const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

async function deployCommands(config, logger, discordClient = null) {
    if (!config || !logger) {
        console.error('Missing required parameters: config and logger must be provided');
        return false;
    }

    try {
        if (!config.connectors || !config.connectors.discord) {
            logger.error('Discord connector configuration is missing in the config.');
            return false;
        }
        
        const discordConfig = config.connectors.discord;
        if (!discordConfig.token || !discordConfig.clientId || !discordConfig.guildId) {
            logger.error('Discord token, clientId, or guildId is missing in the config.');
            return false;
        }
        
        if (!config.commands || !Array.isArray(config.commands)) {
            logger.error('Commands configuration is missing or not an array in the config.');
            return false;
        }

        const rest = new REST({ version: '10' }).setToken(discordConfig.token);

        logger.info('Clearing existing commands...');
        await rest.put(
            Routes.applicationGuildCommands(discordConfig.clientId, discordConfig.guildId),
            { body: [] }
        );
        logger.info('Successfully cleared existing commands.');

        const commandsPath = path.resolve(process.cwd(), './reforger-server/commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        const commands = [];

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            const commandConfig = config.commands.find(cmd => cmd.command === command.data.name);
            if (commandConfig && commandConfig.enabled) {
                commands.push(command.data.toJSON());
                logger.info(`Command '/${command.data.name}' loaded.`);
            } else {
                logger.info(`Command '/${command.data.name}' is disabled in the config and will not be loaded.`);
            }
        }

        if (commands.length > 0) {
            logger.info('Deploying commands...');
            await rest.put(
                Routes.applicationGuildCommands(discordConfig.clientId, discordConfig.guildId),
                { body: commands }
            );
            logger.info(`Successfully deployed ${commands.length} commands.`);
            
            if (discordClient) {
                logger.verbose('Refreshing Discord client command cache...');
                await discordClient.application.commands.fetch();
                logger.verbose('Discord command cache refreshed.');
            }
        } else {
            logger.warn('No commands to deploy. All commands are disabled in config.');
        }
        
        return true;
    } catch (error) {
        logger.error(`Error deploying commands: ${error.message}`);
        logger.debug(error.stack);
        return false;
    }
}

// When run directly as a script, used for backward compatibility of older versions
if (require.main === module) {
    const logger = require('./reforger-server/logger/logger');
    
    (async () => {
        const configPath = path.resolve(__dirname, './config.json');
        let config;
        
        try {
            const rawData = fs.readFileSync(configPath, 'utf8');
            if (!rawData) {
                throw new Error('Config file is empty.');
            }
            config = JSON.parse(rawData);
        } catch (error) {
            logger.error(`Error reading config file: ${error.message}`);
            process.exit(1);
        }
        
        await deployCommands(config, logger);
        process.exit(0);
    })();
} else {
    module.exports = deployCommands;
}