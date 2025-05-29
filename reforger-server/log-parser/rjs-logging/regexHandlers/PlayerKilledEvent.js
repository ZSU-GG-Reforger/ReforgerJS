// log-parser/rjs-logging/regexHandlers/PlayerKilledEvent.js
const { EventEmitter } = require('events');

class PlayerKilledEventHandler extends EventEmitter {
    constructor() {
        super();
        // Regex to match: [2025-05-27 05:53:04] PLAYER_KILLED = victimName = Sully___g, weaponName = AK-74, victimFaction = #AR-Faction_US, isTeamKill = false, killerId = 295, isFriendlyFire = false, killerBiId = 839714fe-6339-40ca-9283-c7d3deef9a0f, killerFaction = #AR-Faction_USSR, victimBiId = 9badb6cd-2bfb-4852-b31f-20bfc4be8c09, killerName = Cerberus, victimId = 176, killDistance = 15.1267
        this.regex = /\[([^\]]+)\] PLAYER_KILLED = victimName = ([^,]+), weaponName = ([^,]+), victimFaction = ([^,]+), isTeamKill = (true|false), killerId = (\d+), isFriendlyFire = (true|false), killerBiId = ([^,]+), killerFaction = ([^,]+), victimBiId = ([^,]+), killerName = ([^,]+), victimId = (\d+), killDistance = ([0-9.]+)/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("PLAYER_KILLED =");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const timestamp = match[1];
            const victimName = match[2];
            const weaponName = match[3];
            const victimFaction = match[4];
            const isTeamKill = match[5] === 'true';
            const killerId = parseInt(match[6], 10);
            const isFriendlyFire = match[7] === 'true';
            const killerBiId = match[8];
            const killerFaction = match[9];
            const victimBiId = match[10];
            const killerName = match[11];
            const victimId = parseInt(match[12], 10);
            const killDistance = parseFloat(match[13]);
            
            const killType = this.determineKillType(killerName, isFriendlyFire, isTeamKill);
            const killerFactionType = this.getFactionType(killerFaction);
            const victimFactionType = this.getFactionType(victimFaction);
            
            this.emit('playerKilledEvent', { 
                timestamp,
                killer: {
                    id: killerId,
                    name: killerName,
                    biId: killerBiId,
                    faction: killerFaction,
                    factionType: killerFactionType
                },
                victim: {
                    id: victimId,
                    name: victimName,
                    biId: victimBiId,
                    faction: victimFaction,
                    factionType: victimFactionType
                },
                kill: {
                    weapon: weaponName,
                    distance: killDistance,
                    friendlyFire: isFriendlyFire,
                    teamKill: isTeamKill,
                    type: killType
                },
                raw: {
                    timestamp,
                    victimName,
                    weaponName,
                    victimFaction,
                    isTeamKill,
                    killerId,
                    isFriendlyFire,
                    killerBiId,
                    killerFaction,
                    victimBiId,
                    killerName,
                    victimId,
                    killDistance
                }
            });
        }
    }

    determineKillType(killerName, isFriendlyFire, isTeamKill) {
        if (killerName === 'World' || killerName === 'AI') {
            if (isFriendlyFire) {
                return 'Friendly AI Kill';
            }
            return killerName === 'World' ? 'Environmental Death' : 'AI Kill';
        }
        
        if (isFriendlyFire) {
            return 'Friendly Fire';
        }
        
        if (isTeamKill) {
            return 'Team Kill';
        }
        
        return 'Player Kill';
    }

    getFactionType(faction) {
        const factionMappings = {
            '#AR-Faction_US': 'United States',
            '#AR-Faction_USSR': 'Soviet Union',
            '#AR-Faction_FIA': 'FIA',
            '#AR-Faction_Civilian': 'Civilian'
        };
        
        return factionMappings[faction] || faction;
    }
}

module.exports = PlayerKilledEventHandler;