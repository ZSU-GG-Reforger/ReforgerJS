// log-parser/wcs-commands/regexHandlers/PlayerKilledEvent.js
const { EventEmitter } = require('events');

class PlayerKilledEventHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d+)\|PlayerKilledEvent:killerId=(-?\d+):killerName=([^:]+):killerGUID=([^:]+):victimId=(\d+):victimGUID=([^:]+):victimName=([^:]+):friendlyFire=(true|false):teamKill=(true|false):weapon=([^:]+):weaponSource=([^:]+):distance=([^:]+):killerControl=([^:]+):victimControl=([^:]+):killerDisguise=([^:]+):victimDisguise=([^:]+):instigatorType=(.+)/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("PlayerKilledEvent");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const timestamp = match[1];
            const killerId = parseInt(match[2], 10);
            const killerName = match[3];
            const killerGUID = match[4];
            const victimId = parseInt(match[5], 10);
            const victimGUID = match[6];
            const victimName = match[7];
            const friendlyFire = match[8] === 'true';
            const teamKill = match[9] === 'true';
            const weapon = match[10];
            const weaponSource = match[11];
            const distance = parseFloat(match[12]);
            const killerControl = match[13];
            const victimControl = match[14];
            const killerDisguise = match[15];
            const victimDisguise = match[16];
            const instigatorType = match[17];
            const killType = this.determineKillType(killerId, killerName, killerGUID, friendlyFire, teamKill);
            const killerControlType = this.getControlType(killerControl);
            const victimControlType = this.getControlType(victimControl);
            
            const weaponSourceType = this.getWeaponSourceType(weaponSource);

            this.emit('playerKilledEvent', { 
                timestamp,
                killer: {
                    id: killerId,
                    name: killerName,
                    guid: killerGUID,
                    control: killerControl,
                    controlType: killerControlType,
                    disguise: killerDisguise
                },
                victim: {
                    id: victimId,
                    name: victimName,
                    guid: victimGUID,
                    control: victimControl,
                    controlType: victimControlType,
                    disguise: victimDisguise
                },
                kill: {
                    friendlyFire,
                    teamKill,
                    weapon,
                    weaponSource,
                    weaponSourceType,
                    distance,
                    type: killType,
                    instigatorType
                },
                raw: {
                    killerId,
                    killerName,
                    killerGUID,
                    victimId,
                    victimGUID,
                    victimName,
                    friendlyFire,
                    teamKill,
                    weapon,
                    weaponSource,
                    distance,
                    killerControl,
                    victimControl,
                    killerDisguise,
                    victimDisguise,
                    instigatorType
                }
            });
        }
    }

    determineKillType(killerId, killerName, killerGUID, friendlyFire, teamKill) {
        if (killerName === 'World' || killerGUID === 'World') {
            return 'Environmental Death';
        }
        if (killerName === 'AI' || killerGUID === 'AI' || killerId <= 0) {
            if (friendlyFire) {
                return 'Friendly AI Kill';
            }
            return 'AI Kill';
        }
        if (friendlyFire) {
            return 'Friendly Fire';
        }
        if (teamKill) {
            return 'Team Kill';
        }
        return 'Player Kill';
    }

    getControlType(control) {
        const controlMappings = {
            'PLAYER': 'Player',
            'UNLIMITED_EDITOR': 'Game Master',
            'LIMITED_EDITOR': 'Limited Editor',
            'NONE': 'None',
            'AI': 'AI Controller'
        };
        
        return controlMappings[control] || control;
    }

    getWeaponSourceType(weaponSource) {
        const weaponSourceMappings = {
            'Infantry': 'Infantry Weapon',
            'Vehicle': 'Vehicle Weapon',
            'Unknown': 'Unknown Source'
        };
        
        return weaponSourceMappings[weaponSource] || weaponSource;
    }
}

module.exports = PlayerKilledEventHandler;