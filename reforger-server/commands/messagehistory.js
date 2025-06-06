const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('messagehistory')
        .setDescription('Retrieve player chat message history from RJS by UUID or name')
        .addStringOption(option =>
            option
                .setName('identifier')
                .setDescription('The UUID or UserName of the player')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('server')
                .setDescription('Server Number (leave empty for all servers)')
                .setRequired(false)
        )
};