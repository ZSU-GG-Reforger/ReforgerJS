const { EmbedBuilder } = require("discord.js");

class LogVoteKickVictim {
  constructor(config) {
    this.config = config;
    this.name = "LogVoteKickVictim Plugin";
    this.serverInstance = null;
    this.discordClient = null;
    this.channelOrThread = null;
    this.channelId = null;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async checkPermissionsWithRetry(channel, user, requiredPermissions, retries = 3, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      const perms = channel.permissionsFor(user);
      if (perms && requiredPermissions.every((perm) => perms.has(perm))) {
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
        (plugin) => plugin.plugin === "LogVoteKickVictim"
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
      const requiredPermissions = ["ViewChannel", "SendMessages", "EmbedLinks"];
      const hasPermissions = await this.checkPermissionsWithRetry(
        this.channelOrThread,
        this.discordClient.user,
        requiredPermissions
      );

      if (!hasPermissions) {
        return;
      }

      this.serverInstance.on("voteKickVictim", this.handleVoteKickVictim.bind(this));
    } catch (error) {}
  }

  async handleVoteKickVictim(data) {
    const voteVictimName = data?.voteVictimName || "Missing Value";
    const voteVictimId = data?.voteVictimId || "Missing Id";

    const embed = new EmbedBuilder()
      .setTitle("Player has been Vote Kicked")
      .setDescription(
        `**Server:** ${this.config.server.name}\n\n` +
        `**Player Kicked:** ${voteVictimName}\n` +
        `**Player ID:** ${voteVictimId}`
      )
      .setColor("#FFA500")
      .setFooter({
        text: "VoteKickVictim plugin - ReforgerJS",
      });

    try {
      await this.channelOrThread.send({ embeds: [embed] });
    } catch (error) {}
  }

  async cleanup() {
    if (this.serverInstance) {
      this.serverInstance.removeAllListeners("voteKickVictim");
      this.serverInstance = null;
    }
    this.channelOrThread = null;
    this.discordClient = null;
  }
}

module.exports = LogVoteKickVictim;