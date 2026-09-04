const { appDataDir, join  } = window.__TAURI__.path;
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


export let WATCHLIST_PATH = '';
export let NOTWATCHLIST_PATH = '';
export let PHRASES_PATH = '';
export let SETTINGS_PATH_AIR = '';
export let SETTINGS_PATH_TYPE = '';
export let CACHE_PATH = '';
export let SEASON_PATH = '';

let initPromise = null;

export async function initPaths() {
    if (!initPromise) {
        initPromise = (async () => {

            const appDataPath = await ensureAppDataDir();

            WATCHLIST_PATH = await join(appDataPath, 'watchlist.json');
            NOTWATCHLIST_PATH = await join(appDataPath, 'notwatchlist.json');
            PHRASES_PATH = await join(appDataPath, 'phrases.txt');
            SETTINGS_PATH_AIR = await join(appDataPath, 'settings.txt');
            SETTINGS_PATH_TYPE = await join(appDataPath, 'settings2.txt');
            CACHE_PATH = await join(appDataPath, 'cache.json');
            SEASON_PATH = await join(appDataPath, 'season.txt');
        })();
    }
    await initPromise;
}