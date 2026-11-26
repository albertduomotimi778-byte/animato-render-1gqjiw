// Ambient life: every person breathes, shifts weight, drifts their head, gestures with the words while speaking and
// nods / leans in while listening, even when the file's animate() does nothing. Pure function of film time, so the
// preview and the exported video match. It only ADDS small offsets and never touches a person who is acting an action.
const cl = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// k: person index; T: film seconds; o: { talking, listening, stress (0..1), busy (a walk/react/action owns the body) }
export function ambientPose(k, T, o = {}) {
  const ph = hash(k + 1) * 6.283, sp = 0.9 + hash(k + 7) * 0.25;
  const breath = Math.sin(T * 1.55 * sp + ph);
  const sway = Math.sin(T * 0.42 * sp + ph * 1.7) * 0.6 + Math.sin(T * 0.97 + ph) * 0.4;
  const d = { dy: breath * 1.6, tr: sway * 1.1, hr: Math.sin(T * 0.63 + ph) * 1.4, hx: 0, hy: 0, dx: sway * 2, a: [0, 0, 0, 0] };
  d.a[0] = breath * 1.8 + sway * 1.5; d.a[2] = breath * 1.8 - sway * 1.5;
  if (o.busy) { d.dx = 0; d.a = [0, 0, 0, 0]; d.tr *= 0.3; return d; }
  if (o.talking) {
    const st = cl(o.stress == null ? 0.5 : o.stress, 0, 1);
    // a beat gesture every ~1.4s, sharper on stressed words; head bobs on the emphasis
    const per = 1.35 + hash(k + 3) * 0.4, u = ((T + hash(k) * 2) % per) / per;
    const env = u < 0.28 ? Math.sin((u / 0.28) * Math.PI) : 0;
    const side = Math.floor((T + hash(k) * 2) / per) % 2 ? 1 : 0;
    const amp = 16 + 26 * st;
    d.a[side * 2] += env * amp; d.a[side * 2 + 1] += env * amp * 0.5;
    d.dy += -env * 3 * (0.5 + st); d.hr += env * 3.2 * (side ? 1 : -1); d.hx = Math.sin(T * 1.9 + ph) * 0.25;
    d.tr += env * 2;
  } else if (o.listening) {
    // a slow nod, a small lean toward the speaker, a tilt of the head
    const nod = Math.max(0, Math.sin(T * 1.25 + ph * 2)) ** 3;
    d.hr += 2.2 + nod * -3.5; d.dy += nod * 2.2; d.tr += 1.6; d.hy = nod * 0.18;
  }
  return d;
}

// adds the offsets to a POSE object (arms are [lu, ll, ru, rl] upper/lower angles)
export function applyAmbient(P, d, w = 1) {
  if (!P || !d) return P;
  for (const k of ['dy', 'tr', 'hr', 'hx', 'hy', 'dx']) P[k] = (+P[k] || 0) + d[k] * w;
  const a = Array.isArray(P.a) ? P.a.slice() : [34, -36, 34, -36];
  for (let i = 0; i < 4; i++) a[i] = (+a[i] || 0) + d.a[i] * w;
  P.a = a; return P;
}

export function livelinessRule() {
  return `ACT, DON'T STAND (the people must feel alive, like a hand-animated short film):
- Every beat the narrator says, the person ACTS: gesture with the arms on stressed words, change the face with each new feeling (face:'worried@0->shocked@1.8'), look at who they speak to, react with the body when something happens to them.
- Whoever is listening is never frozen: they nod, lean in, glance away, show surprise or doubt on the face the moment the other person says something that lands.
- Give every person a different manner (one fidgets, one is calm, one over-gestures). Use anticipation before a big move and a settle after it.
- Talk with the narration: set the speaking person on each line so the mouth moves with the words, and cut to a close-up on the face for the emotional line.
- The app adds breathing, weight shift, small head movement and beat gestures on top, so your job is the BIG acting choices, not the idle motion.`;
}
