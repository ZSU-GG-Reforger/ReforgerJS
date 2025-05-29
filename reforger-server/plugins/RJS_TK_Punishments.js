const mysql = require("mysql2/promise");

class RJS_TK_Punishments {
  constructor(config) {
    this.config = config;
    this.name = "RJS_TK_Punishments Plugin";
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
    this.processingKicks = new Set(); 
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

      const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "RJS_TK_Punishments");
      if (!pluginConfig || !pluginConfig.enabled) {
        logger.verbose(`[${this.name}] Plugin is disabled in configuration.`);
        return;
      }

      this.loadConfigOptions(pluginConfig);
      
      this.serverId = this.config.server?.id || null;

      await this.ensureSchema();
      
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

  async ensureSchema() {
    try {
      const connection = await process.mysqlPool.getConnection();

      const [tables] = await connection.query(`SHOW TABLES LIKE 'tk_punishments'`);
      
      if (tables.length === 0) {
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
        logger.info(`[${this.name}] Created tk_punishments table.`);
      } else {
        logger.verbose(`[${this.name}] Using existing tk_punishments table.`);
      }

      connection.release();
    } catch (error) {
      logger.error(`[${this.name}] Error ensuring database schema: ${error.message}`);
      throw error;
    }
  }

  setupEventListeners() {
    this.serverInstance.on('rjsPlayerKilledEvent', this.handlePlayerKilled.bind(this));
    this.serverInstance.on('gameStart', this.resetTKTracking.bind(this));
    this.serverInstance.on('gameEnd', this.resetTKTracking.bind(this));
  }

  resetTKTracking() {
    this.teamkillTracker.clear();
    this.processingKicks.clear(); 
    logger.info(`[${this.name}] RJS TK tracking reset for new round.`);
  }

  async handlePlayerKilled(data) {
  if (!data || !data.killer || !data.victim || !data.kill) {
    return;
  }

  if (!data.kill.friendlyFire && !data.kill.teamKill) {
    return;
  }

  if (!data.kill.weapon || data.kill.weapon === 'unknown') {
    logger.verbose(`[${this.name}] Ignoring RJS friendly fire/team kill with unknown weapon by ${data.killer.name}`);
    return;
  }

  if (!data.killer.biId || data.killer.biId === 'AI' || data.killer.biId === 'World' || !data.killer.id || data.killer.id <= 0) {
    return;
  }

  const killerBiId = data.killer.biId;
  const killerId = data.killer.id;
  const killerName = data.killer.name;
  const victimName = data.victim.name;
  const weapon = data.kill.weapon;
  const killType = data.kill.friendlyFire ? 'friendly fire' : 'team kill';

  if (this.processingKicks.has(killerBiId)) {
    logger.info(`[${this.name}] RJS ${killType} by ${killerName} ignored - player is already being processed for kick`);
    return;
  }

  logger.info(`[${this.name}] RJS ${killType} detected: ${killerName} (ID: ${killerId}) killed ${victimName} with ${weapon}`);

  if (!this.teamkillTracker.has(killerBiId)) {
    this.teamkillTracker.set(killerBiId, 0);
  }

  const currentCount = this.teamkillTracker.get(killerBiId) + 1;
  this.teamkillTracker.set(killerBiId, currentCount);

  if (this.warnEveryTK) {
    await this.warnPlayer(killerId, killerName, currentCount);
  }

  if (currentCount >= this.teamkillKickLimit) {
    this.processingKicks.add(killerBiId);
    
    try {
      await this.kickPlayer(killerBiId, killerId, killerName);
    } catch (error) {
      logger.error(`[${this.name}] Error during kick process for ${killerName}: ${error.message}`);
    } finally {
      this.processingKicks.delete(killerBiId);
    }
  } else {
    const remaining = this.teamkillKickLimit - currentCount;
    logger.warn(`[${this.name}] ${killerName} (ID: ${killerId}) has ${currentCount} RJS ${killType} incidents this round. ${remaining} more will result in kick.`);
  }
}

  async warnPlayer(killerId, killerName, currentCount) {
    try {
      if (!this.serverInstance.rcon || !this.serverInstance.rcon.isConnected) {
        logger.error(`[${this.name}] Cannot warn ${killerName} - RCON is not connected.`);
        return;
      }

      const warnCommand = `#warn ${killerId} "${this.warningMessage}"`;
      
      logger.info(`[${this.name}] WARNING: Sending RJS teamkill warning to ${killerName} (${currentCount}/${this.teamkillKickLimit}). Command: ${warnCommand}`);

      this.serverInstance.rcon.sendCustomCommand(warnCommand);

      logger.info(`[${this.name}] Successfully warned ${killerName} for RJS friendly fire/team kill.`);
    } catch (error) {
      logger.error(`[${this.name}] Error warning player ${killerName}: ${error.message}`);
    }
  }

  async kickPlayer(killerBiId, killerId, killerName) {
    try {
      if (!this.serverInstance.rcon || !this.serverInstance.rcon.isConnected) {
        logger.error(`[${this.name}] Cannot kick ${killerName} - RCON is not connected.`);
        return;
      }

      const kickCommand = `#kick ${killerId}`;
      
      logger.warn(`[${this.name}] KICK: ${killerName} (ID: ${killerId}, BiID: ${killerBiId}) exceeded RJS friendly fire limit. Executing: ${kickCommand}`);

      this.serverInstance.rcon.sendCustomCommand(kickCommand);
      
      try {
        await this.logKickToDatabase(killerBiId, killerName);
      } catch (dbError) {
        logger.error(`[${this.name}] Failed to log kick to database, but kick was successful: ${dbError.message}`);
      }

      if (this.logKicks) {
        await this.logKickToBattleMetrics(killerBiId, killerName);
      }

      await this.checkBanThreshold(killerBiId, killerName);

      this.teamkillTracker.delete(killerBiId);

      logger.warn(`[${this.name}] Successfully processed RJS kick for ${killerName} (ID: ${killerId}).`);
    } catch (error) {
      logger.error(`[${this.name}] Error kicking player ${killerName}: ${error.message}`);
    }
  }

  async logKickToDatabase(playerBiId, playerName) {
    try {
      const insertQuery = `
        INSERT INTO tk_punishments (server_id, playerName, playerGUID, action)
        VALUES (?, ?, ?, 'kick')
      `;

      await process.mysqlPool.query(insertQuery, [
        this.serverId,
        playerName,
        playerBiId
      ]);

      logger.info(`[${this.name}] RJS kick logged to database for ${playerName} (${playerBiId})`);
    } catch (error) {
      logger.error(`[${this.name}] Error logging RJS kick to database: ${error.message}`);
      throw error;
    }
  }

  async logKickToBattleMetrics(playerBiId, playerName) {
    try {
      await this.battlemetricsAPI.createPlayerNote(
        playerBiId,
        {
          note: this.logKickMessage,
          shared: true,
          clearanceLevel: 0,
          expiresAt: null
        },
        true
      );

      logger.info(`[${this.name}] RJS kick logged to BattleMetrics for ${playerName} (${playerBiId})`);
    } catch (error) {
      logger.error(`[${this.name}] Error logging RJS kick to BattleMetrics: ${error.message}`);
    }
  }

  async checkBanThreshold(playerBiId, playerName) {
    try {
      if (!this.enableBMBans) {
        return;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.banKickLimit);

      const [rows] = await process.mysqlPool.query(
        `SELECT COUNT(*) as kickCount FROM tk_punishments 
         WHERE playerGUID = ? AND action = 'kick' AND created >= ?`,
        [playerBiId, cutoffDate]
      );

      const recentKickCount = rows[0].kickCount;

      if (recentKickCount >= this.banKickThreshold) {
        await this.banPlayer(playerBiId, playerName, recentKickCount);
      } else {
        logger.info(`[${this.name}] ${playerName} has ${recentKickCount} RJS kicks in last ${this.banKickLimit} days (threshold: ${this.banKickThreshold}). No ban required.`);
      }
    } catch (error) {
      logger.error(`[${this.name}] Error checking RJS ban threshold: ${error.message}`);
    }
  }

  async banPlayer(playerBiId, playerName, kickCount) {
    try {
      logger.warn(`[${this.name}] BAN: ${playerName} (${playerBiId}) has ${kickCount} RJS kicks in last ${this.banKickLimit} days. Processing ban...`);

      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + this.banDuration);
      const expiresAt = expirationDate.toISOString();

      const banResult = await this.battlemetricsAPI.createBanByReforgerUUID(
        playerBiId,
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
        await this.logBanToDatabase(playerBiId, playerName, this.banDuration.toString());
        logger.warn(`[${this.name}] Successfully banned ${playerName} (${playerBiId}) for ${this.banDuration} hours. Ban ID: ${banResult.data.id}`);
      } else {
        logger.error(`[${this.name}] Failed to create BattleMetrics ban for ${playerName}. No database log will be created.`);
      }
    } catch (error) {
      logger.error(`[${this.name}] Error banning player ${playerName}: ${error.message}`);
    }
  }

  async logBanToDatabase(playerBiId, playerName, duration) {
    try {
      const insertQuery = `
        INSERT INTO tk_punishments (server_id, playerName, playerGUID, action, duration)
        VALUES (?, ?, ?, 'ban', ?)
      `;

      await process.mysqlPool.query(insertQuery, [
        this.serverId,
        playerName,
        playerBiId,
        duration
      ]);

      logger.info(`[${this.name}] RJS ban logged to database for ${playerName} (${playerBiId}) - Duration: ${duration} hours`);
    } catch (error) {
      logger.error(`[${this.name}] Error logging RJS ban to database: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners('rjsPlayerKilledEvent');
      this.serverInstance.removeAllListeners('gameStart');
      this.serverInstance.removeAllListeners('gameEnd');
      this.serverInstance = null;
    }

    this.teamkillTracker.clear();
    this.processingKicks.clear(); 
    this.battlemetricsAPI = null;
    this.isInitialized = false;
    logger.verbose(`[${this.name}] Cleanup completed.`);
  }
}

module.exports = RJS_TK_Punishments;