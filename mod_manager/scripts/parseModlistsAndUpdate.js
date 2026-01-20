#!/usr/bin/env node

/**
 * parseModlists.js
 *
 * 1) Reads all .html files in /app/dropbox/mpmissions.
 * 2) Merges them into masterlist.json (preserving existing time_updated and apiResponse if present).
 * 3) Generates modParameters.json with keys (based on filename) mapping to "mods/123\;mods/456;...".
 * 4) For each mod in the masterlist, fetches the latest mod info from the Steam API and stores the full apiResponse.
 * 5) Cleans up orphan mod folders in /home/linuxgsm/Steam/steamapps/workshop/content/107410.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

const STEAM_API_KEY = process.env.STEAM_API_KEY || '';

const mpmissionsDir = '/app/dropbox/Dropbox/mpmissions';
const masterListPath = path.join(__dirname, '..', 'data', 'masterlist.json');
const modParamsPath = path.join(__dirname, '..', 'data', 'modParameters.json');
const workshopContentDir = '/home/linuxgsm/Steam/steamapps/workshop/content/107410';

function readMasterList() {
    if (!fs.existsSync(masterListPath)) return [];
    return JSON.parse(fs.readFileSync(masterListPath, 'utf-8'));
}

function writeMasterList(list) {
    fs.writeFileSync(masterListPath, JSON.stringify(list, null, 2), 'utf-8');
}

function writeModParams(modParams) {
    fs.writeFileSync(modParamsPath, JSON.stringify(modParams, null, 2), 'utf-8');
}

/**
 * Parses an HTML file and extracts mod details.
 */
function parseHtmlFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const $ = cheerio.load(content);

    const rows = $('table tr');
    const mods = [];

    rows.each((i, elem) => {
        const aTag = $(elem).find('td a');
        const nameTag = $(elem).find('td[data-type="DisplayName"]');

        if (aTag.length) {
            const href = aTag.attr('href') || '';
            const match = href.match(/id=(\d+)/);
            const modId = match ? match[1] : '';
            const modName = nameTag.text().trim() || 'Unknown Mod';
            const modUrl = href;

            if (modId) {
                mods.push({
                    id: modId,
                    name: modName,
                    url: modUrl,
                    time_updated: 0,
                    upToDate: false
                });
            }
        }
    });

    return mods;
}

/**
 * Fetches mod information from the Steam API for a given modId.
 */
async function getModInfo(modId) {
    try {
        const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                'itemcount': '1',
                'publishedfileids[0]': modId,
                'key': STEAM_API_KEY
            })
        });
        const data = await response.json();
        return data?.response?.publishedfiledetails?.[0] || null;
    } catch (err) {
        console.error(`Error fetching mod info for mod ${modId}:`, err);
        return null;
    }
}

/**
 * Cleans up orphan mod folders in the workshop content directory.
 * Deletes any folder whose name is all digits and that is not present in the masterlist.
 */
function cleanOrphanModFolders(masterList) {
    if (!fs.existsSync(workshopContentDir)) {
        console.warn(`Workshop content directory ${workshopContentDir} does not exist.`);
        return;
    }
    const validModIds = new Set(masterList.map(mod => mod.id));
    const folders = fs.readdirSync(workshopContentDir);
    folders.forEach(folder => {
        if (/^\d+$/.test(folder) && !validModIds.has(folder)) {
            const folderPath = path.join(workshopContentDir, folder);
            console.log(`Deleting orphan mod folder: ${folderPath}`);
            fs.rmSync(folderPath, { recursive: true, force: true });
        }
    });
}

/**
 * Detects if a modlist name contains a Creator DLC keyword and returns the DLC prefix.
 * Returns null if no DLC is detected.
 */
function detectCreatorDLC(modlistName) {
    const name = modlistName.toLowerCase();
    
    // Creator DLC mappings: keyword -> DLC mod name
    const dlcMappings = [
        { keywords: ['vietnam', 'prairie', 'sog'], prefix: 'vn' },
        { keywords: ['gm', 'mobilization', 'germany', 'coldwar'], prefix: 'gm' },
        { keywords: ['csla', 'ironcurtain', 'iron'], prefix: 'csla' },
        { keywords: ['ws', 'sahara', 'western'], prefix: 'ws' },
        { keywords: ['spearhead', 'spe', '1944'], prefix: 'spe' },
        { keywords: ['rf', 'reaction'], prefix: 'rf' },
        { keywords: ['ef', 'expeditionary'], prefix: 'ef' }
    ];
    
    for (const dlc of dlcMappings) {
        if (dlc.keywords.some(keyword => name.includes(keyword))) {
            return dlc.prefix;
        }
    }
    
    return null;
}

/**
 * Main function to parse HTML modlists, update masterlist.json with the latest API info,
 * generate modParameters.json, and clean up orphan mod folders.
 */
async function parseModlistsAndUpdate() {
    console.log('\n=== Parsing modlists ===\n');

    const oldMasterList = readMasterList();
    const oldById = {};
    oldMasterList.forEach((m) => {
        oldById[m.id] = m;
    });

    const htmlFiles = fs.readdirSync(mpmissionsDir).filter((f) => f.endsWith('.html'));
    let newModsCollected = [];
    const modParams = {}; // key: filename (lowercase) -> "mods/123\;mods/456\;..."

    htmlFiles.forEach((file) => {
        const filePath = path.join(mpmissionsDir, file);
        const modsInFile = parseHtmlFile(filePath);

        const modIds = modsInFile.map((m) => m.id);
        let modString = modIds.map((id) => `mods/${id}`).join('\\;');
        // const modString = modIds.map((id) => `mods/${id}`).join(';');

        const base = path.basename(file, '.html');
        const paramKey = base.toLowerCase();
        
        // Check if this modlist is for a Creator DLC
        const dlcPrefix = detectCreatorDLC(paramKey);
        if (dlcPrefix) {
            modString = `${dlcPrefix}\\;${modString}`;
            console.log(`Parsed modlist ${base} (Creator DLC: ${dlcPrefix})`);
        } else {
            console.log(`Parsed modlist ${base}`);
        }

        modParams[paramKey] = modString;
        newModsCollected = newModsCollected.concat(modsInFile);
    });

    // Deduplicate & merge with the old masterlist
    const deduped = {};
    newModsCollected.forEach((m) => {
        if (oldById[m.id]) {
            // Preserve existing time_updated, upToDate, and apiResponse if available
            m.time_updated = oldById[m.id].time_updated;
            m.upToDate = oldById[m.id].upToDate;
            if (oldById[m.id].apiResponse) {
                m.apiResponse = oldById[m.id].apiResponse;
            }

            if (oldById[m.id].blacklisted === true) {
                m.blacklisted = true;
                m.failure = oldById[m.id].failure;
            }

            if (m.name === 'Unknown Mod') {
                m.name = oldById[m.id].name;
            }
        }

        deduped[m.id] = m;
    });
    // Keep old mods not present in new HTML files
    for (const id in oldById) {
        if (!deduped[id]) {
            deduped[id] = oldById[id];
        }
    }

    const finalMasterList = Object.values(deduped);

    // For each mod in the masterlist, fetch the latest API info and update the entry.
    for (const mod of finalMasterList) {
        const apiInfo = await getModInfo(mod.id);
        mod.apiResponse = apiInfo; // May be null if the API call fails
    }

    // Write masterlist and modParameters files
    writeMasterList(finalMasterList);
    writeModParams(modParams);

    console.log(`- masterlist.json updated at: ${masterListPath}`);
    console.log(`- modParameters.json created at: ${modParamsPath}`);

    // Clean up orphan mod folders in the workshop content directory
    cleanOrphanModFolders(finalMasterList);

    return finalMasterList;
}

// If run directly
if (require.main === module) {
    parseModlistsAndUpdate().then(() => {
        console.log('\n=== parseModlists complete ===\n');
    });
} else {
    module.exports = { parseModlistsAndUpdate };
}
