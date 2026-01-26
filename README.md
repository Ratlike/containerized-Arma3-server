## Disclaimer

This project is a work in progress and is provided as-is.

The automatic mod installer uses SteamCMD and may trigger Steam rate limiting when Steam Guard is enabled. This can result in temporary connectivity restrictions such as an IP-based flood protection or short-term bans. Using the mod installer with Steam Guard enabled is not advised.

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

- Docker and Docker Compose installed
- Steam account with Arma 3 ownership
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
TS_SERVER_PASS=your_teamspeak_password
MOD_LIST=modlist_name
```

### 3. Set Up Dropbox

If using the Dropbox sync feature:

1. Export HTML modlist files from Arma 3 launcher
2. Place your HTML modlist files in your Dropbox under `Dropbox/mpmissions/`
3. Place also any missions you wish to run on the server into this same folder, it will be mounted as the mpmissions folder on the server
3. First run will require linking your Dropbox account (follow container logs for instructions)

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

The server supports multiple instances (main server + headless clients). Configuration files follow this naming pattern:
- Main server: `arma3server.cfg`, `arma3server.server.cfg`, `arma3server.network.cfg`
- Instance 2: `arma3server-2.cfg`, `arma3server-2.server.cfg`, `arma3server-2.network.cfg`
- Instance 3: `arma3server-3.cfg`, `arma3server-3.server.cfg`, `arma3server-3.network.cfg`

### Mod Management

The mod manager uses HTML modlist files from Dropbox to determine which mods to install:

1. Create an HTML file with a table containing Steam Workshop links
2. Place it in `Dropbox/mpmissions/` (e.g., `coremodsv2.html`)
3. Set `MOD_LIST=coremodsv2` in your `.env` file
4. The mod manager will automatically:
   - Parse the HTML file
   - Download/update mods via SteamCMD
   - Generate mod parameters for the server
   - Copy mod keys to the server
   - Remove obsolete mods

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
| `SERVER_PASS` | Server password for players | No | - |
| `SERVER_ADMIN_PASS` | Admin password | No | - |
| `SERVER_HOSTNAME` | Server hostname/name displayed in server browser | No | Noitavasara |
| `TS_SERVER_PASS` | TeamSpeak server query password | No | - |

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
