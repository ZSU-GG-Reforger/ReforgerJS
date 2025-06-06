// log-parser/wcs-commands/index.js
const EventEmitter = require('events');
const async = require('async');
const TailCustomReader = require('../log-readers/tailCustom');
const logger = global.logger || console;

class WCSCommandsParser extends EventEmitter {
  constructor(filename, options = {}) {
    super();
    options.filename = filename;
    options.parserName = 'wcs-commands';
    this.options = options;
    
    this.linesPerMinute = 0;
    this.matchingLinesPerMinute = 0;
    this.parsingStatsInterval = null;
    this.processLine = this.processLine.bind(this);
    this.queue = async.queue((line, callback) => {
      this.processLine(line);
      callback();
    });

    this.logReader = new TailCustomReader(this.queue.push.bind(this.queue), options);
    this.setupRegexHandlers();
  }

  setupRegexHandlers() {
    try {
      const ChatMessageEventHandler = require('./regexHandlers/ChatMessageEvent');
      const EditorActionEventHandler = require('./regexHandlers/EditorActionEvent');
      const PlayerKilledEventHandler = require('./regexHandlers/PlayerKilledEvent');
      const PlayerConnectedEventHandler = require('./regexHandlers/PlayerConnectedEvent');
      
      this.chatMessageEventHandler = new ChatMessageEventHandler();
      this.editorActionEventHandler = new EditorActionEventHandler();
      this.playerKilledEventHandler = new PlayerKilledEventHandler();
      this.playerConnectedEventHandler = new PlayerConnectedEventHandler();
      
      this.removeAllListeners();
      
      this.chatMessageEventHandler.on('chatMessageEvent', data => {
        logger.verbose(`WCS ChatMessageEvent: [${data.channelType}] ${data.playerName}: ${data.message}`);
        this.emit('chatMessageEvent', data);
      });

      this.editorActionEventHandler.on('editorActionEvent', data => {
        logger.verbose(`WCS EditorActionEvent: ${data.playerName} performed ${data.actionType} on ${data.hoveredEntityComponentName}`);
        this.emit('editorActionEvent', data);
      });

      this.playerKilledEventHandler.on('playerKilledEvent', data => {
        const killDescription = `${data.killer.name} killed ${data.victim.name} with ${data.kill.weapon} (${data.kill.type})`;
        logger.verbose(`WCS PlayerKilledEvent: ${killDescription} - Distance: ${data.kill.distance.toFixed(2)}m`);
        this.emit('playerKilledEvent', data);
      });

      this.playerConnectedEventHandler.on('playerConnectedEvent', data => {
        logger.verbose(`WCS PlayerConnectedEvent: ${data.playerName} (${data.profileName}) connected from ${data.platformType}`);
        this.emit('playerConnectedEvent', data);
      });
    } catch (error) {
      logger.error(`Error setting up WCS regex handlers: ${error.message}`);
    }
  }

  processLine(line) {
    if (this.chatMessageEventHandler && this.chatMessageEventHandler.test(line)) {
      this.chatMessageEventHandler.processLine(line);
      this.matchingLinesPerMinute++;
      return;
    }

    if (this.editorActionEventHandler && this.editorActionEventHandler.test(line)) {
      this.editorActionEventHandler.processLine(line);
      this.matchingLinesPerMinute++;
      return;
    }

    if (this.playerKilledEventHandler && this.playerKilledEventHandler.test(line)) {
      this.playerKilledEventHandler.processLine(line);
      this.matchingLinesPerMinute++;
      return;
    }

    if (this.playerConnectedEventHandler && this.playerConnectedEventHandler.test(line)) {
      this.playerConnectedEventHandler.processLine(line);
      this.matchingLinesPerMinute++;
      return;
    }

    this.linesPerMinute++;
  }

  watch() {
    logger.verbose('WCSCommandsParser - Starting log reader...');
    
    if (this.parsingStatsInterval) clearInterval(this.parsingStatsInterval);
    this.parsingStatsInterval = setInterval(() => this.logStats(), 60 * 1000);
    
    try {
      return Promise.resolve(this.logReader.watch())
        .catch(error => {
          logger.error(`WCSCommandsParser watch error handled: ${error.message}`);
          return Promise.resolve();
        });
    } catch (error) {
      logger.error(`WCSCommandsParser watch setup failed: ${error.message}`);
      return Promise.resolve();
    }
  }

  logStats() {
    logger.info(`WCSCommandsParser - Lines/min: ${this.linesPerMinute} | Matching lines: ${this.matchingLinesPerMinute}`);
    this.linesPerMinute = 0;
    this.matchingLinesPerMinute = 0;
  }

  async unwatch() {
    try {
      if (this.logReader) await this.logReader.unwatch();
    } catch (error) {
      logger.error(`Error stopping WCSCommandsParser LogReader: ${error.message}`);
    }

    if (this.parsingStatsInterval) {
      clearInterval(this.parsingStatsInterval);
      this.parsingStatsInterval = null;
    }

    this.queue.kill();
    this.removeAllListeners();
  }
}

WCSCommandsParser.eventNames = ['chatMessageEvent', 'editorActionEvent', 'playerKilledEvent', 'playerConnectedEvent'];

module.exports = WCSCommandsParser;