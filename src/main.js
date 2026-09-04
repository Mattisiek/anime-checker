const { open } = window.__TAURI__.opener;
const { getCurrentWebview } = window.__TAURI__.webview;

import { addToNotWatchlist, insertIntoFile } from "./services/files.js";
import { rankAnime } from "./ui/animeList.js";
import { initPopup, initPopup2, initPopup3 } from "./ui/popups.js";
import { loadAllAnimeBySeason, ShowAnime, ShowRecommendations } from "./services/animeService.js";
import { hardReset, initMainSearch } from "./services/additionalFeatures.js";
import { initPaths } from "./config/paths.js";

export var originalResults = [];
export var allResults = [];
//var allResultsRecommendations = [];
const container = document.getElementById('anime-container');
const toInsert = document.querySelector("#name-input");
const inputForm = document.querySelector("#input-form");
const hardResetBtn = document.getElementById('hard-reset-btn');

getCurrentWebview().clearAllBrowsingData();

window.onerror = function (msg, url, line) {
    alert("Error: " + msg + " at line " + line);
    return false;
};

container.addEventListener('click', async (e) => {
    const linkEl = e.target.closest('.devernal-link');
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
    const english_title = btn.getAttribute('data-english_title');
    const type = btn.getAttribute('data-type');
    const card = btn.closest('.anime-card');

    btn.disabled = true;
    btn.textContent = 'Adding...';

    const success = await rankAnime(id, title, english_title, type);

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
    const linkEl = e.target.closest('.devernal-link');
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
    const english_title = btn.getAttribute('data-english_title');
    const type = btn.getAttribute('data-type');
    const card = btn.closest('.anime-card');

    btn.disabled = true;
    btn.textContent = 'Adding...';

    const success = await addToNotWatchlist(id, title, english_title, type);

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

if (inputForm) {
    inputForm.addEventListener("submit", (e) => {
        e.preventDefault();
        insertIntoFile(toInsert.value);
        toInsert.value = '';
    });
}

hardResetBtn.addEventListener('click', async () => {
    const updatedData = await hardReset();
    
    allResults = updatedData.allResults;
    originalResults = updatedData.originalResults;
});

await initPaths();
loadAllAnimeBySeason();
initPopup();
initPopup2();
initPopup3();
ShowAnime();
ShowRecommendations();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainSearch);
} else {
    initMainSearch();
}
