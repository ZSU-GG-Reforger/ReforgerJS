const axios = require("axios");

class BattleMetricsAPI {
  constructor(config) {
    if (!config || !config.connectors || !config.connectors.battlemetrics) {
      throw new Error("BattleMetrics configuration is missing");
    }

    const bmConfig = config.connectors.battlemetrics;
    if (
      !bmConfig.token ||
      !bmConfig.orgID ||
      !bmConfig.serverID ||
      !bmConfig.listID
    ) {
      throw new Error(
        "BattleMetrics configuration is incomplete (token, orgID, serverID, or listID missing)"
      );
    }

    this.config = bmConfig;
    this.baseUrl = "https://api.battlemetrics.com";
    this.headers = {
      Authorization: `Bearer ${this.config.token}`,
      "Content-Type": "application/json",
    };

    this.playerIdCache = new Map();
    this.cacheTTL = 30 * 60 * 1000;

    this.initialized = false;
  }

  /**
   * Validate API credentials by fetching organization info
   * @returns {Promise<boolean>} True if validation succeeds, throws error otherwise
   */
  async validateCredentials() {
    try {
      const orgInfo = await this.fetchOrganization(this.config.orgID);
      const orgName = orgInfo.data.attributes.name;

      logger.info(
        `BattleMetrics API validated successfully for organization: ${orgName}`
      );
      this.initialized = true;
      return true;
    } catch (error) {
      let errorMessage = `BattleMetrics API validation failed: ${error.message}`;

      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;

        if (status === 401) {
          errorMessage = `BattleMetrics API validation failed: Invalid API token (401 Unauthorized)`;
        } else if (status === 403) {
          errorMessage = `BattleMetrics API validation failed: Insufficient permissions (403 Forbidden)`;
        } else if (status === 404) {
          errorMessage = `BattleMetrics API validation failed: Organization ID '${this.config.orgID}' not found (404 Not Found)`;
        } else if (status === 429) {
          errorMessage = `BattleMetrics API validation failed: Rate limit exceeded (429 Too Many Requests)`;
        } else {
          errorMessage = `BattleMetrics API validation failed: HTTP ${status} - ${JSON.stringify(
            errorData
          )}`;
        }
      }

      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Find a BattleMetrics player ID using a Reforger UUID
   * @param {string} reforgerUUID - The Reforger UUID to search for
   * @returns {Promise<string|null>} BattleMetrics player ID if found, null otherwise
   */
  async getBattleMetricsPlayerId(reforgerUUID) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      if (this.playerIdCache.has(reforgerUUID)) {
        const cachedData = this.playerIdCache.get(reforgerUUID);
        if (Date.now() < cachedData.expiresAt) {
          logger.verbose(
            `Using cached BattleMetrics player ID for Reforger UUID: ${reforgerUUID}`
          );
          return cachedData.playerId;
        } else {
          this.playerIdCache.delete(reforgerUUID);
        }
      }

      logger.verbose(
        `Searching for BattleMetrics player ID with Reforger UUID: ${reforgerUUID}`
      );

      const payload = {
        data: [
          {
            type: "identifier",
            attributes: {
              type: "reforgerUUID",
              identifier: reforgerUUID,
            },
          },
        ],
      };

      const response = await axios.post(
        `${this.baseUrl}/players/match`,
        payload,
        {
          headers: this.headers,
        }
      );

      if (
        response.data.data &&
        response.data.data.length > 0 &&
        response.data.data[0].relationships &&
        response.data.data[0].relationships.player &&
        response.data.data[0].relationships.player.data
      ) {
        const playerId = response.data.data[0].relationships.player.data.id;

        this.playerIdCache.set(reforgerUUID, {
          playerId,
          expiresAt: Date.now() + this.cacheTTL,
        });

        logger.info(
          `Found BattleMetrics player ID ${playerId} for Reforger UUID: ${reforgerUUID}`
        );
        return playerId;
      } else {
        logger.warn(
          `No BattleMetrics player found with Reforger UUID: ${reforgerUUID}`
        );
        return null;
      }
    } catch (error) {
      logger.error(
        `Error finding BattleMetrics player ID for ${reforgerUUID}: ${error.message}`
      );
      if (error.response) {
        logger.error(`API response: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * Enhanced version of fetchPlayer that works with both BM IDs and Reforger UUIDs
   * @param {string} playerIdentifier - Either a BattleMetrics Player ID or Reforger UUID
   * @param {boolean} isReforgerUUID - Set to true if the identifier is a Reforger UUID
   * @returns {Promise<Object|null>} Player data if found, null otherwise
   */
  async fetchPlayer(playerIdentifier, isReforgerUUID = false) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      let bmPlayerId = playerIdentifier;
      if (isReforgerUUID) {
        bmPlayerId = await this.getBattleMetricsPlayerId(playerIdentifier);
        if (!bmPlayerId) {
          return null;
        }
      }

      const response = await axios.get(
        `${this.baseUrl}/players/${bmPlayerId}`,
        {
          headers: this.headers,
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Error fetching BattleMetrics player: ${error.message}`);
      if (error.response && error.response.status === 404) {
        logger.warn(`Player not found with identifier: ${playerIdentifier}`);
      }
      return null;
    }
  }

  /**
   * Fetch organization information
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} Organization data
   */
  async fetchOrganization(orgId) {
    const response = await axios.get(`${this.baseUrl}/organizations/${orgId}`, {
      headers: this.headers,
    });
    return response.data;
  }

  /**
   * Helper method to ensure a BattleMetrics player ID is available
   * @param {string} playerIdentifier - Either a BattleMetrics Player ID or Reforger UUID
   * @param {boolean} isReforgerUUID - Set to true if the identifier is a Reforger UUID
   * @returns {Promise<string|null>} BattleMetrics player ID if found, null otherwise
   * @private
   */
  async _ensurePlayerIdAvailable(playerIdentifier, isReforgerUUID = false) {
    if (isReforgerUUID) {
      return await this.getBattleMetricsPlayerId(playerIdentifier);
    }
    return playerIdentifier;
  }

  /**
   * Create a ban for a player using Reforger UUID
   * @param {string} reforgerUUID - The Reforger UUID of the player to ban
   * @param {Object} options - Ban options
   * @param {string} options.reason - Ban reason
   * @param {string} options.note - Private admin note
   * @param {string} options.expires - Expiration date in ISO format (null for permanent)
   * @param {boolean} [options.permanent=false] - Whether the ban is permanent
   * @param {boolean} [options.autoAddEnabled=true] - Whether to automatically add new identifiers
   * @param {boolean} [options.nativeEnabled=true] - Whether to enable native bans
   * @param {boolean} [options.orgWide=true] - Whether the ban applies organization-wide
   * @returns {Promise<Object|null>} Ban data if successful, null otherwise
   */
  async createBanByReforgerUUID(
    reforgerUUID,
    { reason, note, expires, permanent = false, autoAddEnabled = true, nativeEnabled = true, orgWide = true }
  ) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      const playerId = await this.getBattleMetricsPlayerId(reforgerUUID);
      
      if (!playerId) {
        throw new Error(`Cannot create ban: No BattleMetrics player ID found for Reforger UUID: ${reforgerUUID}`);
      }

      logger.info(`Creating ban for BattleMetrics player ID ${playerId} (Reforger UUID: ${reforgerUUID})`);

      const identifiers = [
        {
          type: "reforgerUUID",
          identifier: reforgerUUID,
          manual: true,
        },
      ];

      const payload = {
        data: {
          type: "ban",
          attributes: {
            autoAddEnabled: autoAddEnabled,
            nativeEnabled: nativeEnabled,
            orgWide: orgWide,
            expires: permanent ? null : expires,
            reason,
            note: note || "",
            identifiers
          },
          relationships: {
            organization: {
              data: {
                type: "organization",
                id: this.config.orgID,
              },
            },
            banList: {
              data: {
                type: "banList",
                id: this.config.listID,
              },
            },
            server: {
              data: {
                type: "server",
                id: this.config.serverID,
              },
            },
            player: {
              data: {
                type: "player",
                id: playerId,
              },
            },
          },
        },
      };

      logger.verbose(`Creating ban with payload: ${JSON.stringify(payload, null, 2)}`);

      const response = await axios.post(`${this.baseUrl}/bans`, payload, {
        headers: this.headers,
      });
      
      logger.info(`BattleMetrics ban created successfully: ${response.data.data.id}`);
      return response.data;
    } catch (error) {
      logger.error(
        `Error creating BattleMetrics ban by Reforger UUID: ${error.message}`
      );
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        logger.error(`API response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return null;
    }
  }

  /**
   * Remove a ban by Reforger UUID
   * @param {string} reforgerUUID - The Reforger UUID of the banned player
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async removeBanByReforgerUUID(reforgerUUID) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      const playerId = await this.getBattleMetricsPlayerId(reforgerUUID);
      if (!playerId) {
        logger.warn(`Cannot remove ban: No BattleMetrics player ID found for Reforger UUID: ${reforgerUUID}`);
        return false;
      }

      const bansResponse = await this.fetchBanList({
        "filter[player]": playerId,
        "filter[expired]": "false"
      });

      if (!bansResponse.data || bansResponse.data.length === 0) {
        logger.warn(`No active bans found for player ID: ${playerId}`);
        return false;
      }

      const banId = bansResponse.data[0].id;
      return await this.removeBan(banId);
    } catch (error) {
      logger.error(`Error removing ban by Reforger UUID: ${error.message}`);
      return false;
    }
  }

  /**
   * Remove a ban by ban ID
   * @param {string} banId - The ban ID to remove
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async removeBan(banId) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      await axios.delete(`${this.baseUrl}/bans/${banId}`, {
        headers: this.headers,
      });

      logger.info(`BattleMetrics ban removed successfully: ${banId}`);
      return true;
    } catch (error) {
      logger.error(`Error removing BattleMetrics ban: ${error.message}`);
      if (error.response) {
        logger.error(`API response: ${JSON.stringify(error.response.data)}`);
      }
      return false;
    }
  }

  async updateBan(banId, { reason, note, expires, permanent = false }) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      const payload = {
        data: {
          type: "ban",
          id: banId,
          attributes: {}
        },
      };

      if (note !== undefined) {
        payload.data.attributes.note = note;
      }
      if (reason !== undefined) {
        payload.data.attributes.reason = reason;
      }
      if (expires !== undefined) {
        payload.data.attributes.expires = permanent ? null : expires;
      }

      logger.verbose(`Updating ban ${banId} with payload: ${JSON.stringify(payload, null, 2)}`);

      const response = await axios.patch(
        `${this.baseUrl}/bans/${banId}`,
        payload,
        { headers: this.headers }
      );

      logger.info(`BattleMetrics ban updated successfully: ${banId}`);
      logger.verbose(`Update response: ${JSON.stringify(response.data, null, 2)}`);
      
      return response.data;
    } catch (error) {
      logger.error(`Error updating BattleMetrics ban: ${error.message}`);
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        logger.error(`API response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }

  async fetchBan(banId) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      const response = await axios.get(`${this.baseUrl}/bans/${banId}`, {
        headers: this.headers,
      });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logger.verbose(`BattleMetrics ban not found: ${banId} (404)`);
      } else {
        logger.error(`Error fetching BattleMetrics ban: ${error.message}`);
      }
      throw error;
    }
  }

  async fetchBanList(params = {}) {
    try {
      if (!this.initialized)
        throw new Error("BattleMetrics API not initialized");

      const queryParams = new URLSearchParams({
        "filter[organization]": this.config.orgID,
        "filter[banList]": this.config.listID,
        "page[size]": params.pageSize || 100,
        ...params,
      });

      const response = await axios.get(`${this.baseUrl}/bans?${queryParams}`, {
        headers: this.headers,
      });
      return response.data;
    } catch (error) {
      logger.error(`Error fetching BattleMetrics ban list: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a note for a player in BattleMetrics
   * @param {string} playerIdentifier - Either a BattleMetrics Player ID or Reforger UUID
   * @param {Object} attributes - Note attributes
   * @param {string} attributes.note - The content of the note (required)
   * @param {boolean} [attributes.shared=true] - Whether the note should be shared with friendly organizations
   * @param {number} [attributes.clearanceLevel=0] - Clearance level required to view this note
   * @param {string|null} [attributes.expiresAt=null] - When this note should expire (ISO date string), or null if it shouldn't expire
   * @param {boolean} [isReforgerUUID=false] - Set to true if the identifier is a Reforger UUID
   * @returns {Promise<Object|null>} Created note data if successful, null otherwise
   */
  async createPlayerNote(playerIdentifier, attributes = {}, isReforgerUUID = false) {
    try {
      if (!this.initialized) throw new Error('BattleMetrics API not initialized');
      
      if (!attributes.note) {
        throw new Error('Note content is required');
      }
      
      const noteAttributes = {
        note: attributes.note,
        shared: attributes.shared !== undefined ? attributes.shared : true,
        clearanceLevel: attributes.clearanceLevel !== undefined ? attributes.clearanceLevel : 0,
        expiresAt: attributes.expiresAt !== undefined ? attributes.expiresAt : null
      };
      
      const playerId = await this._ensurePlayerIdAvailable(playerIdentifier, isReforgerUUID);
      if (!playerId) {
        logger.warn(`Cannot create note: No BattleMetrics player ID found for ${playerIdentifier}`);
        return null;
      }
      
      const endpoint = `${this.baseUrl}/players/${playerId}/relationships/notes`;
    
      const payload = {
        data: {
          type: "playerNote",
          attributes: noteAttributes,
          relationships: {
            organization: {
              data: {
                type: "organization",
                id: this.config.orgID
              }
            }
          }
        }
      };

      logger.verbose(`Sending player note payload to ${endpoint}: ${JSON.stringify(payload)}`);
      
      const response = await axios.post(endpoint, payload, { headers: this.headers });
      
      logger.info(`BattleMetrics player note created successfully for player: ${playerId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error creating BattleMetrics player note: ${error.message}`);
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        logger.error(`API response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Fetch player flags from BattleMetrics
   * @param {string} playerIdentifier - Either a BattleMetrics Player ID or Reforger UUID
   * @param {boolean} [isReforgerUUID=false] - Set to true if the identifier is a Reforger UUID
   * @param {boolean} [activeOnly=true] - If true, only return active flags (not removed)
   * @returns {Promise<Object|null>} Player flags data if successful, null otherwise
   */
  async fetchPlayerFlags(playerIdentifier, isReforgerUUID = false, activeOnly = true) {
    try {
      if (!this.initialized) throw new Error('BattleMetrics API not initialized');
      
      const playerId = await this._ensurePlayerIdAvailable(playerIdentifier, isReforgerUUID);
      if (!playerId) {
        logger.warn(`Cannot fetch flags: No BattleMetrics player ID found for ${playerIdentifier}`);
        return null;
      }
      
      const endpoint = `${this.baseUrl}/players/${playerId}/relationships/flags`;
      logger.verbose(`Fetching player flags from: ${endpoint}`);

      const response = await axios.get(endpoint, { headers: this.headers });
      
      if (response.data && response.data.data) {
        if (activeOnly) {
          response.data.data = response.data.data.filter(flag => {
            return !flag.attributes || !flag.attributes.removedAt;
          });
        }
        
        logger.verbose(`Found ${response.data.data.length} ${activeOnly ? 'active' : 'total'} flags for player ${playerId}`);
      }
      
      return response.data;
    } catch (error) {
      logger.error(`Error fetching BattleMetrics player flags: ${error.message}`);
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        logger.error(`API response data: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * Create a flag for a player in BattleMetrics
   * @param {string} playerIdentifier - Either a BattleMetrics Player ID or Reforger UUID
   * @param {string} flagId - The ID of the flag to add to the player
   * @param {boolean} [isReforgerUUID=false] - Set to true if the identifier is a Reforger UUID
   * @returns {Promise<Object|null>} Created flag relationship data if successful, null otherwise
   */
  async createPlayerFlag(playerIdentifier, flagId, isReforgerUUID = false) {
    try {
      if (!this.initialized) throw new Error('BattleMetrics API not initialized');
      
      if (!flagId) {
        throw new Error('Flag ID is required');
      }
      
      const playerId = await this._ensurePlayerIdAvailable(playerIdentifier, isReforgerUUID);
      if (!playerId) {
        logger.warn(`Cannot create flag: No BattleMetrics player ID found for ${playerIdentifier}`);
        return null;
      }
      
      const endpoint = `${this.baseUrl}/players/${playerId}/relationships/flags`;
      logger.verbose(`Creating player flag relationship at: ${endpoint}`);
      
      const payload = {
        data: [{
          type: "playerFlag",
          id: flagId
        }]
      };

      logger.verbose(`Sending player flag payload to ${endpoint}: ${JSON.stringify(payload)}`);
      
      const response = await axios.post(endpoint, payload, { headers: this.headers });
      
      logger.info(`BattleMetrics player flag ${flagId} added successfully to player: ${playerId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error creating BattleMetrics player flag: ${error.message}`);
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        logger.error(`API response data: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * Delete a flag from a player in BattleMetrics
   * @param {string} playerIdentifier - Either a BattleMetrics Player ID or Reforger UUID
   * @param {string} flagId - The ID of the flag to remove from the player
   * @param {boolean} [isReforgerUUID=false] - Set to true if the identifier is a Reforger UUID
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async deletePlayerFlag(playerIdentifier, flagId, isReforgerUUID = false) {
    try {
      if (!this.initialized) throw new Error('BattleMetrics API not initialized');
      
      if (!flagId) {
        throw new Error('Flag ID is required');
      }
      
      const playerId = await this._ensurePlayerIdAvailable(playerIdentifier, isReforgerUUID);
      if (!playerId) {
        logger.warn(`Cannot delete flag: No BattleMetrics player ID found for ${playerIdentifier}`);
        return false;
      }
      
      const endpoint = `${this.baseUrl}/players/${playerId}/relationships/flags/${flagId}`;
      logger.verbose(`Deleting player flag relationship at: ${endpoint}`);
      
      await axios.delete(endpoint, { headers: this.headers });
      
      logger.info(`BattleMetrics player flag ${flagId} removed successfully from player: ${playerId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting BattleMetrics player flag: ${error.message}`);
      if (error.response) {
        logger.error(`API response status: ${error.response.status}`);
        logger.error(`API response data: ${JSON.stringify(error.response.data)}`);
      }
      return false;
    }
  }
}

module.exports = BattleMetricsAPI;