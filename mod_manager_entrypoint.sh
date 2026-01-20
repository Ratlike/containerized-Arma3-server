#!/bin/bash
# mod_manager_entrypoint.sh

echo "Fixing permissions on mod folders"
chown -R linuxgsm:linuxgsm /home/linuxgsm/Steam
chmod -R 775 /home/linuxgsm/Steam

echo "Mount mod folders with ciopfs (forcing lowercase)"
runuser -u linuxgsm -- ciopfs -o allow_other /app/steam_folder /home/linuxgsm/Steam

echo "Fixing permissions on /app/data..."
chown -R linuxgsm:linuxgsm /app/data

echo "Granting linuxgsm write access to /app/steam_folder via ACL"
setfacl -R -m u:1001:rwx /app/steam_folder || true
setfacl -R -d -m u:1001:rwx /app/steam_folder || true

echo "Granting linuxgsm write access to /app/keys via ACL"
setfacl -R -m u:1001:rwx /app/keys || true
setfacl -R -d -m u:1001:rwx /app/keys || true

echo "Switching to user linuxgsm and starting the app..."
exec gosu linuxgsm "$@"
