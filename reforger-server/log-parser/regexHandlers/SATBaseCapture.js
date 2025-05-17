// log-parser/regexHandlers/SATBaseCapture.js
// Regex Handler for Bacons Server Admin Tools (SAT) Mod
const { EventEmitter } = require('events');

class SATBaseCaptureHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+SCRIPT\s+:\s+ServerAdminTools \| Event serveradmintools_conflict_base_captured \|\s+faction: ([^,]+), base: (.+)/;
    }

    test(line) {
        return this.regex.test(line);
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const faction = match[2].trim();
            const base = match[3].trim();
            this.emit('baseCapture', { time, faction, base });
        }
    }
}

module.exports = SATBaseCaptureHandler;