const { fs } = window.__TAURI__;

import { CACHE_PATH, NOTWATCHLIST_PATH, PHRASES_PATH, SEASON_PATH, SETTINGS_PATH_AIR, SETTINGS_PATH_TYPE, WATCHLIST_PATH } from "../config/paths.js";
import { getCurrentMALSeason } from "./animeService.js";
import { typeOfAiring, typeOfAnime } from "../config/constants.js";

export async function initFiles() {
    try {
        try {
            await fs.readTextFile(WATCHLIST_PATH);
        } catch {
            await fs.writeTextFile(WATCHLIST_PATH, '[]');
        }

        try {
            await fs.readTextFile(NOTWATCHLIST_PATH);
        } catch {
            await fs.writeTextFile(NOTWATCHLIST_PATH, '[]');
        }

        try {
            await fs.readTextFile(PHRASES_PATH);
        } catch {
            await fs.writeTextFile(PHRASES_PATH, '');
        }

        try {
            await fs.readTextFile(SETTINGS_PATH_AIR);
        } catch {
            let settings = "";
            for (const elem of typeOfAiring) {
                settings += `${elem} = 1\n`;
            }
            await fs.writeTextFile(SETTINGS_PATH_AIR, settings);
        }

        try {
            await fs.readTextFile(SETTINGS_PATH_TYPE);
        } catch {
            let settings = "";
            for (const elem of typeOfAnime) {
                settings += `${elem} = 1\n`;
            }
            await fs.writeTextFile(SETTINGS_PATH_TYPE, settings);
        }

        try {
            await fs.readTextFile(CACHE_PATH);
        } catch {
            await fs.writeTextFile(CACHE_PATH, '[]');
        }

        try {
            await fs.readTextFile(SEASON_PATH);
        } catch {
            const currSeason = getCurrentMALSeason();
            await fs.writeTextFile(SEASON_PATH, currSeason.year + "\n" + currSeason.season);
        }

    } catch (error) {
        alert("❌ Fatal error in initFiles: " + error);
    }
}
