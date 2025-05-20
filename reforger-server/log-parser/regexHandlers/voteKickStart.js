const { EventEmitter } = require('events');

class VoteKickStartHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3}).*?VOTING SYSTEM - Player '(.*?)' \(with player id = (\d+)\) started a vote to kick player '(.*?)' \(with player id = (\d+)\)/;
    }
    test(line) {
        return this.regex.test(line);
    }
    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const voteOffenderName = match[2];
            const voteOffenderId = match[3];
            const voteVictimName = match[4];
            const voteVictimId = match[5];
            this.emit('voteKickStart', { 
                time, 
                voteOffenderName, 
                voteOffenderId, 
                voteVictimName, 
                voteVictimId 
            });
        }
    }
}

module.exports = VoteKickStartHandler;