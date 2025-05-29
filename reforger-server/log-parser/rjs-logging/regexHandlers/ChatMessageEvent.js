// log-parser/rjs-logging/regexHandlers/ChatMessageEvent.js
const { EventEmitter } = require('events');

class ChatMessageEventHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /\[([^\]]+)\] CHAT = playerBiId = ([^,]+), channelId = (\d+), message = ([^,]+), playerName = ([^,]+), playerId = (\d+)/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("CHAT =");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const timestamp = match[1];
            const playerBiId = match[2];
            const channelId = parseInt(match[3], 10);
            const message = match[4];
            const playerName = match[5];
            const playerId = parseInt(match[6], 10);
            const channelType = this.getChannelType(channelId);
            
            this.emit('chatMessageEvent', { 
                timestamp,
                playerId,
                playerName,
                playerBiId,
                channelId,
                channelType,
                message,
                raw: {
                    timestamp,
                    playerBiId,
                    channelId,
                    message,
                    playerName,
                    playerId
                }
            });
        }
    }

    getChannelType(channelId) {
        switch(channelId) {
            case 0: return 'Global';
            case 1: return 'Faction'; 
            case 2: return 'Group';
            case 3: return 'Vehicle';
            case 4: return 'Local';
            default: return 'Unknown';
        }
    }
}

module.exports = ChatMessageEventHandler;