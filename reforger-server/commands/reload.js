// reforger-server/commands/reload.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reload plugins without restarting the server')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('What to reload')
                .setRequired(true)
                .addChoices(
                    { name: 'All Plugins', value: 'plugins' },
                    { name: 'Specific Plugin', value: 'plugin' },
                    { name: 'Commands', value: 'commands' },
                    { name: 'Everything', value: 'all' }
                )
        )
        .addStringOption(option =>
            option
                .setName('plugin_name')
                .setDescription('Name of specific plugin to reload (only if type is "plugin")')
                .setRequired(false)
        )
};