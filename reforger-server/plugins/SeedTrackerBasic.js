const mysql = require("mysql2/promise");

class SeedTrackerBasic {
  constructor(config) {
    this.config = config;
    this.name = "SeedTrackerBasic Plugin";
    this.interval = null;
    this.intervalMinutes = 5;
    this.seedStart = 5;
    this.seedEnd = 40;
    this.serverInstance = null;
  }

async prepareToMount(serverInstance) {
  await this.cleanup();
  this.serverInstance = serverInstance;

  try {
    if (!this.config?.connectors?.mysql?.enabled || !process.mysqlPool) {
      return;
    }

    const pluginConfig = this.config.plugins.find(
      (plugin) => plugin.plugin === "SeedTrackerBasic"
    );
    if (!pluginConfig) {
      return;
    }

    this.intervalMinutes =
      typeof pluginConfig.interval === "number" && pluginConfig.interval > 0
        ? pluginConfig.interval
        : this.intervalMinutes;
    this.seedStart =
      typeof pluginConfig.seedStart === "number" ? pluginConfig.seedStart : this.seedStart;
    this.seedEnd =
      typeof pluginConfig.seedEnd === "number" ? pluginConfig.seedEnd : this.seedEnd;

    await this.setupSchema();
    await this.migrateSchema();
    this.startTracking();
    logger.info(`[${this.name}] Initialized successfully`);
  } catch (error) {
    logger.error(`[${this.name}] Error during initialization: ${error.message}`);
  }
}

  async setupSchema() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS seed_tracker (
      id INT AUTO_INCREMENT PRIMARY KEY,
      playerName VARCHAR(255) NULL,
      playerUID VARCHAR(255) NOT NULL UNIQUE,
      seedValue INT DEFAULT 0,
      created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  `;

  try {
    const connection = await process.mysqlPool.getConnection();
    await connection.query(createTableQuery);
    connection.release();
    logger.verbose(`[${this.name}] Database schema setup complete`);
  } catch (error) {
    logger.error(`[${this.name}] Error setting up schema: ${error.message}`);
  }
}

async migrateSchema() {
  try {
    logger.verbose(`[${this.name}] Checking if schema migration is needed...`);
    const connection = await process.mysqlPool.getConnection();
    
    const [tableResult] = await connection.query(`
      SELECT TABLE_COLLATION 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seed_tracker'
    `);
    
    if (tableResult.length > 0 && !tableResult[0].TABLE_COLLATION.startsWith("utf8mb4")) {
      logger.info(`[${this.name}] Migrating seed_tracker table to utf8mb4...`);
      await connection.query(`
        ALTER TABLE seed_tracker CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
    }
    
    connection.release();
    logger.verbose(`[${this.name}] Schema migration check completed.`);
  } catch (error) {
    logger.error(`[${this.name}] Error during schema migration: ${error.message}`);
  }
}

  startTracking() {
    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.trackSeedPlayers();
    this.interval = setInterval(() => this.trackSeedPlayers(), intervalMs);
  }

  async trackSeedPlayers() {
    const players = this.serverInstance?.players;
    if (!Array.isArray(players) || players.length === 0) {
      return;
    }

    if (players.length < this.seedStart || players.length > this.seedEnd) {
      return;
    }

    for (const player of players) {
      if (player?.uid && player?.name) {
        await this.processPlayer(player);
      }
    }
  }

  async processPlayer(player) {
    try {
      const [rows] = await process.mysqlPool.query(
        "SELECT playerUID FROM seed_tracker WHERE playerUID = ?",
        [player.uid]
      );

      if (rows.length > 0) {
        await process.mysqlPool.query(
          "UPDATE seed_tracker SET seedValue = seedValue + 1 WHERE playerUID = ?",
          [player.uid]
        );
      } else {
        await process.mysqlPool.query(
          "INSERT INTO seed_tracker (playerName, playerUID, seedValue) VALUES (?, ?, 1)",
          [player.name, player.uid]
        );
      }
    } catch (error) {}
  }

  async cleanup() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.serverInstance = null;
  }
}

module.exports = SeedTrackerBasic;
