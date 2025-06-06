# ReforgerJS Plugin Development Guide

This guide will help you understand how to create plugins for ReforgerJS, what APIs are available, and how to integrate with Discord and databases.

## Table of Contents
1. [Plugin Structure](#plugin-structure)
2. [Plugin Configuration](#plugin-configuration)
3. [Creating Your First Plugin](#creating-your-first-plugin)
4. [Available Events](#available-events)
5. [Database Integration](#database-integration)
6. [Discord Integration](#discord-integration)
7. [RCON Access](#rcon-access)
8. [Examples](#examples)

## Plugin Structure

A ReforgerJS plugin is a JavaScript class that implements specific methods to hook into the server. Each plugin:

- Must be in its own file in the `reforger-server/plugins` directory
- Should have the same filename as listed in the config.json file
- Must export a class that can be instantiated with `new`

## Plugin Configuration

Plugins are configured in the `plugins` section of `config.json`:

```
json
"plugins": [
  {
    "plugin": "YourPluginName",
    "enabled": true,
    "channel": "discord-channel-id",
    "custom-option": "value"
  }
]
```

## Creating Your First Plugin

Here's a basic plugin template:

```
javascript
class YourPluginName {
  constructor(config) {
    this.config = config;
    this.name = "Your Plugin Name";
    this.serverInstance = null;
    this.discordClient = null;
  }

  async prepareToMount(serverInstance, discordClient) {
    // Store references to server and Discord client
    this.serverInstance = serverInstance;
    this.discordClient = discordClient;

    // Get plugin-specific config
    const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "YourPluginName");

    // Subscribe to events
    this.serverInstance.on("playerJoined", this.handlePlayerJoined.bind(this));

    logger.info(`[${this.name}] Plugin initialized successfully`);
  }

  handlePlayerJoined(data) {
    // Handle player joined event
    logger.info(`[${this.name}] Player joined: ${data.playerName}`);
  }

  async cleanup() {
    // Remove event listeners
    if (this.serverInstance) {
      this.serverInstance.removeListener("playerJoined", this.handlePlayerJoined);
    }
    
    logger.info(`[${this.name}] Cleanup complete`);
  }
}

module.exports = YourPluginName;
```

## Available Events

The ReforgerJS server emits the following events that your plugin can listen for:

### Player Events
- `playerJoined` - When a player joins the server. Data includes: `time`, `playerName`, `playerIP`, `playerNumber`, `beGUID`, `steamID`, `device`
- `playerUpdate` - When player information is updated. Data includes: `time`, `playerId`, `playerName`, `playerUid`

### Vote Events 
- `voteKickStart` - When a player initiates a vote kick. Data includes: `time`, `voteOffenderName`, `voteOffenderId`, `voteVictimName`, `voteVictimId`
- `voteKickVictim` - When a player is successfully vote kicked. Data includes: `time`, `voteVictimName`, `voteVictimId`

### Server Events
- `serverHealth` - Server performance metrics. Data includes: `fps`, `memory`, `player` (count)
- `gameStart` - When the game starts. Data includes: `time`
- `gameEnd` - When the game ends. Data includes: `time`

### Server Admin Tools (SAT) Events
- `baseCapture` - When a base is captured. Data includes: `time`, `faction`, `base`
- `satPlayerKilled` - When a player is killed. Data includes: `time`, `playerName`, `instigatorName`, `friendlyFire`, `isAI`
- `satFriendlyFire` - Specific event for friendly fire (subset of satPlayerKilled)
- `adminAction` - When an admin performs an action. Data includes: `time`, `action`, `adminName`, `targetPlayer`
- `satGameEnd` - When the game ends (SAT-specific). Data includes: `time`, `reason`, `winner`

### GM Tools Events
- `gmToolsStatus` - GM Tools status changes. Data includes: `time`, `playerName`, `playerId`, `status`
- `gmToolsTime` - GM Tools session duration. Data includes: `time`, `playerName`, `playerId`, `duration`

### Chat Events
- `chatMessage` - In-game chat messages. Data includes: `time`, `playerBiId`, `senderFaction`, `channelId`, `channelType`, `senderId`, `playerName`, `message`, `serverName`

## Database Integration

To integrate with the MySQL database:

```
javascript
async prepareToMount(serverInstance) {
  this.serverInstance = serverInstance;

  // Check if MySQL is enabled
  if (
    !this.config.connectors ||
    !this.config.connectors.mysql ||
    !this.config.connectors.mysql.enabled
  ) {
    logger.warn(`[${this.name}] MySQL is not enabled in config`);
    return;
  }

  // Get the MySQL pool
  const pool = process.mysqlPool;
  if (!pool) {
    logger.error(`[${this.name}] MySQL pool is not available`);
    return;
  }

  // Create tables if needed
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS your_table (
        id INT AUTO_INCREMENT PRIMARY KEY,
        playerName VARCHAR(255) NULL,
        created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    const connection = await pool.getConnection();
    await connection.query(createTableQuery);
    connection.release();
    logger.info(`[${this.name}] Database schema ready`);
  } catch (error) {
    logger.error(`[${this.name}] Database setup error: ${error.message}`);
  }
}

// Example of saving data to database
async saveToDatabase(data) {
  try {
    await process.mysqlPool.query(
      "INSERT INTO your_table (playerName) VALUES (?)",
      [data.playerName]
    );
    logger.info(`[${this.name}] Data saved to database`);
  } catch (error) {
    logger.error(`[${this.name}] Database error: ${error.message}`);
  }
}
```

## Discord Integration

To integrate with Discord:

```
javascript
async prepareToMount(serverInstance, discordClient) {
  this.serverInstance = serverInstance;
  this.discordClient = discordClient;

  // Get plugin config
  const pluginConfig = this.config.plugins.find(
    plugin => plugin.plugin === "YourPluginName"
  );

  if (!pluginConfig || !pluginConfig.channel) {
    logger.warn(`[${this.name}] No channel configured`);
    return;
  }

  // Get the Discord channel
  try {
    const guild = await this.discordClient.guilds.fetch(
      this.config.connectors.discord.guildId,
      { cache: true, force: true }
    );

    const channel = await guild.channels.fetch(pluginConfig.channel);
    if (!channel || !channel.isTextBased()) {
      logger.error(`[${this.name}] Channel is not a text channel`);
      return;
    }

    this.channel = channel;

    // Check permissions
    if (!this.channel.permissionsFor(this.discordClient.user).has("SendMessages")) {
      logger.error(`[${this.name}] Bot cannot send messages in channel`);
      return;
    }

    // Setup event handlers
    this.serverInstance.on("playerJoined", this.handlePlayerJoined.bind(this));
  } catch (error) {
    logger.error(`[${this.name}] Discord setup error: ${error.message}`);
  }
}

// Send a message to Discord
async sendDiscordMessage(content) {
  if (!this.channel) return;
  
  try {
    await this.channel.send(content);
  } catch (error) {
    logger.error(`[${this.name}] Discord message error: ${error.message}`);
  }
}
```

## RCON Access

To send RCON commands to the server:

```
javascript
// Example: kicking a player via RCON
kickPlayer(playerName) {
  if (!this.serverInstance || !this.serverInstance.rcon) {
    logger.warn(`[${this.name}] RCON not available`);
    return;
  }

  if (!this.serverInstance.rcon.isConnected) {
    logger.warn(`[${this.name}] RCON not connected`);
    return;
  }

  const kickCommand = `#kick ${playerName}`;
  this.serverInstance.rcon.sendCustomCommand(kickCommand);
  logger.info(`[${this.name}] Sent kick command for ${playerName}`);
}
```

## Examples

Here are some examples for common plugin tasks:

### Event Logging Plugin

```
javascript
class EventLogger {
  constructor(config) {
    this.config = config;
    this.name = "EventLogger Plugin";
    this.serverInstance = null;
  }

  async prepareToMount(serverInstance) {
    this.serverInstance = serverInstance;
    
    // Track multiple events
    this.serverInstance.on("playerJoined", this.handlePlayerJoined.bind(this));
    this.serverInstance.on("satPlayerKilled", this.handlePlayerKilled.bind(this));
    this.serverInstance.on("chatMessage", this.handleChatMessage.bind(this));
    
    logger.info(`[${this.name}] Initialized and tracking events`);
  }

  handlePlayerJoined(data) {
    logger.info(`[${this.name}] Player joined: ${data.playerName} from IP ${data.playerIP}`);
  }

  handlePlayerKilled(data) {
    logger.info(`[${this.name}] Player ${data.playerName} was killed by ${data.instigatorName}`);
  }

  handleChatMessage(data) {
    logger.info(`[${this.name}] [${data.channelType}] ${data.playerName}: ${data.message}`);
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeListener("playerJoined", this.handlePlayerJoined);
      this.serverInstance.removeListener("satPlayerKilled", this.handlePlayerKilled);
      this.serverInstance.removeListener("chatMessage", this.handleChatMessage);
    }
  }
}

module.exports = EventLogger;
```

Refer to the existing plugins in the repository for more detailed examples:
- `DBLog` - For database logging
- `LogVoteKickStart` - For Discord integration
- `ServerStatus` - For server monitoring
- `AltChecker` - For more complex operations

This README should help you get started with creating plugins for ReforgerJS. For additional help, examine the existing plugins and refer to the core code in `reforger-server/main.js` and `reforger-server/log-parser`.