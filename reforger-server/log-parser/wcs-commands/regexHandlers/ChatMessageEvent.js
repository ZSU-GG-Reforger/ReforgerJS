// log-parser/wcs-commands/regexHandlers/ChatMessageEvent.js
const { EventEmitter } = require('events');

class ChatMessageEventHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d+)\|ChatMessageEvent:playerId=(\d+):playerName=([^:]+):playerGUID=([^:]+):channelId=(\d+):message=(.*)/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("ChatMessageEvent");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const timestamp = match[1];
            const playerId = parseInt(match[2], 10);
            const playerName = match[3];
            const playerGUID = match[4]; 
            const channelId = parseInt(match[5], 10);
            const message = match[6];
            const channelType = this.getChannelType(channelId);
            
            this.emit('chatMessageEvent', { 
                timestamp,
                playerId,
                playerName,
                playerGUID,
                channelId,
                channelType,
                message
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