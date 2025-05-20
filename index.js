// index.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const { printLogo } = require('./reforger-server/utils/logo');
const { validateConfig, performStartupChecks } = require('./reforger-server/factory');
const { loadPlugins, mountPlugins } = require('./reforger-server/pluginLoader');
const logger = require('./reforger-server/logger/logger');
const deployCommands = require('./deploy-commands');

function loadConfig(filePath) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        if (error instanceof SyntaxError) {
            logger.error(`Invalid JSON in config file: ${error.message}`);
            console.error('Invalid JSON in config file. Exiting.');
        } else {
            logger.error(`Error reading config file: ${error.message}`);
            console.error('Error reading config file. Exiting.');
        }
        process.exit(1);
    }
}

async function main() {
    try {
        printLogo();

        // 1) Load config
        const configPath = path.resolve(__dirname, './config.json');
        const config = loadConfig(configPath);

        // 2) Validate config
        if (!validateConfig(config)) {
            logger.error('Invalid configuration. Please check your config.json.');
            process.exit(1);
        }

        // 3) Perform startup checks and get the Discord client
        const discordClient = await performStartupChecks(config);

        // 3.5) Reload Discord commands if configured
        if (config.server && config.server.reloadCommandsOnStartup === true) {
            logger.info('Reloading Discord commands on startup (reloadCommandsOnStartup=true)...');
            const success = await deployCommands(config, logger, discordClient);
            if (success) {
                logger.info('Discord commands successfully reloaded.');
            } else {
                logger.warn('Failed to reload Discord commands. Bot will continue with existing commands.');
            }
        } else {
            logger.verbose('Skipping command reload on startup (reloadCommandsOnStartup is disabled).');
        }

        // 4) Create and initialize ReforgerServer
        const ReforgerServer = require('./reforger-server/main');
        const serverInstance = new ReforgerServer(config);
        await serverInstance.initialize();
        logger.info('ReforgerServer initialized successfully.');

        // 5) Load plugins
        const loadedPlugins = await loadPlugins(config);

        // 6) Mount plugins with the server instance and Discord client
        await mountPlugins(loadedPlugins, serverInstance, discordClient);

        // 7) Load and initialize CommandHandler
        const CommandHandler = require('./reforger-server/commandHandler');
        const commandHandler = new CommandHandler(config, serverInstance, discordClient);
        await commandHandler.initialize();

        // Add interaction listener for slash commands
        discordClient.on('interactionCreate', async (interaction) => {
            try {
                if (interaction.isCommand()) {
                    const commandName = interaction.commandName;
                    const extraData = {};
                    
                    if (interaction.options && interaction.options._hoistedOptions) {
                        interaction.options._hoistedOptions.forEach(option => {
                            extraData[option.name] = option.value;
                        });
                    }
                    
                    await commandHandler.handleCommand(interaction, extraData);
                }
            } catch (error) {
                logger.error(`Error handling interaction: ${error.message}`);
            }
        });
        
        // 8) Connect RCON, start sending 'players'
        serverInstance.startSendingPlayersCommand(30000);
        logger.info('Server is up and running!');

        // Graceful shutdown handling
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT. Shutting down gracefully...');
            for (const pluginInstance of loadedPlugins) {
                if (typeof pluginInstance.cleanup === 'function') {
                    try {
                        await pluginInstance.cleanup();
                        logger.info(`Plugin '${pluginInstance.name || 'Unnamed Plugin'}' cleaned up successfully.`);
                    } catch (error) {
                        logger.error(`Error during cleanup of plugin '${pluginInstance.name || 'Unnamed Plugin'}': ${error.message}`);
                    }
                }
            }
            if (typeof commandHandler.cleanup === 'function') await commandHandler.cleanup();
            if (typeof serverInstance.cleanup === 'function') await serverInstance.cleanup();
            if (discordClient) await discordClient.destroy();
            process.exit(0);
        });
    } catch (error) {
        logger.error(`An error occurred: ${error.message}`);
        process.exit(1);
    }
}

main();