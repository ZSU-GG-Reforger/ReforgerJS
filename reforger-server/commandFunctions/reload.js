// reforger-server/commandFunctions/reload.js
const fs = require('fs');
const path = require('path');
const { loadPlugins, mountPlugins } = require('../pluginLoader');
const deployCommands = require('../../deploy-commands');

module.exports = async (interaction, serverInstance, discordClient, extraData = {}) => {
    const reloadType = interaction.options.getString('type');
    const pluginName = interaction.options.getString('plugin_name');
    const user = interaction.user;
    
    logger.info(`[Reload Command] User: ${user.username} (ID: ${user.id}) requested reload of: ${reloadType} ${pluginName ? `(plugin: ${pluginName})` : ''}`);

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }

    try {
        const configPath = path.resolve(__dirname, '../../config.json');
        let newConfig;
        
        try {
            const rawData = fs.readFileSync(configPath, 'utf8');
            newConfig = JSON.parse(rawData);
        } catch (error) {
            await interaction.editReply(`❌ **Error loading config:** ${error.message}`);
            return;
        }

        let reloadResults = [];

        if (reloadType === 'plugins' || reloadType === 'all') {
            reloadResults.push(await reloadAllPlugins(serverInstance, discordClient, newConfig));
        }

        if (reloadType === 'plugin') {
            if (!pluginName) {
                await interaction.editReply('❌ **Error:** Plugin name is required when reloading a specific plugin.');
                return;
            }
            reloadResults.push(await reloadSpecificPlugin(serverInstance, discordClient, newConfig, pluginName));
        }

        if (reloadType === 'commands' || reloadType === 'all') {
            reloadResults.push(await reloadCommands(newConfig, discordClient));
        }

        serverInstance.config = newConfig;

        const successCount = reloadResults.filter(r => r.success).length;
        const totalCount = reloadResults.length;
        
        let responseMessage = `✅ **Reload Complete** (${successCount}/${totalCount} operations successful)\n\n`;
        
        reloadResults.forEach(result => {
            const emoji = result.success ? '✅' : '❌';
            responseMessage += `${emoji} **${result.operation}:** ${result.message}\n`;
        });

        if (responseMessage.length > 2000) {
            responseMessage = responseMessage.substring(0, 1950) + '...\n*Response truncated*';
        }

        await interaction.editReply(responseMessage);

    } catch (error) {
        logger.error(`[Reload Command] Error: ${error.message}`);
        await interaction.editReply(`❌ **Unexpected error:** ${error.message}`);
    }
};

async function reloadAllPlugins(serverInstance, discordClient, newConfig) {
    try {
        logger.info('[Reload Command] Starting full plugin reload...');
        
        if (global.currentPlugins && Array.isArray(global.currentPlugins)) {
            let cleanupCount = 0;
            for (const pluginInstance of global.currentPlugins) {
                if (typeof pluginInstance.cleanup === 'function') {
                    try {
                        await pluginInstance.cleanup();
                        cleanupCount++;
                        logger.verbose(`[Reload Command] Cleaned up plugin: ${pluginInstance.name || 'Unnamed Plugin'}`);
                    } catch (error) {
                        logger.error(`[Reload Command] Error cleaning up plugin '${pluginInstance.name || 'Unnamed Plugin'}': ${error.message}`);
                    }
                }
            }
            logger.info(`[Reload Command] Cleaned up ${cleanupCount} plugins`);
        }

        clearPluginCache();

        const newPlugins = await loadPlugins(newConfig);
        logger.info(`[Reload Command] Loaded ${newPlugins.length} plugins`);

        await mountPlugins(newPlugins, serverInstance, discordClient);
        logger.info(`[Reload Command] Mounted ${newPlugins.length} plugins`);

        global.currentPlugins = newPlugins;

        return {
            success: true,
            operation: 'Plugin Reload',
            message: `Successfully reloaded ${newPlugins.length} plugins`
        };

    } catch (error) {
        logger.error(`[Reload Command] Plugin reload failed: ${error.message}`);
        return {
            success: false,
            operation: 'Plugin Reload',
            message: `Failed: ${error.message}`
        };
    }
}

async function reloadSpecificPlugin(serverInstance, discordClient, newConfig, pluginName) {
    try {
        logger.info(`[Reload Command] Starting reload of specific plugin: ${pluginName}`);

        if (global.currentPlugins && Array.isArray(global.currentPlugins)) {
            const pluginIndex = global.currentPlugins.findIndex(p => 
                p.name === pluginName || 
                p.name === `${pluginName} Plugin` ||
                p.constructor.name === pluginName
            );

            if (pluginIndex !== -1) {
                const oldPlugin = global.currentPlugins[pluginIndex];
                if (typeof oldPlugin.cleanup === 'function') {
                    await oldPlugin.cleanup();
                    logger.info(`[Reload Command] Cleaned up plugin: ${oldPlugin.name}`);
                }
                global.currentPlugins.splice(pluginIndex, 1);
            }
        }

        const pluginPath = path.join(__dirname, '../plugins', `${pluginName}.js`);
        if (require.cache[require.resolve(pluginPath)]) {
            delete require.cache[require.resolve(pluginPath)];
            logger.verbose(`[Reload Command] Cleared cache for: ${pluginPath}`);
        }

        const pluginConfig = newConfig.plugins.find(plugin => plugin.plugin === pluginName);
        if (!pluginConfig) {
            return {
                success: false,
                operation: `Plugin Reload (${pluginName})`,
                message: `Plugin not found in configuration`
            };
        }

        if (!pluginConfig.enabled) {
            return {
                success: true,
                operation: `Plugin Reload (${pluginName})`,
                message: `Plugin is disabled in configuration - skipped`
            };
        }

        if (fs.existsSync(pluginPath)) {
            try {
                const PluginClass = require(pluginPath);
                const pluginInstance = new PluginClass(newConfig);
                
                if (typeof pluginInstance.prepareToMount === 'function') {
                    await pluginInstance.prepareToMount(serverInstance, discordClient);
                }

                if (!global.currentPlugins) global.currentPlugins = [];
                global.currentPlugins.push(pluginInstance);

                logger.info(`[Reload Command] Successfully reloaded plugin: ${pluginName}`);
                return {
                    success: true,
                    operation: `Plugin Reload (${pluginName})`,
                    message: `Successfully reloaded`
                };

            } catch (error) {
                logger.error(`[Reload Command] Error loading plugin ${pluginName}: ${error.message}`);
                return {
                    success: false,
                    operation: `Plugin Reload (${pluginName})`,
                    message: `Load error: ${error.message}`
                };
            }
        } else {
            return {
                success: false,
                operation: `Plugin Reload (${pluginName})`,
                message: `Plugin file not found: ${pluginPath}`
            };
        }

    } catch (error) {
        logger.error(`[Reload Command] Specific plugin reload failed: ${error.message}`);
        return {
            success: false,
            operation: `Plugin Reload (${pluginName})`,
            message: `Failed: ${error.message}`
        };
    }
}

async function reloadCommands(newConfig, discordClient) {
    try {
        logger.info('[Reload Command] Starting command reload...');
        
        const success = await deployCommands(newConfig, logger, discordClient);
        
        if (success) {
            return {
                success: true,
                operation: 'Commands Reload',
                message: 'Successfully reloaded Discord commands'
            };
        } else {
            return {
                success: false,
                operation: 'Commands Reload',
                message: 'Failed to deploy commands'
            };
        }

    } catch (error) {
        logger.error(`[Reload Command] Command reload failed: ${error.message}`);
        return {
            success: false,
            operation: 'Commands Reload',
            message: `Failed: ${error.message}`
        };
    }
}

function clearPluginCache() {
    const pluginsDir = path.join(__dirname, '../plugins');
    
    if (fs.existsSync(pluginsDir)) {
        const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
        
        pluginFiles.forEach(file => {
            const pluginPath = path.join(pluginsDir, file);
            if (require.cache[require.resolve(pluginPath)]) {
                delete require.cache[require.resolve(pluginPath)];
                logger.verbose(`[Reload Command] Cleared cache for: ${pluginPath}`);
            }
        });
        
        logger.info(`[Reload Command] Cleared require cache for ${pluginFiles.length} plugin files`);
    }
}