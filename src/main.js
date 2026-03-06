const { invoke } = window.__TAURI__.core;
const { fs, path } = window.__TAURI__;
const { open } = window.__TAURI__.opener;
const { appDataDir, join } = window.__TAURI__.path;
const { mkdir } = window.__TAURI__.fs;

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
const PHRASES_PATH = await join(appDataPath, 'phrases.txt');
const SETTINGS_PATH_AIR = await join(appDataPath, 'settings.txt');
const SETTINGS_PATH_TYPE = await join(appDataPath, 'settings2.txt');
const CACHE_PATH = await join(appDataPath, 'cache.json');
const SEASON_PATH = await join(appDataPath, 'season.txt');

var delay = 1001;
var currTime = Date.now();
const typeOfAnime = ['TV', 'Movie', 'ONA', 'OVA', 'Special', 'TV Special', 'CM', 'PV', 'Music', 'null'];
const typeOfAiring = ['Finished Airing', 'Currently Airing', 'Not yet aired'];

var originalResults = [];
var currentSearchTerm = '';
var allResults = [];
let appLaunched = false;

let scrollPosition = 0;

const container = document.getElementById('anime-container');

async function initFiles() {
    try {
        try {
            await fs.readTextFile(WATCHLIST_PATH);
        } catch {
            await fs.writeTextFile(WATCHLIST_PATH, '[]');
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

await initFiles();

async function getPhrases() {
    const content = await fs.readTextFile(PHRASES_PATH);

    return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

async function getWatchlist() {
    const content = await fs.readTextFile(WATCHLIST_PATH);
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

async function addToWatchlist(anime_id, anime_title, anime_type) {
    try {
        const watchlist = await getWatchlist();

        const exists = watchlist.some(item => item.mal_id === anime_id);

        if (!exists) {
            watchlist.push({
                mal_id: anime_id,
                title: anime_title,
                type: anime_type,
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

async function writeToCache(l) {
    try {
        //await fs.writeTextFile(CACHE_PATH, JSON.stringify(l, ['mal_id', 'title', 'title_english', 'score', 'type', 'status', 'aired', 'episodes', 'count', 'images'], 2));
        await fs.writeTextFile(CACHE_PATH, JSON.stringify(l, null, 2));
    } catch (error) {
        alert('Error adding to cache:', error);
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

async function isInWatchlist(mal_id) {
    try {
        const watchlist = await getWatchlist();
        return watchlist.some(item => item.mal_id === mal_id);
    } catch (error) {
        console.error('Error checking watchlist:', error);
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
                const anime = results[j];

                const title = anime.title?.toLowerCase() || '';
                //alert(j + ": " + title + " " + anime.mal_id);
                const englishTitle = anime.title_english?.toLowerCase() || '';

                if (title.includes(searchTerm) || englishTitle.includes(searchTerm)) {
                    const existingAnime = allResults.find(a => a.mal_id === anime.mal_id);

                    if (existingAnime) {
                        existingAnime.count = (existingAnime.count || 1) + 1;
                    } else {
                        anime.count = 1;
                        allResults.push(anime);
                        originalResults.push(anime);
                    }
                    currentRes++;
                }
            }

            hasNextPage = data.pagination?.has_next_page === true;

            if (results.length < pageLen) {
                hasNextPage = false;
            }

            page++;

            if (hasNextPage) {
                const currDelay = Math.max(delay - (Date.now() - currTime), 10);
                // alert(currDelay);
                await new Promise(resolve => setTimeout(resolve, currDelay));
                currTime = Date.now();
            }

        } catch (error) {
            alert(`❌ Error on page ${page}: ${error.message}`);
            hasNextPage = false;
        }
        if (currentRes === 0) {
            break;
        }
    }
    return allPageResults;
}

async function insertIntoFile(name) {
    try {
        const current = await fs.readTextFile(PHRASES_PATH);
        const updated = current.trim() + (current.trim() ? '\n' : '') + name;

        const postLoadControls = document.getElementById('main-search-container');
        const popupButton = document.getElementById('show-popup-btn');
        const popupButton2 = document.getElementById('show-popup2-btn');
        const popupButton3 = document.getElementById('show-popup3-btn');
        const hardResetButton = document.getElementById('hard-reset-btn');
        const inputForm = document.getElementById('input-form');
        const counterDisplay = document.getElementById('counter-display');

        container.innerHTML = 'Loading...';

        postLoadControls.style.display = 'none';

        popupButton.style.display = 'none';
        popupButton2.style.display = 'none';
        popupButton3.style.display = 'none';
        hardResetButton.style.display = 'none';
        inputForm.style.display = 'none';
        counterDisplay.style.display = 'none';

        await addSingleAnime(name);

        await fs.writeTextFile(PHRASES_PATH, updated);

        postLoadControls.style.display = 'flex';

        popupButton.style.display = 'flex';
        popupButton2.style.display = 'flex';
        popupButton3.style.display = 'flex';
        hardResetButton.style.display = 'flex';
        inputForm.style.display = 'flex';
        counterDisplay.style.display = 'flex';

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
            const title = anime.title?.toLowerCase() || '';
            const englishTitle = anime.title_english?.toLowerCase() || '';

            if (title.includes(searchTerm) || englishTitle.includes(searchTerm)) {
                let matches = 0;
                if (title.includes(searchTerm) || englishTitle.includes(searchTerm)) matches++;

                if (anime.count !== undefined) {
                    anime.count = Math.max(0, anime.count - matches);
                }
            }
        });

        allResults = allResults.filter(anime => anime.count > 0);
        originalResults = originalResults.filter(anime => anime.count > 0);


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

async function getSeasonalAnime(year, season) {
    const maxPages = 20;
    let page = 1;
    let pageLen = 25;
    let hasNextPage = true;
    let allPageResults = [];

    const phrases = await getPhrases();

    while (hasNextPage && page <= maxPages) {
        try {
            let url;
            if (year === 'upcoming' || year === 'now') {
                url = `https://api.jikan.moe/v4/seasons/${year}?page=${page}`;
            }
            else {
                url = `https://api.jikan.moe/v4/seasons/${year}/${season}?page=${page}`;
            }
            const response = await fetch(url);
            const data = await response.json();

            const results = data.data || [];

            for (let j = 0; j < results.length; j++) {
                const anime = results[j];
                const title = anime.title?.toLowerCase() || '';
                const englishTitle = anime.title_english?.toLowerCase() || '';
                let c = 0;
                for (const phraseUnchanged of phrases) {
                    const phrase = phraseUnchanged.toLowerCase();
                    if (title.includes(phrase) || englishTitle.includes(phrase)) {
                        c += 1;
                    }
                }
                const existingAnime = allPageResults.find(a => a.mal_id === anime.mal_id);
                if (c > 0) {
                    if (existingAnime) {
                        existingAnime.count = existingAnime.count + c;
                    } else {
                        anime.count = c;
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

    container.innerHTML = 'Loading...';

    const postLoadControls = document.getElementById('main-search-container');
    const popupButton = document.getElementById('show-popup-btn');
    const popupButton2 = document.getElementById('show-popup2-btn');
    const popupButton3 = document.getElementById('show-popup3-btn');
    const hardResetButton = document.getElementById('hard-reset-btn');
    const inputForm = document.getElementById('input-form');
    const counterDisplay = document.getElementById('counter-display');

    postLoadControls.style.display = 'none';

    popupButton.style.display = 'none';
    popupButton2.style.display = 'none';
    popupButton3.style.display = 'none';
    hardResetButton.style.display = 'none';
    inputForm.style.display = 'none';
    counterDisplay.style.display = 'none';

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

async function loadAllAnimeBySeason() {
    if (appLaunched) return;
    appLaunched = true;

    container.innerHTML = 'Loading...';

    const postLoadControls = document.getElementById('main-search-container');
    const popupButton = document.getElementById('show-popup-btn');
    const popupButton2 = document.getElementById('show-popup2-btn');
    const popupButton3 = document.getElementById('show-popup3-btn');
    const hardResetButton = document.getElementById('hard-reset-btn');
    const inputForm = document.getElementById('input-form');
    const counterDisplay = document.getElementById('counter-display');

    postLoadControls.style.display = 'none';

    popupButton.style.display = 'none';
    popupButton2.style.display = 'none';
    popupButton3.style.display = 'none';
    hardResetButton.style.display = 'none';
    inputForm.style.display = 'none';
    counterDisplay.style.display = 'none';

    const savedSeason = await getSeason();
    const prevSeason = getPreviousSeason(savedSeason[0], savedSeason[1]);
    prevSeason.year = savedSeason[0];
    prevSeason.season = savedSeason[1];
    const currSeason = getCurrentMALSeason();

    let currRes = [];
    let t = -1;
    let isIn = false;
    for (let year = Number(prevSeason.year); year <= Number(currSeason.year); year++) {
        for (let season of ['winter', 'spring', 'summer', 'fall']) {
            if (t === -1 && prevSeason.season === season) t = 0;
            if (t === 0) {
                //alert(year + " " + season);
                const a = await getSeasonalAnime(year, season);
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
    //alert("upcoming");
    const seasonalAnime = await getSeasonalAnime('upcoming', '');
    for (const animeA of seasonalAnime) {
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

    for (const cachedAnime of cacheList) {
        isInResult = false;
        for (const anime of allResults) {
            if (cachedAnime.title === anime.title) {
                isInResult = true;
            }
        }
        if (!isInResult) {
            allResults.push(cachedAnime);
            originalResults.push(cachedAnime);
        }
    }

    postLoadControls.style.display = 'flex';

    popupButton.style.display = 'flex';
    popupButton2.style.display = 'flex';
    popupButton3.style.display = 'flex';
    hardResetButton.style.display = 'flex';
    inputForm.style.display = 'flex';
    counterDisplay.style.display = 'flex';

    await writeToCache(allResults);
    await renderList(allResults);
}

function countDuplicates(animeList) {
    const uniqueMap = new Map();

    animeList.forEach(anime => {
        const id = anime.mal_id;
        if (!uniqueMap.has(id)) {
            anime.count = anime.count || 1;
            uniqueMap.set(id, anime);
        }
    });

    return Array.from(uniqueMap.values());
}

function removeDuplicates(animeList) {
    const uniqueMap = new Map();

    animeList.forEach(anime => {
        if (!uniqueMap.has(anime.mal_id)) {
            uniqueMap.set(anime.mal_id, anime);
        }
    });

    return Array.from(uniqueMap.values());
}

function sortByReleaseDate(animeList) {
    return [...animeList].sort((a, b) => {

        const hasDateA = a.aired?.from != null;
        const hasDateB = b.aired?.from != null;

        if (hasDateA && !hasDateB) return -1;
        if (!hasDateA && hasDateB) return 1;
        if (!hasDateA && !hasDateB) return a.title.localeCompare(b.title);

        const dateA = a.aired?.to ? new Date(a.aired.to) : new Date(a.aired.from);
        const dateB = b.aired?.to ? new Date(b.aired.to) : new Date(b.aired.from);

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

        return dateA - dateB;
    });
}

async function renderList(list, preserveOriginal = false) {
    if (!preserveOriginal && originalResults.length === 0) {
        originalResults = [...list];
    }

    let listToRender = list;

    if (currentSearchTerm && currentSearchTerm.trim() !== '') {
        const term = currentSearchTerm.toLowerCase().trim();
        listToRender = listToRender.filter(anime =>
            (anime.title && anime.title.toLowerCase().includes(term)) ||
            (anime.title_english && anime.title_english.toLowerCase().includes(term))
        );
    }

    let mapToRender = countDuplicates(listToRender);
    mapToRender = sortByReleaseDate(mapToRender, 'asc');

    const watchlist = await getWatchlist();
    const settings = await getSettings();
    const settings2 = await getSettings2();
    const watchedIds = new Set(watchlist.map(item => item.mal_id));

    let tempList = [];

    for (let i = 0; i < mapToRender.length; i++) {
        const anime = mapToRender[i];

        if (watchedIds.has(anime.mal_id)) continue;
        if (settings.get(anime.status) === '0') continue;
        if (settings.get(anime.status) === undefined) alert("undefined status: " + anime.status);
        const typeKey = anime.type === null ? "null" : anime.type;
        if (settings2.get(typeKey) === '0') {
            continue;
        }
        // else alert(anime.title + " " +  anime.type + " " + settings2.get(anime.type));
        if (anime.type !== null && settings2.get(typeKey) === undefined) alert("undefined type: " + typeKey + ' in anime: ' + anime.title);

        if (anime.count !== 0) {
            tempList.push(anime);
        }
        //alert("Anime count = 0: " + anime.title);
    }

    const counterDisplay = document.getElementById('counter-display');
    if (counterDisplay) {
        counterDisplay.textContent = `Number of anime: ${tempList.length}`;
    }

    container.innerHTML = '';
    let tempHTMLcontent = '';

    for (let i = 0; i < tempList.length; i++) {
        const anime = tempList[i];
        if (anime.count === 0) {
            continue;
        }

        let airDateHtml = '';
        let scoreHtml = '';
        let nameHtml = '';
        let typeHtml = '';
        let episodesHtml = '';
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
        else if (anime.status === "Not yet aired") {
            airDateHtml = ``;
        }
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
        else {
            nameHtml = `<h3>${anime.title}</h3><h3>${anime.title_english}</h3>`;
        }

        if (anime.episodes !== null) {
            episodesHtml = `<p>Episodes: ${anime.episodes}</p>`;
        }

        else {
            nameHtml = `<h3>${anime.title}</h3>
                  <h3>${anime.title_english}</h3>`;

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
        <p>Count: ${anime.count}</p>
        <p>
          <a href="#" 
            onclick="event.preventDefault(); window.__TAURI__.opener.openUrl('${anime.url}');" 
            style="color: #4CAF50; cursor: pointer; text-decoration: underline;">
            View on MyAnimeList →
          </a>
        </p>
        <button 
          type="button"
          class="add-btn" 
          data-id="${anime.mal_id}" 
          data-title="${anime.title.replace(/"/g, '&quot;')}" 
          data-type="${anime.type}">
          I have watched it
        </button>
      </div>
    `;
    }
    container.innerHTML = tempHTMLcontent;
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

    const success = await addToWatchlist(id, title, type);

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
        alert('This anime is already in your watchlist!');
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
            return { anime, notinWatchlist };
        });

        Promise.all(watchlistCheck).then(results => {
            allAnimeItems = results
                .filter(r => !r.notinWatchlist)
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
            if (anime) {
                await removeFromWatchlist(anime.mal_id);
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
        if (searchInput) {
            searchInput.value = '';
        }

        const postLoadControls = document.getElementById('main-search-container');
        const popupButton = document.getElementById('show-popup-btn');
        const popupButton2 = document.getElementById('show-popup2-btn');
        const popupButton3 = document.getElementById('show-popup3-btn');
        const hardResetButton = document.getElementById('hard-reset-btn');
        const inputForm = document.getElementById('input-form');
        const counterDisplay = document.getElementById('counter-display');

        if (postLoadControls) postLoadControls.style.display = 'none';

        popupButton.style.display = 'none';
        popupButton2.style.display = 'none';
        popupButton3.style.display = 'none';
        hardResetButton.style.display = 'none';
        inputForm.style.display = 'none';

        const container = document.getElementById('anime-container');
        if (container) {
            container.innerHTML = 'Loading...';
        }

        await loadAllAnime();
        postLoadControls.style.display = 'flex';

        popupButton.style.display = 'flex';
        popupButton2.style.display = 'flex';
        popupButton3.style.display = 'flex';
        hardResetButton.style.display = 'flex';
        inputForm.style.display = 'flex';
        counterDisplay.style.display = 'flex';
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

initPopup();
initPopup2();
initPopup3();
hardReset();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainSearch);
} else {
    initMainSearch();
}


