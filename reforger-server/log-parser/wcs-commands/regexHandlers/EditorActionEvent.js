// log-parser/wcs-commands/regexHandlers/EditorActionEvent.js
const { EventEmitter } = require('events');

class EditorActionEventHandler extends EventEmitter {
    constructor() {
        super();
        this.regex = /(\d+)\|EditorActionEvent:playerId=(\d+):playerName=([^:]+):playerGUID=([^:]+):action=([^:]+):hoveredEntityComponentName=([^:]+):hoveredEntityComponentOwnerId=(-?\d+):selectedEntityComponentsNames=([^:]+):selectedEntityComponentsOwnersIds=(.+)/;
    }

    test(line) {
        return this.regex.test(line) && line.includes("EditorActionEvent");
    }

    processLine(line) {
        const match = this.regex.exec(line);
        if (match) {
            const timestamp = match[1];
            const playerId = parseInt(match[2], 10);
            const playerName = match[3];
            const playerGUID = match[4];
            const action = match[5];
            const hoveredEntityComponentName = match[6];
            const hoveredEntityComponentOwnerId = parseInt(match[7], 10);
            const selectedEntityComponentsNames = match[8];
            const selectedEntityComponentsOwnersIds = match[9];
            const selectedEntityNames = this.parseCommaSeparatedList(selectedEntityComponentsNames);
            const selectedEntityOwnerIds = this.parseCommaSeparatedList(selectedEntityComponentsOwnersIds)
                .map(id => parseInt(id, 10));
            
            const actionType = this.getActionType(action);
            
            this.emit('editorActionEvent', { 
                timestamp,
                playerId,
                playerName,
                playerGUID,
                action,
                actionType,
                hoveredEntityComponentName,
                hoveredEntityComponentOwnerId,
                selectedEntityNames,
                selectedEntityOwnerIds,
                raw: {
                    selectedEntityComponentsNames,
                    selectedEntityComponentsOwnersIds
                }
            });
        }
    }

    parseCommaSeparatedList(str) {
        if (!str || str === 'unknown' || str.trim() === '') {
            return ['unknown'];
        }
        return str.split(',').map(item => item.trim());
    }

    getActionType(action) {
        const actionMappings = {
            'SCR_DeleteSelectedContextAction': 'Delete Entity',
            'SCR_LightningContextAction': 'Lightning Strike',
            'SCR_NeutralizeEntityContextAction': 'Neutralize Entity',
            'SCR_SpawnEntityContextAction': 'Spawn Entity',
            'SCR_MoveEntityContextAction': 'Move Entity',
            'SCR_RotateEntityContextAction': 'Rotate Entity',
            'SCR_ScaleEntityContextAction': 'Scale Entity',
            'SCR_CloneEntityContextAction': 'Clone Entity',
            'SCR_GroupEntityContextAction': 'Group Entities',
            'SCR_UngroupEntityContextAction': 'Ungroup Entities'
        };
        
        return actionMappings[action] || action;
    }
}

module.exports = EditorActionEventHandler;