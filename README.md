# Anime Checker

A Tauri-based desktop application for tracking and discovering anime from MyAnimeList (MAL) using the Jikan API.

## Description
Anime Checker helps you discover new anime by searching for titles based on keywords/phrases and tracking what you've watched. It automatically fetches seasonal anime and allows you to filter by type and airing status.

## Features
* **Keyword-based Anime Discovery:** Add phrases to automatically find matching anime.
* **Seasonal Anime Tracking:** Automatically loads anime from current and previous seasons.
* **Watchlist Management:** Mark anime as watched and remove them from your discovery list.
* **Smart Filtering:** Filter anime by:
    * Type (TV, Movie, ONA, OVA, Special, etc.)
    * Airing Status (Finished, Currently Airing, Not yet aired)
* **Search Functionality:** Search through your anime list in real-time.
* **Duplicate Detection:** Automatically counts how many of your keywords match each anime.
* **Persistent Storage:** Saves your watchlist, keywords, and settings locally.
* **MAL Integration:** Direct links to MyAnimeList pages for each anime.

## Installation

### Prerequisites
* **Node.js** (v16 or later)
* **Rust** (for Tauri)
* **Git**

### Setup
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Mattisiek/anime-checker.git
    cd anime-checker
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
4.  **Build for production:**
    ```bash
    npm run tauri build
    ```

## Usage Guide

### Initial Setup
1.  Launch the application.
2.  The app automatically loads current and previous season anime.
3.  Add search phrases to find specific anime.

### Adding Search Phrases
* Enter a keyword/phrase in the input field at the top.
* Click **"Submit"** or press **Enter**.
* The app will search for anime matching that phrase.
* Matching anime will appear in your list with a count showing how many phrases matched.

### Managing Your List
* **Mark as Watched:** Click **"I have watched it"** on any anime card to add it to your watchlist.
* **Restore anime:** Select anime in the watchlist popup and click **"I haven't watch these"** to bring those titles back to see them again.
* **Restore phrase:** if you wish to no loger follow a phrase, you can click on that button and choose phrases to no longer follow.
* **View Watchlist:** Click **"Show watchlist"** to see anime you've marked as watched.
* **Searching:** Use the search bar to filter anime by title in real-time.
* **Hard Reset:** If needed, click **"Hard Reset"** to clear all data and reload from scratch.

### Filtering & Settings
Click **"Change settings"** to configure:
* **Airing Status:** Toggle which statuses to show (Finished, Currently Airing, Not yet aired).
* **Anime Types:** Toggle which types to show (TV, Movie, ONA, etc.).

## Important Notes

- The app respects Jikan API rate limiting (1 second between requests)
- All data is stored locally - no external databases
- Images are loaded directly from MyAnimeList
- The app requires an internet connection to fetch new anime data

## Acknowledgments

- [Jikan API](https://jikan.moe/) for providing access to MyAnimeList data
- [Tauri](https://tauri.app/) for the application framework
- MyAnimeList for the anime database
