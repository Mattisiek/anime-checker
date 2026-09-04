import requests
import time
from mal_scraper import get_user_anime_list
import logging
import pandas as pd
import mal_scraper.users
from mal_scraper.consts import ConsumptionStatus
import numpy as np
from sklearn.decomposition import TruncatedSVD
import joblib
import json
import scipy.sparse as sp

logging.getLogger('jikanpy').setLevel(logging.CRITICAL)
logging.getLogger().setLevel(logging.CRITICAL)

delay = 1

url = "https://api.tenrai.org/v1/top/anime"
popular_anime_ids = []
for page in range(1, 2):
    params = {
        "filter": "bypopularity",
        "page": page,
    }
    response = requests.get(url, params=params)
    time.sleep(delay)
    data = response.json()
    # print(data)
    animes = data['data']
    popular_anime_ids += [anime['mal_id'] for anime in animes]

#print(popular_anime_ids)
#print(len(popular_anime_ids))

def get_anime_reviews_tenrai(anime_id, page):
    url = f"https://api.tenrai.org/v1/anime/{anime_id}/reviews?page={page}"
    # print(url)
    
    response = requests.get(url)
    time.sleep(delay)
    
    if response.status_code == 200:
        return response.json()
    else:
        return None


number = 1
t0 = time.time()
distinctUsers = set()


for ind in range(len(popular_anime_ids)):
    animeId = popular_anime_ids[ind]
    # print(animeId)
    page = 1
    while True:
        # print()
    # for page in range(1, 10):        
        data = get_anime_reviews_tenrai(animeId, page)
        # print("AAA", page, data)
        # print(data)

        if not data or ('status' in data and data['status'] == 500):
            page += 1
            continue

        number_of_failed_attempts = 0
            
        for i, review in enumerate(data['data'], 1):
            # print(f"\nReview {i}:")
            # print(f"User: {review['user']['username']}")
            # print(f"Score: {review['score']}")
            distinctUsers.add(review['user']['username'])

        if not data['pagination']['has_next_page']:
            # print(f"{number} ended at: {page} with total of {len(distinctUsers)} users after {time.time() - t0} seconds")
            break
        page += 1
    number += 1
    # if len(distinctUsers) >= maxUserSize:
    #    print(f"Ending with {len(distinctUsers)}")
    #    break

start = ind


# print(len(distinctUsers))

usernames = list(distinctUsers)

# print(len(set(usernames)))

# usernames = usernames[:10]

_original_convert = mal_scraper.users._convert_status_code_to_const

def _safe_convert_status_code_to_const(code):
    status_map = {
        1: ConsumptionStatus.consuming,
        2: ConsumptionStatus.completed,
        3: ConsumptionStatus.on_hold,
        4: ConsumptionStatus.dropped,
        6: ConsumptionStatus.backlog,
    }
    return status_map.get(code, ConsumptionStatus.backlog)

mal_scraper.users._convert_status_code_to_const = _safe_convert_status_code_to_const

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://myanimelist.net/",
})


def getReviewsFromUser(username):
    anime_list = get_user_anime_list(username, requester=session)
    time.sleep(delay)
    if anime_list is None: return None
    anime_list = [anime for anime in anime_list if anime['score'] > 0]
    return anime_list


rows = []
rowsAtLeast5 = []
successful_usernames = []
usernamesAtLeast5 = []
count = 0

for username in usernames:
    try:
        count += 1
        animeList = getReviewsFromUser(username)
        
        if animeList is None:
            # print(f"Skipping {username}: No data returned.")
            continue

        shortedAnimeList = [
            {
                'id_ref': entry['id_ref'],
                'name': entry['name'],
                'score': entry['score'],
            } 
            for entry in animeList
        ]
        # print(animeList)
        # print(shortedAnimeList)
        # print(len(animeList))

        rows.append(shortedAnimeList)
        successful_usernames.append(username)
        
        # print(f"Processed: {count} users")
        if len(shortedAnimeList) > 4:
            rowsAtLeast5.append(shortedAnimeList)
            usernamesAtLeast5.append(username)

    except Exception as e:
        print(f"Error processing {username}: {e}")
        continue


df = pd.DataFrame([
    {f"{item['id_ref']}_{item['name']}": item['score'] for item in userAnime}
    for userAnime in rows
], index=successful_usernames)

df = df.fillna(0)

df2 = pd.DataFrame([
    {f"{item['id_ref']}_{item['name']}": item['score'] for item in userAnime}
    for userAnime in rowsAtLeast5
], index=usernamesAtLeast5)

df2 = df2.fillna(0)

anime_names = df.columns.tolist()
with open('anime_names.json', 'w', encoding='utf-8') as f:
    json.dump(anime_names, f)

anime_names2 = df2.columns.tolist()
with open('anime_names2.json', 'w', encoding='utf-8') as f:
    json.dump(anime_names2, f)


vals = df.values.astype(np.float32)
mask = vals != 0

row_sums = vals.sum(axis=1)
row_counts = mask.sum(axis=1)
row_means = np.divide(
    row_sums, 
    row_counts, 
    out=np.zeros(len(vals), dtype=np.float32), 
    where=row_counts != 0
)

vals_norm = np.where(mask, vals - row_means[:, np.newaxis], 0)

df_norm = pd.DataFrame(vals_norm, index=df.index, columns=df.columns)

X_sparse = sp.csr_matrix(vals_norm)

svd = TruncatedSVD(n_components=50, algorithm='randomized', random_state=42)
base_dense_vectors = svd.fit_transform(X_sparse)

joblib.dump(svd, 'svd_model.joblib')
np.save('svd_vectors.npy', base_dense_vectors.astype(np.float32))
df_norm.to_csv('df_norm.csv.gz', index=False, compression='gzip')
sp.save_npz('df_norm_sparse.npz', X_sparse)


vals2 = df2.values.astype(np.float32)
mask2 = vals2 != 0

row_sums2 = vals2.sum(axis=1)
row_counts2 = mask2.sum(axis=1)
row_means2 = np.divide(
    row_sums2, 
    row_counts2, 
    out=np.zeros(len(vals2), dtype=np.float32), 
    where=row_counts2 != 0
)

vals_norm2 = np.where(mask2, vals2 - row_means2[:, np.newaxis], 0)

df_norm2 = pd.DataFrame(vals_norm2, index=df2.index, columns=df2.columns)

X_sparse2 = sp.csr_matrix(vals_norm2)

svd2 = TruncatedSVD(n_components=50, algorithm='randomized', random_state=42)
base_dense_vectors2 = svd2.fit_transform(X_sparse2)

joblib.dump(svd2, 'svd_model2.joblib')
np.save('svd_vectors2.npy', base_dense_vectors2.astype(np.float32))
df_norm2.to_csv('df_norm2.csv.gz', index=False, compression='gzip')
sp.save_npz('df_norm_sparse2.npz', X_sparse2)