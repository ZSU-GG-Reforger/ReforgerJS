// log-parser/regexHandlers/applicationHang.js
const { EventEmitter } = require('events');

class ApplicationHangHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+ENGINE\s+\(F\):\s+Application\s+hangs\s+\(force\s+crash\)\s+(\d+)\s+s/;
    }

    test(line) {
        return this.regex.test(line);
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const duration = match[2];
            this.emit('applicationHang', { 
                time,
                duration,
                message: 'ENGINE (F): Application hangs (force crash)'
            });
        }
    }
}

module.exports = ApplicationHangHandler;