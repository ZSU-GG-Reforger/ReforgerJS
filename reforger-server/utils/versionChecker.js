// reforger-server/utils/versionChecker.js
const axios = require('axios');
const { version } = require('../../package.json');

function compareVersions(v1, v2) {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        
        if (v1Part > v2Part) return 1;
        if (v1Part < v2Part) return -1;
    }
    
    return 0;
}

async function checkVersion(owner, repo, logger) {
    try {
        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
        const latestVersion = response.data.tag_name.replace('v', '');
        const currentVersion = version;
        
        const comparison = compareVersions(currentVersion, latestVersion);
        
        if (comparison === 0) {
            logger.info(`Running latest stable version: ${currentVersion}`);
            return { upToDate: true, isExperimental: false };
        } else if (comparison > 0) {
            logger.warn(`Running experimental version: ${currentVersion} (latest stable: ${latestVersion})`);
            return { upToDate: true, isExperimental: true };
        } else {
            logger.warn(`New version available: ${latestVersion} (currently running: ${currentVersion})`);
            logger.info(`Update at: https://github.com/${owner}/${repo}/releases/latest`);
            return { upToDate: false, isExperimental: false };
        }
    } catch (error) {
        logger.error(`Failed to check for updates: ${error.message}`);
        return { upToDate: true, isExperimental: false };
    }
}

module.exports = { checkVersion };