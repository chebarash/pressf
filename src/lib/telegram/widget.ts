/**
 * The "Today" widget pinned in the chat with the bot (Bot API 10.4): one HTML
 * document whose code never changes, fed by `chat_data` that the reminders job
 * edits when the day's classes change. It runs in Telegram's sandbox: no
 * network, no web fonts, so generic font families only. The countdown is
 * computed in the widget from the class times.
 *
 * Bump WIDGET_VERSION whenever WIDGET_HTML changes: chats then get a new widget
 * (the old one is unpinned and deleted), since a sent widget can't be edited.
 */
export const WIDGET_VERSION = 1;
export const WIDGET_HEIGHT = 172;

/** A class in the widget: [start, end] in unix seconds, then name, room, topic. */
export type WidgetClass = [number, number, string, string, string];
/** A deadline in the widget: [due unix seconds, "Lab 6 · Databases"]. */
export type WidgetDue = [number, string];
/** `l` names the day shown ("Today", "Tomorrow", "Mon 17 Nov"). */
export type WidgetData = { l: string; c: WidgetClass[]; d: WidgetDue[] };

const MAX_BYTES = 1024;
const bytes = (s: string) => new TextEncoder().encode(s).length;
const cut = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** The widget's data, cut down to Telegram's 1024 bytes (topics go first, then extra classes). */
export function widgetData(a: {
  label: string;
  classes: Array<{ start: string; end: string; name: string; room: string | null; topic?: string | null }>;
  due: Array<{ at: Date; title: string; course: string }>;
}): string {
  const unix = (iso: string | Date) => Math.floor(new Date(iso).getTime() / 1000);
  const data: WidgetData = {
    l: a.label,
    c: a.classes.slice(0, 6).map((c) => [unix(c.start), unix(c.end), cut(c.name, 40), cut(c.room, 16), cut(c.topic, 60)]),
    d: a.due.slice(0, 2).map((d) => [unix(d.at), cut(`${d.title} · ${d.course}`, 50)]),
  };
  let out = JSON.stringify(data);
  if (bytes(out) > MAX_BYTES) data.c = data.c.map((c) => [c[0], c[1], c[2], c[3], ""]);
  while (bytes((out = JSON.stringify(data))) > MAX_BYTES && data.c.length > 1) data.c.pop();
  return out;
}

/** Press F's card: cream, ink border, hard shadow; teal and mustard chips. */
export const WIDGET_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{font-family:system-ui,-apple-system,sans-serif;color:#12110c;background:transparent;padding:4px 7px 7px 4px}
.c{background:#f5f0d6;border:2px solid #12110c;border-radius:16px;box-shadow:3px 3px 0 #12110c;padding:12px 14px;height:${WIDGET_HEIGHT - 11}px;overflow:hidden}
.k{font-size:12px;color:#5a5648;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.k b{color:#2a7181;font-weight:600}
.n{font-family:Georgia,serif;font-size:27px;line-height:1.08;margin:3px 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r{display:flex;gap:8px;margin-top:10px}
.p{flex:1;min-width:0;border-radius:10px;padding:6px 9px;font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t{background:#d5e5e1}.y{background:#f8e7ae}.s{color:#5a5648}
.e{font-family:Georgia,serif;font-size:24px;margin-top:22px}
</style></head><body><div class="c" id="w"></div><script>
var W=typeof TelegramWidget!=="undefined"?TelegramWidget:null;
function data(){try{return JSON.parse((W&&W.chatData)||"{}")}catch(e){return{}}}
function x(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function hm(t){var d=new Date((t+18000)*1000),h=d.getUTCHours(),m=d.getUTCMinutes();return(h<10?"0":"")+h+":"+(m<10?"0":"")+m}
function inn(t,now){var m=Math.max(1,Math.round((t-now)/60));if(m<60)return"in "+m+" min";var h=Math.floor(m/60);return"in "+h+" h"+(m%60?" "+m%60+" min":"")}
function render(){
var d=data(),now=Date.now()/1000,cs=d.c||[],ds=(d.d||[]).filter(function(v){return v[0]>now}),i,a=null,lab="";
for(i=0;i<cs.length;i++){if(cs[i][1]>now){a=cs[i];break}}
var el=document.getElementById("w");
if(!a){el.innerHTML='<div class="k">'+x(d.l||"Today")+'</div><div class="e">No more classes</div>'+(ds.length?'<div class="r"><div class="p y">'+x(ds[0][1])+'<br><span class="s">due '+hm(ds[0][0])+'</span></div></div>':"");return}
var today=(d.l||"Today")==="Today";
if(a[0]<=now)lab="<b>Now</b> · until "+hm(a[1]);else if(today)lab="<b>Next</b> · "+inn(a[0],now);else lab="<b>"+x(d.l)+"</b> · first at "+hm(a[0]);
var rest=cs.slice(i+1),chips="";
if(rest.length)chips+='<div class="p t">'+hm(rest[0][0])+" "+x(rest[0][2])+'<br><span class="s">'+x(rest[0][3]||"")+(rest.length>1?" · +"+(rest.length-1)+" more":"")+"</span></div>";
if(ds.length)chips+='<div class="p y">'+x(ds[0][1])+'<br><span class="s">due '+hm(ds[0][0])+"</span></div>";
el.innerHTML='<div class="k">'+lab+'</div><div class="n">'+x(a[2])+'</div><div class="m">'+[hm(a[0])+"–"+hm(a[1]),a[3],a[4]].filter(Boolean).map(x).join(" · ")+"</div>"+(chips?'<div class="r">'+chips+"</div>":"");
}
render();
if(W&&W.onEvent)W.onEvent("chatDataChanged",render);
if(typeof setInterval==="function")setInterval(render,30000);
</script></body></html>`;
