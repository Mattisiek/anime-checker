const { fs, path } = window.__TAURI__;
const { readTextFile, readFile } = window.__TAURI__.fs;
const { resolveResource } = window.__TAURI__.path;

import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.mjs";

import { ensureAppDataDir } from "../config/paths.js";
import { getSingleAnime } from "../api/getAnime.js";
import { showLoading } from "../ui/loading.js";

let pyodideInstance = null;
let notebookCache = null;
let modelCacheList = [];

export async function initMLModel() {
    if (pyodideInstance) return pyodideInstance;

    try {
        console.log("Initializing ML Engine...");
        //*
        pyodideInstance = await loadPyodide({
            stdout: () => { },
            stderr: (msg) => console.warn("Pyodide Warning:", msg)
        });
        //*/
        //pyodideInstance = await loadPyodide();
        await pyodideInstance.loadPackage(["micropip", "setuptools", "pandas", "requests"]);
        const micropip = pyodideInstance.pyimport("micropip");
        await micropip.install("mlxtend==0.22.0");

        await pyodideInstance.runPythonAsync(`
            import sys, warnings, os, json, pandas as pd, time, numpy as np, math, requests
            import joblib
            from pathlib import Path
            from types import ModuleType
            from sklearn.neighbors import NearestNeighbors
            from sklearn.decomposition import TruncatedSVD
            warnings.filterwarnings("ignore", category=DeprecationWarning)

            if 'distutils' not in sys.modules:
                d = ModuleType('distutils'); v = ModuleType('distutils.version')
                class LooseVersion:
                    def __init__(self, vstring): self.vstring = vstring
                    def __lt__(self, other): return False
                    def __ge__(self, other): return True
                v.LooseVersion = LooseVersion; d.version = v
                sys.modules['distutils'] = d; sys.modules['distutils.version'] = v
        `);






        const animeNamesPath = await resolveResource('resources/anime_names.json');
        const animeNamesData = await readFile(animeNamesPath);

        try {
            pyodideInstance.FS.stat('anime_names.json');
        } catch {
            pyodideInstance.FS.writeFile('anime_names.json', new Uint8Array(animeNamesData));
        }

        await pyodideInstance.runPythonAsync(`
            import json
            import warnings
            warnings.filterwarnings('ignore')
            
            with open('anime_names.json', 'r', encoding='utf-8') as f:
                anime_names = json.load(f)
        `);






        const dfNormPath = await resolveResource('resources/df_norm_sparse.npz');
        const dfNormData = await readFile(dfNormPath);

        try {
            pyodideInstance.FS.stat('df_norm_sparse.npz');
        } catch {
            pyodideInstance.FS.writeFile('df_norm_sparse.npz', new Uint8Array(dfNormData));
        }

        await pyodideInstance.runPythonAsync(`
            import scipy.sparse as sp
            import warnings
            warnings.filterwarnings('ignore')
            
            df_normalized = sp.load_npz('df_norm_sparse.npz')
        `);




        const svgPath = await resolveResource('resources/svd_vectors.npy');
        const svgData = await readFile(svgPath);

        try {
            pyodideInstance.FS.stat('svd_vectors.npy');
        } catch {
            pyodideInstance.FS.writeFile('svd_vectors.npy', new Uint8Array(svgData));
        }

        await pyodideInstance.runPythonAsync(`
            import pandas as pd
            import warnings
            warnings.filterwarnings('ignore')
            
            dense_user_vectors = np.load('svd_vectors.npy')
        `);




        

        const svdModelPath = await resolveResource('resources/svd_model.joblib');
        const modelData = await readFile(svdModelPath);

        try {
            pyodideInstance.FS.stat('svd_model.joblib');
        } catch {
            pyodideInstance.FS.writeFile('svd_model.joblib', new Uint8Array(modelData));
        }

        await pyodideInstance.runPythonAsync(`
            import pandas as pd
            import warnings
            warnings.filterwarnings('ignore')
            
            svd = joblib.load('svd_model.joblib')
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

export async function runRecommendations() {
    showLoading();
    try {
        const pyodide = await initMLModel();

        const appDataDir = await ensureAppDataDir();

        const fullWatchlistPath = await path.join(appDataDir, 'watchlist.json');
        const watchlistContent = await fs.readTextFile(fullWatchlistPath);

        const fullNotWatchlistPath = await path.join(appDataDir, 'notwatchlist.json');
        const notwatchlistContent = await fs.readTextFile(fullNotWatchlistPath);

        const fullCachePath = await path.join(appDataDir, 'cache.json');
        const cachelistContent = await fs.readTextFile(fullCachePath);

        pyodide.globals.set("RAW_WATCHLIST_JSON", watchlistContent);
        pyodide.globals.set("WATCHLIST_PATH_STR", fullWatchlistPath.replace(/\\/g, '/'));

        pyodide.globals.set("RAW_NOTWATCHLIST_JSON", notwatchlistContent);
        pyodide.globals.set("NOTWATCHLIST_PATH_STR", fullNotWatchlistPath.replace(/\\/g, '/'));
        
        pyodide.globals.set("RAW_CACHELIST_JSON", cachelistContent);
        pyodide.globals.set("CACHELIST_PATH_STR", fullCachePath.replace(/\\/g, '/'));

        await pyodide.runPythonAsync(`
            vfs_path = Path('/home/pyodide/default_app')
            vfs_path.mkdir(parents=True, exist_ok=True)
            vfs_file_path = vfs_path / 'watchlist.json'
            watchlist_path = str(vfs_file_path)
            n_vfs_file_path = vfs_path / 'notwatchlist.json'
            notwatchlist_path = str(n_vfs_file_path)
            c_vfs_file_path = vfs_path / 'cache.json'
            cache_path = str(c_vfs_file_path)

            with open(vfs_file_path, 'w', encoding='utf-8') as f:
                f.write(RAW_WATCHLIST_JSON)
            with open(n_vfs_file_path, 'w', encoding='utf-8') as f:
                f.write(RAW_NOTWATCHLIST_JSON)
            with open(c_vfs_file_path, 'w', encoding='utf-8') as f:
                f.write(RAW_CACHELIST_JSON)
            os.environ['APPDATA'] = '/home/pyodide'
            config = {'identifier': 'default_app'}
        `);

        for (const [index, cell] of notebookCache.cells.entries()) {
            if (index <= 3) continue;
            if (cell.cell_type === 'code') {
                let code = cell.source.join('');
                if (code.includes('tauri.conf.json')) {
                    code = "config = {'identifier': 'default_app'}";
                }

                await pyodide.runPythonAsync(code);
            }
        }

        const jsonResult = await pyodide.runPythonAsync(`
            recs = globals().get('recommendations', {})
            output = recs.to_dict() if hasattr(recs, 'to_dict') else (recs if recs else {})
            json.dumps({str(k): float(v) for k, v in output.items()})
        `);

        return await handleResultDisplay(jsonResult);

    } catch (err) {
        console.error("Execution Error:", err);
        alert("Error running model: " + err.message);
    }
}

export async function handleResultDisplay(jsonResult) {
    if (!jsonResult || jsonResult === "{}") {
        alert("No recommendations found.");
        return;
    }
    let modelList = [];
    const finalObj = JSON.parse(jsonResult);
    //let resultString = "Top Recommendations:\n";
    for (const animeKey of Object.keys(finalObj)) {
        const parts = animeKey.split('_');

        const id = Number(parts[0]);
        //const name = parts.slice(1).join('_');
        //resultString += `• ${name} - Score: ${score.toFixed(2)}\n`;
        const found = modelCacheList.find(item => item.mal_id === id);

        if (found) {
            modelList.push(found);
        }
        else {
            const currAnime = await getSingleAnime(id);
            if (currAnime && currAnime.mal_id) {
                modelList.push(currAnime);
                modelCacheList.push(currAnime);
            }
        }
    }
    return modelList
}