const { EventEmitter } = require("events");
const Rcon = require("./rcon");
const LogParser = require("./log-parser/index");
const fs = require("fs");
const path = require("path");

global.serverPlayerCount = 0;
global.serverFPS = 0;
global.serverMemoryUsage = 0;

class ReforgerServer extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.players = [];
    this.rcon = null;
    this.logParser = null;
    this.voteKickStartBuffer = [];
    this.bufferTimeout = 3000;
    this.isReconnecting = false;
    this.maxReconnectAttempts = Infinity;
    this.reconnectAttempts = 0;
    this.initialReconnectDelay = 5000;
    this.maxReconnectDelay = 60000;
    this.currentReconnectDelay = this.initialReconnectDelay;
  }

  setupRCON() {
    try {
      if (this.rcon) {
        this.rcon.removeAllListeners();
      }

      this.rcon = new Rcon(this.config);

      this.rcon.on("connect", () => {
        logger.info("RCON connected successfully.");
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.currentReconnectDelay = this.initialReconnectDelay;
      });

      this.rcon.on("error", (err) => {
        logger.error(`RCON error: ${err.message}`);
      });

      this.rcon.on("close", () => {
        logger.warn("RCON connection closed.");
        this.handleRconDisconnection();
      });

      this.rcon.on("players", (updatedPlayers) => {
        this.players = updatedPlayers;
        this.emit("players", this.players);
      });

      logger.info("RCON setup complete.");
    } catch (error) {
      logger.error(`Failed to set up RCON: ${error.message}`);
      this.handleRconDisconnection();
    }
  }

  connectRCON() {
    if (!this.rcon) {
      logger.error("RCON is not initialized. Call setupRCON() first.");
      return;
    }
    this.rcon.start();
  }

  restartRCON() {
    if (!this.rcon) {
      logger.error("RCON is not initialized. Call setupRCON() first.");
      return;
    }
    logger.warn("Restarting RCON...");
    this.rcon.restart();
  }

  startSendingPlayersCommand(interval = 30000) {
    if (!this.rcon) {
      logger.error("RCON is not initialized. Call setupRCON() first.");
      return;
    }
    this.rcon.startSendingPlayersCommand(interval);
  }

  setupLogParser() {
    try {
      if (this.logParser) {
        this.logParser.removeAllListeners();
        this.logParser.unwatch();
      }

      this.logParser = new LogParser("console.log", this.config.server);
      if (!this.logParser) {
        logger.error("LogParser creation failed.");
        return;
      }

      this.setupLogParserEventHandlers();
      this.logParser.watch();
      logger.info("Log Parser setup complete.");
    } catch (error) {
      logger.error(`Failed to set up Log Parser: ${error.message}`);
    }
  }

  setupLogParserEventHandlers() {
    this.logParser.on("event", (eventData) => {
      this.emit("logEvent", eventData);
    });

    this.setupVoteKickEventHandlers();
    this.setupPlayerEventHandlers();
    this.logParser.on("serverHealth", (data) => {
      global.serverFPS = data.fps;
      global.serverMemoryUsage = data.memory;
      global.serverPlayerCount = data.player;
      const memoryMB = (global.serverMemoryUsage / 1024).toFixed(2);
      //logger.verbose(`Server Health updated: FPS: ${global.serverFPS}, Memory: ${global.serverMemoryUsage} kB (${memoryMB} MB), Player Count: ${global.serverPlayerCount}`);
    });
    this.setupGameStateEventHandlers();
    this.setupSATEventHandlers();
    this.setupGMToolsEventHandlers();
    this.setupFlabbyChatEventHandlers();
  }

  async setupCustomLogParsers() {
    try {
      if (!this.config.customParsers) {
        logger.verbose("No custom parsers defined in config");
        return;
      }

      this.customParsers = this.customParsers || {};

      for (const [parserName, parserConfig] of Object.entries(
        this.config.customParsers
      )) {
        try {
          if (
            parserConfig.enabled === "false" ||
            parserConfig.enabled === false
          ) {
            logger.verbose(`Custom parser ${parserName} is disabled, skipping`);
            continue;
          }

          if (!parserConfig.logDir) {
            logger.error(
              `Custom parser ${parserName} is missing required configuration (logDir)`
            );
            continue;
          }

          const parserPath = path.join(
            __dirname,
            "log-parser",
            parserName,
            "index.js"
          );

          if (!fs.existsSync(parserPath)) {
            logger.error(
              `Custom parser ${parserName} enabled in config but not found at ${parserPath}`
            );
            continue;
          }

          logger.info(`Loading custom parser: ${parserName}`);

          let CustomParserClass;
          try {
            CustomParserClass = require(parserPath);
          } catch (requireError) {
            logger.error(
              `Failed to require custom parser ${parserName}: ${requireError.message}`
            );
            continue;
          }

          const customParserOptions = {
            ...parserConfig,
            mode: "tail",
            logReaderMode: "tail",
          };

          let customParser;
          try {
            const fileName = parserConfig.fileName || null;
            customParser = new CustomParserClass(
              fileName,
              customParserOptions
            );
          } catch (instantiationError) {
            logger.error(
              `Failed to instantiate custom parser ${parserName}: ${instantiationError.message}`
            );
            continue;
          }

          const eventNames = CustomParserClass.eventNames || [];

          if (eventNames.length === 0) {
            logger.warn(
              `Custom parser ${parserName} does not specify any events to forward`
            );
          }

          for (const eventName of eventNames) {
            customParser.on(eventName, (data) => {
              logger.verbose(
                `Custom parser ${parserName} emitted event: ${eventName}`
              );
              this.emit(eventName, data);
            });
          }

          try {
            await customParser.watch().catch((error) => {
              logger.error(
                `Error watching logs for custom parser ${parserName}: ${error.message}`
              );
            });
          } catch (watchError) {
            logger.error(
              `Failed to start watching logs for custom parser ${parserName}: ${watchError.message}`
            );
            continue;
          }

          this.customParsers[parserName] = customParser;

          logger.info(
            `Custom parser ${parserName} initialized and watching logs`
          );
        } catch (error) {
          logger.error(
            `Error initializing custom parser ${parserName}: ${error.stack}`
          );
        }
      }
    } catch (error) {
      logger.error(`Error in setupCustomLogParsers: ${error.message}`);
    }
  }

  setupVoteKickEventHandlers() {
    this.logParser.on("voteKickStart", (data) => {
      logger.info(
        `Votekick Started by ${data.voteOffenderName} (ID: ${data.voteOffenderId}) against ${data.voteVictimName} (ID: ${data.voteVictimId})`
      );
      this.emit("voteKickStart", data);
    });

    this.logParser.on("voteKickVictim", (data) => {
      logger.info(
        `Vote kick succeeded against player '${data.voteVictimName}' (ID: ${data.voteVictimId})`
      );
      this.emit("voteKickVictim", data);
    });
  }

  setupPlayerEventHandlers() {
    this.logParser.on("playerJoined", (data) => {
      const { playerName, playerIP, playerNumber, beGUID, steamID, device } =
        data;
      if (this.rcon) {
        const existing = this.rcon.players.find((p) => p.name === playerName);
        if (existing) {
          existing.ip = playerIP;
          if (beGUID) existing.beGUID = beGUID;
          if (steamID !== undefined) existing.steamID = steamID;
          if (device !== undefined) existing.device = device;
        } else {
          const newPlayer = {
            name: playerName,
            number: playerNumber,
            ip: playerIP,
          };
          if (beGUID) newPlayer.beGUID = beGUID;
          if (steamID !== undefined) newPlayer.steamID = steamID;
          if (device !== undefined) newPlayer.device = device;
          this.rcon.players.push(newPlayer);
        }
      }
      logger.verbose(
        `Player joined: ${playerName} (#${playerNumber}) from ${playerIP} - Device: ${
          device || "Unknown"
        }, SteamID: ${steamID || "None"}, BE GUID: ${beGUID || "Unknown"}`
      );
      this.emit("playerJoined", data);
    });

    this.logParser.on("playerUpdate", (data) => {
      if (this.rcon) {
        const existing = this.rcon.players.find(
          (p) => p.name === data.playerName
        );
        if (existing) {
          let updated = false;
          if (!existing.id && data.playerId) {
            existing.id = parseInt(data.playerId, 10);
            updated = true;
          }
          if (!existing.uid && data.playerUid) {
            existing.uid = data.playerUid;
            updated = true;
          }
        } else {
          if (data.playerName && data.playerId && data.playerUid) {
            this.rcon.players.push({
              name: data.playerName,
              id: parseInt(data.playerId, 10),
              uid: data.playerUid,
              ip: null,
            });
          } else {
            logger.warn(
              `Incomplete playerUpdate data. Skipping. Data: ${JSON.stringify(
                data
              )}`
            );
          }
        }
      }
      this.emit("playerUpdate", data);
    });
  }

  setupSATEventHandlers() {
    this.logParser.on("baseCapture", (data) => {
      logger.info(`Base captured: ${data.base} by faction ${data.faction}`);
      this.emit("baseCapture", data);
    });

    this.logParser.on("playerKilled", (data) => {
      logger.verbose(
        `ServerAdminTools Player killed: ${data.playerName} by ${data.instigatorName}, friendly fire: ${data.friendlyFire}`
      );

      const payload = {
        time: data.time,
        playerName: data.playerName,
        instigatorName: data.instigatorName,
        friendlyFire: data.friendlyFire,
        isAI: data.isAI,
      };

      this.emit("satPlayerKilled", payload);

      if (data.friendlyFire) {
        logger.info(
          `ServerAdminTools Friendly fire: ${data.instigatorName} killed ${data.playerName}`
        );
        this.emit("satFriendlyFire", payload);
      }
    });

    this.logParser.on("adminAction", (data) => {
      logger.info(
        `Admin action: ${data.action} by ${data.adminName} on player ${data.targetPlayer}`
      );
      this.emit("adminAction", data);
    });

    this.logParser.on("gameEnd", (data) => {
      if (data.reason && data.winner) {
        logger.info(
          `ServerAdminTools Game ended: Reason: ${data.reason}, Winner: ${data.winner}`
        );
        this.emit("satGameEnd", data);
      }
    });
  }

  setupGMToolsEventHandlers() {
    this.logParser.on("gmToolsStatus", (data) => {
      logger.info(
        `GM Tools: Player ${data.playerName} (ID: ${data.playerId}) ${
          data.status === "Enter" ? "entered" : "exited"
        } Game Master mode`
      );
      this.emit("gmToolsStatus", data);
    });

    this.logParser.on("gmToolsTime", (data) => {
      logger.verbose(
        `GM Tools: Session duration for ${data.playerName} (ID: ${data.playerId}): ${data.duration} seconds`
      );
      this.emit("gmToolsTime", data);
    });
  }

  setupFlabbyChatEventHandlers() {
    this.logParser.on("chatMessage", (data) => {
      const channelType = this.getChatChannelType(data.channelId);
      logger.verbose(
        `Chat: [${channelType}] ${data.playerName}: ${data.message}`
      );

      this.emit("chatMessage", {
        time: data.time,
        playerBiId: data.playerBiId,
        senderFaction: data.senderFaction,
        channelId: data.channelId,
        channelType: channelType,
        senderId: data.senderId,
        playerName: data.playerName,
        message: data.message,
        serverName: data.serverName,
      });
    });
  }

  getChatChannelType(channelId) {
    switch (channelId) {
      case "0":
        return "Global";
      case "1":
        return "Faction";
      case "2":
        return "Group";
      case "3":
        return "Vehicle";
      case "4":
        return "Local";
      default:
        return "Unknown";
    }
  }

  setupGameStateEventHandlers() {
    // Game Start event
    this.logParser.on("gameStart", (data) => {
      logger.info(`Game started at ${data.time}`);
      this.emit("gameStart", data);
    });

    // Game End event
    this.logParser.on("gameEnd", (data) => {
      logger.info(`Game ended at ${data.time}`);
      this.emit("gameEnd", data);
    });

    // Application Hang event
    this.logParser.on("applicationHang", (data) => {
      logger.info(`Aplication Hang at ${data.time}`);
      this.emit("applicationHang", data);
    });
  }

  handleRconDisconnection() {
    if (this.isReconnecting) {
      return;
    }
    this.isReconnecting = true;
    this.reconnectAttempts = 0;
    this.currentReconnectDelay = this.initialReconnectDelay;
    this.attemptReconnection();
  }

  processVoteKickStartBuffer() {
    const currentTime = Date.now();

    this.voteKickStartBuffer = this.voteKickStartBuffer.filter((event) => {
      return currentTime - event.timestamp < 1800000;
    });

    logger.verbose(
      `Processing ${this.voteKickStartBuffer.length} buffered voteKick events.`
    );

    const bufferCopy = [...this.voteKickStartBuffer];
    this.voteKickStartBuffer = [];

    bufferCopy.forEach((data) => {
      if (this.rcon) {
        const playerId = parseInt(data.playerId, 10);
        const player = this.rcon.players.find((p) => p.id === playerId);

        if (player) {
          logger.info(
            `Votekick Started by ${
              player.name || player.uid
            } (buffered) [ID=${playerId}]`
          );
        } else {
          logger.warn(
            `Still no matching player for ID ${playerId} (buffered event).`
          );
        }
      }
      this.emit("voteKickStart", data);
    });
  }

  async attemptReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("Max RCON reconnection attempts reached. Giving up.");
      return;
    }

    this.reconnectAttempts += 1;
    logger.warn(
      `Attempting to reconnect to RCON. Attempt ${this.reconnectAttempts}...`
    );

    try {
      this.rcon.removeAllListeners("connect");

      this.rcon.once("connect", () => {
        logger.info("RCON reconnected successfully in ReforgerServer.");
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.currentReconnectDelay = this.initialReconnectDelay;

        if (this.rcon.playersIntervalTime && !this.rcon.playersInterval) {
          logger.info(
            `Ensuring players command is restarted from ReforgerServer`
          );
          this.rcon.startSendingPlayersCommand(this.rcon.playersIntervalTime);
        }
      });

      this.restartRCON();

      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * 2,
        this.maxReconnectDelay
      );
    } catch (error) {
      logger.error(
        `Reconnection attempt ${this.reconnectAttempts} failed: ${error.message}`
      );
    }

    if (this.isReconnecting) {
      setTimeout(() => {
        this.attemptReconnection();
      }, this.currentReconnectDelay);
    }
  }

  async initialize() {
    try {
      this.setupRCON();
      this.connectRCON();
      this.setupLogParser();
      await this.setupCustomLogParsers();
      logger.info("ReforgerServer initialized successfully.");
    } catch (error) {
      logger.error(`Failed to initialize ReforgerServer: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ReforgerServer;