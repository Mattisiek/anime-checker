const { fs } = window.__TAURI__;

import { pickAttributes } from "../config/constants.js";
import { PHRASES_PATH, WATCHLIST_PATH, NOTWATCHLIST_PATH, CACHE_PATH, SETTINGS_PATH_AIR, SETTINGS_PATH_TYPE, SEASON_PATH } from "../config/paths.js";
import { addSingleAnime, mergeAnime } from "../api/getAnime.js";
import { allResults, originalResults } from "../main.js";
import { renderList } from "../ui/animeList.js";
import { showLoading, changeVisibility } from "../ui/loading.js";

export async function getPhrases() {
    const content = await fs.readTextFile(PHRASES_PATH);

    return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

export async function getWatchlist() {
    const content = await fs.readTextFile(WATCHLIST_PATH);
    return JSON.parse(content);
}

export async function getNotWatchlist() {
    const content = await fs.readTextFile(NOTWATCHLIST_PATH);
    return JSON.parse(content);
}

export async function writeToCache(l) {
    try {
        await fs.writeTextFile(CACHE_PATH, JSON.stringify(l.map(item => pickAttributes(item)), null, 2));
    } catch (error) {
        alert('Error adding to cache: ' + error);
    }
}

export async function getCachelist() {
    const content = await fs.readTextFile(CACHE_PATH);
    return JSON.parse(content);
}

export async function getSettings() {
    const M = new Map();
    const content = await fs.readTextFile(SETTINGS_PATH_AIR);

    let contentTab = content.split(/\r?\n/).filter(line => line.trim() !== "");
    for (let i = 0; i < contentTab.length; i++) {
        contentTab[i] = contentTab[i].split(" = ");
        M.set(contentTab[i][0], contentTab[i][1]);
    }
    return M;
}

export async function getSettings2() {
    const M = new Map();
    const content = await fs.readTextFile(SETTINGS_PATH_TYPE);

    let contentTab = content.split(/\r?\n/).filter(line => line.trim() !== "");
    for (let i = 0; i < contentTab.length; i++) {
        contentTab[i] = contentTab[i].split(" = ");
        M.set(contentTab[i][0], contentTab[i][1]);
    }
    return M;
}

export async function addToWatchlist(anime_id, anime_title, anime_english_title, anime_type, anime_score) {
    try {
        let watchlist = await getWatchlist();
        const exists = watchlist.some(item => item.mal_id === anime_id);

        if (!exists) {
            watchlist.push({
                mal_id: anime_id,
                title: anime_title,
                english_title: anime_english_title,
                type: anime_type,
                score: anime_score,
            });

            await fs.writeTextFile(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        return false;
    }
}

export async function addToNotWatchlist(anime_id, anime_title, anime_english_title, anime_type) {
    try {
        let notwatchlist = await getNotWatchlist();
        const exists = notwatchlist.some(item => item.mal_id === anime_id);

        if (!exists) {
            notwatchlist.push({
                mal_id: anime_id,
                title: anime_title,
                english_title: anime_english_title,
                type: anime_type,
            });

            await fs.writeTextFile(NOTWATCHLIST_PATH, JSON.stringify(notwatchlist, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error adding to notwatchlist:', error);
        return false;
    }
}

export async function removeFromWatchlist(anime_id) {
    try {
        let watchlist = await getWatchlist();
        const exists = watchlist.some(item => item.mal_id === anime_id);

        if (exists) {
            const updatedWatchlist = watchlist.filter(item => item.mal_id !== anime_id);

            await fs.writeTextFile(WATCHLIST_PATH, JSON.stringify(updatedWatchlist, null, 2));
            watchlist = updatedWatchlist;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        return false;
    }
}

export async function removeFromNotWatchlist(anime_id) {
    try {
        
        let notwatchlist = await getNotWatchlist();
        const exists = notwatchlist.some(item => item.mal_id === anime_id);

        if (exists) {
            const updatedNotWatchlist = notwatchlist.filter(item => item.mal_id !== anime_id);

            await fs.writeTextFile(NOTWATCHLIST_PATH, JSON.stringify(updatedNotWatchlist, null, 2));
            notwatchlist = updatedNotWatchlist;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error removing from notwatchlist:', error);
        return false;
    }
}

export async function isInWatchlist(mal_id) {
    try {
        
        let watchlist = await getWatchlist();
        return watchlist.some(item => item.mal_id === mal_id);
    } catch (error) {
        console.error('Error checking watchlist:', error);
        return false;
    }
}

export async function isInNotWatchlist(mal_id) {
    try {
        let notwatchlist = await getNotWatchlist();
        return notwatchlist.some(item => item.mal_id === mal_id);
    } catch (error) {
        console.error('Error checking notwatchlist:', error);
        return false;
    }
}

export async function getSeason() {
    const content = await fs.readTextFile(SEASON_PATH);

    return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

export async function setSeason(currSeason) {
    try {
        await fs.writeTextFile(SEASON_PATH, currSeason.year + "\n" + currSeason.season);
    } catch (error) {
        console.error('Error adding season:', error);
        return false;
    }
}

export async function insertIntoFile(name) {
    try {
        const current = await fs.readTextFile(PHRASES_PATH);
        const updated = current.trim() + (current.trim() ? '\n' : '') + name;

        showLoading();

        changeVisibility('none');

        const a = await addSingleAnime(name);
        await mergeAnime(a, allResults, originalResults);

        await fs.writeTextFile(PHRASES_PATH, updated);

        writeToCache(allResults);
        await renderList(allResults);

        changeVisibility('flex');

    } catch (error) {
        console.error('Error writing to file:', error);
    }
}

export async function deleteFromFile(name) {
    try {
        let phrases = await getPhrases();
        const updatedPhrases = phrases.filter(item => item !== name);
        const contentToWrite = updatedPhrases.join('\n');
        await fs.writeTextFile(PHRASES_PATH, contentToWrite);

        const searchTerm = name.toLowerCase();


        allResults.forEach(anime => {
            //*/
            for (let i = 0; i < anime.phrases.length; i++) {
                if (anime.phrases[i] === searchTerm) {
                    anime.phrases.splice(i, 1);
                    break;
                }
            }
            //}
        });

        const NewAllResults = allResults.filter(anime => anime.phrases.length > 0);
        const NewOriginalResults = originalResults.filter(anime => anime.phrases.length > 0);

        writeToCache(NewAllResults);
        await renderList(NewOriginalResults);

    } catch (error) {
        console.error('Error deleting from file:', error);
        alert(`Error: ${error.message}`);
    }
}
