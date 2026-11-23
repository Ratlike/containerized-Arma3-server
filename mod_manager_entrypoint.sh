#!/bin/bash
# mod_manager_entrypoint.sh

# Grants the linuxgsm user access to a folder through an ACL.
# Prints a warning when the ACL cannot be set.
grant_access_to_linuxgsm() {
  local permissions="$1"
  local folder="$2"
  local failed=0

  setfacl -R -m "u:1000:${permissions}" "$folder" || failed=1
  setfacl -R -d -m "u:1000:${permissions}" "$folder" || failed=1

  if [ "$failed" -eq 1 ]; then
    echo "Warning: could not set the ACL on ${folder}. Access for linuxgsm then depends on the owner of the folder."
  fi
}

echo "Fixing permissions on mod folders"
chown -R linuxgsm:linuxgsm /home/linuxgsm/Steam
chmod -R 775 /home/linuxgsm/Steam

# Docker creates missing host folders as root, so give the top-level folders to linuxgsm.
chown linuxgsm:linuxgsm /app/steam_folder /app/keys

echo "Mount mod folders with ciopfs (forcing lowercase)"
runuser -u linuxgsm -- ciopfs -o allow_other /app/steam_folder /home/linuxgsm/Steam

echo "Fixing permissions on /app/data..."
chown -R linuxgsm:linuxgsm /app/data

echo "Granting linuxgsm write access to /app/steam_folder via ACL"
grant_access_to_linuxgsm rwx /app/steam_folder

echo "Granting linuxgsm write access to /app/keys via ACL"
grant_access_to_linuxgsm rwx /app/keys

echo "Granting linuxgsm read access to /app/dropbox via ACL"
grant_access_to_linuxgsm rx /app/dropbox

echo "Switching to user linuxgsm and starting the app..."
exec gosu linuxgsm "$@"
