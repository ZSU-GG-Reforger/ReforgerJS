const { EmbedBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

module.exports = async (interaction, serverInstance, discordClient, extraData = {}) => {
    const identifier = interaction.options.getString('identifier');
    const serverIdOption = interaction.options.getInteger('server');
    const user = interaction.user;
    
    logger.info(`[MessageHistoryRJS Command] User: ${user.username} (ID: ${user.id}) requested message history for identifier: ${identifier} on server: ${serverIdOption || 'ALL'}`);

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }

    try {
        const pool = process.mysqlPool || serverInstance.mysqlPool;
        if (!pool) {
            await interaction.editReply('Database connection is not initialized.');
            return;
        }

        const [rjsChatTableCheck] = await pool.query(`SHOW TABLES LIKE 'rjs_chat'`);
        const [playersTableCheck] = await pool.query(`SHOW TABLES LIKE 'players'`);
        
        if (!rjsChatTableCheck.length) {
            await interaction.editReply('RJS chat table is missing. RJS_DBEvents plugin may not be enabled.');
            return;
        }

        if (!playersTableCheck.length) {
            await interaction.editReply('Players table is missing. DBLog plugin may not be enabled.');
            return;
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        let playerGUID;
        let playerName;

        if (isUUID) {
            playerGUID = identifier;
            
            let existsQuery;
            let queryParams;
            
            if (serverIdOption) {
                existsQuery = `SELECT (
                    EXISTS (SELECT 1 FROM rjs_chat WHERE playerBiId = ? AND server_id = ?) 
                    OR EXISTS (SELECT 1 FROM players WHERE playerUID = ?)
                ) AS existsInDB`;
                queryParams = [playerGUID, serverIdOption.toString(), playerGUID];
            } else {
                existsQuery = `SELECT (
                    EXISTS (SELECT 1 FROM rjs_chat WHERE playerBiId = ?) 
                    OR EXISTS (SELECT 1 FROM players WHERE playerUID = ?)
                ) AS existsInDB`;
                queryParams = [playerGUID, playerGUID];
            }
            
            const [[playerExists]] = await pool.query(existsQuery, queryParams);
            
            if (!playerExists.existsInDB) {
                const serverMessage = serverIdOption ? ` on server ${serverIdOption}` : '';
                await interaction.editReply(`Player with UUID: ${playerGUID} could not be found${serverMessage}.`);
                return;
            }
            
            const [playerRow] = await pool.query(`SELECT playerName FROM players WHERE playerUID = ?`, [playerGUID]);
            playerName = (playerRow.length > 0) ? playerRow[0].playerName : 'Unknown Player';
        } else {
            const [matchingPlayers] = await pool.query(
                `SELECT DISTINCT playerUID, playerName FROM players WHERE playerName LIKE ?`,
                [`%${identifier}%`]
            );
            
            if (matchingPlayers.length === 0) {
                const [matchingChatters] = await pool.query(
                    `SELECT DISTINCT playerBiId, playerName FROM rjs_chat WHERE playerName LIKE ? AND playerBiId IS NOT NULL`,
                    [`%${identifier}%`]
                );
                
                if (matchingChatters.length === 0) {
                    await interaction.editReply(`No players found with name containing: ${identifier}`);
                    return;
                } else if (matchingChatters.length > 1) {
                    const displayCount = Math.min(matchingChatters.length, 3);
                    let responseMessage = `Found ${matchingChatters.length} players in chat history matching "${identifier}". `;
                    
                    if (matchingChatters.length > 3) {
                        responseMessage += `Showing first 3 results. Please refine your search or use a UUID instead.\n\n`;
                    } else {
                        responseMessage += `Please use one of the following UUIDs for a specific player:\n\n`;
                    }
                    
                    for (let i = 0; i < displayCount; i++) {
                        const player = matchingChatters[i];
                        responseMessage += `${i+1}. ${player.playerName} - UUID: ${player.playerBiId}\n`;
                    }
                    
                    await interaction.editReply(responseMessage);
                    return;
                } else {
                    playerGUID = matchingChatters[0].playerBiId;
                    playerName = matchingChatters[0].playerName;
                }
            } else if (matchingPlayers.length > 1) {
                const displayCount = Math.min(matchingPlayers.length, 3);
                let responseMessage = `Found ${matchingPlayers.length} players matching "${identifier}". `;
                
                if (matchingPlayers.length > 3) {
                    responseMessage += `Showing first 3 results. Please refine your search or use a UUID instead.\n\n`;
                } else {
                    responseMessage += `Please use one of the following UUIDs for a specific player:\n\n`;
                }
                
                for (let i = 0; i < displayCount; i++) {
                    const player = matchingPlayers[i];
                    responseMessage += `${i+1}. ${player.playerName} - UUID: ${player.playerUID}\n`;
                }
                
                await interaction.editReply(responseMessage);
                return;
            } else {
                playerGUID = matchingPlayers[0].playerUID;
                playerName = matchingPlayers[0].playerName;
            }
        }

        let messageHistoryQuery = `
            SELECT 
                channelType, message, timestamp, server_id
            FROM rjs_chat 
            WHERE playerBiId = ?
        `;
        
        let queryParams = [playerGUID];

        if (serverIdOption) {
            messageHistoryQuery += ` AND server_id = ?`;
            queryParams.push(serverIdOption.toString());
        }

        messageHistoryQuery += ` ORDER BY timestamp DESC LIMIT 10`;

        const [messageRows] = await pool.query(messageHistoryQuery, queryParams);

        if (messageRows.length === 0) {
            const serverMessage = serverIdOption ? ` on server ${serverIdOption}` : '';
            await interaction.editReply(`No chat message history found for player: ${playerName} (${playerGUID})${serverMessage}`);
            return;
        }

        let serverDisplay = "";
        if (serverIdOption) {
            serverDisplay = `**Server:** ${serverIdOption}\n`;
        } else {
            const serverList = [...new Set(messageRows.map(row => row.server_id).filter(Boolean))];
            if (serverList.length > 0) {
                serverDisplay = `**Servers:** ${serverList.join(', ')}\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`💬 Chat Message History`)
            .setDescription(`**Player:** ${playerName}\n**UUID:** ${playerGUID}\n${serverDisplay}**Last ${messageRows.length} messages:**\n---------------`)
            .setColor("#4287f5")
            .setFooter({ text: "RJS Message History" });

        let currentEmbedLength = embed.data.description?.length || 0;
        let fieldsAdded = 0;
        const maxFields = 25;
        const maxEmbedLength = 5500; 

        for (let i = 0; i < messageRows.length && fieldsAdded < maxFields; i++) {
            const msg = messageRows[i];
            const channelType = msg.channelType || 'Unknown';
            const message = msg.message || 'Empty message';
            
            let truncatedMessage = message.length > 200 ? message.substring(0, 200) + '...' : message;
            
            const fieldName = `${i + 1}. [${channelType}]`;
            const fieldLength = fieldName.length + truncatedMessage.length;
            
            if (currentEmbedLength + fieldLength > maxEmbedLength) {
                const availableSpace = maxEmbedLength - currentEmbedLength - fieldName.length - 50;
                if (availableSpace > 50) {
                    truncatedMessage = message.length > availableSpace ? message.substring(0, availableSpace) + '...' : message;
                } else {
                    embed.addFields({
                        name: "⚠️ Truncated",
                        value: `Showing ${fieldsAdded} of ${messageRows.length} messages (embed size limit reached)`,
                        inline: false
                    });
                    break;
                }
            }
            
            embed.addFields({
                name: fieldName,
                value: truncatedMessage,
                inline: false
            });
            
            currentEmbedLength += fieldLength;
            fieldsAdded++;
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(`[MessageHistoryRJS Command] Error: ${error.message}`);
        await interaction.editReply('An error occurred while retrieving message history.');
    }
};