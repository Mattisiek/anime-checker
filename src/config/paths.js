const { join } = window.__TAURI__.path;
const { appDataDir } = window.__TAURI__.path;
const { mkdir } = window.__TAURI__.fs;

export async function ensureAppDataDir() {
    const appDataPath = await appDataDir();
    try {
        await mkdir(appDataPath, { recursive: true });
    } catch (error) {
        alert("Error creating directory: " + error);
    }
    return appDataPath;
}

export const appDataPath = await ensureAppDataDir();

export const WATCHLIST_PATH = await join(appDataPath, 'watchlist.json');
export const NOTWATCHLIST_PATH = await join(appDataPath, 'notwatchlist.json');
export const PHRASES_PATH = await join(appDataPath, 'phrases.txt');
export const SETTINGS_PATH_AIR = await join(appDataPath, 'settings.txt');
export const SETTINGS_PATH_TYPE = await join(appDataPath, 'settings2.txt');
export const CACHE_PATH = await join(appDataPath, 'cache.json');
export const SEASON_PATH = await join(appDataPath, 'season.txt');
