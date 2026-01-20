#!/usr/bin/env node

/**
 * modUpdater.js
 *
 * 1. Calls parseModlistsAndUpdate() to refresh masterlist.json, modParameters.json, and update each mod's API info.
 * 2. Deletes mods on disk that are no longer present in masterlist.json.
 * 3. Reads the masterlist and, for each mod, compares the local time_updated with the remote time (from apiResponse).
 * 4. Installs/updates any mod that is out-of-date or missing.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { parseModlistsAndUpdate } = require('./parseModlistsAndUpdate');
const { installOrUpdateMod } = require('./installOrUpdateMod');

const keysFolder = '/app/keys';
const modsFolder = '/app/steam_folder/steamapps/workshop/content/107410';

function cleanupStaleMods(modsRoot, desiredIds) {
    if (!fs.existsSync(modsRoot)) {
        console.log(`Mods folder not found, skipping cleanup: ${modsRoot}`);
        return;
    }

    const entries = fs.readdirSync(modsRoot, { withFileTypes: true });
    const stale = [];

    for (const ent of entries) {
        if (!ent.isDirectory()) continue;

        const name = ent.name;

        // Only consider numeric Workshop ID folders.
        if (!/^\d+$/.test(name)) continue;

        if (!desiredIds.has(name)) {
            stale.push(name);
        }
    }

    if (stale.length === 0) {
        console.log('No stale mods to delete.');
        return;
    }

    console.log(`Deleting ${stale.length} stale mod folder(s) not present in masterlist.json...`);
    for (const id of stale) {
        const fullPath = path.join(modsRoot, id);

        // Safety: delete only within modsRoot and only directories already enumerated.
        try {
            fs.rmSync(fullPath, { recursive: true, force: true });
            console.log(`Deleted ${fullPath}`);
        } catch (err) {
            console.error(`Failed to delete ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}

async function main() {
    console.log('\n=== ARMA 3 Mod Updater ===\n');

    // 1) Parse modlists to update masterlist.json, modParameters.json, and fetch latest API info
    const updatedList = await parseModlistsAndUpdate();

    if (!updatedList.length) {
        console.log('No mods found after parsing. Exiting.');
        return;
    }

    // 2) Cleanup mods that exist on disk but are no longer in masterlist.json
    const desiredIds = new Set(updatedList.map(m => String(m.id)));
    cleanupStaleMods(modsFolder, desiredIds);

    // 3) Identify outdated mods by comparing local time_updated with the API's time_updated
    const outdatedMods = [];
    for (const mod of updatedList) {
        if (mod.blacklisted === true) {
            console.log(`Skipping blacklisted mod ${mod.name}`);
            continue;
        }

        const modDiskPath = path.join(modsFolder, String(mod.id));
        const missingOnDisk = !fs.existsSync(modDiskPath);

        const remoteTime = mod.apiResponse && mod.apiResponse.time_updated ? mod.apiResponse.time_updated : null;

        if (missingOnDisk) {
            outdatedMods.push({ ...mod, remoteTime });
            continue;
        }

        if (!remoteTime) {
            outdatedMods.push({ ...mod, remoteTime: null });
            continue;
        }

        if (remoteTime > mod.time_updated) {
            outdatedMods.push({ ...mod, remoteTime });
            continue;
        }
    }

    if (!outdatedMods.length) {
        console.log('All mods are up-to-date!');
        console.log('\n=== modUpdater complete ===\n');
    } else {
        console.log(`Found ${outdatedMods.length} outdated mod(s). Updating...\n`);

        // 4) For each outdated mod, call installOrUpdateMod with the remote time_updated
        for (const mod of outdatedMods) {
            await installOrUpdateMod(mod.id, mod.remoteTime);
        }

        console.log('\n=== modUpdater complete ===\n');
    }

    if (keysFolder) {
        console.log(`\nCopying key files to ${keysFolder}`);

        if (!fs.existsSync(modsFolder)) {
            console.log(`Workshop folder not found, skipping key copy: ${modsFolder}`);
            return;
        }

        const modFolders = fs.readdirSync(modsFolder);
        modFolders.forEach(modFolder => {
            const keysDir = path.join(modsFolder, modFolder, 'keys');
            if (fs.existsSync(keysDir) && fs.statSync(keysDir).isDirectory()) {
                const keyFiles = fs.readdirSync(keysDir);
                keyFiles.forEach(file => {
                    const srcFile = path.join(keysDir, file);
                    const destFile = path.join(keysFolder, file);
                    try {
                        // Use cp command instead of fs.copyFileSync to handle FUSE mounts
                        execSync(`cp -f "${srcFile}" "${destFile}"`, { encoding: 'utf8' });
                        // console.log(`Copied ${srcFile} -> ${destFile}`);
                    } catch (err) {
                        console.error(`Error copying ${srcFile} to ${destFile}: ${err}`);
                    }
                });
            }
        });

        console.log("Finished copying keys.")

    } else {
        console.warn('No KEYS_FOLDER specified in environment. Skipping key files copy.');
    }
}

if (require.main === module) {
    main();
} else {
    module.exports = { main };
}
