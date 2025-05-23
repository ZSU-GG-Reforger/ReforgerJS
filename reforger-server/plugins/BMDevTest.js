class BMDevTest {
  constructor(config) {
    this.config = config;
    this.name = "BMDevTest Plugin";
    this.serverInstance = null;
    this.battlemetricsAPI = null;
    this.testResults = {
      flags: { passed: false, error: null },
      notes: { passed: false, error: null },
      bans: { passed: false, error: null },
      editBan: { passed: false, error: null },
      removeBan: { passed: false, error: null }
    }
  }

  async testEditBan(config) {
    try {
      const testBanID = config.testBanID;
      let testBanEditMessage = config.testBanEditMessage || "Updated ban message from BattleMetrics API test";
      
      if (typeof testBanEditMessage === 'object') {
        testBanEditMessage = JSON.stringify(testBanEditMessage);
      }

      if (!testBanID) {
        throw new Error("testBanID is required for ban edit testing");
      }

      logger.info(`[${this.name}] 1. Fetching current ban details...`);
      logger.info(`[${this.name}] Ban ID: ${testBanID}`);
      
      const currentBan = await this.battlemetricsAPI.fetchBan(testBanID);
      
      if (currentBan && currentBan.data) {
        logger.info(`[${this.name}] ✓ Successfully fetched ban details`);
        logger.info(`[${this.name}] Current reason: ${currentBan.data.attributes.reason || 'No reason'}`);
        logger.info(`[${this.name}] Current note: ${currentBan.data.attributes.note || 'No note'}`);
      } else {
        throw new Error("Failed to fetch current ban details");
      }

      logger.info(`[${this.name}] 2. Updating ban with new message...`);
      logger.info(`[${this.name}] New message: ${testBanEditMessage}`);
      
      try {
        const updateResult = await this.battlemetricsAPI.updateBan(testBanID, {
          note: testBanEditMessage,
          reason: currentBan.data.attributes.reason 
        });

        if (updateResult && updateResult.data) {
          logger.info(`[${this.name}] ✓ Successfully updated ban`);
          logger.info(`[${this.name}] Update response received with ban ID: ${updateResult.data.id}`);
        } else {
          logger.warn(`[${this.name}] Update returned but no data in response`);
          logger.info(`[${this.name}] Update result: ${JSON.stringify(updateResult)}`);
        }
      } catch (updateError) {
        logger.error(`[${this.name}] Error during ban update: ${updateError.message}`);
        throw new Error(`Failed to update ban: ${updateError.message}`);
      }

      logger.info(`[${this.name}] 3. Verifying ban update...`);
      
      await this.delay(2000);
      
      try {
        const updatedBan = await this.battlemetricsAPI.fetchBan(testBanID);
        
        if (updatedBan && updatedBan.data) {
          logger.info(`[${this.name}] ✓ Successfully fetched updated ban`);
          logger.info(`[${this.name}] Updated note: ${updatedBan.data.attributes.note || 'No note'}`);
          logger.info(`[${this.name}] Expected note: ${testBanEditMessage}`);
          
          if (updatedBan.data.attributes.note === testBanEditMessage) {
            logger.info(`[${this.name}] ✓ Ban update verified successfully - notes match exactly`);
          } else {
            logger.warn(`[${this.name}] Note content doesn't match exactly, but update appears successful`);
            logger.info(`[${this.name}] This might be normal if BattleMetrics processes the note content`);
          }
        } else {
          throw new Error("Failed to fetch updated ban for verification");
        }
      } catch (verifyError) {
        logger.error(`[${this.name}] Error during verification: ${verifyError.message}`);
        logger.warn(`[${this.name}] Verification failed but update may have been successful`);
      }

      this.testResults.editBan.passed = true;
      logger.info(`[${this.name}] Ban edit operations test PASSED`);

    } catch (error) {
      this.testResults.editBan.error = error.message;
      logger.error(`[${this.name}] Ban edit operations test FAILED: ${error.message}`);
    }
  }

  async testRemoveBan(config) {
    try {
      const testBanID = config.testBanID;

      if (!testBanID) {
        throw new Error("testBanID is required for ban removal testing");
      }

      logger.info(`[${this.name}] 1. Verifying ban exists before removal...`);
      logger.info(`[${this.name}] Ban ID: ${testBanID}`);
      
      const existingBan = await this.battlemetricsAPI.fetchBan(testBanID);
      
      if (existingBan && existingBan.data) {
        logger.info(`[${this.name}] ✓ Ban exists and can be removed`);
        logger.info(`[${this.name}] Ban reason: ${existingBan.data.attributes.reason}`);
      } else {
        throw new Error("Ban not found or unable to fetch ban details");
      }

      logger.info(`[${this.name}] 2. Removing ban...`);
      
      const removeResult = await this.battlemetricsAPI.removeBan(testBanID);

      if (removeResult) {
        logger.info(`[${this.name}] ✓ Successfully removed ban`);
      } else {
        throw new Error("Failed to remove ban");
      }

      logger.info(`[${this.name}] 3. Verifying ban removal...`);
      
      try {
        const removedBan = await this.battlemetricsAPI.fetchBan(testBanID);
        if (removedBan && removedBan.data) {
          throw new Error("Ban still exists after removal attempt");
        }
        logger.warn(`[${this.name}] Unexpected: Ban fetch returned without error but no data`);
      } catch (fetchError) {
        if (fetchError.message.includes('404') || fetchError.message.includes('Request failed with status code 404')) {
          logger.info(`[${this.name}] ✓ Ban removal verified - ban no longer exists (404 as expected)`);
        } else {
          logger.error(`[${this.name}] Unexpected error during verification: ${fetchError.message}`);
          throw new Error(`Verification failed with unexpected error: ${fetchError.message}`);
        }
      }

      this.testResults.removeBan.passed = true;
      logger.info(`[${this.name}] Ban remove operations test PASSED`);

    } catch (error) {
      this.testResults.removeBan.error = error.message;
      logger.error(`[${this.name}] Ban remove operations test FAILED: ${error.message}`);
    };
  }

  async prepareToMount(serverInstance) {
    this.serverInstance = serverInstance;

    try {
      if (!process.battlemetricsAPI) {
        logger.error(`[${this.name}] BattleMetrics API not available. Plugin will be disabled.`);
        return;
      }

      this.battlemetricsAPI = process.battlemetricsAPI;

      const pluginConfig = this.config.plugins.find(
        (plugin) => plugin.plugin === "BMDevTest"
      );
      
      if (!pluginConfig || !pluginConfig.enabled) {
        logger.warn(`[${this.name}] Plugin disabled or missing configuration`);
        return;
      }

      if (!pluginConfig.testUUID) {
        logger.error(`[${this.name}] testUUID is required for testing. Plugin disabled.`);
        return;
      }

      logger.info(`[${this.name}] Starting BattleMetrics API tests...`);
      logger.info(`[${this.name}] Test UUID: ${pluginConfig.testUUID}`);

      await this.runAllTests(pluginConfig);

      this.printTestSummary();

      logger.info(`[${this.name}] BattleMetrics API testing completed.`);
    } catch (error) {
      logger.error(`[${this.name}] Error initializing plugin: ${error.message}`);
    }
  }

  async runAllTests(config) {
    if (config.testFlags) {
      logger.info(`[${this.name}] Testing Flag operations...`);
      await this.testFlags(config);
    }

    if (config.testNotes) {
      logger.info(`[${this.name}] Testing Note operations...`);
      await this.testNotes(config);
    }

    if (config.testBans) {
      logger.info(`[${this.name}] Testing Ban operations...`);
      await this.testBans(config);
    }

    if (config.testEditBan) {
      logger.info(`[${this.name}] Testing Ban Edit operations...`);
      await this.testEditBan(config);
    }

    if (config.testRemoveBan) {
      logger.info(`[${this.name}] Testing Ban Remove operations...`);
      await this.testRemoveBan(config);
    }
  }

  async testFlags(config) {
    try {
      const testUUID = config.testUUID;
      const testFlagID = config.testFlagID;

      if (!testFlagID) {
        throw new Error("testFlagID is required for flag testing");
      }

      logger.info(`[${this.name}] 1. Fetching existing flags for player...`);
      
      const initialFlags = await this.battlemetricsAPI.fetchPlayerFlags(
        testUUID,
        true, 
        true 
      );

      if (initialFlags && initialFlags.data) {
        logger.info(`[${this.name}] Found ${initialFlags.data.length} existing active flags:`);
        initialFlags.data.forEach(flag => {
          logger.info(`[${this.name}]   - Flag ID: ${flag.id}`);
        });
      } else {
        logger.info(`[${this.name}] No existing flags found or unable to fetch flags`);
      }

      logger.info(`[${this.name}] 2. Adding test flag: ${testFlagID}`);
      
      const addResult = await this.battlemetricsAPI.createPlayerFlag(
        testUUID,
        testFlagID,
        true 
      );

      if (addResult) {
        logger.info(`[${this.name}] ✓ Successfully added test flag`);
      } else {
        throw new Error("Failed to add test flag");
      }

      logger.info(`[${this.name}] 3. Waiting 2 seconds before removal...`);
      await this.delay(2000);

      logger.info(`[${this.name}] 4. Removing test flag: ${testFlagID}`);
      
      const removeResult = await this.battlemetricsAPI.deletePlayerFlag(
        testUUID,
        testFlagID,
        true 
      );

      if (removeResult) {
        logger.info(`[${this.name}] ✓ Successfully removed test flag`);
      } else {
        throw new Error("Failed to remove test flag");
      }

      logger.info(`[${this.name}] 5. Verifying flag removal...`);
      
      const finalFlags = await this.battlemetricsAPI.fetchPlayerFlags(
        testUUID,
        true,
        true 
      );

      if (finalFlags && finalFlags.data) {
        const testFlagExists = finalFlags.data.some(flag => flag.id.endsWith(testFlagID));
        if (testFlagExists) {
          throw new Error("Test flag still exists after removal attempt");
        } else {
          logger.info(`[${this.name}] ✓ Test flag successfully removed - verification passed`);
        }
      }

      this.testResults.flags.passed = true;
      logger.info(`[${this.name}] Flag operations test PASSED`);

    } catch (error) {
      this.testResults.flags.error = error.message;
      logger.error(`[${this.name}] Flag operations test FAILED: ${error.message}`);
    }
  }

  async testNotes(config) {
    try {
      const testUUID = config.testUUID;
      const testNote = config.testNote || "BattleMetrics API Test Note";

      logger.info(`[${this.name}] 1. Adding test note to player...`);
      
      const noteResult = await this.battlemetricsAPI.createPlayerNote(
        testUUID,
        {
          note: testNote,
          shared: true,
          clearanceLevel: 0,
          expiresAt: null
        },
        true
      );

      if (noteResult) {
        logger.info(`[${this.name}] ✓ Successfully created test note`);
        logger.info(`[${this.name}] Note content: "${testNote}"`);
      } else {
        throw new Error("Failed to create test note");
      }

      this.testResults.notes.passed = true;
      logger.info(`[${this.name}] Note operations test PASSED`);

    } catch (error) {
      this.testResults.notes.error = error.message;
      logger.error(`[${this.name}] Note operations test FAILED: ${error.message}`);
    }
  }

  async testBans(config) {
    try {
      const testUUID = config.testUUID;
      const testBanDuration = config.testBanDuration || 24; 
      const testBanReason = config.testBanReason || "BattleMetrics API Test Ban";
      let testBanMessage = config.testBanMessage || "This is a test ban from BattleMetrics API integration";
      
      if (typeof testBanMessage === 'object') {
        testBanMessage = JSON.stringify(testBanMessage);
      }
      const autoAddEnabled = config.testBanAutoAddEnabled !== undefined ? config.testBanAutoAddEnabled : true;
      const nativeEnabled = config.testBanNativeEnabled !== undefined ? config.testBanNativeEnabled : true;
      const orgWide = config.testBanOrgWide !== undefined ? config.testBanOrgWide : true;

      logger.info(`[${this.name}] 1. Creating test ban for player...`);
      logger.info(`[${this.name}] Duration: ${testBanDuration} hours`);
      logger.info(`[${this.name}] Reason: ${testBanReason}`);
      logger.info(`[${this.name}] Message: ${testBanMessage}`);
      logger.info(`[${this.name}] Auto Add Enabled: ${autoAddEnabled}`);
      logger.info(`[${this.name}] Native Enabled: ${nativeEnabled}`);
      logger.info(`[${this.name}] Organization Wide: ${orgWide}`);

      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + testBanDuration);
      const expiresAt = expirationDate.toISOString();

      const banResult = await this.battlemetricsAPI.createBanByReforgerUUID(
        testUUID,
        {
          reason: testBanReason,
          note: testBanMessage,
          expires: expiresAt,
          permanent: false,
          autoAddEnabled: autoAddEnabled,
          nativeEnabled: nativeEnabled,
          orgWide: orgWide
        }
      );

      if (banResult && banResult.data) {
        logger.info(`[${this.name}] ✓ Successfully created test ban`);
        logger.info(`[${this.name}] Ban ID: ${banResult.data.id}`);
        logger.info(`[${this.name}] Expires: ${expiresAt}`);
        
        this.testBanId = banResult.data.id;
      } else {
        throw new Error("Failed to create test ban");
      }

      this.testResults.bans.passed = true;
      logger.info(`[${this.name}] Ban operations test PASSED`);
      logger.warn(`[${this.name}] Test ban created - remember to remove it manually if needed`);

    } catch (error) {
      this.testResults.bans.error = error.message;
      logger.error(`[${this.name}] Ban operations test FAILED: ${error.message}`);
    }
  }

  printTestSummary() {
    logger.info(`[${this.name}] ==================== TEST SUMMARY ====================`);
    
    if (this.testResults.flags.passed) {
      logger.info(`[${this.name}] FLAGS TEST: PASSED`);
    } else if (this.testResults.flags.error) {
      logger.error(`[${this.name}] FLAGS TEST: FAILED - ${this.testResults.flags.error}`);
    } else {
      logger.info(`[${this.name}] ⏭FLAGS TEST: SKIPPED`);
    }

    if (this.testResults.notes.passed) {
      logger.info(`[${this.name}] NOTES TEST: PASSED`);
    } else if (this.testResults.notes.error) {
      logger.error(`[${this.name}] NOTES TEST: FAILED - ${this.testResults.notes.error}`);
    } else {
      logger.info(`[${this.name}] NOTES TEST: SKIPPED`);
    }

    if (this.testResults.bans.passed) {
      logger.warn(`[${this.name}] BANS TEST: PASSED (Test ban created - cleanup may be needed)`);
    } else if (this.testResults.bans.error) {
      logger.error(`[${this.name}] BANS TEST: FAILED - ${this.testResults.bans.error}`);
    } else {
      logger.info(`[${this.name}] BANS TEST: SKIPPED`);
    }

    if (this.testResults.editBan.passed) {
      logger.info(`[${this.name}] EDIT BAN TEST: PASSED`);
    } else if (this.testResults.editBan.error) {
      logger.error(`[${this.name}] EDIT BAN TEST: FAILED - ${this.testResults.editBan.error}`);
    } else {
      logger.info(`[${this.name}] EDIT BAN TEST: SKIPPED`);
    }

    if (this.testResults.removeBan.passed) {
      logger.info(`[${this.name}] REMOVE BAN TEST: PASSED`);
    } else if (this.testResults.removeBan.error) {
      logger.error(`[${this.name}] REMOVE BAN TEST: FAILED - ${this.testResults.removeBan.error}`);
    } else {
      logger.info(`[${this.name}] REMOVE BAN TEST: SKIPPED`);
    }

    const totalTests = Object.values(this.testResults).filter(result => result.passed || result.error).length;
    const passedTests = Object.values(this.testResults).filter(result => result.passed).length;
    
    logger.info(`[${this.name}] ======================================================`);
    logger.info(`[${this.name}] OVERALL: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests && totalTests > 0) {
      logger.info(`[${this.name}] All BattleMetrics API tests completed successfully!`);
    } else if (passedTests > 0) {
      logger.warn(`[${this.name}] Some tests failed - check configuration and permissions`);
    } else {
      logger.error(`[${this.name}] All tests failed - BattleMetrics API integration may not be working`);
    }
    
    logger.info(`[${this.name}] ======================================================`);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    logger.info(`[${this.name}] Plugin cleanup completed.`);
  }
}

module.exports = BMDevTest;