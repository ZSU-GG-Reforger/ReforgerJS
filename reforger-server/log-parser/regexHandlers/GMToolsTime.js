// log-parser/regexHandlers/GMToolsTime.js
// Regex Handler for H0VI GM Tools - 64F10E068D5880A6
const { EventEmitter } = require('events');

class GMToolsTimeHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+SCRIPT\s+:\s+\[GM Tools\]\[GMSession\] GM session duration for '(.*?)' \(ID: (\d+)\): ([\d.]+) seconds/;
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
            const duration = parseFloat(match[4]);
            
            this.emit('gmToolsTime', { 
                time, 
                playerName, 
                playerId,
                duration
            });
        }
    }
}

module.exports = GMToolsTimeHandler;