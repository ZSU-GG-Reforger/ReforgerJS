const { EmbedBuilder } = require("discord.js");

class LogVoteKickStart {
  constructor(config) {
    this.config = config;
    this.name = "LogVoteKickStart Plugin";
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
        (plugin) => plugin.plugin === "LogVoteKickStart"
      );
      if (!pluginConfig || !pluginConfig.channel) {
        return;
      }

      this.channelId = pluginConfig.channel;
      const guild = await this.discordClient.guilds.fetch(this.config.connectors.discord.guildId, {
        cache: true,
        force: true,
      });

      const channelOrThread = await guild.channels.fetch(this.channelId);
      if (!channelOrThread || (!channelOrThread.isThread() && !channelOrThread.isTextBased())) {
        return;
      }

      this.channelOrThread = channelOrThread;

      const canSend = await this.checkPermissionsWithRetry(
        this.channelOrThread,
        this.discordClient.user,
        "SendMessages"
      );

      if (!canSend) {
        return;
      }

      this.serverInstance.on("voteKickStart", this.handleVoteKickStart.bind(this));
    } catch (error) {}
  }

  async handleVoteKickStart(data) {
    const voteOffenderName = data?.voteOffenderName || "Missing Value";
    const voteOffenderId = data?.voteOffenderId || "Missing Id";
    const voteVictimName = data?.voteVictimName || "Missing Value";
    const voteVictimId = data?.voteVictimId || "Missing Id";

    const embed = new EmbedBuilder()
      .setTitle("Player has initiated a vote kick!")
      .setDescription(
        `**Server:** ${this.config.server.name}\n\n` +
        `**Player Initiating Vote:** ${voteOffenderName}\n` +
        `**Player ID:** ${voteOffenderId}\n\n` +
        `**Target Player:** ${voteVictimName}\n` +
        `**Target Player ID:** ${voteVictimId}`
      )
      .setColor("#FFA500")
      .setFooter({
        text: "VoteKickStart plugin - ReforgerJS",
      });

    try {
      await this.channelOrThread.send({ embeds: [embed] });
    } catch (error) {}
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners("voteKickStart");
      this.serverInstance = null;
    }
    this.channelOrThread = null;
    this.discordClient = null;
  }
}

module.exports = LogVoteKickStart;