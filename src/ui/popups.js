const { fs } = window.__TAURI__;

import { renderList } from "./animeList.js";
import { SETTINGS_PATH_AIR, SETTINGS_PATH_TYPE } from "../config/paths.js";
import { allResults } from "../main.js";
import { deleteFromFile } from "../services/files.js";
import { getWatchlist, getNotWatchlist, isInWatchlist, isInNotWatchlist, removeFromWatchlist, removeFromNotWatchlist, getPhrases, getSettings, getSettings2 } from "../services/files.js";

export function initPopup() {
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

    async function loadAnimeList() {
        const [watchlist, notwatchlist] = await Promise.all([
            getWatchlist(),
            getNotWatchlist()
        ]);
        allAnimeItems = [...watchlist, ...notwatchlist];
        filteredItems = [...watchlist, ...notwatchlist];
        renderCheckboxList();
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
                <div style="font-weight: bold;">${anime.english_title}</div>
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
        filteredItems = allAnimeItems.filter(anime => anime.title.toLowerCase().includes(term) ||
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
                const isInWatchList = await isInWatchlist(anime.mal_id);
                const isInNotWatchList = await isInNotWatchlist(anime.mal_id);
                if (isInWatchList) await removeFromWatchlist(anime.mal_id);
                if (isInNotWatchList) await removeFromNotWatchlist(anime.mal_id);
            }
        }

        await loadAnimeList();

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

export function initPopup2() {
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
        filteredPhrases.forEach((phrase) => {
            const value = phrase.replace(/"/g, '&quot;');
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
            filteredPhrases = allPhrases.filter(phrase => phrase.toLowerCase().includes(term)
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

export function initPopup3() {
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
