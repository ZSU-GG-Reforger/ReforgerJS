const { EmbedBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

module.exports = async (interaction, serverInstance, discordClient, extraData = {}) => {
    const uuid = extraData.uuid;
    const user = interaction.user;
    logger.info(`[VoteInfo Command] User: ${user.username} (ID: ${user.id}) requested vote info for UUID: ${uuid}`);

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
    }

    try {
        const pool = process.mysqlPool || serverInstance.mysqlPool;
        if (!pool) {
            await interaction.editReply('Database connection is not initialized.');
            return;
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
        if (!isUUID) {
            await interaction.editReply('Invalid UUID format. Please provide a valid player UUID.');
            return;
        }

        const [offendersTableCheck] = await pool.query(`SHOW TABLES LIKE 'VoteOffenders'`);
        const [victimsTableCheck] = await pool.query(`SHOW TABLES LIKE 'VoteVictims'`);
        const [playersTableCheck] = await pool.query(`SHOW TABLES LIKE 'players'`);
        
        if (!offendersTableCheck.length || !victimsTableCheck.length || !playersTableCheck.length) {
            await interaction.editReply('Required tables are missing in the database.');
            return;
        }

        const [playerRow] = await pool.query(`SELECT playerName FROM players WHERE playerUID = ?`, [uuid]);
        if (playerRow.length === 0) {
            await interaction.editReply(`No player found with UUID: ${uuid}`);
            return;
        }
        
        const playerName = playerRow[0].playerName;

        const [[playerExists]] = await pool.query(
            `SELECT (EXISTS (SELECT 1 FROM VoteOffenders WHERE offenderUID = ? OR victimUID = ?) 
             OR EXISTS (SELECT 1 FROM VoteVictims WHERE victimUID = ?)) AS existsInDB`,
            [uuid, uuid, uuid]
        );
        
        if (!playerExists.existsInDB) {
            await interaction.editReply(`No vote data found for player: ${playerName} (${uuid})`);
            return;
        }

        // 1. Votes started by player
        const [[votesStarted]] = await pool.query(
            `SELECT COUNT(*) AS count FROM VoteOffenders WHERE offenderUID = ?`,
            [uuid]
        );

        // 2. Times player has been vote kicked
        const [[votesKicked]] = await pool.query(
            `SELECT COUNT(*) AS count FROM VoteVictims WHERE victimUID = ?`,
            [uuid]
        );

        // 3. Top victims (players this person voted against)
        const [topVictims] = await pool.query(
            `SELECT victimName, victimUID, COUNT(*) as count
             FROM VoteOffenders
             WHERE offenderUID = ? AND victimUID IS NOT NULL
             GROUP BY victimUID, victimName
             ORDER BY count DESC
             LIMIT 3`,
            [uuid]
        );

        // 4. Top voters (players who voted against this person)
        const [topVoters] = await pool.query(
            `SELECT offenderName, offenderUID, COUNT(*) as count
             FROM VoteOffenders
             WHERE victimUID = ? AND offenderUID IS NOT NULL
             GROUP BY offenderUID, offenderName
             ORDER BY count DESC
             LIMIT 3`,
            [uuid]
        );

        const embed = new EmbedBuilder()
            .setTitle("🗳️ Player Vote Information")
            .setDescription(`**Player:** ${playerName}\n**UUID:** ${uuid}\n---------------\n`)
            .setColor("#FFA500")
            .setFooter({ text: "Reforger Vote Info" });

        embed.addFields(
            {
                name: "**Votes Initiated**",
                value: `${votesStarted.count} vote${votesStarted.count !== 1 ? 's' : ''} started`
            },
            {
                name: "**Vote Kicked**",
                value: `Player has been vote kicked ${votesKicked.count} time${votesKicked.count !== 1 ? 's' : ''}`
            }
        );

        if (topVictims.length > 0) {
            let victimsText = '';
            topVictims.forEach((victim, index) => {
                victimsText += `${index + 1}. ${victim.victimName || 'Unknown'}: ${victim.count} vote${victim.count !== 1 ? 's' : ''}\n`;
            });
            
            embed.addFields({
                name: "**Top Voted Against**",
                value: victimsText || 'No data available'
            });
        } else {
            embed.addFields({
                name: "**Top Voted Against**",
                value: 'No data available'
            });
        }

        if (topVoters.length > 0) {
            let votersText = '';
            topVoters.forEach((voter, index) => {
                votersText += `${index + 1}. ${voter.offenderName || 'Unknown'}: ${voter.count} vote${voter.count !== 1 ? 's' : ''}\n`;
            });
            
            embed.addFields({
                name: "**Top Voted By**",
                value: votersText || 'No data available'
            });
        } else {
            embed.addFields({
                name: "**Top Voted By**",
                value: 'No data available'
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(`[VoteInfo Command] Error: ${error.message}`);
        await interaction.editReply('An error occurred while retrieving vote information.');
    }
};