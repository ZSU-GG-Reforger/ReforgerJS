// log-parser/regexHandlers/playerUpdate.js
const { EventEmitter } = require('events');

class PlayerUpdateHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d{2}:\d{2}:\d{2}\.\d{3})\s+NETWORK\s+:\s+### Updating player: PlayerId=(\d+), Name=(.*?), IdentityId=([a-f0-9-]+)/;
    }

    test(line) {
        return this.regex.test(line);
      }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const time = match[1];
            const playerId = match[2];
            const playerName = match[3].trim();
            const playerUid = match[4];
            this.emit('playerUpdate', { time, playerId, playerName, playerUid });
        }
    }
}

module.exports = PlayerUpdateHandler;
