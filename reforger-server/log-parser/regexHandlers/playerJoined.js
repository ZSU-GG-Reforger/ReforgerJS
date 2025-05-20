const { EventEmitter } = require('events');

class PlayerJoinedHandler extends EventEmitter {
    constructor() {
        super();
        this.lineAddingPlayerRegex = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+DEFAULT\s+: BattlEye Server: Adding player identity=(0x[0-9a-fA-F]+), name='(.+?)'/;
        
        this.playerConnectedRegex = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+DEFAULT\s+: BattlEye Server: 'Player\s+#(\d+)\s+(.*?)\s+\(([^):]+)(?::\d+)?\)\s+connected'/;
        
        this.settingGuidRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}\s+DEFAULT\s+: BattlEye Server: Setting GUID for player identity=(0x[0-9a-fA-F]+), GUID=(.+)$/;
        
        this.beGuidRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}\s+DEFAULT\s+: BattlEye Server: 'Player\s+#(\d+)\s+.*-\s+BE\s+GUID:\s+([a-fA-F0-9]{32})'/;

        this.pendingPlayersByIdentity = new Map();
        
        this.pendingPlayersByNumber = new Map();
    }

    test(line) {
        return this.lineAddingPlayerRegex.test(line) || 
               this.playerConnectedRegex.test(line) || 
               this.settingGuidRegex.test(line) || 
               this.beGuidRegex.test(line);
    }

    processLine(line) {
        const matchLineAddingPlayer = this.lineAddingPlayerRegex.exec(line);
        if (matchLineAddingPlayer) {
            const time = matchLineAddingPlayer[1];
            const identity = matchLineAddingPlayer[2];
            const playerName = matchLineAddingPlayer[3];

            this.pendingPlayersByIdentity.set(identity, {
                time,
                identity,
                playerName,
                playerNumber: null,
                playerIP: null,
                steamID: null,
                device: null,
                beGUID: null
            });
            return;
        }

        const matchPlayerConnected = this.playerConnectedRegex.exec(line);
        if (matchPlayerConnected) {
            const time = matchPlayerConnected[1];
            const playerNumber = matchPlayerConnected[2];
            const playerName = matchPlayerConnected[3];
            const playerIP = matchPlayerConnected[4].trim();

            let playerData = null;
            for (const [identity, data] of this.pendingPlayersByIdentity.entries()) {
                if (data.playerName === playerName) {
                    playerData = data;
                    playerData.playerNumber = playerNumber;
                    playerData.playerIP = playerIP;
                    
                    this.pendingPlayersByNumber.set(playerNumber, identity);
                    break;
                }
            }

            if (!playerData) {
                playerData = {
                    time,
                    identity: null,
                    playerName,
                    playerNumber,
                    playerIP,
                    steamID: null,
                    device: null,
                    beGUID: null
                };
                this.pendingPlayersByNumber.set(playerNumber, playerNumber);
                this.pendingPlayersByIdentity.set(playerNumber, playerData);
            }
            return;
        }

        const matchSettingGuid = this.settingGuidRegex.exec(line);
        if (matchSettingGuid) {
            const identity = matchSettingGuid[1];
            const guidValue = matchSettingGuid[2];

            const playerData = this.pendingPlayersByIdentity.get(identity);
            if (playerData) {
                if (guidValue === '[u8; 64]') {
                    playerData.steamID = null;
                    playerData.device = 'Console';
                } else {
                    playerData.steamID = guidValue;
                    playerData.device = 'PC';
                }
            }
            return;
        }

        const matchBeGuid = this.beGuidRegex.exec(line);
        if (matchBeGuid) {
            const playerNumber = matchBeGuid[1];
            const beGUID = matchBeGuid[2];

            const identity = this.pendingPlayersByNumber.get(playerNumber);
            if (identity) {
                const playerData = this.pendingPlayersByIdentity.get(identity);
                if (playerData) {
                    playerData.beGUID = beGUID;

                    this.emit('playerJoined', playerData);

                    this.pendingPlayersByIdentity.delete(identity);
                    this.pendingPlayersByNumber.delete(playerNumber);
                }
            }
        }
    }
}

module.exports = PlayerJoinedHandler;