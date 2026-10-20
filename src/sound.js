// The sounds of things thrown: going into the water, skipping off it, a
// floater coming up through it, things knocking together and landing on
// the pool's deck. Each is made as it happens (Web Audio, no recordings),
// from what happened, not from what the thing is: how fast, how big, how
// hard (its material's bounce: a lively ball rings, a pizza thuds), so a
// new thing sounds as its definition says.
//
//   - Into the water: the slap of the surface (a burst of noise, band-passed
//     higher for a small thing, as loud as its speed and size make it), then,
//     as the cavity pinches off, the bubble it leaves ringing at Minnaert's
//     frequency, f ≈ 3.26 m·s⁻¹ / a for a bubble of radius a (SPLASH.bubble
//     of the thing's), rising a little in pitch as it nears the surface: the
//     "plunk" of a stone. A floater that comes back up rings quietly.
//   - A skip: a short, bright slap.
//   - A knock (src/collide.js) or a landing on the deck: a thud of
//     low-passed noise and a ring at KNOCK.pitch / R Hz, ringing longer the
//     livelier the thing (its bounce), so a basketball booms, a tennis ball
//     pocks and a stone clicks.
//
// Each is played when it is seen, not when the physics finds it: `after`,
// the seconds until the frame that shows it reaches the screen (src/main.js
// simulate), less the audio's own latency (its base and output latency,
// where the browser says them), so the slap is heard as the stone is seen to
// strike, a little later than its step, never before.
//
// Nothing plays until the page has been touched (browsers start audio only
// on a gesture: src/main.js calls unlock on the first press or key), and Sound off
// (the setting, its own localStorage key, src/main.js) stops it all. Each
// sound is a few nodes that stop and are let go within a second; at most
// VOICES.most play at once (the quietest new one waits for none: it is
// dropped), so a storm of knocks costs no more than a few.
const SPLASH = { bubble: 0.3, pinch: 0.035, slap: 0.12, plunk: 0.5 };
const KNOCK = { pitch: 35, thud: 0.6, ring: 0.5 };
const VOICES = { most: 12, quietest: 0.02, longest: 1.5, latest: 0.25 };   // s: no sound here lasts a second, nor waits a quarter of one to be seen

export function createSound() {
  let context = null, master = null, noise = null;
  let enabled = true;
  let playing = 0;
  let offset = 0;   // where in the noise the last burst began

  function ready(starting = false) {
    if (!enabled || (!context && !starting)) return null;
    if (!context) {
      const Context = typeof window !== 'undefined' ? window.AudioContext ?? window.webkitAudioContext : null;
      if (!Context) return null;
      try { context = new Context(); } catch { return null; }
      master = context.createDynamicsCompressor();
      const level = context.createGain();
      level.gain.value = 0.7;
      master.connect(level).connect(context.destination);
      // A second of white noise, made once, that every slap and thud plays a slice of.
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = noise.getChannelData(0);
      // From a stream of its own (a seeded throw's Math.random is not the sound's to draw from).
      let state = 0x9e3779b9;
      for (let index = 0; index < samples.length; index++) {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        samples[index] = ((state >>> 0) / 4294967296) * 2 - 1;
      }
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context.state === 'running' ? context : null;
  }

  /**
   * A voice if one is free and `loudness` is worth one: its start time and a
   * done() to call as it ends. It is let go VOICES.longest after at the
   * latest, whatever the audio says (a stalled audio clock never ends a
   * sound, and the voices would never come free).
   */
  function voice(loudness, after = 0) {
    if (loudness < VOICES.quietest || playing >= VOICES.most) return null;
    const audio = ready();
    if (!audio) return null;
    playing++;
    let ended = false;
    const done = () => { if (ended) return; ended = true; playing--; };
    // When it is seen (the header), less what the audio itself takes to be heard.
    const wait = Math.max(Math.min(after, VOICES.latest) - (audio.baseLatency ?? 0) - (audio.outputLatency ?? 0), 0);
    setTimeout(done, (VOICES.longest + wait) * 1000);
    return { audio, now: audio.currentTime + wait, done };
  }

  /** A burst of noise through a band-pass at `frequency`, `seconds` long, at `gain`, from `at`. */
  function burst(audio, at, { frequency, quality = 0.8, seconds, gain, type = 'bandpass' }, onEnd) {
    const source = audio.createBufferSource();
    source.buffer = noise;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.002);
    envelope.gain.exponentialRampToValueAtTime(1e-4, at + seconds);
    source.connect(filter).connect(envelope).connect(master);
    offset = (offset + 0.37) % 0.5;   // a different slice of the noise each time, drawn from no random stream
    source.start(at, offset, seconds + 0.01);
    source.onended = onEnd;
  }

  /** A ring at `frequency` (Hz, gliding to `to`), `seconds` long, at `gain`, from `at`. */
  function ring(audio, at, { frequency, to = frequency, seconds, gain }, onEnd) {
    const tone = audio.createOscillator();
    tone.frequency.setValueAtTime(frequency, at);
    tone.frequency.exponentialRampToValueAtTime(to, at + seconds);
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.003);
    envelope.gain.exponentialRampToValueAtTime(1e-4, at + seconds);
    tone.connect(envelope).connect(master);
    tone.start(at);
    tone.stop(at + seconds + 0.01);
    tone.onended = onEnd;
  }

  const clamp = (value, least, most) => Math.min(Math.max(value, least), most);

  return {
    /** Start the audio on a gesture (a throw): browsers keep it silent until one. */
    unlock() { ready(true); },
    /** Sound on or off (the setting). */
    setEnabled(on) {
      enabled = Boolean(on);
      if (!enabled && context?.state === 'running') context.suspend().catch(() => {});
      if (enabled && context) ready();
    },
    get enabled() { return enabled; },
    /** How many sounds are playing, and the audio's state ('running', 'suspended', or 'none' before a gesture or without audio): tools/quality-probe.mjs. */
    get playing() { return playing; },
    get state() { return context?.state ?? 'none'; },

    /** A thing into the water (src/rock.js goIn's impact: speed, radius), seen `after` seconds from now (the header). */
    splash({ speed, radius }, after = 0) {
      const loudness = clamp(speed * Math.sqrt(radius) * SPLASH.slap, 0, 1);
      const sound = voice(loudness, after);
      if (!sound) return;
      const { audio, now } = sound;
      let ends = 2;
      const end = () => { if (--ends === 0) sound.done(); };
      burst(audio, now, { frequency: clamp(900 / Math.sqrt(radius / 0.03), 300, 2500), seconds: 0.06 + radius, gain: loudness }, end);
      const bubble = SPLASH.bubble * radius;
      const pitch = clamp(3.26 / bubble, 120, 3000);
      ring(audio, now + SPLASH.pinch * Math.sqrt(radius / 0.03), { frequency: pitch, to: pitch * 1.3, seconds: 0.05 + 2 * radius, gain: loudness * SPLASH.plunk }, end);
    },
    /** A skip off the water (src/rock.js skimReport: its speed in), seen `after` seconds from now. */
    skip({ velocity, radius }, after = 0) {
      const loudness = clamp(Math.abs(velocity.y) * 0.25, 0, 0.6);
      const sound = voice(loudness, after);
      if (!sound) return;
      burst(sound.audio, sound.now, { frequency: clamp(2400 * Math.sqrt(0.03 / radius), 900, 5000), quality: 1.2, seconds: 0.04, gain: loudness }, sound.done);
    },
    /** A floater coming up through the surface, or back down into it (src/rock.js startFloating's ripple), seen `after` seconds from now. */
    ripple({ speed, radius }, after = 0) {
      const loudness = clamp(speed * Math.sqrt(radius) * 0.08, 0, 0.3);
      const sound = voice(loudness, after);
      if (!sound) return;
      burst(sound.audio, sound.now, { frequency: 500, seconds: 0.12, gain: loudness, type: 'lowpass' }, sound.done);
    },
    /**
     * Two things knocking, or one on the deck: `speed` (m/s) they met at,
     * `radius` (m) and `bounce` (its material's, 0 to 1) of what rings, seen
     * `after` seconds from now.
     */
    knock({ speed, radius, bounce }, after = 0) {
      const loudness = clamp(speed * 0.12, 0, 0.9);
      const sound = voice(loudness, after);
      if (!sound) return;
      const { audio, now } = sound;
      let ends = 2;
      const end = () => { if (--ends === 0) sound.done(); };
      const pitch = clamp(KNOCK.pitch / radius, 90, 4000);
      burst(audio, now, { frequency: pitch * 2, seconds: 0.03, gain: loudness * KNOCK.thud * (1 - 0.5 * bounce), type: 'lowpass' }, end);
      ring(audio, now, { frequency: pitch, to: pitch * 0.97, seconds: 0.02 + 0.2 * bounce * bounce, gain: loudness * KNOCK.ring * bounce }, end);
    },
  };
}
