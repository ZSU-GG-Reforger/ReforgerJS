// log-parser/rjs-logging/regexHandlers/PlayerJoinedEvent.js
const { EventEmitter } = require('events');

class PlayerJoinedEventHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /\[([^\]]+)\] PLAYER_JOINED = playerBiId = ([^,]+), platform = ([^,]+), playerName = ([^,]+), playerId = (\d+), profileName = (.+)/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("PLAYER_JOINED =");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const timestamp = match[1];
            const playerBiId = match[2];
            const platform = match[3];
            const playerName = match[4];
            const playerId = parseInt(match[5], 10);
            const profileName = match[6];
            const platformType = this.getPlatformType(platform);
            
            this.emit('playerJoinedEvent', { 
                timestamp,
                playerId,
                playerName,
                playerBiId,
                profileName,
                platform,
                platformType,
                raw: {
                    timestamp,
                    playerBiId,
                    platform,
                    playerName,
                    playerId,
                    profileName
                }
            });
        }
    }

    getPlatformType(platform) {
        const platformMappings = {
            'platform-windows': 'PC (Windows)',
            'platform-xbox': 'Xbox',
            'platform-playstation': 'PlayStation',
            'platform-linux': 'PC (Linux)',
            'platform-mac': 'PC (Mac)'
        };
        
        return platformMappings[platform] || platform;
    }
}

module.exports = PlayerJoinedEventHandler;