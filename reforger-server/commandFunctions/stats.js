const { EmbedBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

module.exports = async (interaction, serverInstance, discordClient, extraData = {}) => {
    const identifier = interaction.options.getString('identifier');
    const serverIdOption = interaction.options.getInteger('server');
    const user = interaction.user;
    logger.info(`[Stats Command] User: ${user.username} (ID: ${user.id}) requested stats for identifier: ${identifier} on server: ${serverIdOption || 'ALL'}`);

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }

    try {
        const pool = process.mysqlPool || serverInstance.mysqlPool;
        if (!pool) {
            await interaction.editReply('Database connection is not initialized.');
            return;
        }

        const statsConfig = serverInstance.config.commands.find(c => c.command === 'stats');
        if (!statsConfig || !statsConfig.statsTable) {
            await interaction.editReply('Stats command is not properly configured.');
            return;
        }
        
        const statsTable = statsConfig.statsTable;
        const totalServers = statsConfig.servers || 1;

        if (serverIdOption !== null && serverIdOption !== undefined) {
            if (serverIdOption <= 0 || serverIdOption > totalServers) {
                await interaction.editReply(`Invalid server ID. Please enter a server number between 1 and ${totalServers}, or leave empty for combined stats.`);
                return;
            }
        }

        const [statsTableCheck] = await pool.query(`SHOW TABLES LIKE ?`, [statsTable]);
        const [playersTableCheck] = await pool.query(`SHOW TABLES LIKE 'players'`);
        if (!statsTableCheck.length || !playersTableCheck.length) {
            await interaction.editReply('Required tables (players/stats) are missing in the database.');
            return;
        }

        const [columnsResult] = await pool.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = ?
        `, [statsTable]);
        
        const availableColumns = columnsResult.map(col => col.COLUMN_NAME);
        
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        
        let playerUID;
        let playerName;

        if (isUUID) {
            playerUID = identifier;
            
            const hasServerIdColumn = availableColumns.includes('server_id');
            
            let existsQuery = `SELECT (
                EXISTS (SELECT 1 FROM \`${statsTable}\` WHERE playerUID = ? ${serverIdOption && hasServerIdColumn ? `AND server_id = '${serverIdOption}'` : ''}) 
                OR EXISTS (SELECT 1 FROM players WHERE playerUID = ?)
            ) AS existsInDB`;
            
            const [[playerExists]] = await pool.query(existsQuery, [playerUID, playerUID]);
            
            if (!playerExists.existsInDB) {
                const serverMessage = serverIdOption ? ` on server ${serverIdOption}` : '';
                await interaction.editReply(`Player with UUID: ${playerUID} could not be found${serverMessage}.`);
                return;
            }
            
            const [playerRow] = await pool.query(`SELECT playerName FROM players WHERE playerUID = ?`, [playerUID]);
            playerName = (playerRow.length > 0) ? playerRow[0].playerName : 'Unknown Player';
        } else {
            const [matchingPlayers] = await pool.query(
                `SELECT playerUID, playerName FROM players WHERE playerName LIKE ?`,
                [`%${identifier}%`]
            );
            
            if (matchingPlayers.length === 0) {
                await interaction.editReply(`No players found with name containing: ${identifier}`);
                return;
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
                playerUID = matchingPlayers[0].playerUID;
                playerName = matchingPlayers[0].playerName;
            }
        }

        const coreColumns = [
            'playerUID', 'level', 'level_experience', 'session_duration', 
            'sppointss0', 'sppointss1', 'sppointss2', 'warcrimes', 'distance_walked', 
            'kills', 'ai_kills', 'shots', 'grenades_thrown', 'friendly_kills', 
            'friendly_ai_kills', 'deaths', 'distance_driven', 'points_as_driver_of_players', 
            'players_died_in_vehicle', 'roadkills', 'friendly_roadkills', 'ai_roadkills', 
            'friendly_ai_roadkills', 'distance_as_occupant', 'bandage_self', 
            'bandage_friendlies', 'tourniquet_self', 'tourniquet_friendlies', 
            'saline_self', 'saline_friendlies', 'morphine_self', 'morphine_friendlies', 
            'warcrime_harming_friendlies', 'crime_acceleration', 'kick_session_duration', 
            'kick_streak'
        ];
        
        const optionalColumns = [
            'lightban_session_duration', 'lightban_streak',
            'heavyban_kick_session_duration', 'heavyban_streak'
        ];

        const hasServerIdColumn = availableColumns.includes('server_id');
        
        const filterExistingColumns = (cols) => cols.filter(col => availableColumns.includes(col));
        
        const existingCoreColumns = filterExistingColumns(coreColumns);
        const existingOptionalColumns = filterExistingColumns(optionalColumns);
        const allExistingColumns = [...existingCoreColumns, ...existingOptionalColumns];
        
        let statsQuery;
        let queryParams;

        if (serverIdOption && hasServerIdColumn) {
            statsQuery = `SELECT ${allExistingColumns.join(', ')} FROM \`${statsTable}\` WHERE playerUID = ? AND server_id = ?`;
            queryParams = [playerUID, serverIdOption.toString()];
        } else {
            const selectClauses = [];
            
            allExistingColumns.forEach(col => {
                if (col === 'playerUID') {
                    selectClauses.push('playerUID');
                } else if (col === 'level') {
                    selectClauses.push('MAX(level) as level');
                } else if (col !== 'server_id') {
                    selectClauses.push(`SUM(${col}) as ${col}`);
                }
            });
            
            if (hasServerIdColumn) {
                selectClauses.push('GROUP_CONCAT(DISTINCT server_id) as servers');
            }
            
            statsQuery = `
                SELECT ${selectClauses.join(', ')}
                FROM \`${statsTable}\`
                WHERE playerUID = ?
                GROUP BY playerUID
            `;
            queryParams = [playerUID];
        }

        const [rows] = await pool.query(statsQuery, queryParams);

        if (rows.length === 0) {
            const serverMessage = serverIdOption ? ` on server ${serverIdOption}` : '';
            await interaction.editReply(`No stats found for player: ${playerName} (${playerUID})${serverMessage}`);
            return;
        }
        
        const stats = rows[0];
        
        let serverDisplay = "";
        if (serverIdOption && hasServerIdColumn) {
            serverDisplay = `**Server:** ${serverIdOption}\n`;
        } else if (stats.servers && hasServerIdColumn) {
            const serverList = stats.servers.split(',').filter(Boolean);
            serverDisplay = `**Servers:** ${serverList.join(', ')}\n`;
        }

        const metersToKm = meters => (meters / 1000).toFixed(2);
        const kdRatio = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills;

        const embed = new EmbedBuilder()
            .setTitle("📊 Player Stats")
            .setDescription(`**User:** ${playerName}\n**UUID:** ${playerUID}\n${serverDisplay}---------------\n`)
            .setColor("#FFA500")
            .setFooter({ text: "Reforger Stats" })
            .addFields(
                {
                    name: "**🔸Infantry**",
                    value: `Points: ${stats.sppointss0 || 0}\nPlayer Kills: ${stats.kills || 0}\nDeaths: ${stats.deaths || 0}\nK/D: ${kdRatio}\n\nAI Kills: ${stats.ai_kills || 0}\nShots Fired: ${stats.shots || 0}\nGrenades Thrown: ${stats.grenades_thrown || 0}\nDistance Walked: ${metersToKm(stats.distance_walked || 0)} km`
                },
                {
                    name: "**🔸Logistics**",
                    value: `Points: ${stats.sppointss1 || 0}\nRoadKills: ${stats.roadkills || 0}\nAI Roadkills: ${stats.ai_roadkills || 0}\nDistance Driven: ${metersToKm(stats.distance_driven || 0)} km\nDistance as Passenger: ${metersToKm(stats.distance_as_occupant || 0)} km`
                },
                {
                    name: "**🔸Medical**",
                    value: `Points: ${stats.sppointss2 || 0}\nBandages Applied: ${(stats.bandage_self || 0) + (stats.bandage_friendlies || 0)}\nTourniquets Applied: ${(stats.tourniquet_self || 0) + (stats.tourniquet_friendlies || 0)}\nSaline Applied: ${(stats.saline_self || 0) + (stats.saline_friendlies || 0)}\nMorphine Applied: ${(stats.morphine_self || 0) + (stats.morphine_friendlies || 0)}`
                },
                {
                    name: "**❗Warcrimes**",
                    value: `Warcrime Value: ${stats.warcrime_harming_friendlies || 0}\nTeamkills: ${stats.friendly_kills || 0}\nAI TeamKills: ${stats.friendly_ai_kills || 0}\nFriendly Roadkills: ${stats.friendly_roadkills || 0}\nFriendly AI Roadkills: ${stats.friendly_ai_roadkills || 0}`
                }
            );

        const hasModHistory = (
            (existingOptionalColumns.includes('lightban_streak') && stats.lightban_streak > 0) || 
            (existingOptionalColumns.includes('heavyban_streak') && stats.heavyban_streak > 0) ||
            (stats.kick_streak > 0)
        );
        
        if (hasModHistory) {
            const modHistoryItems = [];
            
            if (stats.kick_streak > 0) {
                modHistoryItems.push(`Kicks: ${stats.kick_streak}`);
            }
            
            if (existingOptionalColumns.includes('lightban_streak') && stats.lightban_streak > 0) {
                modHistoryItems.push(`Light Bans: ${stats.lightban_streak}`);
            }
            
            if (existingOptionalColumns.includes('heavyban_streak') && stats.heavyban_streak > 0) {
                modHistoryItems.push(`Heavy Bans: ${stats.heavyban_streak}`);
            }
            
            if (modHistoryItems.length > 0) {
                embed.addFields({
                    name: "**⚠️ Moderation History**",
                    value: modHistoryItems.join('\n')
                });
            }
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(`[Stats Command] Error: ${error.message}`);
        await interaction.editReply('An error occurred while retrieving stats.');
    }
};