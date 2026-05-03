const { invoke } = window.__TAURI__.core;
const { fs, path } = window.__TAURI__;
const { open } = window.__TAURI__.opener;
const { appDataDir, join } = window.__TAURI__.path;
const { mkdir } = window.__TAURI__.fs;
const { getCurrentWebview } = window.__TAURI__.webview;
const { readTextFile } = window.__TAURI__.fs;
const { resolveResource } = window.__TAURI__.path;

import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs";

let pyodideInstance = null;
let notebookCache = null;
var modelList = [];
var modelCacheList = [];

async function initMLModel() {
    if (pyodideInstance) return pyodideInstance;

    try {
        console.log("Initializing ML Engine...");
        /*
        pyodideInstance = await loadPyodide({
            stdout: () => {},
            stderr: (msg) => console.warn("Pyodide Warning:", msg)
        });
        */
        pyodideInstance = await loadPyodide();

        await pyodideInstance.loadPackage(["micropip", "setuptools", "pandas"]);
        const micropip = pyodideInstance.pyimport("micropip");
        await micropip.install("mlxtend==0.22.0");

        await pyodideInstance.runPythonAsync(`
            import sys, warnings, os, json, pandas as pd, time, numpy as np, math
            from pathlib import Path
            from types import ModuleType
            from sklearn.metrics.pairwise import cosine_similarity
            from sklearn.neighbors import NearestNeighbors
            warnings.filterwarnings("ignore")

            if 'distutils' not in sys.modules:
                d = ModuleType('distutils'); v = ModuleType('distutils.version')
                class LooseVersion:
                    def __init__(self, vstring): self.vstring = vstring
                    def __lt__(self, other): return False
                    def __ge__(self, other): return True
                v.LooseVersion = LooseVersion; d.version = v
                sys.modules['distutils'] = d; sys.modules['distutils.version'] = v
        `);

        // Cache'owanie danych stałych (anime_df.csv i notebook)
        const csvPath = await resolveResource('resources/anime_df.csv');
        const csvContent = await readTextFile(csvPath);
        try {
            pyodideInstance.FS.stat('anime_df.csv');
            // Jeśli nie wywali błędu, plik istnieje - nie nadpisuj
        } catch (e) {
            pyodideInstance.FS.writeFile('anime_df.csv', csvContent, { encoding: 'utf8' });
        }

        await pyodideInstance.runPythonAsync(`
            df = pd.read_csv('anime_df.csv')
            if len(df.columns) > 0:
                df.rename(columns={df.columns[0]: 'usernames'}, inplace=True)
            print("DataFrame loaded and column renamed.")
            df = df.set_index(df.columns[0])
            df = df.astype(float)
        `);

        const modelPath = await resolveResource('resources/model.ipynb');
        notebookCache = JSON.parse(await readTextFile(modelPath));

        for (const cell of notebookCache.cells) {
            if (cell.cell_type === 'code') {
                await pyodideInstance.loadPackagesFromImports(cell.source.join(''));
            }
        }

        console.log("ML Engine Ready.");
        return pyodideInstance;
    } catch (err) {
        console.error("Initialization Failed:", err);
        throw err;
    }
}

async function runRecommendations() {
    try {
        const pyodide = await initMLModel(); // Upewnia się, że silnik działa

        // 1. Odczyt aktualnej watchlisty (zawsze świeża)
        const appDataDir = await ensureAppDataDir(); 
        const fullWatchlistPath = await path.join(appDataDir, 'watchlist.json');
        const watchlistContent = await fs.readTextFile(fullWatchlistPath);
        
        const fullNotWatchlistPath = await path.join(appDataDir, 'notwatchlist.json');
        const notwatchlistContent = await fs.readTextFile(fullNotWatchlistPath);
        
        pyodide.globals.set("RAW_WATCHLIST_JSON", watchlistContent);
        pyodide.globals.set("WATCHLIST_PATH_STR", fullWatchlistPath.replace(/\\/g, '/'));
        
        pyodide.globals.set("RAW_NOTWATCHLIST_JSON", notwatchlistContent);
        pyodide.globals.set("NOTWATCHLIST_PATH_STR", fullNotWatchlistPath.replace(/\\/g, '/'));

        await pyodide.runPythonAsync(`
vfs_path = Path('/home/pyodide/default_app')
vfs_path.mkdir(parents=True, exist_ok=True)
vfs_file_path = vfs_path / 'watchlist.json'
watchlist_path = str(vfs_file_path)
n_vfs_file_path = vfs_path / 'notwatchlist.json'
notwatchlist_path = str(n_vfs_file_path)

with open(n_vfs_file_path, 'w', encoding='utf-8') as f:
    f.write(RAW_NOTWATCHLIST_JSON)
with open(vfs_file_path, 'w', encoding='utf-8') as f:
    f.write(RAW_WATCHLIST_JSON)
os.environ['APPDATA'] = '/home/pyodide'
config = {'identifier': 'default_app'}
        `);

        // 2. Wykonanie komórek notebooka
        for (const [index, cell] of notebookCache.cells.entries()) {
            if (index <= 4) continue; 
            if (cell.cell_type === 'code') {
                let code = cell.source.join('');
                if (code.includes('tauri.conf.json')) {
                    code = "config = {'identifier': 'default_app'}";
                }
                code = code.replace("pd.read_csv('anime_df.csv')", "pd.read_csv('/home/pyodide/anime_df.csv')");
                
                await pyodide.runPythonAsync(code);
            }
        }

        // 3. Ekstrakcja wyników
        const jsonResult = await pyodide.runPythonAsync(`
recs = globals().get('recommendations', {})
output = recs.to_dict() if hasattr(recs, 'to_dict') else (recs if recs else {})
json.dumps({str(k): float(v) for k, v in output.items()})
        `);

        // 4. Wyświetlenie wyników
        await handleResultDisplay(jsonResult);

    } catch (err) {
        console.error("Execution Error:", err);
        alert("Error running model: " + err.message);
    }
}

async function handleResultDisplay(jsonResult) {

    if (!jsonResult || jsonResult === "{}") {
        alert("No recommendations found.");
        return;
    }
    modelList = [];
    const finalObj = JSON.parse(jsonResult);
    let resultString = "Top Recommendations:\n";
    for (const [animeKey, score] of Object.entries(finalObj)) {
        const parts = animeKey.split('_');

        // Pierwsza część (ID)
        const id = Number(parts[0]);
        //alert(id);
        //alert(typeof id);

        // Reszta (Nazwa) - usuwamy ID i łączymy resztę
        const name = parts.slice(1).join('_');
        resultString += `• ${name} - Score: ${score.toFixed(2)}\n`;
        //alert("A");
        const found = modelCacheList.find(item => item.mal_id === id);

        if (found) {
            modelList.push(found);
        }
        else{
            const currAnime = await getSingleAnime(id);
            if (currAnime && currAnime.mal_id) {
                modelList.push(currAnime);
                modelCacheList.push(currAnime);
            }
        }
        //console.log("asdjhasdhjasdhj");
        //console.log(modelList);
    }

    //alert(resultString);
}

getCurrentWebview().clearAllBrowsingData();


window.onerror = function (msg, url, line) {
    alert("Error: " + msg + " at line " + line);
    return false;
};

async function ensureAppDataDir() {
    const appDataPath = await appDataDir();
    try {
        await mkdir(appDataPath, { recursive: true });
    } catch (error) {
        alert("Error creating directory: " + error);
    }
    return appDataPath;
}

const appDataPath = await ensureAppDataDir();

const WATCHLIST_PATH = await join(appDataPath, 'watchlist.json');
const NOTWATCHLIST_PATH = await join(appDataPath, 'notwatchlist.json');
const PHRASES_PATH = await join(appDataPath, 'phrases.txt');
const SETTINGS_PATH_AIR = await join(appDataPath, 'settings.txt');
const SETTINGS_PATH_TYPE = await join(appDataPath, 'settings2.txt');
const CACHE_PATH = await join(appDataPath, 'cache.json');
const SEASON_PATH = await join(appDataPath, 'season.txt');

var delay = 1001;
var currTime = Date.now() + delay;
const typeOfAnime = ['TV', 'Movie', 'ONA', 'OVA', 'Special', 'TV Special', 'CM', 'PV', 'Music', 'null'];
const typeOfAiring = ['Finished Airing', 'Currently Airing', 'Not yet aired'];

var originalResults = [];
var currentSearchTerm = '';
var allResults = [];
var allResultsRecommendations = [];
var appLaunched = false;
var gotRecommendations = false;
var scrollPosition = 0;
var currentlyShown = 'anime';
var refreshDisabled = true;


const container = document.getElementById('anime-container');

async function initFiles() {
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

function pickAttributes(anime) {
    let animeToAdd = {};
    const keyElements = ['mal_id', 'title', 'title_english', 'score', 'type', 'status', 'aired', 'episodes', 'phrases', 'images', 'url'];
    keyElements.forEach(key => {
        animeToAdd[key] = anime[key];
    });
    return animeToAdd;  
}

await initFiles();

document.addEventListener('keydown', function(event) {
    if (!refreshDisabled) return;
    
    if (event.key === 'F5' || 
        (event.key === 'r' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
    }
});

function showLoading(){
    container.innerHTML = 'Loading.....';
}

async function getPhrases() {
    const content = await fs.readTextFile(PHRASES_PATH);

    return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

function changeVisibilitySwitch(vis){
    
    const animes = document.getElementById('show-anime');
    const recommendations = document.getElementById('show-recommendations');
    
    animes.style.display = vis;
    recommendations.style.display = vis;
}

function changeVisibility(vis){
    
    const postLoadControls = document.getElementById('main-search-container');
    const popupButton = document.getElementById('show-popup-btn');
    const popupButton2 = document.getElementById('show-popup2-btn');
    const popupButton3 = document.getElementById('show-popup3-btn');
    const hardResetButton = document.getElementById('hard-reset-btn');
    const inputForm = document.getElementById('input-form');
    const counterDisplay = document.getElementById('counter-display');
    
    refreshDisabled = vis === 'flex' ? false : true;

    changeVisibilitySwitch(vis);
    
    postLoadControls.style.display = vis;
    popupButton.style.display = vis;
    popupButton2.style.display = vis;
    popupButton3.style.display = vis;
    hardResetButton.style.display = vis;
    inputForm.style.display = vis;
    counterDisplay.style.display = vis;
}

async function getWatchlist() {
    const content = await fs.readTextFile(WATCHLIST_PATH);
    return JSON.parse(content);
}

async function getNotWatchlist() {
    const content = await fs.readTextFile(NOTWATCHLIST_PATH);
    return JSON.parse(content);
}

async function getCachelist() {
    const content = await fs.readTextFile(CACHE_PATH);
    return JSON.parse(content);
}

async function getSettings() {
    const M = new Map();
    const content = await fs.readTextFile(SETTINGS_PATH_AIR);

    let contentTab = content.split(/\r?\n/).filter(line => line.trim() !== "");
    for (let i = 0; i < contentTab.length; i++) {
        contentTab[i] = contentTab[i].split(" = ");
        M.set(contentTab[i][0], contentTab[i][1]);
    }
    return M;
}

async function getSettings2() {
    const M = new Map();
    const content = await fs.readTextFile(SETTINGS_PATH_TYPE);

    let contentTab = content.split(/\r?\n/).filter(line => line.trim() !== "");
    for (let i = 0; i < contentTab.length; i++) {
        contentTab[i] = contentTab[i].split(" = ");
        M.set(contentTab[i][0], contentTab[i][1]);
    }
    return M;
}

async function addToWatchlist(anime_id, anime_title, anime_type, anime_score) {
    try {
        const watchlist = await getWatchlist();

        const exists = watchlist.some(item => item.mal_id === anime_id);

        if (!exists) {
            watchlist.push({
                mal_id: anime_id,
                title: anime_title,
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

async function addToNotWatchlist(anime_id, anime_title, anime_type) {
    try {
        const notwatchlist = await getNotWatchlist();

        const exists = notwatchlist.some(item => item.mal_id === anime_id);

        if (!exists) {
            notwatchlist.push({
                mal_id: anime_id,
                title: anime_title,
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

async function writeToCache(l) {
    try {
        await fs.writeTextFile(CACHE_PATH, JSON.stringify(l.map(item => pickAttributes(item)), null, 2));
    } catch (error) {
        alert('Error adding to cache: ' + error);
    }
}

async function getSeason() {
    const content = await fs.readTextFile(SEASON_PATH);

    return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

async function removeFromWatchlist(anime_id) {
    try {
        const watchlist = await getWatchlist();

        const exists = watchlist.some(item => item.mal_id === anime_id);

        if (exists) {
            const updatedWatchlist = watchlist.filter(item => item.mal_id !== anime_id);

            await fs.writeTextFile(WATCHLIST_PATH, JSON.stringify(updatedWatchlist, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        return false;
    }
}

async function removeFromNotWatchlist(anime_id) {
    try {
        const notwatchlist = await getNotWatchlist();

        const exists = notwatchlist.some(item => item.mal_id === anime_id);

        if (exists) {
            const updatedNotWatchlist = notwatchlist.filter(item => item.mal_id !== anime_id);

            await fs.writeTextFile(NOTWATCHLIST_PATH, JSON.stringify(updatedNotWatchlist, null, 2));
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error removing from notwatchlist:', error);
        return false;
    }
}

async function isInWatchlist(mal_id) {
    try {
        const watchlist = await getWatchlist();
        return watchlist.some(item => item.mal_id === mal_id);
    } catch (error) {
        console.error('Error checking watchlist:', error);
        return false;
    }
}

async function isInNotWatchlist(mal_id) {
    try {
        const notwatchlist = await getNotWatchlist();
        return notwatchlist.some(item => item.mal_id === mal_id);
    } catch (error) {
        console.error('Error checking notwatchlist:', error);
        return false;
    }
}

async function addSingleAnime(name) {
    const maxPages = 10;
    const searchTerm = name.toLowerCase();

    let page = 1;
    let pageLen = 25;
    let hasNextPage = true;
    let allPageResults = [];
    let currentRes = 0;

    while (hasNextPage && page <= maxPages) {
        try {
            currentRes = 0;
            const response = await fetch(
                `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(name)}&page=${page}&limit=${pageLen}&sfw`
            );
            const data = await response.json();

            const resultsWithDuplicates = data.data || [];
            const resultsMap = new Map();

            resultsWithDuplicates.forEach(anime => {
                if (!resultsMap.has(anime.mal_id)) {
                    resultsMap.set(anime.mal_id, anime);
                }
            });

            const results = Array.from(resultsMap.values());

            allPageResults = [...allPageResults, ...results];

            for (let j = 0; j < results.length; j++) {
                const anime = pickAttributes(results[j]);

                const title = anime.title?.toLowerCase() || '';
                //alert(j + ": " + title + " " + anime.mal_id);
                const englishTitle = anime.title_english?.toLowerCase() || '';

                if (title.includes(searchTerm) || englishTitle.includes(searchTerm)) {
                    const existingAnime = allResults.find(a => a.mal_id === anime.mal_id);
                    // alert(title);

                    if (existingAnime) {

                        existingAnime.phrases = existingAnime.phrases || [];
                        existingAnime.phrases.push(searchTerm);
                    } else {
                        anime.phrases = [searchTerm];
                        allResults.push(anime);
                        originalResults.push(anime);
                    }
                    currentRes++;
                }
                // else alert(title);
            }

            hasNextPage = data.pagination?.has_next_page === true;

            if (results.length < pageLen) hasNextPage = false;

            page++;

            
            const currDelay = Math.max(delay - (Date.now() - currTime), 10);
            // alert(currDelay);
            await new Promise(resolve => setTimeout(resolve, currDelay));
            currTime = Date.now();

        } catch (error) {
            alert(`❌ Error on page ${page}: ${error.message}`);
            hasNextPage = false;
        }
        if (currentRes === 0) break;
    }
    return allPageResults;
}

async function renderList(list, preserveOriginal = false, recomendations = false) {
    if (!preserveOriginal && originalResults.length === 0) {
        originalResults = [...list];
    }
    //alert(1);

    let listToRender = list;

    if (currentSearchTerm && currentSearchTerm.trim() !== '') {
        const term = currentSearchTerm.toLowerCase().trim();
        listToRender = listToRender.filter(anime =>
            (anime.title && anime.title.toLowerCase().includes(term)) ||
            (anime.title_english && anime.title_english.toLowerCase().includes(term))
        );
    }
    //alert(2);
    
    listToRender = recomendations ? sortByScore(listToRender) : sortByReleaseDate(listToRender);
    const watchlist = await getWatchlist();
    const notwatchlist = await getNotWatchlist();
    const settings = await getSettings();
    const settings2 = await getSettings2();
    const watchedIds = new Set(watchlist.map(item => item.mal_id));
    const watchedIds2 = new Set(notwatchlist.map(item => item.mal_id));
    const watchedIdsWithNoScore = new Set(
    watchlist
        .filter(item => item.score === undefined || item.score === null)
        .map(item => item.mal_id)
);
    //alert(3);

    let tempList = [];
    for (let i = 0; i < listToRender.length; i++) {
        const anime = listToRender[i];

        
        if (watchedIds.has(anime.mal_id) && watchedIdsWithNoScore.has(anime.mal_id)){
            ;
            //await removeFromWatchlist(anime.mal_id);
            //watchedIds.delete(anime.mal_id);
        }        

        if (watchedIds.has(anime.mal_id)) continue;
        if (watchedIds2.has(anime.mal_id)) continue;
        if (settings.get(anime.status) === '0' && !recomendations) continue;
        if (settings.get(anime.status) === undefined) alert("undefined status: " + anime.status);
        const typeKey = anime.type === null ? "null" : anime.type;
        if (settings2.get(typeKey) === '0') {
            continue;
        }
        // else alert(anime.title + " " +  anime.type + " " + settings2.get(anime.type));
        if (anime.type !== null && settings2.get(typeKey) === undefined){
            alert("undefined type: " + typeKey + ' in anime: ' + anime.title);
        }
        tempList.push(anime);
        //alert("Anime count = 0: " + anime.title);
    }
    //alert(4);
    
    const counterDisplay = document.getElementById('counter-display');
    if (counterDisplay) {
        counterDisplay.textContent = `Number of anime: ${tempList.length}`;
    }
    //alert(5);
    
    container.innerHTML = '';
    let tempHTMLcontent = '';
    //alert(6);

    for (let i = 0; i < tempList.length; i++) {
        const anime = tempList[i];

        let airDateHtml = '';
        let scoreHtml = '';
        let nameHtml = '';
        let typeHtml = '';
        let episodesHtml = '';
        let buttonHtml = '';
        let buttonHtml2 = '';
        const airedTab = anime.aired.string.split("to");
        const airedFrom = airedTab[0];
        const airedTo = airedTab[1];

        if (anime.status === "Not yet aired" && anime.aired.from && anime.aired.to) {
            airDateHtml = `<p>Supposed first air: ${airedFrom}</p>
                     <p>Supposed last air: ${airedTo}</p>`;
        }
        if (anime.status === "Not yet aired" && anime.aired.from) {
            airDateHtml = `<p>Supposed first air: ${airedFrom}</p>`;
        }
        else if (anime.status === "Not yet aired") airDateHtml = ``;

        else if (anime.aired?.to) {
            airDateHtml = `<p>First air: ${airedFrom}</p><p>Last air: ${airedTo}</p>`;
        } else {
            airDateHtml = `<p>Air: ${airedFrom}</p>`;
        }

        if (anime.score !== null) {
            scoreHtml = `<p>Score: ${anime.score}</p>`;
        }

        if (anime.type !== null) {
            typeHtml = `<p>Type: ${anime.type}</p>`;
        }

        if (anime.title_english === null || anime.title_english === anime.title) {
            nameHtml = `<h3>${anime.title}</h3>`;
        }
        else nameHtml = `<h3>${anime.title}</h3><h3>${anime.title_english}</h3>`;

        if (anime.episodes !== null) {
            episodesHtml = `<p>Episodes: ${anime.episodes}</p>`;
        }
        else nameHtml = `<h3>${anime.title}</h3> <h3>${anime.title_english}</h3>`;

        if (!recomendations){
            buttonHtml = `
                <button 
                    type="button"
                    class="add-btn" 
                    data-id="${anime.mal_id}" 
                    data-title="${anime.title.replace(/"/g, '&quot;')}" 
                    data-type="${anime.type}">
                    I have watched it
                </button>
            `;
            buttonHtml2 = `
                <button 
                    type="button"
                    class="add-btn2" 
                    data-id="${anime.mal_id}" 
                    data-title="${anime.title.replace(/"/g, '&quot;')}" 
                    data-type="${anime.type}">
                    Dont show me
                </button>
            `
        }

        tempHTMLcontent += `
      <div class="anime-card" style="margin-bottom: 20px; border: 1px solid #ccc; padding: 10px;">
        <img src="${anime.images.jpg.image_url}" alt="${anime.title}" width="100">
        ${nameHtml}
        ${scoreHtml}
        <p>Status: ${anime.status}</p>
        ${typeHtml}
        <!-- Link section 
        <p>First Air: ${anime.aired?.from ? new Date(anime.aired.from).toLocaleDateString() : 'Unknown'}</p>
        <p>Last Air: ${anime.aired?.to ? new Date(anime.aired.to).toLocaleDateString() : 'Unknown'}</p>
        -->
        ${airDateHtml}
        ${episodesHtml}
        <p>
          <a href="#" 
            onclick="event.preventDefault(); window.__TAURI__.opener.openUrl('${anime.url}');" 
            style="color: #4CAF50; cursor: pointer; text-decoration: underline;">
            View on MyAnimeList →
          </a>
        </p>
        ${buttonHtml}
        ${buttonHtml2}
      </div>
    `;
    }
    container.innerHTML = tempHTMLcontent;
}

async function insertIntoFile(name) {
    try {
        const current = await fs.readTextFile(PHRASES_PATH);
        const updated = current.trim() + (current.trim() ? '\n' : '') + name;

        showLoading();

        changeVisibility('none');

        await addSingleAnime(name);

        await fs.writeTextFile(PHRASES_PATH, updated);

        changeVisibility('flex');

        writeToCache(allResults);
        await renderList(allResults);
    } catch (error) {
        console.error('Error writing to file:', error);
    }
}

async function deleteFromFile(name) {
    try {
        let phrases = await getPhrases();
        const updatedPhrases = phrases.filter(item => item !== name);
        const contentToWrite = updatedPhrases.join('\n');
        await fs.writeTextFile(PHRASES_PATH, contentToWrite);

        const searchTerm = name.toLowerCase();


        allResults.forEach(anime => {
            //*/
            //if(anime.phrases && anime.phrases !== undefined){ //TODO: delete this
                //alert(anime.title + " " + anime.phrases);
                for (let i = 0; i < anime.phrases.length; i++) {
                    if (anime.phrases[i] === searchTerm) {
                        anime.phrases.splice(i, 1);
                        break;
                    }
                }
            //}
        });

        allResults = allResults.filter(anime => anime.phrases.length > 0);
        originalResults = originalResults.filter(anime => anime.phrases.length > 0);


        writeToCache(allResults);
        await renderList(allResults);

    } catch (error) {
        console.error('Error deleting from file:', error);
        alert(`Error: ${error.message}`);
    }
}

function getCurrentMALSeason() {
    const date = new Date();
    const month = date.getMonth() + 1;
    const year = date.getFullYear().toString();

    let season;

    if (month >= 1 && month <= 3) {
        season = 'winter';
    } else if (month >= 4 && month <= 6) {
        season = 'spring';
    } else if (month >= 7 && month <= 9) {
        season = 'summer';
    } else {
        season = 'fall';
    }
    return { year, season };
}

function getPreviousSeason(year, seasonPrev) {
    let season;

    if (seasonPrev === 'winter') {
        season = 'fall';
        year--;
    } else if (seasonPrev === 'spring') {
        season = 'winter';
    } else if (seasonPrev === 'summer') {
        season = 'spring';
    } else {
        season = 'summer';
    }
    year = year.toString();
    return { year, season };
}

async function getSeasonalAnime(searchPhrase) {
    const maxPages = 50;
    let page = 1;
    let pageLen = 25;
    let hasNextPage = true;
    let allPageResults = [];

    const phrases = await getPhrases();

    while (hasNextPage && page <= maxPages) {
        try {
            const response = await fetch(`https://api.jikan.moe/v4/${searchPhrase}page=${page}`);
            const data = await response.json();

            const results = data.data || [];

            for (let j = 0; j < results.length; j++) {
                const anime = pickAttributes(results[j]);
                // if(anime.mal_id === 55830) alert(anime.title + " " + anime.status + " " + searchPhrase);
                const title = anime.title?.toLowerCase() || '';
                const englishTitle = anime.title_english?.toLowerCase() || '';
                let currPhrases = [];
                for (const phraseUnchanged of phrases) {
                    const phrase = phraseUnchanged.toLowerCase();
                    if (title.includes(phrase) || englishTitle.includes(phrase)){
                        currPhrases.push(phrase);
                    }
                }
                const existingAnime = allPageResults.find(a => a.mal_id === anime.mal_id);
                if (currPhrases.length > 0) {
                    if (existingAnime) {
                        existingAnime.phrases = currPhrases;
                    } else {
                        anime.phrases = currPhrases;
                        allPageResults.push(anime);
                    }
                }
            }

            hasNextPage = data.pagination?.has_next_page === true;

            if (results.length < pageLen) {
                hasNextPage = false;
            }

            page++;

            const currDelay = Math.max(delay - (Date.now() - currTime), 10);
            await new Promise(resolve => setTimeout(resolve, currDelay));
            currTime = Date.now();

        } catch (error) {
            alert(`❌ Error on page ${page}: ${error.message}`);
            hasNextPage = false;
        }
    }
    return allPageResults;
}

async function loadAllAnime() {
    showLoading();
    changeVisibility('none');
    allResults = [];
    var animeTitles = await getPhrases();

    for (let i = 0; i < animeTitles.length; i++) {
        try {
            await addSingleAnime(animeTitles[i]);

            const currDelay = Math.max(delay - (Date.now() - currTime), 10);
            await new Promise(resolve => setTimeout(resolve, currDelay));
            currTime = Date.now();

        } catch (error) {
            console.error(`Error with ${animeTitles[i]}:`, error);
        }
    }
    await writeToCache(allResults);
    await renderList(allResults);
}

async function getSingleAnime(animeId) {
    let allPageResults = [];
    const phrases = await getPhrases();

    try {
        const response = await fetch(`https://api.jikan.moe/v4/anime/${animeId}/full`);
        const data = await response.json();

        const anime = pickAttributes(data.data);
         if (!anime) {
            alert(`No data found for anime ID: ${animeId}`);
            return null;
        }
        let currPhrases = []
        const title = anime.title?.toLowerCase() || '';
        const englishTitle = anime.title_english?.toLowerCase() || '';
        let c = 0;
        for (const phraseUnchanged of phrases) {
            const phrase = phraseUnchanged.toLowerCase();
            if (title.includes(phrase) || englishTitle.includes(phrase)){
                currPhrases.push(phrase);
                c += 1;
            }
        }
        const existingAnime = allPageResults.find(a => a.mal_id === anime.mal_id);
        if (c > 0) {
            if (existingAnime) {
                existingAnime.phrases = currPhrases;
            } else {
                anime.phrases = currPhrases;
                allPageResults.push(anime);
            }
        }

        const currDelay = Math.max(delay - (Date.now() - currTime), 10);
        await new Promise(resolve => setTimeout(resolve, currDelay));
        currTime = Date.now();
        return anime;
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

async function loadAllAnimeBySeason() {
    if (appLaunched) return;
    appLaunched = true;

    showLoading();

    changeVisibility('none');

    await initMLModel();
    await runRecommendations();
    
    // allResultsRecommendations = await loadTopAnime();

    const savedSeason = await getSeason();
    const prevSeason = getPreviousSeason(savedSeason[0], savedSeason[1]);
    prevSeason.year = savedSeason[0];
    prevSeason.season = savedSeason[1];
    const currSeason = getCurrentMALSeason();
    if (currSeason.year !== savedSeason[0] || currSeason.season !== savedSeason[1]){
        await fs.writeTextFile(SEASON_PATH, currSeason.year + "\n" + currSeason.season);
    }    

    let t = -1;
    let isIn = false;
    // alert("Start")
    for (let year = Number(prevSeason.year); year <= Number(currSeason.year); year++) {
        for (let season of ['winter', 'spring', 'summer', 'fall']) {
            if (t === -1 && prevSeason.season === season) t = 0;
            if (t === 0) {
                //alert(year + " " + season);
                const a = await getSeasonalAnime(`seasons/${year}/${season}?`);
                for (const animeA of a) {
                    isIn = false;
                    for (const animeB of allResults) {
                        if (animeA.mal_id === animeB.mal_id) {
                            isIn = true;
                        }
                    }
                    if (!isIn) {
                        allResults.push(animeA);
                        originalResults.push(animeA);
                    }
                }
            }
            if (t === 0 && year === Number(currSeason.year) && season === currSeason.season) t = 1;
        }
    }
    // alert("upcoming");
    const upcomingAnime = await getSeasonalAnime("seasons/upcoming?");
    for (const animeA of upcomingAnime) {
        isIn = false;
        for (const animeB of allResults) {
            if (animeA.mal_id === animeB.mal_id) {
                isIn = true;
            }
        }
        if (!isIn) {
            allResults.push(animeA);
            originalResults.push(animeA);
        }
    }
    // alert("currently airing");
    const currentAnime = await getSeasonalAnime("anime?status=airing&");
    for (const animeA of currentAnime) {
        isIn = false;
        for (const animeB of allResults) {
            if (animeA.mal_id === animeB.mal_id) {
                isIn = true;
            }
        }
        if (!isIn) {
            allResults.push(animeA);
            originalResults.push(animeA);
        }
    }
    
    //alert("All")
    let cacheList = await getCachelist();
    let isInResult = false;
    let cachedAnimeToAdd;

    for (const cachedAnime of cacheList) {
        isInResult = false;
        for (const anime of allResults) {
            if (cachedAnime.title === anime.title) {
                isInResult = true;
            }
        }
        if (!isInResult) {
            if (cachedAnime.status === 'Currently Airing'){
                cachedAnimeToAdd = await getSingleAnime(cachedAnime.mal_id);
                if (cachedAnimeToAdd) {  // Only add if we got a valid result
                    allResults.push(cachedAnimeToAdd);
                    originalResults.push(cachedAnimeToAdd);
                } 
                else {
                    // If fetch failed, add the cached version as fallback
                    allResults.push(cachedAnime);
                    originalResults.push(cachedAnime);
                }
            }
            else{
                cachedAnimeToAdd = cachedAnime;
                allResults.push(cachedAnimeToAdd);
                originalResults.push(cachedAnimeToAdd);
            }
        }
    }

    changeVisibility('flex');
    await writeToCache(allResults);
    await renderList(allResults);
}

function sortByReleaseDate(animeList) {
    return [...animeList].sort((a, b) => {

        const STATUS_MAP = {
            "Finished Airing": 1,
            "Currently Airing": 2,
            "Not yet aired": 3,
        };

        const statusA = STATUS_MAP[a.status] || 0;
        const statusB = STATUS_MAP[b.status] || 0;

        if (statusA !== statusB) {
            return statusA - statusB;
        }

        const hasDateA = a.aired?.from != null;
        const hasDateB = b.aired?.from != null;

        if (hasDateA && !hasDateB) return -1;
        if (!hasDateA && hasDateB) return 1;
        if (!hasDateA && !hasDateB) return a.title.localeCompare(b.title);


        let dateA = a.aired?.to ? new Date(a.aired.to) : new Date(a.aired.from);
        let dateB = b.aired?.to ? new Date(b.aired.to) : new Date(b.aired.from);

        return dateA - dateB;
    });
}

function sortByScore(animeList) {
    return [...animeList].sort((a, b) => {
        return b.score - a.score;
    });
}


async function rankAnime(id, title, type) {
    return new Promise((resolve) => {
        const popup = document.getElementById('rating-popup-modal');
        const cancelBtn = document.getElementById('popup-cancel4');
        const addButton = document.getElementById('popup-rank');
        const radioList = document.getElementById('radio-list');

        let score = -1;

        popup.style.display = 'flex';
        renderRadioList();
        
        function hidePopup(successValue) {
            popup.style.display = 'none';
            
            //cancelBtn.replaceWith(cancelBtn.cloneNode(true));
            //addSelectedBtn.replaceWith(addSelectedBtn.cloneNode(true));
            
            resolve(successValue);
        }

        function renderRadioList() {
            let html = '';
            for (let i = 1; i <= 10; i++) {
                html += `
                <div style="margin-bottom: 8px; padding: 5px; border-bottom: 1px solid #eee;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="radio" name="anime-score-group" value="${i}" style="width: 18px; height: 18px;">
                        <div style="flex-grow: 1;">
                            <div style="font-weight: bold; color: #333;">${i}</div>
                        </div>
                    </label>
                </div>`;
            }
            radioList.innerHTML = html;

            radioList.querySelectorAll('input[name="anime-score-group"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    score = parseInt(e.target.value, 10);
                });
            });
        }

        const newCancelBtn = document.getElementById('popup-cancel4');

        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hidePopup(false);
        });

        addButton.addEventListener('click', async (e) => {
            e.preventDefault();
            if (score !== -1) {
                try {
                    // If you have a function to save the data:
                    await addToWatchlist(id, title, type, score);
                    //console.log(`Saved: ${title} with score ${score}`);
                    hidePopup(true);
                } catch (err) {
                    console.error("Save failed:", err);
                    alert("Could not save rating.");
                    
                }
            }
        });

        // Close on background click
        popup.onclick = (e) => {
            if (e.target === popup) hidePopup(false);
        };
    });
}

loadAllAnimeBySeason();

window.addEventListener('scroll', () => {
    scrollPosition = window.scrollY;
});

container.addEventListener('click', async (e) => {
    const linkEl = e.target.closest('.external-link');
    if (linkEl) {
        const url = linkEl.getAttribute('data-url');
        await open(url);
        return;
    }

    const btn = e.target.closest('.add-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const currentScroll = window.scrollY;

    const id = parseInt(btn.getAttribute('data-id'));
    const title = btn.getAttribute('data-title');
    const type = btn.getAttribute('data-type');
    const card = btn.closest('.anime-card');

    btn.disabled = true;
    btn.textContent = 'Adding...';

    const success = await rankAnime(id, title, type);

    if (success) {
        card.style.transition = 'opacity 0.3s';
        card.style.opacity = '0';

        setTimeout(() => {
            card.remove();
            const counterDisplay = document.getElementById('counter-display');
            if (counterDisplay) {
                const fullText = counterDisplay.textContent;

                const numberMatch = fullText.match(/\d+/);
                if (numberMatch) {
                    counterDisplay.textContent = `Number of anime: ${parseInt(numberMatch[0]) - 1}`;
                }
            }
            window.scrollTo(0, currentScroll);
        }, 300);
    } else {
        btn.disabled = false;
        btn.textContent = 'I have watched it';
    }
});

container.addEventListener('click', async (e) => {
    const linkEl = e.target.closest('.external-link');
    if (linkEl) {
        const url = linkEl.getAttribute('data-url');
        await open(url);
        return;
    }

    const btn = e.target.closest('.add-btn2');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const currentScroll = window.scrollY;

    const id = parseInt(btn.getAttribute('data-id'));
    const title = btn.getAttribute('data-title');
    const type = btn.getAttribute('data-type');
    const card = btn.closest('.anime-card');

    btn.disabled = true;
    btn.textContent = 'Adding...';

    const success = await addToNotWatchlist(id, title, type);

    if (success) {
        card.style.transition = 'opacity 0.3s';
        card.style.opacity = '0';

        setTimeout(() => {
            card.remove();
            const counterDisplay = document.getElementById('counter-display');
            if (counterDisplay) {
                const fullText = counterDisplay.textContent;

                const numberMatch = fullText.match(/\d+/);
                if (numberMatch) {
                    counterDisplay.textContent = `Number of anime: ${parseInt(numberMatch[0]) - 1}`;
                }
            }
            window.scrollTo(0, currentScroll);
        }, 300);
    } else {
        btn.disabled = false;
        btn.textContent = 'I have watched it';
    }
});

const toInsert = document.querySelector("#name-input");
const inputForm = document.querySelector("#input-form");

if (inputForm) {
    inputForm.addEventListener("submit", (e) => {
        e.preventDefault();
        insertIntoFile(toInsert.value);
        toInsert.value = '';
    });
}

function initPopup() {
    const btn = document.getElementById('show-popup-btn');
    const popup = document.getElementById('popup-modal');
    const cancelBtn = document.getElementById('popup-cancel');
    const addSelectedBtn = document.getElementById('popup-add-selected');
    const searchInput = document.getElementById('popup-search');
    const checkboxList = document.getElementById('checkbox-list');
    const selectedCountSpan = document.getElementById('selected-count');

    let allAnimeItems = [];
    let filteredItems = [];
    let selectedItems = new Set();

    function showPopup() {
        popup.style.display = 'flex';
        loadAnimeList();
        searchInput?.focus();
    }

    function hidePopup() {
        popup.style.display = 'none';
        selectedItems.clear();
        updateSelectedCount();
        if (searchInput) {
            searchInput.value = '';
        }
    }

    function loadAnimeList() {
        const watchlistCheck = allResults.map(async (anime) => {
            const inWatchlist = await isInWatchlist(anime.mal_id);
            const notinWatchlist = !inWatchlist;
            const inNotWatchlist = await isInNotWatchlist(anime.mal_id);
            const notinNotWatchlist = !inNotWatchlist;
            const toRender = notinWatchlist && notinNotWatchlist;
            return { anime, toRender};
        });

        Promise.all(watchlistCheck).then(results => {
            allAnimeItems = results
                .filter(r => !r.toRender)
                .map(r => r.anime);

            filteredItems = [...allAnimeItems];
            renderCheckboxList();
        });
    }

    function renderCheckboxList() {
        if (filteredItems.length === 0) {
            checkboxList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No anime available to add</div>';
            return;
        }

        let html = '';
        filteredItems.forEach(anime => {
            const isChecked = selectedItems.has(anime.mal_id);
            html += `
            <div style="margin-bottom: 8px; padding: 5px; border-bottom: 1px solid #eee;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <input type="checkbox" value="${anime.mal_id}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px;">
                <div style="flex-grow: 1;">
                <div style="font-weight: bold;">${anime.title}</div>
                <div style="font-weight: bold;">${anime.title_english}</div>
                <div style="font-size: 0.9em; color: #666;">${anime.type} | Score: ${anime.score || 'N/A'}</div>
                </div>
            </label>
            </div>
        `;
        });

        checkboxList.innerHTML = html;

        checkboxList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = parseInt(e.target.value);
                if (e.target.checked) {
                    selectedItems.add(id);
                } else {
                    selectedItems.delete(id);
                }
                updateSelectedCount();
            });
        });
    }

    function updateSelectedCount() {
        selectedCountSpan.textContent = `Selected: ${selectedItems.size}`;
    }

    function filterList(searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredItems = allAnimeItems.filter(anime =>
            anime.title.toLowerCase().includes(term) ||
            (anime.title_english && anime.title_english.toLowerCase().includes(term))
        );
        renderCheckboxList();
    }

    async function addSelectedToWatchlist() {
        if (selectedItems.size === 0) {
            return;
        }

        addSelectedBtn.disabled = true;
        addSelectedBtn.textContent = 'Adding...';

        for (const id of selectedItems) {
            const anime = allAnimeItems.find(a => a.mal_id === id);
            const isInWatchListOrNotWatchList = await isInWatchlist(anime.mal_id);
            if (anime) {
                if (isInWatchListOrNotWatchList) await removeFromWatchlist(anime.mal_id);
                else await removeFromNotWatchlist(anime.mal_id);
            }
        }

        addSelectedBtn.disabled = false;
        addSelectedBtn.textContent = 'Add Selected';

        hidePopup();
        await renderList(allResults);
    }

    btn.onclick = (e) => {
        e.preventDefault();
        showPopup();
    };

    cancelBtn.onclick = (e) => {
        e.preventDefault();
        hidePopup();
    };

    addSelectedBtn.onclick = (e) => {
        e.preventDefault();
        addSelectedToWatchlist();
    };

    let searchTimeout;
    searchInput.oninput = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterList(e.target.value);
        }, 300);
    };

    popup.onclick = (e) => {
        if (e.target === popup) {
            hidePopup();
        }
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popup.style.display === 'flex') {
            hidePopup();
        }
    });
}

function initPopup2() {
    const btn = document.getElementById('show-popup2-btn');
    const popup = document.getElementById('popup2-modal');
    const cancelBtn = document.getElementById('popup-cancel2');
    const addSelectedBtn = document.getElementById('popup-add-selected2');
    const searchInput = document.getElementById('popup2-search');
    const checkboxList = document.getElementById('checkbox2-list');
    const selectedCountSpan = document.getElementById('selected-count2');

    let allPhrases = [];
    let filteredPhrases = [];
    let selectedItems = new Set();

    function showPopup() {
        popup.style.display = 'flex';
        loadPhrases();
        searchInput?.focus();
    }

    function hidePopup() {
        popup.style.display = 'none';
        selectedItems.clear();
        updateSelectedCount();
        if (searchInput) {
            searchInput.value = '';
        }
    }

    async function loadPhrases() {
        try {
            const phrases = await getPhrases();
            allPhrases = phrases;
            filteredPhrases = [...allPhrases];
            renderCheckboxList();
        } catch (err) {
            console.error(err);
            checkboxList.innerHTML = '<div style="text-align: center; color: red; padding: 20px;">Error loading phrases</div>';
        }
    }

    function renderCheckboxList() {
        if (filteredPhrases.length === 0) {
            checkboxList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No phrases available</div>';
            return;
        }

        let html = '';
        filteredPhrases.forEach((phrase, index) => {
            const value = phrase.replace(/"/g, '&quot;'); // Escape quotes
            html += `
        <div style="margin-bottom: 8px; padding: 5px; border-bottom: 1px solid #eee;">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input type="checkbox" value="${value}" style="width: 18px; height: 18px;">
            <div style="flex-grow: 1;">
              <div style="font-weight: bold;">${phrase}</div>
            </div>
          </label>
        </div>
      `;
        });

        checkboxList.innerHTML = html;

        checkboxList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const phrase = e.target.value;
                if (e.target.checked) {
                    selectedItems.add(phrase);
                } else {
                    selectedItems.delete(phrase);
                }
                updateSelectedCount();
            });
        });
    }

    function updateSelectedCount() {
        selectedCountSpan.textContent = `Selected: ${selectedItems.size}`;
    }

    function filterList(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        if (term === '') {
            filteredPhrases = [...allPhrases];
        } else {
            filteredPhrases = allPhrases.filter(phrase =>
                phrase.toLowerCase().includes(term)
            );
        }
        renderCheckboxList();
    }

    async function deleteSelectedPhrases() {
        if (selectedItems.size === 0) {
            alert('Please select at least one phrase');
            return;
        }

        addSelectedBtn.disabled = true;
        addSelectedBtn.textContent = 'Deleting...';

        for (const phrase of selectedItems) {
            await deleteFromFile(phrase);
        }

        await loadPhrases();

        addSelectedBtn.disabled = false;
        addSelectedBtn.textContent = 'Delete Selected';

        hidePopup();
        await renderList(allResults);
    }

    btn.onclick = (e) => {
        e.preventDefault();
        showPopup();
    };

    cancelBtn.onclick = (e) => {
        e.preventDefault();
        hidePopup();
    };

    addSelectedBtn.onclick = (e) => {
        e.preventDefault();
        deleteSelectedPhrases();
    };

    let searchTimeout;
    searchInput.oninput = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterList(e.target.value);
        }, 300);
    };

    popup.onclick = (e) => {
        if (e.target === popup) {
            hidePopup();
        }
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popup.style.display === 'flex') {
            hidePopup();
        }
    });
}

function initPopup3() {
    const btn = document.getElementById('show-popup3-btn');
    const popup = document.getElementById('popup3-modal');
    const cancelBtn = document.getElementById('popup-cancel3');
    const addSelectedBtn = document.getElementById('popup-add-selected3');
    const checkboxList = document.getElementById('checkbox3-list');
    const checkboxList2 = document.getElementById('checkbox4-list');
    let selectedItems = new Set();
    let settingsMap = new Map();
    let settingsMap2 = new Map();

    async function showPopup() {
        popup.style.display = 'flex';
        await loadSettingList();
        await loadSettingList2();
    }

    function hidePopup() {
        popup.style.display = 'none';
        selectedItems.clear();
    }

    async function loadSettingList() {
        const settings = await getSettings();
        settingsMap = settings;
        if (settingsMap.size === 0) {
            checkboxList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No settings available</div>';
            return;
        }
        let html = '';
        settingsMap.forEach((value, key) => {
            const isChecked = value === "1" || value === 1 || value === true || value === "true";
            html += `
        <div style="margin-bottom: 8px; padding: 5px; border-bottom: 1px solid #eee;">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input type="checkbox" value="${key}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px;">
            <div style="flex-grow: 1;">
              <div style="font-weight: bold;">${key}</div>
            </div>
          </label>
        </div>
      `;
        });

        checkboxList.innerHTML = html;

        checkboxList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                // alert("AAA");
                const key = e.target.value;
                const isChecked = e.target.checked + 0;

                settingsMap.set(key, isChecked);
                // settingsMap.forEach((value, key) => {alert("value: " + value + ", key:" + key)});
            });
        });
    }

    async function loadSettingList2() {
        const settings2 = await getSettings2();
        settingsMap2 = settings2;
        if (settingsMap2.size === 0) {
            checkboxList2.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No settings available</div>';
            return;
        }

        let html = '';
        settingsMap2.forEach((value, key) => {
            const isChecked = value === "1" || value === 1 || value === true || value === "true";
            html += `
        <div style="margin-bottom: 8px; padding: 5px; border-bottom: 1px solid #eee;">
          <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input type="checkbox" value="${key}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px;">
            <div style="flex-grow: 1;">
              <div style="font-weight: bold;">${key}</div>
            </div>
          </label>
        </div>
      `;
        });


        checkboxList2.innerHTML = html;

        checkboxList2.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const key = e.target.value;
                const isChecked = e.target.checked + 0;

                settingsMap2.set(key, isChecked);
                //settingsMap.forEach((value, key) => {alert("value: " + value + ", key:" + key)});
            });
        });
    }

    async function addSelectedToWatchlist() {
        let settings = "";
        settingsMap.forEach((value, key) => {
            settings += `${key} = ${value}\n`;
        });
        await fs.writeTextFile(SETTINGS_PATH_AIR, settings);

        settings = "";
        settingsMap2.forEach((value, key) => {
            settings += `${key} = ${value}\n`;
        });
        await fs.writeTextFile(SETTINGS_PATH_TYPE, settings);

        addSelectedBtn.disabled = false;
        addSelectedBtn.textContent = 'Change settings';

        hidePopup();
        await renderList(allResults);
    }

    btn.onclick = (e) => {
        e.preventDefault();
        showPopup();
    };

    cancelBtn.onclick = (e) => {
        e.preventDefault();
        hidePopup();
    };

    addSelectedBtn.onclick = (e) => {
        e.preventDefault();
        addSelectedToWatchlist();
    };

    popup.onclick = (e) => {
        if (e.target === popup) {
            hidePopup();
        }
    };

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popup.style.display === 'flex') {
            hidePopup();
        }
    });
}

function hardReset() {
    const btn = document.getElementById('hard-reset-btn');

    btn.onclick = async () => {

        allResults = [];
        originalResults = [];
        currentSearchTerm = '';

        appLaunched = false;

        const searchInput = document.getElementById('main-search');
        searchInput.value = '';

        changeVisibility('none');

        showLoading();


        await loadAllAnime();

        changeVisibility('flex');
    };
}

function initMainSearch() {
    const searchInput = document.getElementById('main-search');
    const clearButton = document.getElementById('clear-search');

    if (!searchInput) return;

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearchTerm = e.target.value;
            renderList(originalResults, true);
        }, 300);
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchTerm = '';
        renderList(originalResults, true);
        searchInput.focus();
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            currentSearchTerm = searchInput.value;
            renderList(originalResults, true);
        }
    });
}

async function loadTopAnime() {
    const maxPages = 10;
    let page = 1;
    let pageLen = 25;
    let hasNextPage = true;
    let allPageResults = [];

    while (hasNextPage && page <= maxPages) {
        try {
            const response = await fetch(`https://api.jikan.moe/v4/top/anime?page=${page}&limit=25`);
            const data = await response.json();

            const results = data.data || [];

            for (let j = 0; j < results.length; j++) {
                const anime = pickAttributes(results[j]);
                allPageResults.push(anime);
            }

            hasNextPage = data.pagination?.has_next_page === true;

            if (results.length < pageLen) {
                hasNextPage = false;
            }

            page++;

            const currDelay = Math.max(delay - (Date.now() - currTime), 10);
            await new Promise(resolve => setTimeout(resolve, currDelay));
            currTime = Date.now();

        } catch (error) {
            alert(`❌ Error on page ${page}: ${error.message}`);
            hasNextPage = false;
        }
    }
    return allPageResults;
}

function ShowAnime() {
    const btn = document.getElementById('show-anime');

    btn.onclick = async () => {
        if(currentlyShown === 'anime'){
            return;
        }
        container.innerHTML = ' ';
        changeVisibility('none');
        currentlyShown = 'anime';
        await renderList(allResults);
        changeVisibility('flex');
    };
}

function ShowRecommendations() {
    const btn = document.getElementById('show-recommendations');
    const searchInput = document.getElementById('main-search');

    btn.onclick = async () => {
        if(currentlyShown === 'recommendations'){
            return;
        }
        currentlyShown = 'recommendations';
        searchInput.value = '';
        currentSearchTerm = '';
        container.innerHTML = '';
        gotRecommendations = true;
        changeVisibility('none');
        await runRecommendations();
        //console.log(modelList)
        //for (const elem of modelList) alert(elem.mal_id);
        //container.innerHTML = '';
        await renderList(modelList, false, true);
        //console.log("SDSFSDFSDF", document.getElementById('anime-container').innerHTML);
        changeVisibilitySwitch('flex');
    };
}

initPopup();
initPopup2();
initPopup3();
hardReset();
ShowAnime();
ShowRecommendations();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainSearch);
} else {
    initMainSearch();
}
