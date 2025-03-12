// index.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const { printLogo } = require('./reforger-server/utils/logo');
const { validateConfig, performStartupChecks } = require('./reforger-server/factory');
const { loadPlugins, mountPlugins } = require('./reforger-server/pluginLoader');
const logger = require('./reforger-server/logger/logger');

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
        logger.info('CommandHandler initialized successfully.');

        // Add interaction listener for slash commands
        discordClient.on('interactionCreate', async (interaction) => {
            try {
                if (interaction.isCommand()) {
                    // Modified: Extract all command data to pass to the handler
                    const commandName = interaction.commandName;
                    const extraData = {};
                    
                    // Get all options from the interaction
                    if (interaction.options && interaction.options._hoistedOptions) {
                        interaction.options._hoistedOptions.forEach(option => {
                            extraData[option.name] = option.value;
                        });
                    }
                    
                    // Handle the command with all the extracted data
                    await commandHandler.handleCommand(interaction, extraData);
                }
            } catch (error) {
                logger.error(`Error handling interaction: ${error.message}`);
            }
        });

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