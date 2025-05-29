const { EmbedBuilder } = require("discord.js");

class RJS_LogChat {
  constructor(config) {
    this.config = config;
    this.name = "RJS_LogChat Plugin";
    this.serverInstance = null;
    this.discordClient = null;
    this.channelOrThread = null;
    this.channelId = null;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async checkPermissionsWithRetry(channel, user, permission, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      const perms = channel.permissionsFor(user);
      if (perms && perms.has(permission)) {
        return true;
      }
      await this.delay(delayMs);
    }
    return false;
  }

  async prepareToMount(serverInstance, discordClient) {
    await this.cleanup();
    this.serverInstance = serverInstance;
    this.discordClient = discordClient;

    try {
      const pluginConfig = this.config.plugins.find(
        (plugin) => plugin.plugin === "RJS_LogChat"
      );
      if (!pluginConfig || !pluginConfig.channel) {
        logger.warn(`[${this.name}] Missing 'channel' ID in plugin config. Plugin disabled.`);
        return;
      }

      this.channelId = pluginConfig.channel;
      const guild = await this.discordClient.guilds.fetch(
        this.config.connectors.discord.guildId,
        { cache: true, force: true }
      );

      const channelOrThread = await guild.channels.fetch(this.channelId);
      if (!channelOrThread) {
        logger.warn(`[${this.name}] Unable to find channel or thread with ID ${this.channelId}. Plugin disabled.`);
        return;
      }

      if (channelOrThread.isThread()) {
        this.channelOrThread = channelOrThread;
      } else if (channelOrThread.isTextBased()) {
        this.channelOrThread = channelOrThread;
      } else {
        logger.warn(`[${this.name}] The specified ID is not a valid text channel or thread. Plugin disabled.`);
        return;
      }

      const canSend = await this.checkPermissionsWithRetry(
        this.channelOrThread,
        this.discordClient.user,
        "SendMessages"
      );

      if (!canSend) {
        logger.warn(`[${this.name}] Bot does not have permission to send messages in the channel or thread. Plugin disabled.`);
        return;
      }

      this.serverInstance.on("rjsChatMessageEvent", this.handleChatMessage.bind(this));
      
      logger.info(`[${this.name}] Initialized and listening to rjsChatMessageEvent events.`);
    } catch (error) {
      logger.error(`[${this.name}] Error during initialization: ${error.stack}`);
    }
  }

  getChannelColor(channelType) {
    const colors = {
      'Global': '#FF0000',    // Red
      'Faction': '#0099FF',   // Blue
      'Group': '#00FF00',     // Green
      'Vehicle': '#FF9900',   // Orange
      'Local': '#9966FF',     // Purple
      'Unknown': '#808080'    // Gray
    };
    return colors[channelType] || colors['Unknown'];
  }

  async handleChatMessage(data) {
    if (!data || !data.message) {
      return;
    }

    const playerId = data?.playerId || "Unknown ID";
    const playerName = data?.playerName || "Unknown Player";
    const playerBiId = data?.playerBiId || "Unknown BiID";
    const channelType = data?.channelType || "Unknown";
    const message = data?.message || "";

    const channelColor = this.getChannelColor(channelType);

    const embed = new EmbedBuilder()
      .setTitle(`Chat Message - ${channelType}`)
      .setDescription(`**Server:** ${this.config.server.name}`)
      .setColor(channelColor)
      .addFields(
        {
          name: "👤 Player Info",
          value: `**ID:** ${playerId}\n**Name:** ${playerName}\n**BiID:** ${playerBiId}`,
          inline: true
        },
        {
          name: "📺 Channel",
          value: `**Type:** ${channelType}`,
          inline: true
        },
        {
          name: "💬 Message",
          value: message,
          inline: false
        }
      )
      .setFooter({
        text: "RJS_LogChat Plugin - ReforgerJS"
      })
      .setTimestamp();

    try {
      await this.channelOrThread.send({ embeds: [embed] });
      logger.verbose(`[${this.name}] Logged RJS chat message from ${playerName} in ${channelType}: ${message}`);
    } catch (error) {
      logger.error(`[${this.name}] Failed to send embed: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners("rjsChatMessageEvent");
      this.serverInstance = null;
    }
    this.channelOrThread = null;
    this.discordClient = null;
    logger.verbose(`[${this.name}] Cleanup completed.`);
  }
}

module.exports = RJS_LogChat;