const fs = require('fs');
const path = require('path');

class TailCustomReader {
  constructor(queueLine, options = {}) {
    if (!options.logDir) {
      throw new Error('logDir must be specified in options.');
    }
    if (!options.filename) {
      throw new Error('filename must be specified in options.');
    }
    if (typeof queueLine !== 'function') {
      throw new Error('queueLine must be specified and be a function.');
    }
    
    this.queueLine = queueLine;
    this.options = options;
    this.logDir = options.logDir;
    this.filename = options.filename;
    this.scanInterval = options.scanInterval || 3000;
    this.stateSaveInterval = options.stateSaveInterval || 60000;
    
    const parserType = options.parserName || 'custom';
    this.stateFile = path.resolve(__dirname, `${parserType}_state.json`);
    
    this.filePath = path.join(this.logDir, this.filename);
    
    this.lastFileSize = 0;
    this.scanIntervalID = null;
    this.stateSaveID = null;
  }

  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        if (data && data.trim()) {
          const state = JSON.parse(data);
          this.lastFileSize = state.lastFileSize || 0;
        }
      }
    } catch (error) {
      logger.warn(`Error loading state for custom parser: ${error.message}`);
      this.lastFileSize = 0;
    }
  }

  saveState() {
    try {
      const state = {
        filePath: this.filePath,
        lastFileSize: this.lastFileSize
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      logger.warn(`Error saving state for custom parser: ${error.message}`);
    }
  }

  checkFileExists() {
    try {
      if (fs.existsSync(this.filePath)) {
        return true;
      }
      logger.warn(`Custom log file not found: ${this.filePath}, but will continue monitoring for it`);
      return false;
    } catch (error) {
      logger.error(`Error checking log file existence: ${error.message}`);
      return false;
    }
  }

  scanLogs() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }
      
      const stats = fs.statSync(this.filePath);
      const newSize = stats.size;
      
      if (newSize < this.lastFileSize) {
        logger.info(`File ${this.filePath} appears to have been truncated or rotated. Resetting position.`);
        this.lastFileSize = 0;
      }
      
      if (newSize > this.lastFileSize) {
        const stream = fs.createReadStream(this.filePath, {
          start: this.lastFileSize,
          end: newSize - 1,
        });
        
        let data = '';
        stream.on('data', chunk => {
          data += chunk.toString();
        });
        
        stream.on('end', () => {
          const lines = data.split(/\r?\n/);
          lines.forEach(line => {
            if (line.trim().length > 0) {
              this.queueLine(line);
            }
          });
          this.lastFileSize = newSize;
          stream.destroy();
        });
        
        stream.on('error', err => {
          logger.error(`Error reading log file: ${err.message}`);
          stream.destroy();
        });
      }
    } catch (err) {
      logger.error(`Error scanning logs: ${err.message}`);
    }
  }

  watch() {
    this.loadState();
    this.checkFileExists();
    
    this.scanIntervalID = setInterval(() => {
      this.scanLogs();
    }, this.scanInterval);

    this.stateSaveID = setInterval(() => {
      this.saveState();
    }, this.stateSaveInterval);

    logger.info(`Started watching custom log file (will wait for it if not found): ${this.filePath}`);
    return Promise.resolve(); 
  }

  async unwatch() {
    if (this.scanIntervalID) {
      clearInterval(this.scanIntervalID);
      this.scanIntervalID = null;
    }
    if (this.stateSaveID) {
      clearInterval(this.stateSaveID);
      this.stateSaveID = null;
    }
    this.saveState();
    return Promise.resolve();
  }
}

module.exports = TailCustomReader;