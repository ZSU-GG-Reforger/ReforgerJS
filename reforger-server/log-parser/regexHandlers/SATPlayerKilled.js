// log-parser/regexHandlers/SATPlayerKilled.js
// Regex Handler for Bacons Server Admin Tools (SAT) Mod
const { EventEmitter } = require('events');

class SATPlayerKilledHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+SCRIPT\s+:\s+ServerAdminTools \| Event serveradmintools_player_killed \| player: (.*?), instigator: (.*?), friendly: (true|false)/;
    }

    test(line) {
        return this.regex.test(line);
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const playerName = match[2].trim();
            const instigatorName = match[3].trim();
            const friendlyFire = match[4].trim() === 'true';
            const isAI = instigatorName === 'AI';
            
            this.emit('playerKilled', { 
                time, 
                playerName, 
                instigatorName, 
                friendlyFire, 
                isAI 
            });
        }
    }
}

module.exports = SATPlayerKilledHandler;