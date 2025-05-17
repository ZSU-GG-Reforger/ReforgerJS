// log-parser/regexHandlers/GMToolsStatus.js
// Regex Handler for H0VI GM Tools - 64F10E068D5880A6
const { EventEmitter } = require('events');

class GMToolsStatusHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+SCRIPT\s+:\s+\[GM Tools\]\[GMSession\] Player '(.*?)' \(ID: (\d+)\) ([A-Z]+) Game Master/;
    }

    test(line) {
        return this.regex.test(line);
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const playerName = match[2].trim();
            const playerId = match[3];
            const statusRaw = match[4];
            
            let status = "Unknown";
            if (statusRaw === 'ENTERED') {
                status = 'Enter';
            } else if (statusRaw === 'EXITED') {
                status = 'Exit';
            }
            
            this.emit('gmToolsStatus', { 
                time, 
                playerName, 
                playerId,
                status
            });
        }
    }
}

module.exports = GMToolsStatusHandler;