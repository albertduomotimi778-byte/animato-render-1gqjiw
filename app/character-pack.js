// Character packs: "make my own character from a reference image".
//
// The person copies the CHARACTER MAKER PROMPT (buildMakerPrompt) into any AI model, attaches a reference image, and the AI
// returns ONE .html file: a character pack. The pack holds a male and a female body, a wardrobe (outfits) and hairstyles, every
// piece drawn as SVG around its own pivot so the app's puppet can animate it (walk, talk, blink, gesture) in front, side and back view.
// The app imports the file (parsePackText), keeps it on the device (createStore), and scenes use it with
//   packCharacter('Mara', {gender:'female', outfit:'suit', hair:'bob', topc:'#7a5a8a'});  ...  {custom:'Mara', x:..., ground:...}
//
// Pure functions, no DOM (the only browser pieces, DOMParser and IndexedDB, are passed in or checked for).

export const PACK_FORMAT = 'animato-character-pack';
export const PACK_VERSION = 1;
export const PACK_SCRIPT_ID = 'animato-character-pack';
export const MAKER_MARKER = 'ANIMATO CHARACTER MAKER';

/** The pieces a body supplies (the face), an outfit supplies (the clothes) and a hairstyle supplies (the hair). */
export const BODY_PARTS = ['head', 'headSide', 'headBack', 'mouthOpen', 'mouthOpenSide', 'eyesClosed', 'eyesClosedSide', 'pupil', 'pupilSide', 'browL', 'browR', 'browSide'];
/** The mouth shapes the face can show (lip sync + moods). Only `rest` is really needed; the app falls back to the nearest shape for the others. */
export const MOUTH_SHAPES = ['rest', 'smile', 'grin', 'smirk', 'frown', 'AI', 'E', 'O', 'U', 'MBP', 'FV', 'L', 'CONS'];
export const FACE_SLOT = '<g data-face="1"></g>';
export const OUTFIT_PARTS = ['torso', 'torsoSide', 'torsoBack', 'upperArm', 'foreArm', 'upperLeg', 'lowerLeg', 'lowerLegSide'];
export const HAIR_PARTS = ['back', 'front', 'side', 'sideBack', 'rear'];
export const REQUIRED_BODY = ['head', 'eyesClosed'];
export const REQUIRED_OUTFIT = ['torso', 'upperArm', 'foreArm', 'upperLeg', 'lowerLeg'];
export const DEFAULT_RIG = { upperLeg: 150, lowerLeg: 150, torso: 190, shoulderX: 58, shoulderDown: 25, hipX: 32, upperArm: 105, foreArm: 100 };
export const DEFAULT_COLORS = ['#3b82f6', '#1e3a8a', '#f5b700', '#e2eafc'];
export const LIMITS = { piece: 40000, total: 2400000, outfits: 24, hairs: 24, name: 40, id: 32 };

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const NAMED = { black: '#1c1c21', white: '#f3f3f1', red: '#c0392b', blue: '#2e62b4', navy: '#1f2c4c', green: '#2f7d4f', yellow: '#e8c33a', orange: '#df7a2e', pink: '#e27aa3', purple: '#6a43a6', brown: '#6b4a33', gray: '#7a7f88', grey: '#7a7f88', teal: '#1d8583', beige: '#d9c3a0', tan: '#c9a77c', gold: '#c9a13b', silver: '#b8bcc4' };
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function normHex(c, fallback = '') {
  const s = String(c == null ? '' : c).trim().toLowerCase();
  if (HEX.test(s)) return s.length === 4 ? '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s;
  if (NAMED[s]) return NAMED[s];
  return fallback;
}
export function shadeHex(hex, k) {
  const h = normHex(hex, '#888888');
  const f = (i) => cl(Math.round(parseInt(h.slice(i, i + 2), 16) * k), 0, 255).toString(16).padStart(2, '0');
  return '#' + f(1) + f(3) + f(5);
}
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
const slug = (s, n = LIMITS.id) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n);

/* ---------- safe SVG pieces ---------- */

/** One drawn piece: SVG shapes only. Scripts, images, styles, links, animation tags and outside references are removed. */
export function cleanPiece(svg) {
  if (typeof svg !== 'string' || !svg.trim()) return '';
  let x = svg.slice(0, LIMITS.piece);
  x = x.replace(/<\s*(script|foreignObject|iframe|style|object|embed)\b[\s\S]*?(<\/\s*\1\s*>|$)/gi, '');
  x = x.replace(/<\s*image\b[^>]*>(\s*<\/\s*image\s*>)?/gi, '');
  x = x.replace(/<\s*\/?\s*(svg|use|animate\w*|set|a|html|body)\b[^>]*>/gi, '');
  x = x.replace(/\son\w+\s*=/gi, ' data-x=').replace(/(xlink:)?href\s*=/gi, 'data-h=');
  x = x.replace(/url\(\s*(?!#)[^)]*\)/gi, 'none');
  return x.trim();
}

/** Optional check (browser): the fragment must be well-formed XML. Pass `new DOMParser()`. Returns '' when fine, else a short message. */
export function xmlProblem(fragment, parser) {
  if (!parser || !fragment) return '';
  try {
    const d = parser.parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + fragment.replace(/@(?=[a-z])/gi, '') + '</svg>', 'image/svg+xml');
    const e = d.getElementsByTagName('parsererror')[0];
    return e ? String(e.textContent || 'broken SVG').split('\n')[0].slice(0, 160) : '';
  } catch (e) { return ''; }
}

function cleanParts(src, keys, bag, where) {
  const out = {};
  if (!isObj(src)) return out;
  for (const k of keys) {
    const v = cleanPiece(src[k]);
    if (v) out[k] = v;
  }
  bag.size += Object.values(out).reduce((a, s) => a + s.length, 0);
  return out;
}

function cleanRig(r, base) {
  const out = { ...base };
  if (isObj(r)) for (const k of Object.keys(DEFAULT_RIG)) { const v = +r[k]; if (Number.isFinite(v) && v >= 5 && v <= 600) out[k] = v; }
  return out;
}
const colorList = (a) => (Array.isArray(a) ? a.map((c) => normHex(c)).filter(Boolean).slice(0, 4) : []);


const pt2 = (v) => (Array.isArray(v) && Number.isFinite(+v[0]) && Number.isFinite(+v[1]) ? [cl(+v[0], -400, 400), cl(+v[1], -400, 400)] : null);
function cleanMouths(src, bag) {
  const out = {};
  if (!isObj(src)) return out;
  for (const k of Object.keys(src).slice(0, 24)) {
    const key = String(k).replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
    const v = cleanPiece(src[k]);
    if (key && v) { out[key] = v; bag.size += v.length; }
  }
  return out;
}
function cleanFacePoints(b) {
  const e = isObj(b.eyes) ? b.eyes : {}, w = isObj(b.brows) ? b.brows : {};
  const rg = Array.isArray(e.range) && Number.isFinite(+e.range[0]) && Number.isFinite(+e.range[1]) ? [cl(+e.range[0], 0, 40), cl(+e.range[1], 0, 40)] : [5, 3.5];
  return { eyes: { l: pt2(e.l), r: pt2(e.r), side: pt2(e.side), range: rg }, brows: { l: pt2(w.l), r: pt2(w.r), side: pt2(w.side) }, mouthSide: pt2(b.mouthSide) };
}
/**
 * Turns whatever the AI wrote into a safe, normalised pack. Never throws.
 * Returns { ok, pack, errors, warnings }: ok means the pack can be used (it has at least one complete person).
 */
export function sanitizePack(raw, opts = {}) {
  const errors = [], warnings = [];
  const bag = { size: 0 };
  if (!isObj(raw)) return { ok: false, pack: null, errors: ['The file does not hold a character pack.'], warnings };
  if (raw.format && raw.format !== PACK_FORMAT) warnings.push('The file says it is a "' + String(raw.format).slice(0, 30) + '" file, not an ' + PACK_FORMAT + ' file. Tried to read it anyway.');
  const name = String(raw.name || raw.title || 'My character').replace(/[<>&"]/g, '').trim().slice(0, LIMITS.name) || 'My character';
  const id = slug(raw.id || name) || 'my-character';
  const d = isObj(raw.defaults) ? raw.defaults : {};
  const defaults = {
    skin: normHex(d.skin, '#d9a679'), line: normHex(d.line || d.outline, '#1a1a1a'), eye: normHex(d.eye, '#2b1a10'), hair: normHex(d.hair, '#1b1b1b'),
    colors: colorList(d.colors),
  };
  while (defaults.colors.length < 4) defaults.colors.push(DEFAULT_COLORS[defaults.colors.length]);
  const rig = cleanRig(raw.rig, DEFAULT_RIG);
  const size = cl(+raw.size || 1.1, 0.5, 2);

  const bodies = {};
  for (const g of ['male', 'female']) {
    const b = isObj(raw.bodies) ? raw.bodies[g] : null;
    if (!isObj(b)) continue;
    const parts = cleanParts(b.parts || b, BODY_PARTS, bag);
    const mouths = cleanMouths(b.mouths, bag), mouthsSide = cleanMouths(b.mouthsSide, bag);
    const miss = REQUIRED_BODY.filter((k) => !parts[k]);
    if (!parts.mouthOpen && !Object.keys(mouths).length) miss.push('mouthOpen (or the mouths set)');
    if (miss.length) { errors.push('The ' + g + ' body is missing: ' + miss.join(', ') + '.'); continue; }
    const m = Array.isArray(b.mouth) && Number.isFinite(+b.mouth[0]) && Number.isFinite(+b.mouth[1]) ? [+b.mouth[0], +b.mouth[1]] : [0, -60];
    const fp = cleanFacePoints(b);
    if (!parts.pupil || !fp.eyes.l || !fp.eyes.r) warnings.push('The ' + g + ' body has no moving pupils (pupil + eyes.l / eyes.r): the eyes will not look around.');
    if (!parts.browL || !fp.brows.l || !fp.brows.r) warnings.push('The ' + g + ' body has no moving eyebrows (browL + brows.l / brows.r): the brows will not show feelings.');
    if (!mouths.rest || Object.keys(mouths).length < 6) warnings.push('The ' + g + ' body has fewer than 6 mouth shapes: lip sync will look simple.');
    bodies[g] = { rig: cleanRig(b.rig, rig), size: cl(+b.size || size, 0.5, 2), mouth: m, mouthSide: fp.mouthSide, eyes: fp.eyes, brows: fp.brows, mouths, mouthsSide, skin: normHex(b.skin, ''), parts };
  }
  const extraOnly = !isObj(raw.bodies) && (Array.isArray(raw.outfits) || Array.isArray(raw.hairs));
  if (!Object.keys(bodies).length && !errors.length && !extraOnly) errors.push('The pack has no male or female body.');

  const outfits = [];
  for (const o of (Array.isArray(raw.outfits) ? raw.outfits : []).slice(0, LIMITS.outfits)) {
    if (!isObj(o)) continue;
    const oid = slug(o.id || o.label || 'outfit' + (outfits.length + 1)) || 'outfit' + (outfits.length + 1);
    const g = /^(male|female)$/.test(o.gender) ? o.gender : 'any';
    const parts = cleanParts(o.parts || o, OUTFIT_PARTS, bag);
    const miss = REQUIRED_OUTFIT.filter((k) => !parts[k]);
    if (miss.length) { warnings.push('Outfit "' + oid + '" skipped: it is missing ' + miss.join(', ') + '.'); continue; }
    if (outfits.some((x) => x.id === oid && x.gender === g)) continue;
    outfits.push({ id: oid, label: String(o.label || oid).replace(/[<>&"]/g, '').slice(0, 40), gender: g, colors: colorList(o.colors), parts });
  }
  const hairs = [];
  for (const h of (Array.isArray(raw.hairs) ? raw.hairs : []).slice(0, LIMITS.hairs)) {
    if (!isObj(h)) continue;
    const hid = slug(h.id || h.label || 'hair' + (hairs.length + 1)) || 'hair' + (hairs.length + 1);
    const g = /^(male|female)$/.test(h.gender) ? h.gender : 'any';
    const parts = cleanParts(h.parts || h, HAIR_PARTS, bag);
    if (hairs.some((x) => x.id === hid && x.gender === g)) continue;
    hairs.push({ id: hid, label: String(h.label || hid).replace(/[<>&"]/g, '').slice(0, 40), gender: g, color: normHex(h.color, ''), parts });
  }
  if (bag.size > LIMITS.total) errors.push('The pack is too big (' + Math.round(bag.size / 1000) + ' KB of drawing). Ask the AI for a smaller one.');
  for (const g of Object.keys(bodies)) {
    if (!outfits.some((o) => o.gender === g || o.gender === 'any')) errors.push('There is no complete outfit for the ' + g + ' body.');
  }
  if (extraOnly && !outfits.length && !hairs.length) errors.push('The file has no complete outfit or hairstyle in it.');
  if (!extraOnly && !bodies.male) warnings.push('There is no male body: male characters will use the female body.');
  if (!extraOnly && !bodies.female) warnings.push('There is no female body: female characters will use the male body.');
  for (const g of Object.keys(bodies)) {
    const n = outfits.filter((o) => o.gender === g || o.gender === 'any').length;
    if (n === 1) warnings.push('The ' + g + ' body has only one outfit, so every ' + g + ' will dress the same.');
  }
  if (!hairs.length) warnings.push('There are no hairstyles: the heads are drawn as given.');
  const pack = { format: PACK_FORMAT, version: PACK_VERSION, id, name, notes: String(raw.notes || '').slice(0, 400), defaults, rig, size, bodies, outfits, hairs };
  if (extraOnly) pack.extra = true;
  if (opts.parser) {
    const check = (label, s) => { const p = xmlProblem(s, opts.parser); if (p) errors.push(label + ': ' + p); };
    for (const g of Object.keys(bodies)) {
      for (const [k, v] of Object.entries(bodies[g].parts)) check(g + ' ' + k, v);
      for (const [k, v] of Object.entries(bodies[g].mouths)) check(g + ' mouth ' + k, v);
      for (const [k, v] of Object.entries(bodies[g].mouthsSide)) check(g + ' side mouth ' + k, v);
    }
    for (const o of outfits) for (const [k, v] of Object.entries(o.parts)) check('outfit ' + o.id + ' ' + k, v);
    for (const h of hairs) for (const [k, v] of Object.entries(h.parts)) check('hair ' + h.id + ' ' + k, v);
  }
  return { ok: !errors.length && (!!Object.keys(bodies).length || extraOnly), pack: errors.length ? null : pack, errors, warnings };
}

/** Reads a pack out of an .html file (the JSON script inside it), a plain .json file, or text with a ```json block. */
export function parsePackText(text, opts = {}) {
  const src = String(text == null ? '' : text);
  if (!src.trim()) return { ok: false, pack: null, errors: ['The file is empty.'], warnings: [] };
  const cands = [];
  const re = new RegExp('<script[^>]*type\\s*=\\s*["\']application/json["\'][^>]*>([\\s\\S]*?)<\\/script>', 'gi');
  let m;
  while ((m = re.exec(src))) cands.push(m[1]);
  const byId = new RegExp('<script[^>]*id\\s*=\\s*["\']' + PACK_SCRIPT_ID + '["\'][^>]*>([\\s\\S]*?)<\\/script>', 'i').exec(src);
  if (byId) cands.unshift(byId[1]);
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(src);
  if (fence) cands.push(fence[1]);
  if (/^\s*[{[]/.test(src)) cands.push(src);
  const at = src.indexOf('"format"');
  if (at >= 0) { const s = src.lastIndexOf('{', at); if (s >= 0) cands.push(src.slice(s)); }
  let lastErr = '';
  for (const c of cands) {
    let t = c.trim();
    if (!t) continue;
    for (const attempt of [t, t.replace(/,\s*([}\]])/g, '$1'), t.slice(0, t.lastIndexOf('}') + 1)]) {
      try {
        const j = JSON.parse(attempt);
        if (isObj(j) && (j.bodies || j.outfits || j.format === PACK_FORMAT)) return sanitizePack(j, opts);
      } catch (e) { lastErr = e && e.message ? String(e.message).slice(0, 120) : 'bad JSON'; }
    }
  }
  return { ok: false, pack: null, errors: [lastErr ? 'The character data inside the file is broken (' + lastErr + '). Ask the AI to send the file again.' : 'No character pack was found in this file. Use the file the AI made from the character maker prompt.'], warnings: [] };
}

/** Adds the outfits and hairstyles of `more` to `base` (same id): lets the AI send a second file with extra clothes. */
export function mergePacks(base, more) {
  if (!base) return more;
  if (!more) return base;
  const out = JSON.parse(JSON.stringify(base));
  delete out.extra;
  for (const g of Object.keys(more.bodies)) if (!out.bodies[g]) out.bodies[g] = more.bodies[g];
  for (const o of more.outfits) if (!out.outfits.some((x) => x.id === o.id && x.gender === o.gender)) out.outfits.push(o);
  for (const h of more.hairs) if (!out.hairs.some((x) => x.id === h.id && x.gender === h.gender)) out.hairs.push(h);
  out.outfits = out.outfits.slice(0, LIMITS.outfits);
  out.hairs = out.hairs.slice(0, LIMITS.hairs);
  return out;
}

/* ---------- putting a person together ---------- */

const TOKENS = /@(skinShade|skin|hairShade|hair|eye|line|c[1-4])\b/g;
const find = (list, want, gender) => {
  const w = slug(want);
  if (!w) return null;
  const ok = (x) => x.gender === gender || x.gender === 'any';
  return list.find((x) => ok(x) && (x.id === w || slug(x.label) === w)) || list.find((x) => x.id === w || slug(x.label) === w) || list.find((x) => ok(x) && (x.id.includes(w) || w.includes(x.id))) || null;
};

/**
 * One person from the pack: the body for the gender, an outfit, a hairstyle, and the colours.
 * look: { gender, outfit, hair, skin, hairc, eyec, topc, bottomc, accentc, shoec, colors, height }
 * Whatever the look leaves out is chosen from `seed` (the person's name), so a cast gets different clothes and hair.
 * Returns the definition regCustom() takes: { rig, size, mouth, skin, outline, color, parts }.
 */
export function composeLook(pack, look = {}, seed = '') {
  const L = isObj(look) ? look : {};
  const has = (g) => !!pack.bodies[g];
  let gender = /^(f|w|girl|lady|female|woman)/i.test(String(L.gender || '')) ? 'female' : /^(m|b|boy|man|male|guy)/i.test(String(L.gender || '')) ? 'male' : '';
  if (!gender) { const avail = ['male', 'female'].filter(has); gender = avail[hash(seed + '|g') % Math.max(1, avail.length)] || 'male'; }
  const bodyG = has(gender) ? gender : has('male') ? 'male' : 'female';
  const body = pack.bodies[bodyG];
  const pickFrom = (list, tag) => { const pool = list.filter((x) => x.gender === gender || x.gender === 'any'); const use = pool.length ? pool : list; return use.length ? use[hash(seed + '|' + tag) % use.length] : null; };
  const outfit = find(pack.outfits, L.outfit, gender) || pickFrom(pack.outfits, 'o');
  const wantHair = String(L.hair == null ? '' : L.hair);
  const noHair = /^(none|shaved|no)$/i.test(wantHair) || (/^bald$/i.test(wantHair) && !find(pack.hairs, wantHair, gender));
  const hair = noHair ? null : (find(pack.hairs, L.hair, gender) || pickFrom(pack.hairs, 'h'));
  const hp = (hair && hair.parts) || {};
  const skin = normHex(L.skin, body.skin || pack.defaults.skin);
  const hairc = normHex(L.hairc || L.hairColor, (hair && hair.color) || pack.defaults.hair);
  const oc = (outfit && outfit.colors && outfit.colors.length ? outfit.colors : pack.defaults.colors).concat(pack.defaults.colors);
  const lc = Array.isArray(L.colors) ? L.colors : [];
  const c = [normHex(L.topc || lc[0], oc[0]), normHex(L.bottomc || lc[1], oc[1]), normHex(L.accentc || lc[2], oc[2]), normHex(L.shoec || lc[3], oc[3])];
  const map = { skin, skinShade: shadeHex(skin, 0.84), hair: hairc, hairShade: shadeHex(hairc, 0.72), eye: normHex(L.eyec || L.eyeColor, pack.defaults.eye), line: pack.defaults.line, c1: c[0], c2: c[1], c3: c[2], c4: c[3] };
  const fill = (s) => (s ? s.replace(TOKENS, (m0, k) => map[k]) : '');
  const bp = body.parts, op = (outfit && outfit.parts) || {};
  // layers: hair that falls behind the person (back, sideBack) is its own piece, drawn BEHIND the neck, shoulders and body
  const sideBehind = hp.sideBack || '';
  const parts = {
    headBehind: fill(hp.back || ''),
    headBehindSide: fill(sideBehind),
    head: fill(bp.head + FACE_SLOT + (hp.front || '')),
    headSide: bp.headSide ? fill(bp.headSide + FACE_SLOT + (hp.side || hp.front || '')) : '',
    headBack: bp.headBack ? fill(bp.headBack + (hp.rear || '')) : '',
    mouthOpen: fill(bp.mouthOpen), mouthOpenSide: fill(bp.mouthOpenSide), eyesClosed: fill(bp.eyesClosed), eyesClosedSide: fill(bp.eyesClosedSide),
  };
  for (const k of OUTFIT_PARTS) parts[k] = fill(op[k]);
  // the moving face: pupils, eyebrows and the set of mouth shapes (drawn by faceMarkup at the FACE_SLOT of the head)
  const fm = (o) => { const r = {}; for (const k of Object.keys(o || {})) r[k] = fill(o[k]); return r; };
  const face = (bp.pupil || bp.browL || (body.mouths && Object.keys(body.mouths).length)) ? {
    pupil: fill(bp.pupil), pupilSide: fill(bp.pupilSide), browL: fill(bp.browL), browR: fill(bp.browR), browSide: fill(bp.browSide),
    mouths: fm(body.mouths), mouthsSide: fm(body.mouthsSide), eyes: body.eyes || null, brows: body.brows || null, mouth: body.mouth, mouthSide: body.mouthSide || null,
  } : null;
  const hgt = cl(+L.height || 1, 0.75, 1.25);
  return { rig: body.rig, size: cl(body.size * hgt, 0.5, 2), mouth: body.mouth, face, skin, outline: map.line, color: c[0], parts, _info: { gender, bodyGender: bodyG, outfit: outfit && outfit.id, hair: hair ? hair.id : 'none' } };
}

/** Short summary for the screen and for the AI prompt. */
export function describePack(pack) {
  const ids = (list, g) => list.filter((x) => x.gender === g || x.gender === 'any').map((x) => x.id);
  return {
    id: pack.id, name: pack.name,
    genders: Object.keys(pack.bodies),
    outfits: { male: ids(pack.outfits, 'male'), female: ids(pack.outfits, 'female') },
    hairs: { male: ids(pack.hairs, 'male'), female: ids(pack.hairs, 'female') },
  };
}

/** What the scene prompt says when the person's saved characters are installed in the app. */
export function packCastGuide(packs) {
  const list = (Array.isArray(packs) ? packs : []).filter(Boolean);
  if (!list.length) return '';
  const rows = list.map((p) => {
    const d = describePack(p);
    return `- pack "${d.id}" (${d.name}): male outfits [${d.outfits.male.join(', ')}], female outfits [${d.outfits.female.join(', ')}]; male hair [${d.hairs.male.join(', ')}], female hair [${d.hairs.female.join(', ')}]`;
  }).join('\n');
  return `MY SAVED CHARACTERS ARE ALREADY INSTALLED IN THE APP (character pack). Do NOT draw people yourself and do NOT write customCharacter(...). Create every person (heroes, bosses, passers-by, crowd members) with packCharacter near the top of the file, then place them with {custom:'Name', ...}:
packCharacter('Mara', {gender:'female', outfit:'<outfit id>', hair:'<hair id>', skin:'#b97c52', hairc:'#2b1b14', topc:'#7a5a8a', bottomc:'#1f2937', accentc:'#f5b700', shoec:'#222222', height:1});
${rows}
- Every field is optional. Choose them for the story (a nurse, a CEO, a street seller...): a different outfit id, hair id and colours for every person, so no two people look alike. Fields you leave out are picked automatically and differently for each name.
- Add pack:'<pack id>' to use a pack other than the first one. Crowds: write several packCharacter people with different looks and place them small and far (do not use crowd(), it draws the built-in people).
- Write movie({title:'...', aspect:'16:9', character:'custom'}) and give every person {custom:'Name'} in every scene (and the thumbnail). Front, side and back views, talking mouths, blinking, walking and all acting commands work on these people exactly as on the built-in ones.
- Everything else (sets, props, objects, effects, camera, captions) you still design freely.`;
}

/* ---------- keeping packs on the device ---------- */

const DB = 'animato-char-packs', STORE = 'packs', LS_KEY = 'stk_char_packs';

/** A tiny store: IndexedDB when the browser has it, localStorage otherwise, memory as the last resort. */
export function createStore(env = {}) {
  const idb = env.indexedDB !== undefined ? env.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  const ls = env.localStorage !== undefined ? env.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
  const mem = new Map();
  let db = null;
  const open = () => new Promise((res) => {
    if (!idb) return res(null);
    if (db) return res(db);
    try {
      const rq = idb.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE, { keyPath: 'id' }); } catch (e) { /* exists */ } };
      rq.onsuccess = () => { db = rq.result; res(db); };
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  const lsRead = () => { try { const j = JSON.parse(ls.getItem(LS_KEY) || '[]'); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
  const lsWrite = (a) => { try { ls.setItem(LS_KEY, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const tx = (mode, fn) => open().then((d) => new Promise((res) => {
    if (!d) return res(undefined);
    try { const t = d.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => res(r && r.result !== undefined ? r.result : true); t.onerror = () => res(undefined); t.onabort = () => res(undefined); } catch (e) { res(undefined); }
  }));
  return {
    async all() {
      const d = await open();
      let list = null;
      if (d) list = await new Promise((res) => { try { const r = d.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res(null); } catch (e) { res(null); } });
      if (!list && ls) list = lsRead();
      if (!list) list = [...mem.values()];
      return list;
    },
    async put(pack) {
      mem.set(pack.id, pack);
      if (await tx('readwrite', (s) => s.put(pack))) return true;
      if (ls) { const a = lsRead().filter((p) => p.id !== pack.id); a.push(pack); return lsWrite(a); }
      return true;
    },
    async remove(id) {
      mem.delete(id);
      await tx('readwrite', (s) => s.delete(id));
      if (ls) lsWrite(lsRead().filter((p) => p.id !== id));
      return true;
    },
  };
}


/**
 * Draws the MOVING part of the face: pupils that look around, eyebrows that show the feeling, and one mouth shape.
 * Pure and self-contained (no outside names) so the same source also runs inside the pack's own viewer.
 *   F     the face of a composed person (composeLook().face)
 *   S     { gx, gy: where the eyes look (-1..1), tilt: +1 worried ... -1 angry, raise: brows up/down (-.8..1.2), eye: eye openness,
 *           yaw, pitch: head turn, mouth: a mouth name (rest smile grin smirk frown flat open AI E O U MBP FV L CONS), open: 0..1 jaw while talking }
 *   view  'front' | 'side' | 'back'
 * Returns { svg, mouth, pupil, brow }: which parts it actually drew (so the caller knows to skip the old overlays).
 */
export function faceMarkup(F, S, view) {
  var o = { svg: '', mouth: false, pupil: false, brow: false };
  if (!F || view === 'back') return o;
  S = S || {};
  var side = view === 'side', out = '';
  var cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var nm = function (v, d) { v = +v; return isFinite(v) ? v : d; };
  var r = function (v) { return Math.round(v * 100) / 100; };
  var yaw = cl(nm(S.yaw, 0), -1, 1), pit = cl(nm(S.pitch, 0), -1, 1);
  var E = F.eyes || {}, B = F.brows || {};
  var P = side ? F.pupilSide : F.pupil;
  if (P) {
    var rg = E.range || [5, 3.5];
    var gx = cl(nm(S.gx, 0) + (side ? 0 : yaw * 0.6), -1, 1), gy = cl(nm(S.gy, 0) + pit * 0.6, -1, 1);
    var spots = side ? [E.side] : [E.l, E.r];
    for (var i = 0; i < spots.length; i++) if (spots[i]) { out += '<g transform="translate(' + r(spots[i][0] + gx * rg[0]) + ',' + r(spots[i][1] + gy * rg[1]) + ')">' + P + '</g>'; o.pupil = true; }
  }
  var bl = side ? F.browSide : F.browL;
  if (bl) {
    var ti = cl(nm(S.tilt, 0), -1.4, 1.4), up = -cl(nm(S.raise, 0), -0.8, 1.2) * 14 + (1 - cl(nm(S.eye, 1), 0.15, 1.5)) * 5;
    if (side) {
      if (B.side) { out += '<g transform="translate(' + r(B.side[0]) + ',' + r(B.side[1] + up) + ') rotate(' + r(-ti * 12) + ')">' + bl + '</g>'; o.brow = true; }
    } else {
      if (B.l) { out += '<g transform="translate(' + r(B.l[0]) + ',' + r(B.l[1] + up) + ') rotate(' + r(-ti * 18) + ')">' + bl + '</g>'; o.brow = true; }
      if (B.r) { out += '<g transform="translate(' + r(B.r[0]) + ',' + r(B.r[1] + up) + ') rotate(' + r(ti * 18) + ')">' + (F.browR || '<g transform="scale(-1,1)">' + bl + '</g>') + '</g>'; o.brow = true; }
    }
  }
  var M = side ? F.mouthsSide : F.mouths, mp = side ? (F.mouthSide || F.mouth) : F.mouth;
  if (M && mp) {
    var low = {}, any = false;
    for (var k in M) { low[k.toLowerCase()] = M[k]; any = true; }
    if (any) {
      var chain = { smile: ['smile', 'rest'], grin: ['grin', 'smile', 'rest'], smirk: ['smirk', 'smile', 'rest'], frown: ['frown', 'rest'], flat: ['rest'], rest: ['rest', 'flat'], open: ['o', 'ai'],
        ai: ['ai', 'o', 'e'], e: ['e', 'ai', 'smile'], o: ['o', 'ai', 'u'], u: ['u', 'o'], mbp: ['mbp', 'rest'], fv: ['fv', 'cons', 'e'], l: ['l', 'cons', 'e'], cons: ['cons', 'e', 'l', 'ai'], laugh: ['ai', 'grin'] };
      var want = String(S.mouth || 'rest').toLowerCase(), ch = chain[want] || [want, 'rest'], piece = '';
      for (var j = 0; j < ch.length && !piece; j++) piece = low[ch[j]] || '';
      if (!piece) piece = low.rest || '';
      if (piece) {
        var sc = S.open == null ? 1 : 0.72 + 0.28 * cl(nm(S.open, 0) * 1.25, 0, 1);
        out += '<g transform="translate(' + r(mp[0]) + ',' + r(mp[1]) + ') scale(1,' + r(sc) + ')">' + piece + '</g>';
        o.mouth = true;
      }
    }
  }
  o.svg = out ? '<g transform="translate(' + r(side ? 0 : yaw * 3) + ',' + r(pit * 2) + ')">' + out + '</g>' : '';
  return o;
}

/* ---------- the prompt the person copies into ChatGPT, Claude, Gemini... ---------- */

/** The minimal viewer that goes inside the pack file. It reads the JSON above it and draws every person in front, side and back view. */
export const VIEWER_SCRIPT = `(function(){
var SLOT='<g data-face="1"></g>';
${faceMarkup.toString()}
var FS={mouth:'rest',tilt:0,raise:0,gx:0,gy:0};
var pack=JSON.parse(document.getElementById('animato-character-pack').textContent);
var T=/@(skinShade|skin|hairShade|hair|eye|line|c[1-4])\\b/g;
function hx(c,d){c=String(c||'').trim();return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)?c:d}
function shade(h,k){h=hx(h,'#888888');if(h.length==4)h='#'+h[1]+h[1]+h[2]+h[2]+h[3]+h[3];var o='#';[1,3,5].forEach(function(i){o+=('0'+Math.max(0,Math.min(255,Math.round(parseInt(h.substr(i,2),16)*k))).toString(16)).slice(-2)});return o}
function compose(g,oi,hi){var b=pack.bodies[g]||pack.bodies.male||pack.bodies.female,os=pack.outfits.filter(function(o){return o.gender==g||o.gender=='any'}),hs=pack.hairs.filter(function(h){return h.gender==g||h.gender=='any'});
var o=os[oi%os.length],h=hs.length?hs[hi%hs.length]:{parts:{}},D=pack.defaults,skin=hx(b.skin,D.skin),hc=hx(h.color,D.hair),cs=(o.colors&&o.colors.length?o.colors:D.colors).concat(D.colors);
var m={skin:skin,skinShade:shade(skin,.84),hair:hc,hairShade:shade(hc,.72),eye:D.eye,line:D.line,c1:cs[0],c2:cs[1],c3:cs[2],c4:cs[3]};
function f(s){return (s||'').replace(T,function(a,k){return m[k]})}var hp=h.parts||{},bp=b.parts,P={};
P.headBehind=f(hp.back||'');P.headBehindSide=f(hp.sideBack||'');P.head=f(bp.head+SLOT+(hp.front||''));P.headSide=bp.headSide?f(bp.headSide+SLOT+(hp.side||hp.front||'')):'';P.headBack=bp.headBack?f(bp.headBack+(hp.rear||'')):'';
var F=null,mo={},mos={};for(var k in (b.mouths||{}))mo[k]=f(b.mouths[k]);for(var k2 in (b.mouthsSide||{}))mos[k2]=f(b.mouthsSide[k2]);
if(bp.pupil||bp.browL||Object.keys(mo).length)F={pupil:f(bp.pupil),pupilSide:f(bp.pupilSide),browL:f(bp.browL),browR:f(bp.browR),browSide:f(bp.browSide),mouths:mo,mouthsSide:mos,eyes:b.eyes,brows:b.brows,mouth:b.mouth,mouthSide:b.mouthSide};
['torso','torsoSide','torsoBack','upperArm','foreArm','upperLeg','lowerLeg','lowerLegSide'].forEach(function(k){P[k]=f(o.parts[k])});
return {P:P,F:F,rig:b.rig||pack.rig,label:g+' · '+o.id+' · '+(h.id||'no hair')}}
function draw(c,view){var R=c.rig,P=c.P,s=view=='side',bk=view=='back',hipY=880-(R.upperLeg+R.lowerLeg),neck=hipY-R.torso,sh=neck+R.shoulderDown;
function pk(k){return (s&&P[k+'Side'])||(bk&&P[k+'Back'])||P[k]}
function leg(m){var x=s?(m>0?-8:8):m*R.hipX;return '<g transform="translate('+x+','+hipY+')">'+P.upperLeg+'<g transform="translate(0,'+R.upperLeg+')">'+((s&&P.lowerLegSide)||P.lowerLeg)+'</g></g>'}
function arm(m){var x=s?0:m*R.shoulderX;return '<g transform="translate('+x+','+sh+') rotate('+(m<0?6:-6)+')">'+P.upperArm+'<g transform="translate(0,'+R.upperArm+')">'+P.foreArm+'</g></g>'}
var behind=bk?'':(s?P.headBehindSide:P.headBehind)||'';var body='<g transform="translate(0,'+neck+')">'+behind+'</g>'+(s?leg(1)+leg(-1):leg(-1)+leg(1))+'<g transform="translate(0,'+hipY+')">'+pk('torso')+'</g>'+(s?arm(-1):arm(-1)+arm(1))+'<g transform="translate(0,'+neck+')">'+pk('head').replace(SLOT,bk?'':faceMarkup(c.F,FS,view).svg)+'</g>';
return '<svg viewBox="-150 130 300 770" width="150" height="385">'+body+'</svg>'}
function render(){var h='<h1>'+pack.name+'</h1>';['male','female'].forEach(function(g){if(!pack.bodies[g])return;var os=pack.outfits.filter(function(o){return o.gender==g||o.gender=='any'}),n=Math.max(os.length,1);
h+='<h2>'+g+'</h2><div class=row>';for(var i=0;i<n;i++){var c=compose(g,i,i);h+='<figure><div>'+['front','side','back'].map(function(v){return draw(c,v)}).join('')+'</div><figcaption>'+c.label+'</figcaption></figure>'}h+='</div>'});
document.getElementById('sheet').innerHTML=h}
var ct=document.createElement('div');ct.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0;font-size:12px;color:#9fb3d1';
function sel(label,opts,fn){var l=document.createElement('label');l.textContent=label+' ';var e=document.createElement('select');e.style.cssText='background:#1b2030;color:#eee;border:1px solid #33405e;border-radius:6px;padding:3px';opts.forEach(function(o){var q=document.createElement('option');q.textContent=o;e.appendChild(q)});e.onchange=function(){fn(e.value);render()};l.appendChild(e);ct.appendChild(l)}
sel('Face test: mouth',['rest','smile','grin','smirk','frown','AI','E','O','U','MBP','FV','L','CONS'],function(v){FS.mouth=v});
sel('brows',['calm','happy','sad','angry','surprised'],function(v){var m={calm:[0,0],happy:[.2,.3],sad:[.9,-.1],angry:[-.9,-.2],surprised:[0,1]}[v];FS.tilt=m[0];FS.raise=m[1]});
sel('eyes look',['centre','left','right','up','down'],function(v){var m={centre:[0,0],left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[v];FS.gx=m[0];FS.gy=m[1]});
var sh=document.getElementById('sheet');sh.parentNode.insertBefore(ct,sh);render()})();`;

export function buildMakerPrompt() {
  return `${MAKER_MARKER} · works with ChatGPT, Claude, Gemini, Google AI Studio or any AI model

YOUR JOB: turn the reference image I attach into a CHARACTER PACK: one downloadable .html file that holds a complete, animatable character, drawn as SVG, in the exact look of my reference image. The Animato app imports the file and uses the character in animated videos.

STEP 0. THE IMAGES. If no image is attached yet, reply ONLY: "Please attach the reference image of your character (a clear picture; a full-body picture is best). If you also have a SIDE view and a BACK view of the same character, attach them in the same message (optional). If you don't have them, I will work them out precisely from the front view." Do nothing else until the image is attached. As soon as it is attached, start (do not wait for the optional views) and work silently. Treat the FIRST image as the front reference. If a side view and/or back view is attached, those are the master blueprint for those views (copy them exactly: hair length, clothes details, shoes, accessories). Any view that is NOT attached, you must CALCULATE precisely from the front reference (see SIDE AND BACK VIEWS below).

THE REFERENCE IMAGE IS THE MASTER BLUEPRINT. Your aim is a PERFECT REPLICA of this character, from the hair down to the shoes, in the same art style. Use all the effort and length you have; do not shortcut, do not simplify, do not fall back to a generic character, do not stop at "close enough". Whatever you can see in the image must be in the drawing: if you cannot copy a detail exactly, get as close as you possibly can.

WORK IN THIS ORDER (every step is required):
1. INVENTORY (write it for yourself before any drawing). List what you see, part by part: art style (outline thickness and colour, flat or shaded, realistic or cartoon or stick or anime), head shape and size, face (eyes, irises, brows, nose, mouth, lips, ears, cheeks, freckles, wrinkles, makeup), skin tone (hex), hair (style, length, parting, fringe, volume, texture, colours as hex), facial hair, neck, shoulders and body build, every garment (type, cut, colours as hex, buttons, pockets, logos, patterns, sleeves, collar), belt, trousers or skirt, socks, shoes, jewellery, glasses, hats, bags, scars, tattoos, and anything unusual. Note the body proportions (head height compared with the body, arm and leg length). If the image shows only part of the body, continue it in the same style.
2. BUILD THE BODY of the character you see (the reference gender): the head and face drawn exactly like the image, then the clothes exactly like the image. This is the REFERENCE LOOK and it must be a faithful copy.
3. BUILD THE OPPOSITE GENDER in the same art style, the same face language (eyes, nose, line weight) and the same proportions, adapted naturally (hair, build, clothes).
4. BUILD THE WARDROBE: at least 4 different outfits for each gender (outfit 1 = the reference outfit; then for example casual, formal suit or dress, sporty, work or uniform), each in the same art style and fitting the same body.
5. BUILD THE HAIRSTYLES: at least 4 for each gender (hairstyle 1 = the reference hair; then clearly different styles and lengths, one can be bald/very short).
6. COMPARE AND FIX. Look at your drawing again next to the reference image, part by part (hair, face, clothes, shoes, colours, proportions, line style). List every difference you find and fix it. Repeat until the reference look matches as closely as you can get it.
7. CHECK THE FILE (see the checklist) and deliver it.

IT MUST BE ANIMATABLE: the app moves each piece like a puppet (walking, running, waving, pointing, sitting, talking, blinking, turning). So the character is NOT one flat picture. Draw SEPARATE PIECES, each around its OWN PIVOT at (0,0), one unit = one pixel, the whole person about 660 units tall (matching the rig numbers below):
- head: the pivot is the NECK. The head goes UP (negative y): about 150 to 190 tall and 130 to 170 wide, centred on x=0, with a short neck stub just below y=0. Draw here everything FIXED on the head: skin, ears, nose, cheeks, blush, freckles, wrinkles, makeup, the eye SOCKETS and eye WHITES (with their outline and eyelashes), but NOT the irises/pupils, NOT the eyebrows, NOT the mouth or lips (those are the moving face pieces below, drawn separately; if you left them in the head they would be drawn twice and never move), and NOT the hair (hair is a separate layer, see below). Facing the camera.
- headSide: the same head in true PROFILE, facing RIGHT (+x), nose pointing right, the ear showing. headBack: the back of the head and neck seen from behind (skin, ears; hair is added by the hair layer).
SIDE AND BACK VIEWS MUST BE CORRECT, not a mirrored or squashed copy of the front. If I attached a side or back image, copy it. If not, CALCULATE them from the front reference like a character model sheet: keep the SAME head height, chin line, eye line, shoulder line, waist, hem and shoe line in all three views (draw the three views mentally on one grid). Profile: the skull is as deep as it is wide, the face is a profile silhouette (forehead, brow ridge, nose that sticks out to the right with the true nose shape and size from the front, lips, chin and jaw line), ONE visible eye (narrower, at the front of the head), the ear sits just behind the middle of the head at the eye-to-nose height, the neck leans slightly forward, the torso is about 60% as wide as the front (chest and back curves, the belly, the bust or the hips as they would really look), the arms hang from the middle of the shoulder, and clothing details wrap around correctly (a collar opening, buttons or a zip line on the front edge, pockets, hem lines, a skirt that is narrower). Back view: the back of the head with the real hair shape and the hairline, both ears, the back of the neck, the collar, the back of the clothes (seams, hood, straps, a bag, labels, back pockets), no face. Accessories (glasses arms, earrings, hat, bag straps, necklace, watch) must appear consistently in every view.
- MOVING FACE (required, this is what makes the character come alive; draw it in the SAME art style as the reference, with the same line weight, colours and lip style):
  pupil: ONE eye's iris + pupil + highlight (the coloured round part that looks around), drawn around its own centre (0,0), sized to sit INSIDE the eye white with a few units to spare on each side. The app draws it twice (left eye and right eye) and slides it to make the eyes look left, right, up and down, so the eye whites in the head must be big enough for it to travel. eyes: {"l":[x,y],"r":[x,y],"range":[5,3.5]} gives the centre of the left and right eye (in head space) and how far the pupil may slide (x, y units). If the reference has big anime eyes or a simple dot, keep that style (a dot eye is just a small pupil). 
  browL: ONE eyebrow (the one over the character's LEFT eye on the screen, x<0), drawn around its own centre (0,0), the INNER end (towards the nose) on the +x side. The app mirrors it for the other brow (or give browR too if they differ). brows: {"l":[x,y],"r":[x,y]} gives where the brows sit. The app raises, lowers and tilts them for happy, sad, angry, surprised and worried faces, so draw them as clean separate shapes with a bit of room above the eye.
  mouths: a SET of mouth shapes, each drawn around the SAME centre (0,0) (the app puts it at the body's mouth:[x,y]), same width scale, same style, same lip colour and shape language as the reference mouth, including lips, lipstick, teeth, tongue and mouth corners. They are used for LIP SYNC (the app picks the shape that matches the sound being spoken) and for moods. Draw ALL of these keys: "rest" (relaxed closed mouth, the reference's neutral mouth), "smile", "grin" (big smile with teeth), "smirk" (one corner up), "frown", "AI" (wide open, the "ah" sound), "E" (wide and thin, teeth showing, "ee"), "O" (round open, "oh"), "U" (small rounded pucker, "oo"), "MBP" (lips pressed together, for m, b, p), "FV" (upper teeth resting on the lower lip, for f, v), "L" (mouth half open, tongue tip up behind the upper teeth, for l, th), "CONS" (slightly open, teeth close, for t, d, s, k). They must read clearly at small size and match each other (same head, same jaw width), so the jump from one to the next looks like one person talking. Accurate lip sync is a core goal: make AI, E, O, U, MBP, FV and L clearly different from each other.
  eyesClosed: closed eyes drawn in head space ON TOP of the head, with shapes in the skin colour under them that cover the open eyes AND the pupils; shown while blinking.
  Optional for the profile: pupilSide (+ eyes.side [x,y]), browSide (+ brows.side [x,y]), mouthsSide (the same set of mouth shapes in profile, facing RIGHT, + mouthSide [x,y]). If you give a profile piece, leave that feature OUT of headSide (it is drawn by the app); if you do not give it, draw that feature fixed inside headSide. 
  Old style (only if you truly cannot draw the set): mouthOpen, an open talking mouth ON TOP of the head, with mouth:[x,y] its centre. Prefer the mouths set.
- torso: the pivot is the middle of the PELVIS; the body goes UP to the neck at y = -torso (190 by default). The clothes on the chest, belly and hips, the shoulders. torsoSide: the torso in profile (narrower). torsoBack: seen from behind.
- upperArm: the pivot is the SHOULDER, the arm hangs straight DOWN to the elbow (rig.upperArm long), sleeve included. foreArm: the pivot is the ELBOW, hangs straight DOWN to the fingertips, hand included (rig.foreArm long), cuff or glove included.
- upperLeg: the pivot is the HIP, hangs straight DOWN to the knee (rig.upperLeg). lowerLeg: the pivot is the KNEE, hangs straight DOWN to the ground (rig.upperLeg + rig.lowerLeg from the hip) and ends in the shoe. lowerLegSide: the same in profile with the shoe pointing RIGHT (+x). A skirt or dress belongs to the torso piece (it may hang over the legs); the leg pieces under it are the bare or stockinged legs.
- Hair: each hairstyle is up to five layers, drawn in head space (pivot = the neck), and the app stacks them in this order, back to front: [back] behind the WHOLE body, then the legs, torso and arms, then the head, then [front] on top of the face.
  back = ONLY the hair that hangs BEHIND the person (long hair behind the neck and shoulders, a ponytail, a bun's tail). It is drawn BEHIND the neck, shoulders, torso and arms, so it must never be needed to cover them; do not put fringe, crown or anything that should lie on the face or in front of the neck in back.
  front = hair that lies ON TOP of the head and face seen from the front: fringe, crown, parting, sideburns, and locks that fall IN FRONT of the shoulders. Keep it clear of the neck (the neck stub is x -13 to 13) unless the hair really covers it.
  side = the hair in profile, drawn over headSide. sideBack = hair behind the profile body (the long hair falling behind the back in profile), drawn behind the body like back.
  rear = the hair seen from behind, drawn over headBack, on top of the back of the head and the neck and shoulders (long hair seen from behind does cover the back and neck, that is correct).
- rig (numbers): {upperLeg:150, lowerLeg:150, torso:190, shoulderX:58, shoulderDown:25, hipX:32, upperArm:105, foreArm:100}. Adjust them if the character is taller, shorter, thinner or chibi, and draw the pieces to those lengths. size: overall scale (default 1.1).

COLOUR TOKENS (so one drawing can be re-coloured by the app: use them in fill and stroke instead of fixed colours where a colour should be changeable):
@skin (skin tone), @skinShade (a darker skin shade), @hair, @hairShade, @eye, @line (the outline colour), @c1 (main clothing colour: shirt, dress, jacket), @c2 (second clothing colour: trousers, skirt), @c3 (accent: tie, trim, belt), @c4 (shoes). Write them as plain text inside the attribute: fill="@skin", stroke="@line". Use real hex colours for things that must stay fixed (a logo, a button). In "defaults" put the REAL colours from the reference image (skin, hair, line, eye, colors:[c1,c2,c3,c4]) so the reference look appears exactly as in the image.

SVG RULES: each piece is an SVG fragment string: path, circle, ellipse, rect, polygon, line, g, linearGradient and radialGradient (inside <defs>, with unique ids), stroke, opacity. NO <svg> wrapper, no <image>, no <script>, no <style>, no <use>, no <a>, no external links, no text or fonts. Every piece under 30,000 characters. Straight quotes only. Smooth curves (C, Q) and layered shapes make it look professional: add gradients, shadows, highlights, folds, texture lines, whatever the reference style has.

THE PACK FILE: ONE self-contained HTML file named character-pack.html. It contains exactly this JSON inside a script tag, then the viewer script. In the JSON write "</" as "<\\/" and keep it valid JSON (double quotes, no comments, no trailing commas).
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CHARACTER NAME · Animato character pack</title>
<style>body{margin:0;padding:16px;font:14px system-ui;background:#10131a;color:#eee}h1{font-size:20px}h2{font-size:15px;color:#9fb3d1}.row{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0;background:#1b2030;border-radius:10px;padding:8px}figure>div{display:flex}figcaption{font-size:11px;color:#9fb3d1;text-align:center}</style></head><body><div id="sheet"></div>
<script type="application/json" id="animato-character-pack">
{
 "format":"animato-character-pack","version":1,"name":"Character name","id":"character-name",
 "notes":"one line: what the reference is (art style, who)",
 "defaults":{"skin":"#d9a679","line":"#1a1a1a","eye":"#2b1a10","hair":"#1b1b1b","colors":["#3b82f6","#1e3a8a","#f5b700","#e2eafc"]},
 "rig":{"upperLeg":150,"lowerLeg":150,"torso":190,"shoulderX":58,"shoulderDown":25,"hipX":32,"upperArm":105,"foreArm":100},"size":1.1,
 "bodies":{
  "male":{"mouth":[0,-48],"eyes":{"l":[-26,-80],"r":[26,-80],"range":[5,3.5]},"brows":{"l":[-26,-104],"r":[26,-104]},
   "parts":{"head":"<svg fragment>","headSide":"...","headBack":"...","pupil":"...","browL":"...","eyesClosed":"..."},
   "mouths":{"rest":"...","smile":"...","grin":"...","smirk":"...","frown":"...","AI":"...","E":"...","O":"...","U":"...","MBP":"...","FV":"...","L":"...","CONS":"..."}},
  "female":{"mouth":[0,-48],"eyes":{...},"brows":{...},"parts":{...same pieces...},"mouths":{...the 13 shapes...}}
 },
 "outfits":[
  {"id":"reference","label":"Reference outfit","gender":"male","colors":["#hex","#hex","#hex","#hex"],"parts":{"torso":"...","torsoSide":"...","torsoBack":"...","upperArm":"...","foreArm":"...","upperLeg":"...","lowerLeg":"...","lowerLegSide":"..."}},
  ...at least 4 per gender, "gender" is "male", "female" or "any"...
 ],
 "hairs":[
  {"id":"reference","label":"Reference hair","gender":"male","color":"#hex","parts":{"back":"...","front":"...","side":"...","rear":"..."}},
  ...at least 4 per gender...
 ]
}
</script>
<script>
${VIEWER_SCRIPT}
</script></body></html>
(Copy the viewer script exactly as printed above, it draws every person in front, side and back view so we can both check the result.)

CHECKLIST BEFORE YOU SEND (silently, fix anything that fails):
[ ] I compared every part with the reference image and fixed every difference: hair, face, skin, clothes, colours, shoes, proportions, line style.
[ ] Male and female bodies both exist; each has head, headSide, headBack, eyesClosed, pupil, browL, eyes, brows, mouth and ALL 13 mouth shapes (rest, smile, grin, smirk, frown, AI, E, O, U, MBP, FV, L, CONS).
[ ] The head has NO pupils, NO eyebrows and NO mouth drawn in it (they are the moving pieces); the pupil sits inside the eye white with room to move; the mouth shapes are all centred on (0,0) and clearly different (AI, E, O, U, MBP, FV, L), in the reference's lip style.
[ ] The face matches the reference exactly (eye shape and colour, brow shape and thickness, lips, nose, ears, skin marks).
[ ] Side and back views are correct and consistent with the front (same heights, lines, accessories); taken from my side/back images if I gave them, calculated precisely if I did not.
[ ] At least 4 outfits for each gender, each with torso, torsoSide, torsoBack, upperArm, foreArm, upperLeg, lowerLeg and lowerLegSide.
[ ] At least 4 hairstyles for each gender, each with front, side and rear (and back / sideBack when hair falls behind the person). Hair that hangs behind the neck and shoulders is in back, never in front.
[ ] Every piece is drawn around its own pivot as described; arms and legs hang straight down; shoes point right in the side pieces.
[ ] Colours use the @tokens where they should change, and the defaults hold the real reference colours.
[ ] The JSON is valid and every SVG fragment is well-formed (every tag closed).
[ ] The file is complete: no "...", no placeholders, no "and so on".

HOW TO DELIVER: create a real downloadable file named character-pack.html (use your file, canvas, artifact or code-interpreter tool). If you CAN preview HTML, open it and look at it; fix anything that looks wrong. Your chat reply is short: the download link, then 3 steps: 1) Download the file. 2) Open Animato Studio Pro, then Tools, then Code to stickman. 3) Choose the Reference Image character, tap "Import character file" and pick the file. If you CANNOT make a downloadable file, say so in one line and print the whole file in ONE code block.
If your length limit cuts the file short, deliver what you finished as a complete valid pack (fewer outfits and hairstyles are fine, but both bodies and the reference outfit and hair must be complete) and then, when I say "continue", send a second complete file with the SAME "id" and "name" holding only the extra "outfits" and "hairs" (and nothing else is needed): the app adds them to the first pack.

Start now: if there is no image yet, ask for it.`;
}
