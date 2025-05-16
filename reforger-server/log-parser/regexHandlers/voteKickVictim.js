const { EventEmitter } = require("events");

class VoteKickVictimHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3}).*?VOTING SYSTEM - Vote to kick player '(.*?)' \(with player id = (\d+)\) succeeded/;
    }
    
    test(line) {
        return this.regex.test(line);
    }
    
    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const voteVictimName = match[2];
            const voteVictimId = match[3];
            
            this.emit("voteKickVictim", {
                time,
                voteVictimName,
                voteVictimId
            });
        }
    }
}

module.exports = VoteKickVictimHandler;