const mysql = require("mysql2/promise");

class RJS_DBLog {
  constructor(config) {
    this.config = config;
    this.name = "RJS_DBLog Plugin";
    this.isInitialized = false;
    this.serverInstance = null;
    this.playerCache = new Map();
    this.cacheTTL = 10 * 60 * 1000;
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

      const dbLogPlugin = this.config.plugins.find(plugin => plugin.plugin === "DBLog");
      if (!dbLogPlugin || !dbLogPlugin.enabled) {
        logger.error(`[${this.name}] DBLog plugin must be enabled for RJS_DBLog to work. Plugin will be disabled.`);
        return;
      }

      const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "RJS_DBLog");
      if (!pluginConfig || !pluginConfig.enabled) {
        logger.verbose(`[${this.name}] Plugin is disabled in configuration.`);
        return;
      }

      if (!(await this.checkPlayersTable())) {
        logger.error(`[${this.name}] Players table not found. DBLog plugin must run first to create the table. Plugin will be disabled.`);
        return;
      }

      await this.migrateSchema();

      this.setupEventListeners();

      this.isInitialized = true;
      logger.info(`[${this.name}] Initialized successfully and listening for RJS events.`);
    } catch (error) {
      logger.error(`[${this.name}] Error during initialization: ${error.message}`);
    }
  }

  async checkPlayersTable() {
    try {
      const connection = await process.mysqlPool.getConnection();
      const [tables] = await connection.query(`SHOW TABLES LIKE 'players'`);
      connection.release();
      return tables.length > 0;
    } catch (error) {
      logger.error(`[${this.name}] Error checking for players table: ${error.message}`);
      return false;
    }
  }

  async migrateSchema() {
    try {
      const connection = await process.mysqlPool.getConnection();

      const [columns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'players'
      `);

      const columnNames = columns.map(col => col.COLUMN_NAME);
      const alterQueries = [];

      if (!columnNames.includes('profileName')) {
        alterQueries.push('ADD COLUMN profileName VARCHAR(255) NULL');
      }

      if (!columnNames.includes('platform')) {
        alterQueries.push('ADD COLUMN platform VARCHAR(100) NULL');
      }

      if (alterQueries.length > 0) {
        const alterQuery = `ALTER TABLE players ${alterQueries.join(', ')}`;
        await connection.query(alterQuery);
        logger.info(`[${this.name}] Migrated players table with new columns: ${alterQueries.join(', ')}`);
      } else {
        logger.verbose(`[${this.name}] Players table already has required columns.`);
      }

      connection.release();
    } catch (error) {
      logger.error(`[${this.name}] Error migrating schema: ${error.message}`);
      throw error;
    }
  }

  setupEventListeners() {
    this.serverInstance.on('rjsPlayerJoinedEvent', this.handlePlayerJoined.bind(this));
  }

  async handlePlayerJoined(data) {
    if (!data || !data.playerBiId || !data.playerName) {
      logger.warn(`[${this.name}] Received incomplete rjsPlayerJoinedEvent data`);
      return;
    }

    try {
      const playerUID = data.playerBiId; 
      const playerName = data.playerName;
      const profileName = data.profileName || null;
      const platform = data.platform || null;
      const playerId = data.playerId || null;

      const cacheKey = `${playerUID}_${profileName}_${platform}`;
      if (this.playerCache.has(cacheKey)) {
        logger.verbose(`[${this.name}] Player ${playerName} RJS data already cached, skipping update`);
        return;
      }

      const [rows] = await process.mysqlPool.query(
        "SELECT * FROM players WHERE playerUID = ?",
        [playerUID]
      );

      if (rows.length > 0) {
        const dbPlayer = rows[0];
        let needsUpdate = false;
        const updateFields = {};

        if (dbPlayer.profileName !== profileName) {
          updateFields.profileName = profileName;
          needsUpdate = true;
        }

        if (dbPlayer.platform !== platform) {
          updateFields.platform = platform;
          needsUpdate = true;
        }

        if (dbPlayer.playerName !== playerName) {
          updateFields.playerName = playerName;
          needsUpdate = true;
        }

        if (needsUpdate) {
          const setClause = Object.keys(updateFields)
            .map(field => `${field} = ?`)
            .join(', ');
          const values = Object.values(updateFields);
          values.push(playerUID);

          const updateQuery = `UPDATE players SET ${setClause} WHERE playerUID = ?`;
          await process.mysqlPool.query(updateQuery, values);

          logger.info(`[${this.name}] Updated RJS data for player ${playerName} (${playerUID})`);
        } else {
          logger.verbose(`[${this.name}] No RJS data update needed for player ${playerName}`);
        }
      } else {
        const insertQuery = `
          INSERT INTO players (playerName, playerUID, profileName, platform)
          VALUES (?, ?, ?, ?)
        `;
        await process.mysqlPool.query(insertQuery, [
          playerName,
          playerUID,
          profileName,
          platform
        ]);

        logger.info(`[${this.name}] Created new player record for ${playerName} (${playerUID}) with RJS data`);
      }

      this.playerCache.set(cacheKey, true);
      setTimeout(() => {
        this.playerCache.delete(cacheKey);
      }, this.cacheTTL);

    } catch (error) {
      logger.error(`[${this.name}] Error handling rjsPlayerJoinedEvent for ${data.playerName}: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners('rjsPlayerJoinedEvent');
      this.serverInstance = null;
    }
    this.playerCache.clear();
    this.isInitialized = false;
    logger.verbose(`[${this.name}] Cleanup completed.`);
  }
}

module.exports = RJS_DBLog;