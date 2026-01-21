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
const modsFolder = '/app/steam_folder/steamapps/workshop/content/107410';

/**
 * Recursively calculates the total size of a directory in bytes
 */
function getDirectorySize(dirPath) {
    let totalSize = 0;
    
    if (!fs.existsSync(dirPath)) {
        return 0;
    }
    
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
            totalSize += getDirectorySize(filePath);
        } else {
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
        }
    }
    
    return totalSize;
}

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

    // Check if mod doesn't exist on Steam Workshop before attempting download
    if (modEntry.apiResponse && modEntry.apiResponse.result === 9) {
        console.log(`Mod [${modId}] (${modEntry.name}) does not exist on Steam Workshop - skipping download`);
        recordFailure(modEntry, new Error('Mod not found on Steam Workshop (API result: 9)'));
        writeMasterList(masterList);
        return;
    }

    console.log(`\nInstalling/updating mod [${modId}] (${modEntry.name})...`);

    try {
        const cmd = `${steamCmdPath} +login "${STEAM_USER}" "${STEAM_PASS}" +workshop_download_item 107410 ${modId} validate +quit`;
        console.log(`Running steamcmd for mod ${modId}...`);
        const output = execSync(cmd, { encoding: 'utf8' });

        // Check for error-indicative output
        if (output.includes("ERROR!")) {
            throw new Error(`steamcmd reported an error: ${output}`);
        }

        // Verify mod size if API response has file_size
        if (modEntry.apiResponse && modEntry.apiResponse.file_size) {
            const modPath = path.join(modsFolder, modId);
            const actualSize = getDirectorySize(modPath);
            const expectedSize = parseInt(modEntry.apiResponse.file_size, 10);
            
            // Allow 10% tolerance for size differences (filesystem overhead, compression, metadata, etc.)
            const tolerance = 0.10;
            const minSize = expectedSize * (1 - tolerance);
            const maxSize = expectedSize * (1 + tolerance);
            
            if (actualSize < minSize || actualSize > maxSize) {
                const actualMB = (actualSize / 1024 / 1024).toFixed(2);
                const expectedMB = (expectedSize / 1024 / 1024).toFixed(2);
                console.warn(`Size mismatch for mod [${modId}]: expected ~${expectedMB} MB, got ${actualMB} MB`);
                throw new Error(`Mod size mismatch: expected ${expectedMB} MB, got ${actualMB} MB - incomplete download`);
            } else {
                console.log(`Mod size verified: ${(actualSize / 1024 / 1024).toFixed(2)} MB`);
            }
        }

        // If success, update time_updated and mark as upToDate
        modEntry.time_updated = newTimeUpdated || Math.floor(Date.now() / 1000);
        modEntry.upToDate = true;
        modEntry.blacklisted = false;
        delete modEntry.failure;

    } catch (err) {
        const output = err.stdout || err.message || '';
        
        // Define error patterns
        const permanentErrors = [
            'File Not Found',
            'No subscription',
            'Access Denied',
            'does not exist',
            'failed (Failure)',
            'Invalid Workshop Item'
        ];
        
        const transientErrors = [
            'Invalid Password',
            'Connection timeout',
            'Login Failure',
            'rate limit',
            'No connection',
            'Network error',
            'Timeout',
            'timed out',
            'size mismatch',
            'incomplete download'
        ];
        
        const isPermanent = permanentErrors.some(pattern => output.includes(pattern));
        const isTransient = transientErrors.some(pattern => output.includes(pattern));
        
        if (isPermanent) {
            console.error(`Permanent error for mod [${modId}] (${modEntry.name}) - blacklisting`);
            modEntry.upToDate = false;
            recordFailure(modEntry, err);
        } else if (isTransient) {
            console.error(`Transient error for mod [${modId}] (${modEntry.name}) - will retry next time`);
            modEntry.upToDate = false;
            // Don't blacklist, don't update time_updated - will retry on next run
        } else {
            console.error(`Unknown error for mod [${modId}] (${modEntry.name}) - not blacklisting`);
            console.error(`Error details: ${err.message}`);
            modEntry.upToDate = false;
            // Don't blacklist for unknown errors
        }
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
