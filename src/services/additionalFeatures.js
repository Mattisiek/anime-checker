import { loadAllAnime } from "../api/getAnime.js";
import { writeToCache } from "./files.js";
import { renderList } from "../ui/animeList.js";
import { changeVisibility, showLoading } from "../ui/loading.js";
import { originalResults } from "../main.js";

export async function hardReset() {

    document.getElementById('main-search').value = '';

    document.getElementById('main-search').value = '';

    changeVisibility('none');
    showLoading();

    let allResults = await loadAllAnime();
    let originalResults = [...allResults];

    await writeToCache(allResults);
    await renderList(allResults);

    changeVisibility('flex');
    return { allResults, originalResults };
}

export function initMainSearch() {
    const searchInput = document.getElementById('main-search');
    const clearButton = document.getElementById('clear-search');

    if (!searchInput) return;

    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderList(originalResults);
        }, 300);
    });

    clearButton.addEventListener('click', () => {
        searchInput.value = '';

        document.getElementById('main-search').value = '';
        renderList(originalResults);
        searchInput.focus();
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            renderList(originalResults);
        }
    });
}

