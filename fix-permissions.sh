#!/bin/bash
set -e

# Directories to fix
CONFIG_DIR="${HOME}/Containers/Arma3/data/config-lgsm/arma3server"
CFG_DIR="${HOME}/Containers/Arma3/data/serverfiles/cfg"

echo "Fixing permissions for:"
echo "  $CONFIG_DIR"
echo "  $CFG_DIR"

# Check if directories exist
if [ ! -d "$CONFIG_DIR" ]; then
    echo "Error: Directory $CONFIG_DIR does not exist."
    exit 1
fi

if [ ! -d "$CFG_DIR" ]; then
    echo "Error: Directory $CFG_DIR does not exist."
    exit 1
fi

# Change ownership to your current user (UID and GID)
sudo chown -R "$(id -u):$(id -g)" "$CONFIG_DIR" "$CFG_DIR"

# Set directory permissions to 775 (rwxrwxr-x)
echo "Setting directory permissions to 775..."
find "$CONFIG_DIR" "$CFG_DIR" -type d -exec chmod 775 {} \;

# Set file permissions to 664 (rw-rw-r--)
echo "Setting file permissions to 664..."
find "$CONFIG_DIR" "$CFG_DIR" -type f -exec chmod 664 {} \;

echo "Permissions updated successfully."

