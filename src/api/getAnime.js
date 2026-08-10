import { pickAttributes } from "../config/constants.js";
import { getPhrases } from "../services/files.js";
import { changeVisibility, showLoading } from "../ui/loading.js";
import { waitRateLimit } from '../utils/rateLimit.js';

async function tauriFetch(url, options = {}) {
    return await window.__TAURI__.http.fetch(url, {
        method: options.method || "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            ...(options.headers || {})
        },
        body: options.body
    });
}

export async function getSingleAnime(animeId) {
    let allPageResults = [];
    const phrases = await getPhrases();

    try {
        const response = await tauriFetch(`https://api.tenrai.org/v1/anime/${animeId}`);
        const data = await response.json();

        const anime = pickAttributes(data.data);
        if (!anime) {
            alert(`No data found for anime ID: ${animeId}`);
            return null;
        }
        let currPhrases = [];
        const title = anime.title?.toLowerCase() || '';
        const englishTitle = anime.title_english?.toLowerCase() || '';
        let c = 0;
        for (const phraseUnchanged of phrases) {
            const phrase = phraseUnchanged.toLowerCase();
            if (title.includes(phrase) || englishTitle.includes(phrase)) {
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

        await waitRateLimit();
        return anime;
    } catch (error) {
        console.error('Full error:', error);
        console.error('Type:', typeof error);

        if (error instanceof Error) {
            console.error('Message:', error.message);
            console.error('Stack:', error.stack);
        }

        console.error('Stringified:', JSON.stringify(error, null, 2));
    }
}

export async function getSeasonalAnime(searchPhrase) {
    const maxPages = 50;
    let page = 1;
    let pageLen = 25;
    let hasNextPage = true;
    let allPageResults = [];

    const phrases = await getPhrases();

    while (hasNextPage && page <= maxPages) {
        try {
            const url = `https://api.tenrai.org/v1/${searchPhrase}page=${page}`;
            const response = await tauriFetch(url);
            const data = await response.json();
            const results = data.data || [];

            for (let j = 0; j < results.length; j++) {
                const anime = pickAttributes(results[j]);
                const title = anime.title?.toLowerCase() || '';
                const englishTitle = anime.title_english?.toLowerCase() || '';
                let currPhrases = [];
                for (const phraseUnchanged of phrases) {
                    const phrase = phraseUnchanged.toLowerCase();
                    if (title.includes(phrase) || englishTitle.includes(phrase)) {
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

            await waitRateLimit();

        } catch (error) {
            console.error(`❌ Error on page ${page}: ${error.message}`);
            hasNextPage = false;
        }
    }
    return allPageResults;
}

export async function addSingleAnime(name) {
    const maxPages = 10;
    const searchTerm = name.toLowerCase();

    let page = 1;
    let hasNextPage = true;
    let allPageResults = [];

    while (hasNextPage && page <= maxPages) {
        try {
            const url = `https://api.tenrai.org/v1/anime?q=${encodeURIComponent(searchTerm)}&page=${page}`;
            const response = await tauriFetch(url);
            const data = await response.json();

            const resultsWithDuplicates = data.data || [];
            const resultsMap = new Map();

            resultsWithDuplicates.forEach(anime => {
                if (!resultsMap.has(anime.mal_id)) {
                    resultsMap.set(anime.mal_id, anime);
                }
            });

            const results = Array.from(resultsMap.values());
            for (let j = 0; j < results.length; j++) {
            
                const anime = pickAttributes(results[j]);

                const title = anime.title?.toLowerCase() || '';
                //alert(j + ": " + title + " " + anime.mal_id);
                const englishTitle = anime.title_english?.toLowerCase() || '';

                if (title.includes(searchTerm) || englishTitle.includes(searchTerm)) {
                    anime.phrases = searchTerm;
                    allPageResults.push(anime);
                }
            }

            hasNextPage = data.pagination?.has_next_page === true;

            page++;

            await waitRateLimit();

        } catch (error) {
            alert(`❌ Error on page ${page}: ${error.message}`);
            hasNextPage = false;
        }
    }
    return allPageResults;
}

export async function loadAllAnime() {
    showLoading();
    changeVisibility('none');
    var animeTitles = await getPhrases();
    let allResults = []

    for (let i = 0; i < animeTitles.length; i++) {
        try {
            let a = await addSingleAnime(animeTitles[i]);
            
            for(const elem of a){
                allResults.push(elem);
            }

        } catch (error) {
            console.error(`Error with ${animeTitles[i]}:`, error);
        }
    }
    return allResults
}

export async function mergeAnime(results, allResults, originalResults){
    for (let j = 0; j < results.length; j++) {
        const anime = pickAttributes(results[j]);
        const existingAnime = allResults.find(a => a.mal_id === anime.mal_id);

        if (existingAnime) {
            existingAnime.phrases = existingAnime.phrases || [];
            existingAnime.phrases.push(anime.phrases);
        } else {
            anime.phrases = [anime.phrases];
            allResults.push(anime);
            originalResults.push(anime);
        }
    }
    return {allResults, originalResults}
}


export async function getAnimeEpisodes(animeId) {
    try {
        const response = await tauriFetch(`https://api.tenrai.org/v1/anime/${animeId}/episodes`);

        await waitRateLimit();
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const payload = await response.json();
        
        return payload.data; 
    } catch (error) {
        console.error(`Failed to fetch episodes for MAL ID ${animeId}:`, error);
        return [];
    }
}