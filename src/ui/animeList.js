import { getSettings, getSettings2, getWatchlist, getNotWatchlist, removeFromWatchlist, addToWatchlist } from "../services/files.js";

const container = document.getElementById('anime-container');

export async function renderList(list, recomendations = false) {

    const currentSearchTerm = document.getElementById('main-search').value;

    let listToRender = list;

    if (!recomendations && currentSearchTerm && currentSearchTerm.trim() !== '') {
        const term = currentSearchTerm.toLowerCase().trim();
        listToRender = listToRender.filter(anime => (anime.title && anime.title.toLowerCase().includes(term)) ||
            (anime.title_english && anime.title_english.toLowerCase().includes(term))
        );
    }

    listToRender = recomendations ? sortByScore(listToRender) : sortByReleaseDate(listToRender);
    //const watchlist = await getWatchlist();
    //const notwatchlist = await getNotWatchlist();
    const settings = await getSettings();
    const settings2 = await getSettings2();
    const watchlist = await getWatchlist();
    const notwatchlist = await getNotWatchlist();
    const watchedIds = new Set(watchlist.map(item => item.mal_id));
    const watchedIds2 = new Set(notwatchlist.map(item => item.mal_id));
    const watchedIdsWithNoScore = new Set(
        watchlist
            .filter(item => item.score === undefined || item.score === null || String(item.score).toLowerCase() === "unknown")
            .map(item => item.mal_id)
    );

    let tempList = [];
    for (let i = 0; i < listToRender.length; i++) {
        const anime = listToRender[i];


        if (watchedIds.has(anime.mal_id) && watchedIdsWithNoScore.has(anime.mal_id)) {
            await removeFromWatchlist(anime.mal_id);
            watchedIds.delete(anime.mal_id);
        }

        if (watchedIds.has(anime.mal_id)) continue;
        if (watchedIds2.has(anime.mal_id)) continue;
        if (!recomendations) {
            const statusKey = anime.status ? String(anime.status).trim() : "Unknown";
            if (settings.get(statusKey) === '0') continue;
            if (settings.get(statusKey) === undefined) {
                console.warn("Niezdefiniowany status w ustawieniach: " + statusKey);
            }

            let typeKey;
            if (anime.type && anime.type !== null && String(anime.type).toLowerCase() !== "unknown") {
                typeKey = String(anime.type).trim();
            } else {
                typeKey = "Unknown";
            }

            if (settings2.get(typeKey) === '0') {
                continue;
            }

            if (typeKey !== "Unknown" && settings2.get(typeKey) === undefined) {
                alert("undefined type: " + typeKey + ' in anime: ' + anime.title);
            }
        }
        tempList.push(anime);
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

        let airDateHtml;
        let scoreHtml = '';
        let nameHtml;
        let typeHtml = '';
        let episodesHtml = '';
        let buttonHtml = '';
        let buttonHtml2;
        const airedString = anime.aired?.string || "";

        const airedTab = airedString ? airedString.split("to") : [];
        const airedFrom = airedTab[0]?.trim() || "Unknown";
        const airedTo = airedTab[1]?.trim() || "Unknown";

        if (anime.status === "Not yet aired") {
            if (anime.aired?.from && anime.aired?.to && anime.aired?.from !== anime.aired?.to) {
                airDateHtml = `<p>Supposed first air: ${airedFrom}</p>
                            <p>Supposed last air: ${airedTo}</p>`;
            } else if (anime.aired?.from === anime.aired?.to) {
                airDateHtml = `<p>Supposed air: ${airedFrom}</p>`;
            } else if (anime.aired?.from) {
                airDateHtml = `<p>Supposed first air: ${airedFrom}</p>`;
            } else {
                airDateHtml = ``;
            }
        } else if (anime.aired?.to) {
            airDateHtml = `<p>First air: ${airedFrom}</p><p>Last air: ${airedTo}</p>`;
        } else {
            airDateHtml = `<p>Air: ${airedFrom}</p>`;
        }

        if (anime.score !== null && anime.score !== undefined && String(anime.score).toLowerCase() !== "unknown") {
            scoreHtml = `<p>Score: ${anime.score}</p>`;
        }

        if (anime.type !== null && anime.type !== undefined && anime.type.toString().toLowerCase() !== "unknown") {
            typeHtml = `<p>Type: ${anime.type}</p>`;
        }

        if (anime.title_english === null || anime.title_english === anime.title) {
            nameHtml = `<h3>${anime.title}</h3>`;
        }
        else nameHtml = `<h3>${anime.title}</h3><h3>${anime.title_english}</h3>`;

        if (anime.episodes !== null && anime.episodes.toString().toLowerCase() !== "unknown") {
            episodesHtml = `<p>Episodes: ${anime.episodes}</p>`;
        }
        if (anime.status === "Finished Airing"){
            if (!recomendations) {
                buttonHtml = `
                    <button 
                        type="button"
                        class="add-btn" 
                        data-id="${anime.mal_id}" 
                        data-title="${anime.title.replace(/"/g, '&quot;')}" 
                        data-english_title="${anime.title_english?.replace(/"/g, '&quot;')}" 
                        data-type="${anime.type}">
                        I have watched it
                    </button>
                `;
            }
        }
        buttonHtml2 = `
            <button 
                type="button"
                class="add-btn2" 
                data-id="${anime.mal_id}" 
                data-title="${anime.title.replace(/"/g, '&quot;')}" 
                data-english_title="${anime.title_english?.replace(/"/g, '&quot;')}" 
                data-type="${anime.type}">
                Dont show me
            </button>
        `;

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

        if (statusA == 2 && statusB == 2 && !a.aired.to && b.aired.to) return 1;
        if (statusA == 2 && statusB == 2 && a.aired.to && !b.aired.to) return -1;


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

export async function rankAnime(id, title, english_title, type) {
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

        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hidePopup(false);
        });

        addButton.addEventListener('click', async (e) => {
            e.preventDefault();
            if (score !== -1) {
                try {
                    await addToWatchlist(id, title, english_title, type, score);
                    //console.log(`Saved: ${title} with score ${score}`);
                    hidePopup(true);
                } catch (err) {
                    console.error("Save failed:", err);
                    alert("Could not save rating.");

                }
            }
        });

        popup.onclick = (e) => {
            if (e.target === popup) hidePopup(false);
        };
    });
}
