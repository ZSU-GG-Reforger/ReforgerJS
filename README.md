<div align="center">

<img src="reforger-server/utils/ReforgerJSlogo.png" alt="Logo" width="800"/>

</div>

# ReforgerJS

## **About**

ReforgerJS is a third-party JavaScript framework designed for comprehensive monitoring, administration, and integration of your Arma Reforger server. It not only provides powerful tools to manage player data and server status but also features seamless Discord integration, enabling real-time alerts, commands, and statistics right from your Discord server.


## **Using ReforgerJS**

ReforgerJS relies on being able to access the Reforger server log directory in order to parse logs live to collect information. Thus, ReforgerJS must be hosted on the same server box as your Reforger server.

#### Prerequisites

- [Node.js](https://nodejs.org/en/) (18.x) - [Download](https://nodejs.org/en/)
- For player stats, Add this to your server startup file: `-logstats 30000` [More Info](https://community.bistudio.com/wiki/Arma_Reforger:Startup_Parameters#logStats)
- Some plugins may have additional requirements.

#### Installation

1. [Download ReforgerJS](https://github.com/ZSU-GG-Reforger/ReforgerJS/releases/latest) and unzip the download.
2. Open the unzipped folder in your terminal.
3. Install the dependencies by running `npm install` in your terminal.
4. Configure the `config.json` file. See below for more details.
5. Once you have enabled the commands you wish to run. Before running the bot, Run the command loader `node deploy-commands.js`
6. Start ReforgerJS by running `node index.js` in your terminal.

<br>

## **Configuring ReforgerJS**

<details>
  <summary>Server</summary>

## Server Configuration

```json
"server": {
  "id": 1,
  "name": "SERVER NAME",
  "host": "xxx.xxx.xxx.xxx",
  "queryPort": 00000,
  "rconPort": 00000,
  "rconPassword": "password",
  "logReaderMode": "tail",
  "logDir": "C:/path/to/reforger/log/folder",
},
"consoleLogLevel": "info",
"outputLogLevel": "info",
```

- `id` - An integer ID to uniquely identify the server.
- `name` - The Name of the server. Used by several plugins.
- `host` - The IP of the server.
- `queryPort` - The query port of the server.
- `rconPort` - The RCON port of the server.
- `rconPassword` - The RCON password of the server.
- `logReaderMode` - `tail` will read from a local log file, Future plans for `FTP`/`SFTP`
- `logDir` - The folder where your Reforger logs are saved.

- `consoleLogLevel` - Level of logging to be logged to the console
- `outputLogLevel` - Level of logging to be logged to the saved log files
  Log Levels: `verbose` | `info` | `warn` | `error`

  ***

  </details>

<details>
  <summary>Connectors</summary>

## Connector Configuration

Connectors allow ReforgerJS to communicate with external resources.

##### Discord

Connects to Discord via `discord.js`.

```json
"connectors": {
  "discord": {
    "token": "",
    "clientId":"",
    "guildId": ""
  }
},
```

- `token` - Discord bot login token.
- `clientId` - ClientID of the bot.
- `guildId` - GuildID of the server your are wanting to connect to.

##### Databases

ReforgerJS uses MySQL for data saved by plugins

```json
  "mysql": {
    "enabled": false,
    "host": "host",
    "port": 3306,
    "username": "",
    "password": "",
    "database": "",
    "dialect": ""
  }
```

---

</details>

<details>
  <summary>Commands</summary>

## Discord Commands Configuration

Commands include a permission system. They can be restricted to select discord Roles.

##### Roles

List of Discord Role IDs

```json
"roles": {
  "roleName": "discord RoleID",
  "roleName1": "discord RoleID",
  "roleName2": "discord RoleID",
  "roleName3": "discord RoleID"
}
```

Role names can be customised. These names are used for `roleLevels`

##### RoleLevels

Role levels are the permission levels allocted to your discord roles. For example; Level 1 has full access to every command, Level 3 can only access level 3 or lower commands

```json
"roleLevels": {
  "1": [
    "roleName",
    "roleName1"
  ],
  "2": [
    "roleName2"
  ],
  "3": [
    "roleName3"
  ]
}
```

##### Commands

Discord Slash Commands

```json
"commands": [
  {
    "command": "whois",
    "enabled": false,
    "commandLevel": 3
  }
],
```

- `command` - Command name, Must match name to the command located in the `commands` folder
- `enabled` - Enabled the command. `deploy-commands` will only load commands that are enabled in teh config
- `commandLevel` - Permission level to allocate command to.

  ***

  </details>

<details>
  <summary>Plugins</summary>

## Plugin Configuration

The `plugins` section in your config file lists all plugins built into ReforgerJS

```json
  "plugins": [
    {
      "plugin": "DBLog",
      "disabled": false
    }
  ]
```

The `disabled` field can be toggled between `true`/ `false` to enabled/disable the plugin.

Plugin options are also specified. A full list of plugin options can be seen below.
When creating plugins, the name (Cap specific) must match the name in the plugin folder.

---

</details>

<br>

## **Commands**

The following is a list of commands built into ReforgerJS, you can click their title for more information:

<details>
  <summary>/whois</summary>
  <h2>/whois</h2>
  <p>
    The <code>/whois</code> command retrieves player information from the database by searching with a specific identifier.
    It returns data stored in the database and can also be used as an alt checker when supplied with an IP address.
    This command requires the <code>DBLog</code> plugin.
  </p>
  <h3>Options</h3>
  <ul>
    <li>
      <h4>Identifier</h4>
      <p>The type of identifier to search by. The available options are:</p>
      <ul>
        <li>beGUID (Battle-eye GUID)</li>
        <li>UUID (Reforger UUID)</li>
        <li>Name (Player Name)</li>
        <li>IP (IP Address)</li>
      </ul>
    </li>
    <li>
      <h4>Value</h4>
      <p>The value corresponding to the chosen identifier. When using an IP address, this command can function as an alt checker.</p>
    </li>
  </ul>
</details>

<details>
  <summary>/stats</summary>
  <h2>/stats</h2>
  <p>
    The <code>/stats</code> command retrieves detailed player statistics by UUID.
    It gathers both basic player information and advanced metrics from the database.
    This command requires the <code>DBLog</code> and <code>DBLogStats</code> plugins.
  </p>
  <h3>Options</h3>
  <ul>
    <li>
      <h4>UUID</h4>
      <p>The Reforger UUID of the player whose statistics are being retrieved.</p>
    </li>
  </ul>
  <h3>Statistics Returned</h3>
  <ul>
    <li>
      <strong>Infantry:</strong> Points, player kills, deaths, K/D ratio, AI kills, shots fired, grenades thrown, and distance walked.
    </li>
    <li>
      <strong>Logistics:</strong> Points, roadkills, AI roadkills, distance driven, and distance as a passenger.
    </li>
    <li>
      <strong>Medical:</strong> Points, bandages applied, tourniquets applied, saline and morphine usage.
    </li>
    <li>
      <strong>Warcrimes:</strong> Warcrime values, teamkills, friendly roadkills, and additional related metrics.
    </li>
  </ul>
    <li>
      <h4>tableName Config Option</h4>
      <h6>Description</h6>
      <p>TableName specified in DBLogStats Plugin</p>
      <h6>Default</h6>
      <pre><code>""</code></pre>
    </li>
</details>

<br>

## **Plugins**

The following is a list of plugins built into ReforgerJS, you can click their title for more information:

<details>
          <summary>DBLog</summary>
          <h2>DBLog</h2>
          <p>This plugin will log various player statistics to a database.
          <h3>Stats</h3>
          <ul><li>Player Name</li>
          <li>IP address</li>
          <li>Reforger UUID</li>
          <li>Battle-eye GUID</li></ul></p>
          <h3>Options</h3>
          <ul><li><h4>Interval</h4>
           <h6>Description</h6>
           <p>Interval in minutes. How often the the plugin should check for updates/new players</p>
           <h6>Default</h6>
           <pre><code>1</code></pre></li></ul>
</details>

<details>
          <summary>DBLogStats</summary>
          <h2>DBLogStats</h2>
          <p>This plugin will log various player statistics to a database. The stats recorded are the vanilla playerData stats (Kills, Deaths, Rounds fired ect)</p>
          <h3>Options</h3>
          <ul><li><h4>Interval</h4>
           <h6>Description</h6>
           <p>Interval in minutes. How often the the plugin should check for updates/new players</p>
           <h6>Default</h6>
           <pre><code>1</code></pre></li>
          <li><h4>Path</h4>
           <h6>Description</h6>
           <p>Dir path to your servers playerData json files</p>
           <h6>Default</h6>
           <pre><code>C:/path/to/saves/profile/.save/playersave</code></pre></li>
          <li><h4>TableName</h4>
           <h6>Description</h6>
           <p>Name for the stats table to be created. (This will matter if you plan to run more than 1 server)</p>
           <h6>Default</h6>
           <pre><code>""</code></pre></li></ul>
</details>

<details>
          <summary>LogVoteKickVictim</summary>
          <h2>LogVoteKickVictim</h2>
          <p>Discord logging for the victim of a vote kick (The player that gets kicked)</p>
          <h3>Options</h3>
          <ul><li><h4>Channel</h4>
           <h6>Description</h6>
           <p>The ID of a discord channel or Thread</p>
           <h6>Default</h6>
           <pre><code>""</code></pre></li></ul>
</details>

<details>
          <summary>LogVoteKickStart</summary>
          <h2>LogVoteKickStart</h2>
          <p>Discord logging for the plaeyr for initiates a vote kick</p>
          <h3>Options</h3>
          <ul><li><h4>Channel</h4>
           <h6>Description</h6>
           <p>The ID of a discord channel or Thread</p>
           <h6>Default</h6>
           <pre><code>""</code></pre></li></ul>
</details>

<details>
          <summary>AltChecker</summary>
          <h2>AltChecker</h2>
          <p>Alt checking for connecting players</p>
          <h3>Options</h3>
          <ul><li><h4>Channel</h4>
           <h6>Description</h6>
           <p>The ID of a discord channel or Thread</p>
           <h6>Default</h6>
           <pre><code>""</code></pre></li>
          <li><h4>logAlts</h4>
           <h6>Description</h6>
           <p>Whether to log these Alts to a channel/Thread</p>
           <h6>Default</h6>
           <pre><code>true</code></pre></li>
          <li><h4>logOnlyOnline</h4>
           <h6>Description</h6>
           <p>Only log Alts if they are currently online. If a player joins and detects an Alt account, It will only log if said Alt is online </p>
           <h6>Default</h6>
           <pre><code>false</code></pre></li></ul>
</details>

<details>
          <summary>SeedTrackerBasic</summary>
          <h2>SeedTrackerBasic</h2>
          <p>Basic Database logging for seeding</p>
          <h3>Options</h3>
          <ul><li><h4>Interval</h4>
           <h6>Description</h6>
           <p>Interval in minutes. How often the the plugin should check for updates/new players</p>
           <h6>Default</h6>
           <pre><code>5</code></pre></li>
          <li><h4>seedStart</h4>
           <h6>Description</h6>
           <p>Track seeding time for players while playercount is equal to or above this number</p>
           <h6>Default</h6>
           <pre><code>4</code></pre></li>
          <li><h4>seedEnd</h4>
           <h6>Description</h6>
           <p>Track seeding time for players while playercount is equal to or below this number</p>
           <h6>Default</h6>
           <pre><code>40</code></pre></li></ul>
</details>

<details>
  <summary>ServerStatus</summary>
  <h2>ServerStatus</h2>
  <p>
    This plugin displays the server status on Discord by periodically updating an embed with live data such as player count, FPS, and memory usage.
    It can also update the Discord bot's status with the latest server information.
  </p>
  <h3>Options</h3>
  <ul>
    <li>
      <h4>enabled</h4>
      <h6>Description</h6>
      <p>Determines whether the ServerStatus plugin is active.</p>
      <h6>Default</h6>
      <pre><code>false</code></pre>
    </li>
    <li>
      <h4>channel</h4>
      <h6>Description</h6>
      <p>ID of the Discord channel where the status message will be posted.</p>
      <h6>Default</h6>
      <pre><code>""</code></pre>
    </li>
    <li>
      <h4>messageID</h4>
      <h6>Description</h6>
      <p>ID of the Discord message to update with server status information. The bot will edit this value automatically. (If you want to reset the embed, remove this value)</p>
      <h6>Default</h6>
      <pre><code>""</code></pre>
    </li>
    <li>
      <h4>interval</h4>
      <h6>Description</h6>
      <p>Interval in minutes. How often the plugin should update the server status.</p>
      <h6>Default</h6>
      <pre><code>1</code></pre>
    </li>
    <li>
      <h4>showFPS</h4>
      <h6>Description</h6>
      <p>If set to true, displays the current FPS in the status embed.</p>
      <h6>Default</h6>
      <pre><code>true</code></pre>
    </li>
    <li>
      <h4>showMemoryUsage</h4>
      <h6>Description</h6>
      <p>If set to true, displays the server's memory usage in the status embed.</p>
      <h6>Default</h6>
      <pre><code>false</code></pre>
    </li>
    <li>
      <h4>discordBotStatus</h4>
      <h6>Description</h6>
      <p>If enabled, updates the Discord bot's status with live server data.</p>
      <h6>Default</h6>
      <pre><code>true</code></pre>
    </li>
    <li>
      <h4>embed</h4>
      <h6>Description</h6>
      <p>Settings for the Discord embed used to display the server status.</p>
      <ul>
        <li>
          <h5>title</h5>
          <h6>Default</h6>
          <pre><code>"Arma Reforger Server Status"</code></pre>
        </li>
        <li>
          <h5>color</h5>
          <h6>Default</h6>
          <pre><code>"#00FF00"</code></pre>
        </li>
        <li>
          <h5>footer</h5>
          <h6>Default</h6>
          <pre><code>"ReforgerJS"</code></pre>
        </li>
        <li>
          <h5>thumbnail</h5>
          <h6>Description</h6>
          <p>Determines whether a thumbnail should be displayed in the embed.</p>
          <h6>Default</h6>
          <pre><code>false</code></pre>
        </li>
        <li>
          <h5>thumbnailURL</h5>
          <h6>Description</h6>
          <p>URL for the thumbnail image to be used in the embed.</p>
          <h6>Default</h6>
          <pre><code>"https://IMAGE_URL_HERE.png"</code></pre>
        </li>
      </ul>
    </li>
  </ul>
</details>


<br>

### Inspired by SquadJS - Team Silver Sphere

https://github.com/Team-Silver-Sphere/SquadJS
