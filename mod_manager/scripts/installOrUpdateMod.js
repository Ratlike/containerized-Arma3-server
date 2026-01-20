#!/usr/bin/env node

/**
 * installMod.js
 *
 * Installs or updates a single mod specified by modId.
 * Updates masterlist.json's time_updated and upToDate fields.
 *
 * If run directly, it will prompt for mod ID and fall back to setting time_updated = Date.now().
 * If required by another script, call installOrUpdateMod(modId, newTimeUpdated).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const prompt = require('prompt-sync')();

const STEAM_USER = process.env.STEAM_USER || '';
const STEAM_PASS = process.env.STEAM_PASS || '';
const masterListPath = path.join(__dirname, '..', 'data', 'masterlist.json');
const steamCmdPath = '/steamcmd/steamcmd.sh';

function readMasterList() {
    if (!fs.existsSync(masterListPath)) return [];
    return JSON.parse(fs.readFileSync(masterListPath, 'utf-8'));
}

function writeMasterList(list) {
    fs.writeFileSync(masterListPath, JSON.stringify(list, null, 2), 'utf-8');
}

function recordFailure(mod, error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);

    mod.blacklisted = true;
    mod.failure = {
        failedAt: now,
        error: message
    };
}

/**
 * Installs/updates the given modId. 
 * If newTimeUpdated is provided, we set modEntry.time_updated = newTimeUpdated.
 * Otherwise, fallback to Date.now().
 * Note: This function does not update the stored apiResponse.
 */
async function installOrUpdateMod(modId, newTimeUpdated = null) {
    let masterList = readMasterList();
    let modEntry = masterList.find((m) => m.id === modId);

    if (!modEntry) {
        modEntry = {
            id: modId,
            name: 'Unknown Mod (Added by installOrUpdateMod)',
            url: `https://steamcommunity.com/workshop/filedetails/?id=${modId}`,
            time_updated: 0,
            upToDate: false
        };
        masterList.push(modEntry);
    }

    console.log(`\nInstalling/updating mod [${modId}] (${modEntry.name})...`);

    try {
        const cmd = `
      ${steamCmdPath} +login "${STEAM_USER}" "${STEAM_PASS}" +workshop_download_item 107410 ${modId} validate +quit
    `;
        console.log(`Running: ${cmd}`);
        const output = execSync(cmd, { encoding: 'utf8' });

        // Check for error-indicative output (adjust conditions as needed)
        if (output.includes("ERROR!")) {
            throw new Error(`steamcmd reported an error: ${output}`);
        }

        // If success, update time_updated and mark as upToDate
        modEntry.time_updated = newTimeUpdated || Math.floor(Date.now() / 1000);
        modEntry.upToDate = true;
        modEntry.blacklisted = false;
        delete modEntry.failure;

    } catch (err) {
        console.error(`Error installing mod [${modId}]:`, err);
        modEntry.upToDate = false;
        recordFailure(modEntry, err);
    }

    writeMasterList(masterList);
    console.log(`Done updating mod [${modId}]. Masterlist saved.`);
}

// If run directly from CLI, prompt user
if (require.main === module) {
    const modId = prompt('Enter Steam mod ID: ');
    if (!modId) {
        console.log('No mod ID provided. Exiting.');
        process.exit(0);
    }
    installOrUpdateMod(modId).then(() => {
        console.log('All done!');
        process.exit(0);
    });
} else {
    // Export for usage in modUpdater.js
    module.exports = { installOrUpdateMod };
}
