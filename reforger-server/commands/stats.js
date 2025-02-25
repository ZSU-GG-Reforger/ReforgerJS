const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Retrieve player statistics by UUID or name')
        .addStringOption(option =>
            option
                .setName('identifier')
                .setDescription('The UUID or UserName of the player')
                .setRequired(true)
        )
};
