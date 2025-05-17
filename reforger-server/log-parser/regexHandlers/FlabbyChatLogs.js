// log-parser/regexHandlers/FlabbyChatLogs.js
// Regex Handler for Logging Enhanced by flabby - 6316335D6A19E51C
const { EventEmitter } = require('events');

class FlabbyChatLogsHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+SCRIPT\s+:\s+<flabby_logger>\s+\[\s+playerBiId=([a-f0-9-]+),\s+function='OnNewMessage',\s+senderFaction='([^']*)',\s+channelId='(\d+)',\s+senderId='(\d+)',\s+playerName='(.*?)',\s+msg='(.*?)',\s+ServerName='([^']+)'/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("function='OnNewMessage'");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const playerBiId = match[2];
            const senderFaction = match[3];
            const channelId = match[4];
            const senderId = match[5];
            const playerName = match[6].trim();
            const message = match[7];
            const serverName = match[8];
            
            this.emit('chatMessage', { 
                time,
                playerBiId,
                senderFaction,
                channelId,
                senderId,
                playerName,
                message,
                serverName
            });
        }
    }
}

module.exports = FlabbyChatLogsHandler;