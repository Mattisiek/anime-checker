import { getSeasonalAnime, getSingleAnime } from "../api/getAnime.js";
import { getCachelist, getSeason, writeToCache, setSeason, removeFromWatchlist, removeFromNotWatchlist } from "./files.js";
import { initFiles } from "./initFiles.js";
import { allResults, originalResults } from "../main.js";
import { renderList } from "../ui/animeList.js";
import { showLoading, changeVisibility, changeVisibilitySwitch } from "../ui/loading.js";
import { runRecommendations } from "../ml/initMLModel.js";

const container = document.getElementById('anime-container');
export var modelList = [];
var currentlyShown = 'anime';

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

export async function loadAllAnimeBySeason() {
    showLoading();

    changeVisibility('none');

    await initFiles();

    modelList = await runRecommendations();
    // allResultsRecommendations = await loadTopAnime();
    const savedSeason = await getSeason();
    const prevSeason = getPreviousSeason(savedSeason[0], savedSeason[1]);
    prevSeason.year = savedSeason[0];
    prevSeason.season = savedSeason[1];
    const currSeason = getCurrentMALSeason();
    if (currSeason.year !== savedSeason[0] || currSeason.season !== savedSeason[1]) {
        setSeason(currSeason)
    }

    let t = -1;
    let isIn;
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
    let isInResult;
    let cachedAnimeToAdd;

    for (const cachedAnime of cacheList) {
        isInResult = false;
        let rememberedStatus;
        for (const anime of allResults) {
            if (cachedAnime.title === anime.title) {
                isInResult = true;
                rememberedStatus = anime.status;
            }
        }
        if (!isInResult) {
            if (cachedAnime.status === 'Currently Airing') {
                cachedAnimeToAdd = await getSingleAnime(cachedAnime.mal_id);
                if (cachedAnimeToAdd) {
                    allResults.push(cachedAnimeToAdd);
                    originalResults.push(cachedAnimeToAdd);
                }
                else {
                    allResults.push(cachedAnime);
                    originalResults.push(cachedAnime);
                }
            }
            else {
                cachedAnimeToAdd = cachedAnime;
                allResults.push(cachedAnimeToAdd);
                originalResults.push(cachedAnimeToAdd);
            }
        }
        else if(rememberedStatus === "Finished Airing" && cachedAnime.status !== "Finished Airing"){
            removeFromWatchlist(cachedAnime.mal_id);
            removeFromNotWatchlist(cachedAnime.mal_id);
        }
    }

    await writeToCache(allResults);
    await renderList(allResults);
    changeVisibility('flex');
}

export function getCurrentMALSeason() {
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

export function ShowAnime() {
    const btn = document.getElementById('show-anime');

    btn.onclick = async () => {
        if (currentlyShown === 'anime') {
            return;
        }
        container.innerHTML = ' ';
        changeVisibility('none');
        currentlyShown = 'anime';
        await renderList(allResults);
        changeVisibility('flex');
    };
}

export function ShowRecommendations() {
    const btn = document.getElementById('show-recommendations');
    const searchInput = document.getElementById('main-search');

    btn.onclick = async () => {
        if (currentlyShown === 'recommendations') {
            return;
        }
        currentlyShown = 'recommendations';
        searchInput.value = '';
        container.innerHTML = '';
        changeVisibility('none');
        modelList = await runRecommendations();
        //console.log(modelList)
        //for (const elem of modelList) alert(elem.mal_id);
        //container.innerHTML = '';
        await renderList(modelList, true);
        changeVisibilitySwitch('flex');
    };
}
