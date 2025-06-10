const fs = require('fs');
const path = require('path');

class ButtonHandler {
    constructor(config, serverInstance, discordClient) {
        this.config = config;
        this.serverInstance = serverInstance;
        this.discordClient = discordClient;
    }

    async initialize() {
        if (!this.config || !this.config.commands || !this.config.roleLevels || !this.config.roles) {
            throw new Error('ButtonHandler configuration is missing required fields.');
        }

        logger.info('ButtonHandler initialized successfully.');
    }

    async handleButton(interaction) {
        if (!interaction.isButton()) return;

        const customId = interaction.customId;
        
        logger.verbose(`ButtonHandler: Received button interaction with customId: ${customId}`);
        logger.verbose(`ButtonHandler: Interaction user: ${interaction.user.username} (${interaction.user.id})`);
        logger.verbose(`ButtonHandler: Interaction type: ${interaction.type}, isButton: ${interaction.isButton()}`);
        
        const idParts = customId.split('-');
        if (idParts.length < 2) {
            logger.warn(`ButtonHandler: Invalid custom ID format: ${customId}`);
            await this.sendErrorResponse(interaction, 'Invalid button configuration.');
            return;
        }

        const commandName = idParts[0];
        const buttonId = idParts.slice(1).join('-'); 

        logger.verbose(`ButtonHandler: Processing button interaction - Command: ${commandName}, Button ID: ${buttonId}, User: ${interaction.user.username} (${interaction.user.id})`);

        const commandConfig = this.config.commands.find(cmd => cmd.command === commandName);
        if (!commandConfig || !commandConfig.enabled) {
            logger.warn(`ButtonHandler: Command '${commandName}' is disabled or not found in config`);
            logger.warn(`ButtonHandler: Available commands: ${this.config.commands.map(cmd => cmd.command).join(', ')}`);
            await this.sendErrorResponse(interaction, 'This feature is currently disabled.');
            return;
        }

        logger.verbose(`ButtonHandler: Command '${commandName}' found and enabled, command level: ${commandConfig.commandLevel}`);

        const commandLevel = commandConfig.commandLevel;
        if (commandLevel !== 0) {
            const userRoles = interaction.member ? interaction.member.roles.cache.map(role => role.id) : [];
            const allowedRoles = this.getAllowedRolesForLevel(commandLevel);

            logger.verbose(`ButtonHandler: User roles: ${userRoles.join(', ')}`);
            logger.verbose(`ButtonHandler: Allowed roles for level ${commandLevel}: ${allowedRoles.join(', ')}`);

            if (!this.userHasPermission(userRoles, allowedRoles)) {
                logger.warn(`ButtonHandler: User ${interaction.user.username} (${interaction.user.id}) lacks permission for button ${customId}`);
                await this.sendErrorResponse(interaction, 'You do not have permission to use this button.');
                return;
            }
        }

        logger.verbose(`ButtonHandler: Permission check passed for user ${interaction.user.username}`);

        try {
            const buttonHandlerPath = path.join(__dirname, 'commandFunctions', `${commandName}.js`);
            
            logger.verbose(`ButtonHandler: Looking for handler at: ${buttonHandlerPath}`);
            
            if (!fs.existsSync(buttonHandlerPath)) {
                logger.error(`ButtonHandler: No handler file found for command '${commandName}' at ${buttonHandlerPath}`);
                await this.sendErrorResponse(interaction, 'Button handler not found.');
                return;
            }

            logger.verbose(`ButtonHandler: Handler file found, attempting to load module`);

            let buttonHandlerModule;
            try {
                delete require.cache[require.resolve(buttonHandlerPath)];
                buttonHandlerModule = require(buttonHandlerPath);
                logger.info(`ButtonHandler: Module loaded successfully`);
            } catch (requireError) {
                logger.error(`ButtonHandler: Error loading handler module for '${commandName}': ${requireError.message}`);
                logger.error(`ButtonHandler: Stack trace: ${requireError.stack}`);
                await this.sendErrorResponse(interaction, 'Error loading button handler.');
                return;
            }

            if (typeof buttonHandlerModule.handleButton !== 'function') {
                logger.error(`ButtonHandler: Handler for '${commandName}' does not export a handleButton function`);
                logger.error(`ButtonHandler: Available exports: ${Object.keys(buttonHandlerModule).join(', ')}`);
                await this.sendErrorResponse(interaction, 'Button handler configuration error.');
                return;
            }

            logger.verbose(`ButtonHandler: handleButton function found, preparing to execute`);

            const extraData = {
                customId: customId,
                buttonId: buttonId,
                commandConfig: commandConfig,
                originalMessage: interaction.message
            };

            logger.verbose(`ButtonHandler: Executing button handler for '${commandName}' with buttonId '${buttonId}'`);

            await buttonHandlerModule.handleButton(interaction, this.serverInstance, this.discordClient, extraData);

            logger.verbose(`ButtonHandler: Button handler executed successfully for '${commandName}'`);

        } catch (error) {
            logger.error(`ButtonHandler: Error executing button handler for '${commandName}': ${error.message}`);
            logger.error(`ButtonHandler: Stack trace: ${error.stack}`);
            await this.sendErrorResponse(interaction, 'An error occurred while processing your request.');
        }
    }

    async sendErrorResponse(interaction, message) {
        try {
            logger.verbose(`ButtonHandler: Sending error response: ${message}`);
            logger.verbose(`ButtonHandler: Interaction state - replied: ${interaction.replied}, deferred: ${interaction.deferred}`);

            if (!interaction.replied && !interaction.deferred) {
                logger.info(`ButtonHandler: Using reply for error response`);
                await interaction.reply({
                    content: message,
                    ephemeral: true
                });
            } else if (interaction.deferred && !interaction.replied) {
                logger.verbose(`ButtonHandler: Using editReply for error response`);
                await interaction.editReply({
                    content: message
                });
            } else {
                logger.verbose(`ButtonHandler: Using followUp for error response`);
                await interaction.followUp({
                    content: message,
                    ephemeral: true
                });
            }
        } catch (replyError) {
            logger.error(`ButtonHandler: Error sending error response: ${replyError.message}`);
            logger.error(`ButtonHandler: Reply error stack: ${replyError.stack}`);
        }
    }

    getAllowedRolesForLevel(level) {
        const roleLevels = this.config.roleLevels;
        const allowedRoles = [];

        for (const [key, roles] of Object.entries(roleLevels)) {
            if (parseInt(key, 10) <= level) {
                roles.forEach(role => {
                    if (this.config.roles[role]) {
                        allowedRoles.push(this.config.roles[role]);
                    }
                });
            }
        }

        return allowedRoles;
    }

    userHasPermission(userRoles, allowedRoles) {
        return userRoles.some(role => allowedRoles.includes(role));
    }

    async cleanup() {
        logger.info('ButtonHandler cleanup completed.');
    }
}

module.exports = ButtonHandler;