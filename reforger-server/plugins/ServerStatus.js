const { EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');

class ServerStatus {
  constructor(config) {
    this.config = config;
    this.name = "ServerStatus Plugin";
    this.interval = null;
    this.isInitialized = false;
    this.serverInstance = null;
    this.discordClient = null;
    this.channel = null;
    this.message = null;
  }

  async prepareToMount(serverInstance, discordClient) {
    await this.cleanup();
    this.serverInstance = serverInstance;
    this.discordClient = discordClient;

    try {
      const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "ServerStatus");
      if (!pluginConfig?.enabled || !pluginConfig?.channel) {
        logger.verbose("ServerStatus plugin is disabled or missing channel configuration");
        return;
      }

      this.channelId = pluginConfig.channel;
      logger.verbose(`ServerStatus initializing with channel ID: ${this.channelId}`);
      
      const guild = await this.discordClient.guilds.fetch(this.config.connectors.discord.guildId, { cache: true, force: true });
      this.channel = await guild.channels.fetch(this.channelId);

      if (!this.channel?.isTextBased()) {
        logger.error(`ServerStatus plugin: Channel ${this.channelId} is not a text channel`);
        return;
      }

      const permissions = this.channel.permissionsFor(this.discordClient.user);
      if (!permissions?.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
        logger.error(`ServerStatus plugin: Missing required permissions in channel ${this.channelId}`);
        return;
      }

      if (pluginConfig.messageID) {
        try {
          logger.verbose(`ServerStatus plugin: Attempting to fetch existing message ${pluginConfig.messageID}`);
          this.message = await this.channel.messages.fetch(pluginConfig.messageID);
        } catch (error) {
          logger.info(`ServerStatus plugin: Could not fetch existing message, creating a new one`);
          this.message = await this.postInitialEmbed();
        }
      } else {
        logger.verbose(`ServerStatus plugin: No message ID configured, creating initial embed`);
        this.message = await this.postInitialEmbed();
      }

      this.interval = setInterval(() => this.updateEmbed(), (pluginConfig.interval || 1) * 60 * 1000);
      logger.info(`ServerStatus plugin: Initialized with update interval of ${pluginConfig.interval || 1} minutes`);
      this.isInitialized = true;
    } catch (error) {
      logger.error(`ServerStatus plugin: Error during initialization: ${error.message}`);
    }
  }

  async postInitialEmbed() {
    try {
      const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "ServerStatus");
      const embedConfig = pluginConfig.embed || {};
      const serverName = this.config.server?.name || "Unknown";

      const embed = new EmbedBuilder()
        .setTitle(embedConfig.title || "Server Status")
        .setColor(embedConfig.color || "#00FF00")
        .setDescription(serverName)
        .setTimestamp()
        .addFields(
          { name: "Player Count", value: "Loading...", inline: true },
          { name: "FPS", value: "Loading...", inline: true },
          { name: "Memory Usage", value: "Loading...", inline: true }
        );

      if (embedConfig.footer) embed.setFooter({ text: embedConfig.footer });
      
      if (embedConfig.thumbnail !== false && embedConfig.thumbnailURL?.trim()) {
        logger.verbose(`ServerStatus plugin: Setting thumbnail to ${embedConfig.thumbnailURL}`);
        embed.setThumbnail(embedConfig.thumbnailURL);
      } else {
        logger.verbose(`ServerStatus plugin: Thumbnail is disabled or URL not provided`);
      }

      const message = await this.channel.send({ embeds: [embed] });
      pluginConfig.messageID = message.id;
      await this.saveConfig();
      logger.info(`ServerStatus plugin: Initial embed posted with message ID: ${message.id}`);

      return message;
    } catch (error) {
      logger.error(`ServerStatus plugin: Error posting initial embed: ${error.message}`);
      throw error;
    }
  }

  async saveConfig() {
    try {
      const configPath = path.resolve(__dirname, "../../config.json");
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), "utf8");
      logger.verbose(`ServerStatus plugin: Config saved with updated message ID`);
    } catch (error) {
      logger.error(`ServerStatus plugin: Error saving config: ${error.message}`);
    }
  }

  async updateEmbed() {
    try {
      const pluginConfig = this.config.plugins.find(plugin => plugin.plugin === "ServerStatus");
      const embedConfig = pluginConfig.embed || {};
      const serverName = this.config.server?.name || "Unknown";

      const playerCount = global.serverPlayerCount || 0;
      const fps = global.serverFPS || 0;
      const memoryUsageMB = ((global.serverMemoryUsage || 0) / 1024).toFixed(2);

      const embed = new EmbedBuilder()
        .setTitle(embedConfig.title || "Server Status")
        .setColor(embedConfig.color || "#00FF00")
        .setDescription(serverName)
        .setTimestamp()
        .addFields(
          { name: "Player Count", value: `${playerCount}`, inline: true },
          { name: "FPS", value: `${fps}`, inline: true },
          { name: "Memory Usage", value: `${memoryUsageMB} MB`, inline: true }
        );

      if (embedConfig.footer) embed.setFooter({ text: embedConfig.footer });
      
      // Only set thumbnail if thumbnail is not explicitly set to false and a URL is provided
      if (embedConfig.thumbnail !== false && embedConfig.thumbnailURL?.trim()) {
        logger.verbose(`ServerStatus plugin: Setting thumbnail to ${embedConfig.thumbnailURL}`);
        embed.setThumbnail(embedConfig.thumbnailURL);
      }

      await this.message.edit({ embeds: [embed] });
      logger.verbose(`ServerStatus plugin: Embed updated with ${playerCount} players, ${fps} FPS, ${memoryUsageMB} MB memory usage`);

      if (pluginConfig.discordBotStatus && this.discordClient?.user) {
        this.discordClient.user.setActivity({
          type: ActivityType.Custom,
          name: `📢${playerCount} Players | ${fps} FPS`,
          state: `📢${playerCount} Players | ${fps} FPS`,
        });
        logger.verbose(`ServerStatus plugin: Discord bot status updated`);
      }
    } catch (error) {
      logger.error(`ServerStatus plugin: Error updating embed: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.verbose(`ServerStatus plugin: Cleanup - interval cleared`);
    }
    this.serverInstance = null;
    this.discordClient = null;
    this.channel = null;
    this.message = null;
    logger.verbose(`ServerStatus plugin: Cleanup complete`);
  }
}

module.exports = ServerStatus;