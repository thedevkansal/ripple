export const THEME_KEY = "ripple-theme";

/**
 * Runs in <head> before first paint: the saved choice, else the OS setting. Keeps the page from
 * flashing the wrong theme on load.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;
