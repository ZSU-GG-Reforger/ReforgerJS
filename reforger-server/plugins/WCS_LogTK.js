const { EmbedBuilder } = require("discord.js");

class WCS_LogTK {
  constructor(config) {
    this.config = config;
    this.name = "WCS_LogTK Plugin";
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
        (plugin) => plugin.plugin === "WCS_LogTK"
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

      this.serverInstance.on("playerKilledEvent", this.handlePlayerKilled.bind(this));
      
      logger.info(`[${this.name}] Initialized and listening to playerKilledEvent events.`);
    } catch (error) {
      logger.error(`[${this.name}] Error during initialization: ${error.stack}`);
    }
  }

  async handlePlayerKilled(data) {
    if (!data || !data.kill || !data.kill.friendlyFire) {
      return;
    }

    const killerName = data?.killer?.name || "Unknown Killer";
    const killerId = data?.killer?.id || "Unknown ID";
    const killerGUID = data?.killer?.guid || "Unknown GUID";
    
    const victimName = data?.victim?.name || "Unknown Victim";
    const victimId = data?.victim?.id || "Unknown ID";
    const victimGUID = data?.victim?.guid || "Unknown GUID";
    
    const weapon = data?.kill?.weapon || "Unknown";
    const distance = data?.kill?.distance || 0;

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Friendly Fire Incident")
      .setDescription(`**Server:** ${this.config.server.name}`)
      .setColor("#FF6B35")
      .addFields(
        {
          name: "🔫 Killer",
          value: `**Name:** ${killerName}\n**ID:** ${killerId}\n**GUID:** ${killerGUID}`,
          inline: true
        },
        {
          name: "💀 Victim", 
          value: `**Name:** ${victimName}\n**ID:** ${victimId}\n**GUID:** ${victimGUID}`,
          inline: true
        },
        {
          name: "📊 Details",
          value: `**Weapon:** ${weapon}\n**Distance:** ${distance.toFixed(2)}m`,
          inline: true
        }
      )
      .setFooter({
        text: weapon === "Unknown" ? 
          "If weapon is Unknown, this could be a result of a car crash etc" :
          "WCS_LogTK Plugin - ReforgerJS"
      })
      .setTimestamp();

    try {
      await this.channelOrThread.send({ embeds: [embed] });
      logger.info(`[${this.name}] Logged friendly fire: ${killerName} killed ${victimName} with ${weapon}`);
    } catch (error) {
      logger.error(`[${this.name}] Failed to send embed: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners("playerKilledEvent");
      this.serverInstance = null;
    }
    this.channelOrThread = null;
    this.discordClient = null;
    logger.verbose(`[${this.name}] Cleanup completed.`);
  }
}

module.exports = WCS_LogTK;