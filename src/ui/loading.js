const container = document.getElementById('anime-container');

let refreshDisabled = true;

document.addEventListener('keydown', function(event) {
    if (!refreshDisabled) return;
    
    if (event.key === 'F5' || 
        (event.key === 'r' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
    }
});

export function showLoading() {
    container.innerHTML = 'Loading.....';
}

export function changeVisibilitySwitch(vis) {

    const animes = document.getElementById('show-anime');
    const recommendations = document.getElementById('show-recommendations');

    animes.style.display = vis;
    recommendations.style.display = vis;
}

export function changeVisibility(vis) {

    const postLoadControls = document.getElementById('main-search-container');
    const popupButton = document.getElementById('show-popup-btn');
    const popupButton2 = document.getElementById('show-popup2-btn');
    const popupButton3 = document.getElementById('show-popup3-btn');
    const hardResetButton = document.getElementById('hard-reset-btn');
    const inputForm = document.getElementById('input-form');
    const counterDisplay = document.getElementById('counter-display');

    refreshDisabled = (vis !== 'flex');
    
    changeVisibilitySwitch(vis);

    postLoadControls.style.display = vis;
    popupButton.style.display = vis;
    popupButton2.style.display = vis;
    popupButton3.style.display = vis;
    hardResetButton.style.display = vis;
    inputForm.style.display = vis;
    counterDisplay.style.display = vis;

    
    return vis !== 'flex';
}
