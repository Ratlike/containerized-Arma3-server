#!/bin/bash
set -e

MODPARAMS_FILE="/mod_manager_data/modParameters.json"

# Escapes a value for use as the replacement part of a sed "s" command.
escape_for_sed_replacement() {
  printf '%s' "$1" | sed -e 's|[\\/&]|\\&|g'
}

# Escapes a value for use inside a double-quoted string in a bash file.
escape_for_bash_double_quotes() {
  printf '%s' "$1" | sed -e 's|[\\"$`]|\\&|g'
}

# Escapes a value for use inside a double-quoted string in an Arma 3 config file.
escape_for_arma_string() {
  printf '%s' "$1" | sed -e 's|"|""|g'
}

# Replaces every occurrence of ${PLACEHOLDER_NAME} with a literal value in the given files.
replace_placeholder() {
  local placeholder_name="$1"
  local value="$2"
  shift 2
  sed -i "s/\${${placeholder_name}}/$(escape_for_sed_replacement "$value")/g" "$@"
}

# Ensure base target directories exist and are writable by linuxgsm.
mkdir -p /data/serverfiles/cfg
mkdir -p /data/config-lgsm/arma3server

chown -R linuxgsm:linuxgsm /data/serverfiles /data/config-lgsm
chmod -R u+rwX,g+rwX,o-rwx /data/serverfiles /data/config-lgsm

# The mod manager stores modlist names in lowercase.
MOD_LIST="${MOD_LIST,,}"
export MOD_LIST

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

  # Validate required environment variables
  echo "Validating required environment variables..."
  if [ -z "$SERVER_HOSTNAME" ]; then
    echo "Error: SERVER_HOSTNAME environment variable is not set!"
    exit 1
  fi
  if [ -z "$SERVER_ADMIN_PASS" ]; then
    echo "Error: SERVER_ADMIN_PASS environment variable is not set!"
    exit 1
  fi
  if [ -z "$SERVER_IP" ]; then
    echo "Error: SERVER_IP environment variable is not set!"
    exit 1
  fi
  # SERVER_PASS is optional (empty string means no password - public server)

  # Replace placeholders with actual environment variable values
  echo "Replacing placeholders in server config..."
  replace_placeholder SERVER_HOSTNAME "$(escape_for_arma_string "$SERVER_HOSTNAME")" /data/serverfiles/cfg/arma3server.server.cfg
  replace_placeholder SERVER_IP "$(escape_for_arma_string "$SERVER_IP")" /data/serverfiles/cfg/arma3server.server.cfg
  replace_placeholder SERVER_PASS "$(escape_for_arma_string "$SERVER_PASS")" /data/serverfiles/cfg/arma3server.server.cfg
  replace_placeholder SERVER_ADMIN_PASS "$(escape_for_arma_string "$SERVER_ADMIN_PASS")" /data/serverfiles/cfg/arma3server.server.cfg
else
  echo "No additional custom configuration directory /custom_configs/arma3server found; skipping copy."
fi

# Copy custom configuration files from custom_configs/lgsm to /data/config-lgsm/arma3server
if [ -d "/custom_configs/lgsm" ]; then
  echo "Copying additional custom configuration files from /custom_configs/lgsm to /data/config-lgsm/arma3server..."
  gosu linuxgsm cp -rf /custom_configs/lgsm/* /data/config-lgsm/arma3server/

  # Validate Steam credentials
  if [ -z "$STEAM_USER" ]; then
    echo "Error: STEAM_USER environment variable is not set!"
    exit 1
  fi
  if [ -z "$STEAM_PASS" ]; then
    echo "Error: STEAM_PASS environment variable is not set!"
    exit 1
  fi

  # Every additional instance needs its own LGSM config file
  for (( instance_number=2; instance_number<=${OTHER_INSTANCES:-0}+1; instance_number++ )); do
    if [ ! -f "/custom_configs/lgsm/arma3server-${instance_number}.cfg" ]; then
      echo "Error: HEADLESS_COUNT is ${OTHER_INSTANCES} but custom_configs/lgsm/arma3server-${instance_number}.cfg does not exist!"
      exit 1
    fi
  done

  # Replace environment variable placeholders in LGSM config files
  echo "Replacing environment variable placeholders in LGSM config..."
  replace_placeholder STEAM_USER "$(escape_for_bash_double_quotes "$STEAM_USER")" /data/config-lgsm/arma3server/*.cfg
  replace_placeholder STEAM_PASS "$(escape_for_bash_double_quotes "$STEAM_PASS")" /data/config-lgsm/arma3server/*.cfg
else
  echo "No additional custom configuration directory /custom_configs/lgsm found; skipping copy."
fi

exec /bin/bash /app/entrypoint.sh
