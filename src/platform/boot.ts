/**
 * Runs inline in <head> before the first paint:
 * - detects the Mini App (launch data in the URL hash, remembered for reloads),
 *   marks <html class="tg">, sets the `pf_platform=telegram` cookie the server
 *   reads, and injects telegram-web-app.js (only inside Telegram);
 * - picks the theme: the user's choice, else Telegram's colour scheme, else the
 *   OS preference;
 * - marks <html data-enter> until the page has loaded: lists on the first paint
 *   rise in once (shell.css "Motion"), never on client navigation.
 * Nothing here waits for the SDK, so the shell paints immediately.
 */
export const TELEGRAM_SDK = "https://telegram.org/js/telegram-web-app.js?59";

export const bootScript = `(function(){var d=document.documentElement;try{
d.dataset.enter="";addEventListener("load",function(){setTimeout(function(){delete d.dataset.enter},250)});
var h=location.hash,tg=h.indexOf("tgWebAppData")>-1||/[?&]tgWebAppPlatform=/.test(location.search);
try{if(tg)sessionStorage.setItem("pf_tg","1");else tg=sessionStorage.getItem("pf_tg")==="1"}catch(e){}
var t=null;try{t=localStorage.getItem("pf_theme")}catch(e){}
if(tg){d.classList.add("tg");
document.cookie="pf_platform=telegram;path=/;max-age=31536000;"+(location.protocol==="https:"?"samesite=none;secure":"samesite=lax");
if(!t){var p=new URLSearchParams(h.slice(1)).get("tgWebAppThemeParams");if(p){var bg=(JSON.parse(p).bg_color||"").replace("#","");
if(bg.length===6){var r=parseInt(bg.slice(0,2),16),g=parseInt(bg.slice(2,4),16),b=parseInt(bg.slice(4,6),16);t=(r*299+g*587+b*114)/1000<128?"dark":"light"}}}
var s=document.createElement("script");s.src=${JSON.stringify(TELEGRAM_SDK)};s.async=true;document.head.appendChild(s)}
else if(document.cookie.indexOf("pf_platform=telegram")>-1){document.cookie="pf_platform=;path=/;max-age=0";d.classList.remove("tg")}
if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
d.dataset.theme=t}catch(e){}})()`;
