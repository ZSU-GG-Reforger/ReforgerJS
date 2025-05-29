const mysql = require("mysql2/promise");

class RJS_DBEvents {
  constructor(config) {
    this.config = config;
    this.name = "RJS_DBEvents Plugin";
    this.isInitialized = false;
    this.serverInstance = null;
    this.serverId = null; 
  }

  async prepareToMount(serverInstance) {
    await this.cleanup();
    this.serverInstance = serverInstance;

    try {
      if (
        !this.config.connectors ||
        !this.config.connectors.mysql ||
        !this.config.connectors.mysql.enabled
      ) {
        logger.warn(`[${this.name}] MySQL is not enabled in the configuration. Plugin will be disabled.`);
        return;
      }

      if (!process.mysqlPool) {
        logger.error(`[${this.name}] MySQL pool is not available. Ensure MySQL is connected before enabling this plugin.`);
        return;
      }

      const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "RJS_DBEvents");
      if (!pluginConfig || !pluginConfig.enabled) {
        logger.verbose(`[${this.name}] Plugin is disabled in configuration.`);
        return;
      }

      this.serverId = this.config.server?.id || null;
      if (this.serverId) {
        logger.info(`[${this.name}] Using server ID: ${this.serverId}`);
      } else {
        logger.warn(`[${this.name}] No server ID found in config.server.id`);
      }

      await this.setupSchema();

      this.setupEventListeners();

      this.isInitialized = true;
      logger.info(`[${this.name}] Initialized successfully and listening for RJS events.`);
    } catch (error) {
      logger.error(`[${this.name}] Error during initialization: ${error.message}`);
    }
  }

  async setupSchema() {
    try {
      const connection = await process.mysqlPool.getConnection();

      const createChatTable = `
        CREATE TABLE IF NOT EXISTS rjs_chat (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(255) NULL,
          timestamp VARCHAR(50) NOT NULL,
          playerId INT NOT NULL,
          playerName VARCHAR(255) NULL,
          playerBiId VARCHAR(255) NULL,
          channelId INT NOT NULL,
          channelType VARCHAR(50) NULL,
          message TEXT NULL,
          created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_timestamp (timestamp),
          INDEX idx_player_biid (playerBiId),
          INDEX idx_channel (channelId)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `;

      const createKillsTable = `
        CREATE TABLE IF NOT EXISTS rjs_playerkills (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(255) NULL,
          timestamp VARCHAR(50) NOT NULL,
          killerId INT NOT NULL,
          killerName VARCHAR(255) NULL,
          killerBiId VARCHAR(255) NULL,
          killerFaction VARCHAR(100) NULL,
          killerFactionType VARCHAR(100) NULL,
          victimId INT NOT NULL,
          victimName VARCHAR(255) NULL,
          victimBiId VARCHAR(255) NULL,
          victimFaction VARCHAR(100) NULL,
          victimFactionType VARCHAR(100) NULL,
          friendlyFire BOOLEAN DEFAULT FALSE,
          teamKill BOOLEAN DEFAULT FALSE,
          weapon VARCHAR(255) NULL,
          distance FLOAT DEFAULT 0,
          killType VARCHAR(100) NULL,
          created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_timestamp (timestamp),
          INDEX idx_killer_biid (killerBiId),
          INDEX idx_victim_biid (victimBiId),
          INDEX idx_kill_type (killType),
          INDEX idx_friendly_fire (friendlyFire)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      `;

      await connection.query(createChatTable);
      await connection.query(createKillsTable);

      connection.release();
      logger.info(`[${this.name}] Database schema setup complete - created rjs_chat and rjs_playerkills tables.`);
    } catch (error) {
      logger.error(`[${this.name}] Error setting up database schema: ${error.message}`);
      throw error;
    }
  }

  setupEventListeners() {
    this.serverInstance.on('rjsChatMessageEvent', this.handleChatMessage.bind(this));
    this.serverInstance.on('rjsPlayerKilledEvent', this.handlePlayerKilled.bind(this));
  }

  async handleChatMessage(data) {
    if (!data || !data.timestamp) {
      logger.warn(`[${this.name}] Received incomplete rjsChatMessageEvent data`);
      return;
    }

    try {
      const insertQuery = `
        INSERT INTO rjs_chat (
          server_id, timestamp, playerId, playerName, playerBiId, channelId, channelType, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await process.mysqlPool.query(insertQuery, [
        this.serverId,
        data.timestamp,
        data.playerId || 0,
        data.playerName || null,
        data.playerBiId || null,
        data.channelId || 0,
        data.channelType || null,
        data.message || null
      ]);

      logger.verbose(`[${this.name}] Stored RJS chat message from ${data.playerName} in channel ${data.channelType} (Server: ${this.serverId})`);
    } catch (error) {
      logger.error(`[${this.name}] Error storing RJS chat message: ${error.message}`);
    }
  }

  async handlePlayerKilled(data) {
    if (!data || !data.timestamp) {
      logger.warn(`[${this.name}] Received incomplete rjsPlayerKilledEvent data`);
      return;
    }

    try {
      const insertQuery = `
        INSERT INTO rjs_playerkills (
          server_id, timestamp, killerId, killerName, killerBiId, killerFaction, killerFactionType,
          victimId, victimName, victimBiId, victimFaction, victimFactionType,
          friendlyFire, teamKill, weapon, distance, killType
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await process.mysqlPool.query(insertQuery, [
        this.serverId,
        data.timestamp,
        data.killer?.id || -1,
        data.killer?.name || null,
        data.killer?.biId || null,
        data.killer?.faction || null,
        data.killer?.factionType || null,
        data.victim?.id || -1,
        data.victim?.name || null,
        data.victim?.biId || null,
        data.victim?.faction || null,
        data.victim?.factionType || null,
        data.kill?.friendlyFire || false,
        data.kill?.teamKill || false,
        data.kill?.weapon || null,
        data.kill?.distance || 0,
        data.kill?.type || null
      ]);

      logger.verbose(`[${this.name}] Stored RJS kill: ${data.killer?.name} killed ${data.victim?.name} (${data.kill?.type}) (Server: ${this.serverId})`);
    } catch (error) {
      logger.error(`[${this.name}] Error storing RJS player kill: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners('rjsChatMessageEvent');
      this.serverInstance.removeAllListeners('rjsPlayerKilledEvent');
      this.serverInstance = null;
    }
    this.isInitialized = false;
    this.serverId = null;
    logger.verbose(`[${this.name}] Cleanup completed.`);
  }
}

module.exports = RJS_DBEvents;