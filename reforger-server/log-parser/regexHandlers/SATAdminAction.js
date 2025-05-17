// log-parser/regexHandlers/SATAdminAction.js
// Regex Handler for Bacons Server Admin Tools (SAT) Mod
const { EventEmitter } = require('events');

class SATAdminActionHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+SCRIPT\s+:\s+ServerAdminTools \| Event serveradmintools_admin_action \| action: ([^,]+), admin: (.*?), player: (.+)/;
    }

    test(line) {
        return this.regex.test(line);
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const action = match[2].trim();
            const adminName = match[3].trim();
            const targetPlayer = match[4].trim();
            
            this.emit('adminAction', { 
                time, 
                action, 
                adminName, 
                targetPlayer 
            });
        }
    }
}

module.exports = SATAdminActionHandler;