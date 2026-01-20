#!/bin/bash
set -e

MODPARAMS_FILE="/mod_manager_data/modParameters.json"

# Ensure base target directories exist and are writable by linuxgsm.
mkdir -p /data/serverfiles/cfg
mkdir -p /data/config-lgsm/arma3server

chown -R linuxgsm:linuxgsm /data/serverfiles /data/config-lgsm
chmod -R u+rwX,g+rwX,o-rwx /data/serverfiles /data/config-lgsm

# If MOD_LIST is not provided, use an empty string as MOD_LIST_VALUE.
# If MOD_LIST is provided, load the value from modParameters.json.
if [ -z "$MOD_LIST" ]; then
  export MOD_LIST_VALUE=""
  echo "MOD_LIST not set; using empty MOD_LIST_VALUE."
else
  if [ ! -f "$MODPARAMS_FILE" ]; then
    echo "Error: modParameters.json not found in /mod_manager_data. Exiting."
    exit 1
  fi

  MOD_VALUE="$(python3 -c "import json; print(json.load(open('$MODPARAMS_FILE')).get('$MOD_LIST', ''))")"
  if [ -z "$MOD_VALUE" ]; then
    echo "Error: No entry for key '$MOD_LIST' found in modParameters.json. Exiting."
    exit 1
  fi

  export MOD_LIST_VALUE="$MOD_VALUE"
  echo "Exported MOD_LIST_VALUE: $MOD_LIST_VALUE"
fi

# Copy custom configuration files from custom_configs/arma3server to /data/serverfiles/cfg
if [ -d "/custom_configs/arma3server" ]; then
  echo "Copying additional custom configuration files from /custom_configs/arma3server to /data/serverfiles/cfg..."
  gosu linuxgsm cp -rf /custom_configs/arma3server/* /data/serverfiles/cfg/
  
  # Replace password placeholders with actual environment variable values
  echo "Replacing password placeholders in server config..."
  sed -i "s/\${SERVER_PASS}/${SERVER_PASS}/g" /data/serverfiles/cfg/arma3server.server.cfg
  sed -i "s/\${SERVER_ADMIN_PASS}/${SERVER_ADMIN_PASS}/g" /data/serverfiles/cfg/arma3server.server.cfg
else
  echo "No additional custom configuration directory /custom_configs/arma3server found; skipping copy."
fi

# Copy custom configuration files from custom_configs/lgsm to /data/config-lgsm/arma3server
if [ -d "/custom_configs/lgsm" ]; then
  echo "Copying additional custom configuration files from /custom_configs/lgsm to /data/config-lgsm/arma3server..."
  gosu linuxgsm cp -rf /custom_configs/lgsm/* /data/config-lgsm/arma3server/
else
  echo "No additional custom configuration directory /custom_configs/lgsm found; skipping copy."
fi

exec /bin/bash /app/entrypoint.sh
