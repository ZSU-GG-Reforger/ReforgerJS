// log-parser/regexHandlers/SATGameEnd.js
// Regex Handler for Bacons Server Admin Tools (SAT) Mod
const { EventEmitter } = require('events');

class SATGameEndHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+SCRIPT\s+:\s+ServerAdminTools \| Event serveradmintools_game_ended \|\s+reason: ([^,]+), winner: (.+)/;
    }

    test(line) {
        return this.regex.test(line);
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const reason = match[2].trim();
            const winner = match[3].trim();
            
            this.emit('gameEnd', { 
                time, 
                reason, 
                winner 
            });
        }
    }
}

module.exports = SATGameEndHandler;