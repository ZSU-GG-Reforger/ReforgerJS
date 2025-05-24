const mysql = require("mysql2/promise");

class WCS_TK_Punishments {
  constructor(config) {
    this.config = config;
    this.name = "WCS_TK_Punishments Plugin";
    this.isInitialized = false;
    this.serverInstance = null;
    this.battlemetricsAPI = null;
    
    this.teamkillKickLimit = 4;
    this.logKicks = true;
    this.logKickMessage = "Player was kicked for teamkilling\nReforgerJS Automated System";
    this.warnEveryTK = true;
    this.warningMessage = "Watch your fire, Teamkilling will result in your removal from the server";
    this.enableBMBans = true;
    this.banKickThreshold = 2;
    this.banKickLimit = 14;
    this.banDuration = 24;
    this.banReason = "Intentional Teamkilling - banned for {{duration}} - appeal at https://discord.gg/LinkToDiscord";
    this.banMessage = "Banned for Teamkilling. ReforgerJS Automated System";
    this.banAutoAddEnabled = false;
    this.banNativeEnabled = false;
    this.banOrgWide = true;
    
    this.teamkillTracker = new Map();
    this.serverId = null;
  }

  async prepareToMount(serverInstance) {
    await this.cleanup();
    this.serverInstance = serverInstance;

    try {
      if (!this.config.connectors || !this.config.connectors.mysql || !this.config.connectors.mysql.enabled) {
        logger.warn(`[${this.name}] MySQL is not enabled in the configuration. Plugin will be disabled.`);
        return;
      }

      if (!process.mysqlPool) {
        logger.error(`[${this.name}] MySQL pool is not available. Ensure MySQL is connected before enabling this plugin.`);
        return;
      }

      if (!this.serverInstance.rcon) {
        logger.error(`[${this.name}] RCON is not available. Plugin will be disabled.`);
        return;
      }

      if (!process.battlemetricsAPI) {
        logger.error(`[${this.name}] BattleMetrics API not available. Plugin will be disabled.`);
        return;
      }

      this.battlemetricsAPI = process.battlemetricsAPI;

      const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "WCS_TK_Punishments");
      if (!pluginConfig || !pluginConfig.enabled) {
        logger.verbose(`[${this.name}] Plugin is disabled in configuration.`);
        return;
      }

      this.loadConfigOptions(pluginConfig);
      
      this.serverId = this.config.server?.id || null;

      await this.setupSchema();
      
      this.setupEventListeners();

      this.isInitialized = true;
      logger.info(`[${this.name}] Initialized successfully. TK limit: ${this.teamkillKickLimit}, Ban threshold: ${this.banKickThreshold} kicks in ${this.banKickLimit} days.`);
    } catch (error) {
      logger.error(`[${this.name}] Error during initialization: ${error.message}`);
    }
  }

  loadConfigOptions(pluginConfig) {
    if (typeof pluginConfig.teamkillKickLimit === 'number' && pluginConfig.teamkillKickLimit > 0) {
      this.teamkillKickLimit = pluginConfig.teamkillKickLimit;
    }
    if (typeof pluginConfig.logKicks === 'boolean') {
      this.logKicks = pluginConfig.logKicks;
    }
    if (typeof pluginConfig.logKickMessage === 'string' && pluginConfig.logKickMessage.trim()) {
      this.logKickMessage = pluginConfig.logKickMessage.trim();
    }
    if (typeof pluginConfig.warnEveryTK === 'boolean') {
      this.warnEveryTK = pluginConfig.warnEveryTK;
    }
    if (typeof pluginConfig.warningMessage === 'string' && pluginConfig.warningMessage.trim()) {
      this.warningMessage = pluginConfig.warningMessage.trim();
    }
    if (typeof pluginConfig.enableBMBans === 'boolean') {
      this.enableBMBans = pluginConfig.enableBMBans;
    }
    if (typeof pluginConfig.banKickThreshold === 'number' && pluginConfig.banKickThreshold > 0) {
      this.banKickThreshold = pluginConfig.banKickThreshold;
    }
    if (typeof pluginConfig.banKickLimit === 'number' && pluginConfig.banKickLimit > 0) {
      this.banKickLimit = pluginConfig.banKickLimit;
    }
    if (typeof pluginConfig.BanDuration === 'number' && pluginConfig.BanDuration > 0) {
      this.banDuration = pluginConfig.BanDuration;
    }
    if (typeof pluginConfig.BanReason === 'string' && pluginConfig.BanReason.trim()) {
      this.banReason = pluginConfig.BanReason.trim();
    }
    if (typeof pluginConfig.BanMessage === 'string' && pluginConfig.BanMessage.trim()) {
      this.banMessage = pluginConfig.BanMessage.trim();
    }
    if (typeof pluginConfig.BanAutoAddEnabled === 'boolean') {
      this.banAutoAddEnabled = pluginConfig.BanAutoAddEnabled;
    }
    if (typeof pluginConfig.BanNativeEnabled === 'boolean') {
      this.banNativeEnabled = pluginConfig.BanNativeEnabled;
    }
    if (typeof pluginConfig.BanOrgWide === 'boolean') {
      this.banOrgWide = pluginConfig.BanOrgWide;
    }
  }

  async setupSchema() {
    try {
      const connection = await process.mysqlPool.getConnection();

      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS tk_punishments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(255) NULL,
          playerName VARCHAR(255) NULL,
          playerGUID VARCHAR(255) NULL,
          action VARCHAR(50) NULL,
          duration VARCHAR(50) NULL,
          created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `;

      await connection.query(createTableQuery);
      connection.release();
      logger.info(`[${this.name}] Database schema setup complete - tk_punishments table ready.`);
    } catch (error) {
      logger.error(`[${this.name}] Error setting up database schema: ${error.message}`);
      throw error;
    }
  }

  setupEventListeners() {
    this.serverInstance.on('playerKilledEvent', this.handlePlayerKilled.bind(this));
    this.serverInstance.on('gameStart', this.resetTKTracking.bind(this));
    this.serverInstance.on('gameEnd', this.resetTKTracking.bind(this));
  }

  resetTKTracking() {
    this.teamkillTracker.clear();
    logger.info(`[${this.name}] TK tracking reset for new round.`);
  }

  async handlePlayerKilled(data) {
    if (!data || !data.killer || !data.victim || !data.kill) {
      return;
    }

    if (!data.kill.friendlyFire) {
      return;
    }

    if (!data.kill.weapon || data.kill.weapon === 'unknown') {
      logger.verbose(`[${this.name}] Ignoring friendly fire with unknown weapon by ${data.killer.name}`);
      return;
    }

    if (!data.killer.guid || data.killer.guid === 'AI' || data.killer.guid === 'World' || !data.killer.id || data.killer.id <= 0) {
      return;
    }

    const killerGUID = data.killer.guid;
    const killerId = data.killer.id;
    const killerName = data.killer.name;
    const victimName = data.victim.name;
    const weapon = data.kill.weapon;

    logger.info(`[${this.name}] Friendly fire detected: ${killerName} (ID: ${killerId}) killed ${victimName} with ${weapon}`);

    if (!this.teamkillTracker.has(killerGUID)) {
      this.teamkillTracker.set(killerGUID, 0);
    }

    const currentCount = this.teamkillTracker.get(killerGUID) + 1;
    this.teamkillTracker.set(killerGUID, currentCount);

    if (this.warnEveryTK) {
      await this.warnPlayer(killerId, killerName, currentCount);
    }

    if (currentCount >= this.teamkillKickLimit) {
      await this.kickPlayer(killerGUID, killerId, killerName);
    } else {
      const remaining = this.teamkillKickLimit - currentCount;
      logger.warn(`[${this.name}] ${killerName} (ID: ${killerId}) has ${currentCount} friendly fire incidents this round. ${remaining} more will result in kick.`);
    }
  }

  async warnPlayer(killerId, killerName, currentCount) {
    try {
      if (!this.serverInstance.rcon || !this.serverInstance.rcon.isConnected) {
        logger.error(`[${this.name}] Cannot warn ${killerName} - RCON is not connected.`);
        return;
      }

      const warnCommand = `#warn ${killerId} "${this.warningMessage}"`;
      
      logger.info(`[${this.name}] WARNING: Sending teamkill warning to ${killerName} (${currentCount}/${this.teamkillKickLimit}). Command: ${warnCommand}`);

      this.serverInstance.rcon.sendCustomCommand(warnCommand);

      logger.info(`[${this.name}] Successfully warned ${killerName} for friendly fire.`);
    } catch (error) {
      logger.error(`[${this.name}] Error warning player ${killerName}: ${error.message}`);
    }
  }

  async kickPlayer(killerGUID, killerId, killerName) {
    try {
      if (!this.serverInstance.rcon || !this.serverInstance.rcon.isConnected) {
        logger.error(`[${this.name}] Cannot kick ${killerName} - RCON is not connected.`);
        return;
      }

      const kickCommand = `#kick ${killerId}`;
      
      logger.warn(`[${this.name}] KICK: ${killerName} (ID: ${killerId}, GUID: ${killerGUID}) exceeded friendly fire limit. Executing: ${kickCommand}`);

      this.serverInstance.rcon.sendCustomCommand(kickCommand);
      
      try {
        await this.logKickToDatabase(killerGUID, killerName);
      } catch (dbError) {
        logger.error(`[${this.name}] Failed to log kick to database, but kick was successful: ${dbError.message}`);
      }

      if (this.logKicks) {
        await this.logKickToBattleMetrics(killerGUID, killerName);
      }

      await this.checkBanThreshold(killerGUID, killerName);

      this.teamkillTracker.delete(killerGUID);

      logger.warn(`[${this.name}] Successfully processed kick for ${killerName} (ID: ${killerId}).`);
    } catch (error) {
      logger.error(`[${this.name}] Error kicking player ${killerName}: ${error.message}`);
    }
  }

  async logKickToDatabase(playerGUID, playerName) {
    try {
      const insertQuery = `
        INSERT INTO tk_punishments (server_id, playerName, playerGUID, action)
        VALUES (?, ?, ?, 'kick')
      `;

      await process.mysqlPool.query(insertQuery, [
        this.serverId,
        playerName,
        playerGUID
      ]);

      logger.info(`[${this.name}] Kick logged to database for ${playerName} (${playerGUID})`);
    } catch (error) {
      logger.error(`[${this.name}] Error logging kick to database: ${error.message}`);
      throw error;
    }
  }

  async logKickToBattleMetrics(playerGUID, playerName) {
    try {
      await this.battlemetricsAPI.createPlayerNote(
        playerGUID,
        {
          note: this.logKickMessage,
          shared: true,
          clearanceLevel: 0,
          expiresAt: null
        },
        true
      );

      logger.info(`[${this.name}] Kick logged to BattleMetrics for ${playerName} (${playerGUID})`);
    } catch (error) {
      logger.error(`[${this.name}] Error logging kick to BattleMetrics: ${error.message}`);
    }
  }

  async checkBanThreshold(playerGUID, playerName) {
    try {
      if (!this.enableBMBans) {
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.banKickLimit);

      const [rows] = await process.mysqlPool.query(
        `SELECT COUNT(*) as kickCount FROM tk_punishments 
         WHERE playerGUID = ? AND action = 'kick' AND created >= ?`,
        [playerGUID, cutoffDate]
      );

      const recentKickCount = rows[0].kickCount;

      if (recentKickCount >= this.banKickThreshold) {
        await this.banPlayer(playerGUID, playerName, recentKickCount);
      } else {
        logger.info(`[${this.name}] ${playerName} has ${recentKickCount} kicks in last ${this.banKickLimit} days (threshold: ${this.banKickThreshold}). No ban required.`);
      }
    } catch (error) {
      logger.error(`[${this.name}] Error checking ban threshold: ${error.message}`);
    }
  }

  async banPlayer(playerGUID, playerName, kickCount) {
    try {
      logger.warn(`[${this.name}] BAN: ${playerName} (${playerGUID}) has ${kickCount} kicks in last ${this.banKickLimit} days. Processing ban...`);

      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + this.banDuration);
      const expiresAt = expirationDate.toISOString();

      const banResult = await this.battlemetricsAPI.createBanByReforgerUUID(
        playerGUID,
        {
          reason: this.banReason,
          note: this.banMessage,
          expires: expiresAt,
          permanent: false,
          autoAddEnabled: this.banAutoAddEnabled,
          nativeEnabled: this.banNativeEnabled,
          orgWide: this.banOrgWide
        }
      );

      if (banResult && banResult.data) {
        await this.logBanToDatabase(playerGUID, playerName, this.banDuration.toString());
        logger.warn(`[${this.name}] Successfully banned ${playerName} (${playerGUID}) for ${this.banDuration} hours. Ban ID: ${banResult.data.id}`);
      } else {
        logger.error(`[${this.name}] Failed to create BattleMetrics ban for ${playerName}. No database log will be created.`);
      }
    } catch (error) {
      logger.error(`[${this.name}] Error banning player ${playerName}: ${error.message}`);
    }
  }

  async logBanToDatabase(playerGUID, playerName, duration) {
    try {
      const insertQuery = `
        INSERT INTO tk_punishments (server_id, playerName, playerGUID, action, duration)
        VALUES (?, ?, ?, 'ban', ?)
      `;

      await process.mysqlPool.query(insertQuery, [
        this.serverId,
        playerName,
        playerGUID,
        duration
      ]);

      logger.info(`[${this.name}] Ban logged to database for ${playerName} (${playerGUID}) - Duration: ${duration} hours`);
    } catch (error) {
      logger.error(`[${this.name}] Error logging ban to database: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners('playerKilledEvent');
      this.serverInstance.removeAllListeners('gameStart');
      this.serverInstance.removeAllListeners('gameEnd');
      this.serverInstance = null;
    }

    this.teamkillTracker.clear();
    this.battlemetricsAPI = null;
    this.isInitialized = false;
    logger.verbose(`[${this.name}] Cleanup completed.`);
  }
}

module.exports = WCS_TK_Punishments;