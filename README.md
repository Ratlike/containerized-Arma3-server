## Disclaimer

This project is a work in progress and is provided as-is.

The server installation and the mod installer both log in to Steam through SteamCMD with a user name and a password. Neither can enter a Steam Guard code. The Steam account must have Steam Guard disabled. Repeated login attempts with Steam Guard enabled can trigger Steam rate limiting, such as IP-based flood protection or short-term bans.

Recommended approach: use a dedicated Steam account that owns Arma 3 and is used only for server and mod downloads.

# Containerized Arma 3 Server

A fully containerized Arma 3 dedicated server solution with automatic mod management, Dropbox integration, and optional TeamSpeak server.

## Features

- **Dockerized Arma 3 Server** - Based on [LinuxGSM](https://linuxgsm.com/) for reliable server management
- **Automatic Mod Management** - Downloads and updates Steam Workshop mods automatically
- **Creator DLC Support** - Automatic detection and configuration for all Arma 3 Creator DLCs
- **Dropbox Integration** - Sync mission files via Dropbox
- **Multiple Server Instances** - Support for headless clients
- **TeamSpeak Server** - Optional integrated TeamSpeak 3 server
- **Customizable Configurations** - Easy server configuration via environment variables and config files

## Architecture

This setup uses Docker Compose to orchestrate multiple services:

1. **Dropbox Container** - Syncs mission files from your Dropbox account
2. **Mod Manager Container** - Downloads and updates Steam Workshop mods based on HTML modlists
3. **Arma 3 Server Container** - Runs the game server with LinuxGSM
4. **TeamSpeak Container** (Optional) - Voice communication server

## Prerequisites

- A Linux host. The Arma 3 server uses `network_mode: host`, which Docker Desktop on Windows and macOS does not provide in the same way.
- Docker and Docker Compose v2 installed
- `/dev/fuse` available on the host. The mod manager runs as a privileged container and mounts a FUSE filesystem.
- A host filesystem with ACL support for the repository folder (ext4, XFS and Btrfs have it by default)
- Steam account with Arma 3 ownership and Steam Guard disabled
  - Ownership is required in order to download mods over steamcmd
- Steam API key (get one from [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey))
- Dropbox account (if using Dropbox sync feature)

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd containerized-Arma3-server
```

### 2. Configure Environment Variables

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
STEAM_USER=your_steam_username
STEAM_PASS=your_steam_password
STEAM_API_KEY=your_steam_api_key
HEADLESS_COUNT=2
SERVER_PASS=your_server_password
SERVER_ADMIN_PASS=your_admin_password
SERVER_HOSTNAME=My Arma 3 server
SERVER_IP=127.0.0.1
TS_SERVER_PASS=your_teamspeak_password
MOD_LIST=modlist_name
```

### 3. Set Up Dropbox

If using the Dropbox sync feature:

1. Export HTML modlist files from Arma 3 launcher
2. Place your HTML modlist files in your Dropbox under `Dropbox/mpmissions/`
3. Place also any missions you wish to run on the server into this same folder, it will be mounted as the mpmissions folder on the server
4. First run will require linking your Dropbox account (follow container logs for instructions)

The other containers wait about 10 minutes for the folder `Dropbox/mpmissions` to appear. If linking and the first sync take longer, the launch command fails. Run the launch command again after the sync has finished.

The mod manager reads the modlist files that are present when it starts. Wait until Dropbox has synced all of them before you start the mod manager.

### 4. Launch the Server

**Full setup with all services:**
```bash
docker compose -f docker-compose-full.yml up -d
```

**Arma 3 server only (without mod manager if you know mods are up to date):**
```bash
docker compose -f docker-compose-arma3.yml up -d
```

**Mod manager only (for updating mods):**
```bash
docker compose -f docker-compose-mod_manager.yml up
```

## Configuration

### Server Configuration Files

Custom configuration files are organized in the `custom_configs/` directory:

- `custom_configs/arma3server/` - Server and network configuration files (`.cfg`, `.network.cfg`)
- `custom_configs/lgsm/` - LinuxGSM configuration files

The values in `.env` are written into the configuration files when the container starts. Do not edit the placeholders such as `${SERVER_HOSTNAME}` in the tracked files.

The server supports multiple instances (main server + headless clients). The repository contains configuration files for 2 headless clients. To use a higher `HEADLESS_COUNT`, add the configuration files for each additional instance first. The container stops with an error when an LGSM configuration file is missing. Configuration files follow this naming pattern:
- Main server: `arma3server.cfg`, `arma3server.server.cfg`, `arma3server.network.cfg`
- Instance 2: `arma3server-2.cfg`, `arma3server-2.server.cfg`, `arma3server-2.network.cfg`
- Instance 3: `arma3server-3.cfg`, `arma3server-3.server.cfg`, `arma3server-3.network.cfg`

### Mod Management

The mod manager uses HTML modlist files from Dropbox to determine which mods to install:

1. Create an HTML file with a table containing Steam Workshop links
2. Place it in `Dropbox/mpmissions/` (e.g., `coremodsv2.html`)
3. Set `MOD_LIST=coremodsv2` in your `.env` file. The name is the filename without `.html`. Upper and lower case do not matter.
4. The mod manager will automatically:
   - Parse the HTML file
   - Download/update mods via SteamCMD
   - Generate mod parameters for the server
   - Copy mod keys to the server

The mod manager keeps a mod on disk after the mod is removed from every modlist. To remove such a mod, delete its entry from `mod_manager/data/masterlist.json` and start the mod manager again.

The mod manager creates two files in `/app/data`:
- `masterlist.json` - Complete list of all mods from all HTML files
- `modParameters.json` - Maps modlist names to server mod parameters

#### Creator DLC Support

The system automatically detects and configures Arma 3 Creator DLCs based on keywords in your modlist filename. When detected, the appropriate DLC prefix is automatically prepended to the mod parameters.

**Supported Creator DLCs:**

| Creator DLC | Keywords | DLC Prefix |
|-------------|----------|------------|
| S.O.G. Prairie Fire | vietnam, prairie, sog | `vn` |
| Global Mobilization | gm, mobilization, germany, coldwar | `gm` |
| CSLA Iron Curtain | csla, ironcurtain, iron | `csla` |
| Western Sahara | ws, sahara, western | `ws` |
| Spearhead 1944 | spearhead, spe, 1944 | `spe` |
| Reaction Forces | rf, reaction | `rf` |
| Expeditionary Forces | ef, expeditionary | `ef` |

**Example:**
- Filename: `vietnam-mission.html` → Detects "vietnam" → Generates: `vn\;mods/463939057\;mods/450814997\;...`
- Filename: `spearhead-ops.html` → Detects "spearhead" → Generates: `spe\;mods/123456\;...`
- Filename: `standard-mods.html` → No DLC detected → Generates: `mods/123456\;mods/789012\;...`

Simply include one of the keywords in your modlist filename, and the system will handle the DLC configuration automatically.

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `STEAM_USER` | Steam account username | Yes | - |
| `STEAM_PASS` | Steam account password | Yes | - |
| `STEAM_API_KEY` | Steam Web API key | Yes | - |
| `MOD_LIST` | Name of modlist to load (from HTML filename) | No | - |
| `HEADLESS_COUNT` | Number of headless client instances | No | 2 |
| `SERVER_PASS` | Server password for players. Leave empty for a public server. Must not contain spaces. | No | - |
| `SERVER_ADMIN_PASS` | Admin password | Yes | - |
| `SERVER_HOSTNAME` | Server hostname/name displayed in server browser | Yes | - |
| `SERVER_IP` | Address the headless clients connect to, and the address the server accepts headless clients from | Yes | - |
| `TS_SERVER_PASS` | TeamSpeak server query password | No | - |

Docker Compose expands `$` in `.env` values. Put a value that contains `$` in single quotes.

## Updating the Arma 3 Server

The server checks for an Arma 3 update only when the container starts. It does not update or restart while it runs. To update, restart the container:

```bash
docker compose -f docker-compose-full.yml restart arma3server
```

## Volume Mounts

The following volumes are used by the containers:

- `./dropbox` - Dropbox sync data
- `./data` - Server files, configs, and player data
- `./mod_manager/data` - Mod manager data (masterlist.json, modParameters.json)
- `./custom_configs` - Custom configuration files (read-only)

## Ports

### Arma 3 Server
The server uses `network_mode: host`, which means it has direct access to the host network. Default Arma 3 ports:
- 2302-2306 UDP (game ports for multiple instances)

### TeamSpeak (Optional)
- 9987/udp - Voice communication
- 10011 - ServerQuery
- 30033 - File transfer

## Docker Compose Files

- **docker-compose-full.yml** - Complete setup with Dropbox, mod manager, Arma 3 server, and TeamSpeak
- **docker-compose-arma3.yml** - Arma 3 server with Dropbox and TeamSpeak (no mod manager)
- **docker-compose-mod_manager.yml** - Mod manager service only (for testing/maintenance)

## Troubleshooting

### Viewing Logs

```bash
# All services
docker compose -f docker-compose-full.yml logs -f

# Specific service
docker compose -f docker-compose-full.yml logs -f arma3server
docker compose -f docker-compose-full.yml logs -f mod-manager
```

## Manual Commands

### Access Server Console

```bash
docker exec -it arma3server /bin/bash
```

### Update Mods Manually

```bash
docker compose -f docker-compose-mod_manager.yml up
```

### Rebuild Containers

```bash
docker compose -f docker-compose-full.yml build
docker compose -f docker-compose-full.yml up -d
```

## File Structure

```
.
├── docker-compose-*.yml          # Docker Compose configurations
├── Dockerfile-arma3              # Arma 3 server image
├── Dockerfile-mod_manager        # Mod manager image
├── custom-entrypoint.sh          # Arma 3 server entrypoint
├── mod_manager_entrypoint.sh     # Mod manager entrypoint
├── package.json                  # Node.js dependencies
├── custom_configs/               # Server configuration files
│   ├── arma3server/             # Server .cfg files
│   └── lgsm/                    # LinuxGSM configs
└── mod_manager/
    └── scripts/
        ├── modUpdater.js        # Main mod update script
        ├── parseModlistsAndUpdate.js  # Parse HTML modlists
        └── installOrUpdateMod.js      # Install individual mods
```

## License

MIT License - See [LICENSE](LICENSE) file for details

## Credits

- Built on [LinuxGSM](https://linuxgsm.com/) Docker image
- Uses [Dropbox Docker container](https://github.com/otherguy/docker-dropbox)
- Mod management powered by SteamCMD and Steam Web API
