const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Reforger player information')
        .addStringOption(option =>
            option
                .setName('identifier')
                .setDescription('The type of identifier (beGUID, UUID, Name, IP, or SteamID)')
                .setRequired(true)
                .addChoices(
                    { name: 'beGUID', value: 'beguid' },
                    { name: 'UUID', value: 'uuid' },
                    { name: 'Name', value: 'name' },
                    { name: 'IP', value: 'ip' },
                    { name: 'SteamID', value: 'steamid' }
                )
        )
        .addStringOption(option =>
            option
                .setName('value')
                .setDescription('The value of the chosen identifier')
                .setRequired(true)
        )
};