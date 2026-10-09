export const THEME_KEY = "ripple-theme";

/**
 * Runs in <head> before first paint: the saved choice, else light. Keeps the page from flashing
 * the wrong theme on load.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;
