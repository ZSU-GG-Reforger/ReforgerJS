const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voteinfo')
        .setDescription('Retrieve player vote statistics by UUID')
        .addStringOption(option =>
            option
                .setName('uuid')
                .setDescription('The UUID of the player')
                .setRequired(true)
        )
};