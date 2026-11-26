// Scenery that says what the narrator says.
//
// The AI is told to put every thing the narrator names on screen. This module is the safety net for when it forgets: it reads
// the narration of a beat, finds the objects and ideas the words name (money, a rocket, a clock, a crash...), and, only if the beat
// does not already show them, adds the matching picture at the moment the word is said, in a free spot away from the people.
// A pure function of its inputs, so the preview and the export match.

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;

// [words, built-in picture, label (shown on the picture, may be '')]
const WORDS = [
  [/\b(million|billion|thousand dollars|cash|paycheck|salary|rich|fortune|dollars?|money)\b/i, 'stack'],
  [/\b(coins?|bitcoin|crypto)\b/i, 'coin'],
  [/\b(rocket|skyrocket(?:ed|s)?|blast(?:ed)? off|took off|launch(?:ed|es)?)\b/i, 'rocket'],
  [/\b(fire|flames?|burn(?:ed|t|ing)?|blaze|on fire)\b/i, 'flame'],
  [/\b(light ?bulb|bright idea|had an idea|great idea|brilliant idea|idea)\b/i, 'bulb'],
  [/\b(phone|text message|ringing)\b/i, 'phone'],
  [/\b(laptop|computer|coding|code|keyboard|website)\b/i, 'laptop'],
  [/\b(mansion|house|home|apartment)\b/i, 'house'],
  [/\b(trophy|champion|champions|won the|winner|victory)\b/i, 'trophy'],
  [/\b(crown|king|queen|royal|throne)\b/i, 'crown'],
  [/\b(newspaper|headline|headlines|breaking news|the news)\b/i, 'newspaper'],
  [/\b(locked|lock|password|vault|secure|security)\b/i, 'lock'],
  [/\b(clock|deadline|ticking|countdown|running out of time|midnight)\b/i, 'clock'],
  [/\b(car|drove|driving|truck|crash(?:ed)? into)\b/i, 'car'],
  [/\b(globe|worldwide|across the world|the whole world|global)\b/i, 'globe'],
  [/\b(storm|thunder|lightning|hurricane|tornado)\b/i, 'storm'],
  [/\b(factory|assembly line|production line)\b/i, 'factory'],
  [/\b(skyscraper|tower|headquarters)\b/i, 'tower'],
  [/\b(flag)\b/i, 'flag'],
  [/\b(heart|in love|loved|falling for)\b/i, 'heart'],
  [/\b(famous|fame|celebrity)\b/i, 'star'],
  [/\b(grew|growth|soared|surged|profits? (?:rose|climbed|jumped)|doubled|tripled|increase[sd]?)\b/i, 'chartUp'],
  [/\b(crashed|collapsed|plunged|plummeted|bankrupt|lost everything|went broke|losses|shrank)\b/i, 'chartDown'],
  [/\b(box|package|parcel|delivery|delivered|shipment)\b/i, 'box'],
  [/\b(gear|engine|machine|machinery)\b/i, 'gear'],
  [/\b(contract|documents?|paperwork)\b/i, 'folder'],
  [/\b(mystery|wondered|nobody knew|no one knew|unknown)\b/i, 'question'],
  [/\b(chip|processor|artificial intelligence|\bAI\b)\b/i, 'chip'],
];

/** What the words of a narration name, and when they are said: [{t, name, word}] (t in seconds from the start of the beat). */
export function detectScenery(text, dur) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const D = Math.max(.8, num(dur, 5)), first = .25, last = Math.max(first + .5, D - .6);
  const out = [];
  for (const [re, name] of WORDS) {
    const m = re.exec(s);
    if (!m) continue;
    const share = (m.index + m[0].length / 2) / s.length;
    out.push({ t: r2(cl(first + share * (last - first), first, last)), name, word: m[0].toLowerCase() });
  }
  return out.sort((a, b) => a.t - b.t);
}

const mentioned = (rawProps, name) => {
  try { return JSON.stringify(rawProps || []).toLowerCase().includes(String(name).toLowerCase()); } catch { return false; }
};

/**
 * Prop tuples to add to a beat so the picture shows what is said. Only objects the beat does not already show; at most `max`
 * (default 2, and fewer when the beat already carries plenty of props); spaced out in time; placed away from the people.
 *   rawProps   the beat's own props (any shape); characters  the beat's resolved characters (for their x)
 */
export function autoProps(narration, dur, rawProps, characters, opts = {}) {
  const D = Math.max(.8, num(dur, 5));
  const have = Array.isArray(rawProps) ? rawProps.length : 0;
  const max = Math.max(0, Math.min(num(opts.max, 2), 5 - have));
  if (!max) return [];
  const xs = (characters || []).map((c) => num(c && c.x, 800));
  const slots = [[1260, 330], [340, 330], [1260, 560], [340, 560], [800, 250]];
  const free = (sx) => xs.length ? Math.min(...xs.map((x) => Math.abs(x - sx))) : 999;
  const out = [];
  let lastT = -9;
  const used = new Set();
  for (const ev of detectScenery(narration, D)) {
    if (out.length >= max) break;
    if (mentioned(rawProps, ev.name)) continue;
    if (ev.t - lastT < 1.4) continue;
    const slot = slots.filter((_, i) => !used.has(i)).sort((a, b) => free(b[0]) - free(a[0]))[0];
    if (!slot) break;
    used.add(slots.indexOf(slot));
    const t0 = r2(Math.max(.1, ev.t - .15)), t1 = r2(Math.min(D - .1, t0 + 2.4));
    if (t1 - t0 < .8) continue;
    out.push(['item', ev.name, null, slot[0], slot[1], 1.05, t0, t1, { auto: true }]);
    lastT = ev.t;
  }
  return out;
}
