// Content type: what kind of video is being made. Each type adds a block to the prompt that sets who speaks, how the
// cast is used, the structure, and a hard pace rule so people never get bored.
export const CONTENT_TYPES = [
  { id: 'movie', name: 'Animated movie', hint: 'Characters act the story and speak their own lines' },
  { id: 'narration', name: 'Narration animation', hint: 'A voice tells it and the characters act it out' },
  { id: 'presenter', name: 'Documentary (presenter)', hint: 'A host talks on stage, others act it out behind' },
];
export const DEFAULT_TYPE = 'narration';
export const CT_MARKER = 'CONTENT TYPE:';
export const isType = (id) => CONTENT_TYPES.some((t) => t.id === id);
export const typeOf = (id) => CONTENT_TYPES.find((t) => t.id === id) || CONTENT_TYPES.find((t) => t.id === DEFAULT_TYPE);

const PACE = `NEVER BORING: PACE RULES (viewers leave when nothing changes, so something new must happen every 2 to 3 seconds):
- Hook in the first 2 seconds: start on the most striking moment (a shout, a crash, a shocking line, a big question). No slow openings, no logo, no "hello".
- A new shot, camera move, zoom, cut, prop, expression or on-screen word every 2 to 3 seconds. Never hold the same framing longer than 4 seconds.
- Fast graphics: punch-in zooms on the key word, quick whip cuts between places, impact shakes on hits, flash frames on reveals, big on-screen words and numbers for the facts, speed lines or pops on surprises, icons and arrows that animate in.
- Every scene ends on a small cliffhanger, question or surprise that makes the next scene necessary. Plant a twist and pay it off.
- Characters are always doing something: gesturing on every stressed word, reacting the second something is said, moving through the space. Nobody just stands.
- Vary the rhythm: fast burst, one beat of calm, fast burst. Close-up for feeling, wide for reveal, low angle for power.
- The last scene lands with a payoff, then one line that makes people want to watch again or follow.`;

const BLOCKS = {
  movie: `${CT_MARKER} ANIMATED MOVIE (a short cinematic film, not a narrated story):
- NO narrator. The characters carry everything through their own spoken lines. Write each line as dialogue: put it in that character's captions and set that character's mouth talking for those seconds (talk:[[from,to]]); the listener reacts on the face.
- STRUCTURE like a real film: (1) cold open that hooks, (2) title card with a bold animated title and music-style intro, (3) Act 1 setup of who wants what, (4) Act 2 rising trouble, a reversal at the middle, (5) the darkest moment, (6) climax, (7) resolution and an ending card. Fit this to the length asked; every part still gets its time.
- CINEMATIC LANGUAGE: establishing wide shot of each place, shot and reverse shot in conversations, close-ups on eyes and hands, slow push-in on tension, whip cuts on action, slow motion on the big impact, silhouette and light changes for mood, weather and ambient motion in every set.
- Give each character a goal, a way of speaking and a distinct manner. Conflict in every scene. Show feelings with the face and body before the line is said.
- Dialogue is short, punchy, and different for each character. No speeches longer than two sentences.
${PACE}`,
  narration: `${CT_MARKER} NARRATION ANIMATION (a voice-over tells the story and the characters act out every word):
- A narrator's voice (not on screen) tells it. The characters do NOT talk to each other; they ACT exactly what the narrator says, in the same second. The narrator's lines are the captions.
- Every verb the narrator says is something the picture shows: who does it, where, with what, and who reacts. Words that name a thing put that thing on screen. Numbers appear on screen when said.
- The narration itself is conversational, vivid and fast, written to be heard: short sentences, strong verbs, questions to the viewer, surprising facts.
${PACE}`,
  presenter: `${CT_MARKER} DOCUMENTARY WITH A PRESENTER (a host talks to the viewer, and other characters act out what the host says behind him):
- Character number 1 in the characters list is the PRESENTER. Give him presenter:'right' (or presenter:'left'). The app pins him in a corner of the screen for the whole video, outside the camera, so he is always there. Only he talks (talk:true); he looks and gestures toward the viewer and toward the action, and reacts with the face to his own punchlines.
- The presenter's lines are the captions and the narration. He never leaves the corner and has no walk, no x or ground changes.
- Every other character (character 2 and up) is an ACTOR who stays silent and acts out, in the main scene area, exactly what the presenter is saying in that second. Put them in the set that the line describes and change the set when the topic changes. Their mouths stay closed (talk:false).
- The camera, set, props and actors carry the story; the presenter explains, jokes, questions and sets up the next beat. Each scene has a new subject, a new set and a new actor action.
- The presenter's voice is conversational: he talks like a smart friend, with questions, surprising facts and jokes, never like reading a report.
${PACE}`,
};

export function contentTypeBlock(id) {
  return BLOCKS[isType(id) ? id : DEFAULT_TYPE];
}
export function injectContentType(prompt, id) {
  const text = String(prompt == null ? '' : prompt);
  if (!isType(id) || text.includes(CT_MARKER)) return text;
  const blk = BLOCKS[id];
  const at = text.indexOf('\nSCENE BY SCENE');
  return at > 0 ? text.slice(0, at) + '\n' + blk + '\n' + text.slice(at) : text + '\n\n' + blk;
}
