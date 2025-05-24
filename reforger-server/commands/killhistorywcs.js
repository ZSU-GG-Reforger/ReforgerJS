const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('killhistorywcs')
        .setDescription('Retrieve player kill history from WCS by UUID or name')
        .addStringOption(option =>
            option
                .setName('identifier')
                .setDescription('The UUID or UserName of the player')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName('teamkills_only')
                .setDescription('Show only teamkills (friendly fire incidents)')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('server')
                .setDescription('Server Number (leave empty for all servers)')
                .setRequired(false)
        )
};