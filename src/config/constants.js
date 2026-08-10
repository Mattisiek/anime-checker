
export function pickAttributes(anime) {
    let animeToAdd = {};
    const keyElements = ['mal_id', 'title', 'title_english', 'score', 'type', 'status', 'aired', 'episodes', 'phrases', 'images', 'url'];
    keyElements.forEach(key => {
        animeToAdd[key] = anime[key];
    });
    return animeToAdd;
}

export const typeOfAnime = ['TV', 'Movie', 'ONA', 'OVA', 'Special', 'TV Special', 'CM', 'PV', 'Music', 'Unknown'];
export const typeOfAiring = ['Finished Airing', 'Currently Airing', 'Not yet aired'];
export var delay = 1001;
