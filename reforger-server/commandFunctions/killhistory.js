const { EmbedBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

module.exports = async (interaction, serverInstance, discordClient, extraData = {}) => {
    const identifier = interaction.options.getString('identifier');
    const teamkillsOnly = interaction.options.getBoolean('teamkills_only') || false;
    const serverIdOption = interaction.options.getInteger('server');
    const user = interaction.user;
    
    logger.info(`[KillHistoryRJS Command] User: ${user.username} (ID: ${user.id}) requested kill history for identifier: ${identifier} (teamkills only: ${teamkillsOnly}) on server: ${serverIdOption || 'ALL'}`);

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }

    try {
        const pool = process.mysqlPool || serverInstance.mysqlPool;
        if (!pool) {
            await interaction.editReply('Database connection is not initialized.');
            return;
        }

        const [rjsKillsTableCheck] = await pool.query(`SHOW TABLES LIKE 'rjs_playerkills'`);
        const [playersTableCheck] = await pool.query(`SHOW TABLES LIKE 'players'`);
        
        if (!rjsKillsTableCheck.length) {
            await interaction.editReply('RJS kills table is missing. RJS_DBEvents plugin may not be enabled.');
            return;
        }

        if (!playersTableCheck.length) {
            await interaction.editReply('Players table is missing. DBLog plugin may not be enabled.');
            return;
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        let killerGUID;
        let killerName;

        if (isUUID) {
            killerGUID = identifier;
            
            let existsQuery;
            let queryParams;
            
            if (serverIdOption) {
                existsQuery = `SELECT (
                    EXISTS (SELECT 1 FROM rjs_playerkills WHERE killerBiId = ? AND server_id = ?) 
                    OR EXISTS (SELECT 1 FROM players WHERE playerUID = ?)
                ) AS existsInDB`;
                queryParams = [killerGUID, serverIdOption.toString(), killerGUID];
            } else {
                existsQuery = `SELECT (
                    EXISTS (SELECT 1 FROM rjs_playerkills WHERE killerBiId = ?) 
                    OR EXISTS (SELECT 1 FROM players WHERE playerUID = ?)
                ) AS existsInDB`;
                queryParams = [killerGUID, killerGUID];
            }
            
            const [[playerExists]] = await pool.query(existsQuery, queryParams);
            
            if (!playerExists.existsInDB) {
                const serverMessage = serverIdOption ? ` on server ${serverIdOption}` : '';
                await interaction.editReply(`Player with UUID: ${killerGUID} could not be found${serverMessage}.`);
                return;
            }
            
            const [playerRow] = await pool.query(`SELECT playerName FROM players WHERE playerUID = ?`, [killerGUID]);
            killerName = (playerRow.length > 0) ? playerRow[0].playerName : 'Unknown Player';
        } else {
            const [matchingPlayers] = await pool.query(
                `SELECT DISTINCT playerUID, playerName FROM players WHERE playerName LIKE ?`,
                [`%${identifier}%`]
            );
            
            if (matchingPlayers.length === 0) {
                const [matchingKillers] = await pool.query(
                    `SELECT DISTINCT killerBiId, killerName FROM rjs_playerkills WHERE killerName LIKE ? AND killerBiId IS NOT NULL`,
                    [`%${identifier}%`]
                );
                
                if (matchingKillers.length === 0) {
                    await interaction.editReply(`No players found with name containing: ${identifier}`);
                    return;
                } else if (matchingKillers.length > 1) {
                    const displayCount = Math.min(matchingKillers.length, 3);
                    let responseMessage = `Found ${matchingKillers.length} players in kill history matching "${identifier}". `;
                    
                    if (matchingKillers.length > 3) {
                        responseMessage += `Showing first 3 results. Please refine your search or use a UUID instead.\n\n`;
                    } else {
                        responseMessage += `Please use one of the following UUIDs for a specific player:\n\n`;
                    }
                    
                    for (let i = 0; i < displayCount; i++) {
                        const player = matchingKillers[i];
                        responseMessage += `${i+1}. ${player.killerName} - UUID: ${player.killerBiId}\n`;
                    }
                    
                    await interaction.editReply(responseMessage);
                    return;
                } else {
                    killerGUID = matchingKillers[0].killerBiId;
                    killerName = matchingKillers[0].killerName;
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
                killerGUID = matchingPlayers[0].playerUID;
                killerName = matchingPlayers[0].playerName;
            }
        }

        let killHistoryQuery = `
            SELECT 
                victimName, victimBiId, weapon, distance, friendlyFire, teamKill, killType, timestamp, server_id
            FROM rjs_playerkills 
            WHERE killerBiId = ?
        `;
        
        let queryParams = [killerGUID];

        if (serverIdOption) {
            killHistoryQuery += ` AND server_id = ?`;
            queryParams.push(serverIdOption.toString());
        }

        if (teamkillsOnly) {
            killHistoryQuery += ` AND (friendlyFire = true OR teamKill = true)`;
        }

        killHistoryQuery += ` ORDER BY timestamp DESC LIMIT 10`;

        const [killRows] = await pool.query(killHistoryQuery, queryParams);

        if (killRows.length === 0) {
            const teamkillText = teamkillsOnly ? ' teamkill' : '';
            const serverMessage = serverIdOption ? ` on server ${serverIdOption}` : '';
            await interaction.editReply(`No${teamkillText} kill history found for player: ${killerName} (${killerGUID})${serverMessage}`);
            return;
        }

        const teamkillText = teamkillsOnly ? ' Teamkill' : '';
        let serverDisplay = "";
        if (serverIdOption) {
            serverDisplay = `**Server:** ${serverIdOption}\n`;
        } else {
            const serverList = [...new Set(killRows.map(row => row.server_id).filter(Boolean))];
            if (serverList.length > 0) {
                serverDisplay = `**Servers:** ${serverList.join(', ')}\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(`Kill History${teamkillText}`)
            .setDescription(`**Player:** ${killerName}\n**UUID:** ${killerGUID}\n${serverDisplay}**Last ${killRows.length} kills:**\n---------------`)
            .setColor(teamkillsOnly ? "#FF6B35" : "#FFA500")
            .setFooter({ text: "RJS Kill History" });

        let currentEmbedLength = embed.data.description?.length || 0;
        let fieldsAdded = 0;
        const maxFields = 25;
        const maxEmbedLength = 5500; 

        for (let i = 0; i < killRows.length && fieldsAdded < maxFields; i++) {
            const kill = killRows[i];
            const isFriendlyFire = kill.friendlyFire || kill.teamKill;
            const friendlyFireIcon = isFriendlyFire ? "⚠️ " : "";
            const distance = kill.distance ? `${parseFloat(kill.distance).toFixed(1)}m` : 'Unknown';
            const weapon = kill.weapon || 'Unknown';
            const victimGUID = kill.victimBiId || 'Unknown';
            const killType = kill.killType || 'Kill';
            
            const fieldName = `${friendlyFireIcon}${i + 1}. ${kill.victimName || 'Unknown Victim'}`;
            const fieldValue = `**GUID:** ${victimGUID}\n**Weapon:** ${weapon}\n**Distance:** ${distance}\n**Type:** ${killType}\n**Friendly Fire:** ${isFriendlyFire ? 'Yes' : 'No'}`;
            const fieldLength = fieldName.length + fieldValue.length;
            
            if (currentEmbedLength + fieldLength > maxEmbedLength) {
                embed.addFields({
                    name: "⚠️ Truncated",
                    value: `Showing ${fieldsAdded} of ${killRows.length} kills (embed size limit reached)`,
                    inline: false
                });
                break;
            }
            
            embed.addFields({
                name: fieldName,
                value: fieldValue,
                inline: false
            });
            
            currentEmbedLength += fieldLength;
            fieldsAdded++;
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(`[KillHistoryRJS Command] Error: ${error.message}`);
        await interaction.editReply('An error occurred while retrieving kill history.');
    }
};