export const THEME_KEY = "ripple-theme";
export const TZ_COOKIE = "tz";

/**
 * Runs in <head> before first paint: applies the saved theme (else light) so the page never
 * flashes the wrong one, and records the browser's timezone so the server can bucket analytics
 * by the viewer's local day and hour.
 */
export const themeScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("${THEME_KEY}");d.dataset.theme=t==="dark"?"dark":"light"}catch(e){d.dataset.theme="light"}try{document.cookie="${TZ_COOKIE}="+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)+";path=/;max-age=31536000;samesite=lax"}catch(e){}})()`;
