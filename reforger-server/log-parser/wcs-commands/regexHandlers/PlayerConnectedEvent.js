// log-parser/wcs-commands/regexHandlers/PlayerConnectedEvent.js
const { EventEmitter } = require('events');

class PlayerConnectedEventHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d+)\|PlayerConnectedEvent:playerId=(\d+):playerName=([^:]+):playerGUID=([^:]+):profileName=([^:]+):platform=(.+)/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("PlayerConnectedEvent");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const timestamp = match[1];
            const playerId = parseInt(match[2], 10);
            const playerName = match[3];
            const playerGUID = match[4];
            const profileName = match[5];
            const platform = match[6];
            const platformType = this.getPlatformType(platform);
            
            this.emit('playerConnectedEvent', { 
                timestamp,
                playerId,
                playerName,
                playerGUID,
                profileName,
                platform,
                platformType,
                raw: {
                    playerId,
                    playerName,
                    playerGUID,
                    profileName,
                    platform
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

module.exports = PlayerConnectedEventHandler;