// Web Audio API Synthesizer for Domino Domino sound effects
// Provides immediate realistic collision and shuffling slide sounds.

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// Domino Tile collision "Clack"
export function playTileClack() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // First sharp click
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Sine & Triangle mixture creates a clean stone-clacking acoustic sound
    osc.type = "sine";
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gainNode.gain.setValueAtTime(0.4, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.09);

    // Secondary slight wood resonance echo
    const osc2 = ctx.createOscillator();
    const gainNode2 = ctx.createGain();

    osc2.connect(gainNode2);
    gainNode2.connect(ctx.destination);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(340, now + 0.01);
    osc2.frequency.exponentialRampToValueAtTime(50, now + 0.12);

    gainNode2.gain.setValueAtTime(0.2, now + 0.01);
    gainNode2.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc2.start(now + 0.01);
    osc2.stop(now + 0.13);
  } catch (err) {
    console.warn("Could not execute clack audio synth:", err);
  }
}

// Shuffling and Dealing Slide Sound
export function playTileShuffle() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.4; // 0.4 seconds of sand-wood noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // White noise
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter white noise to model real wood friction slide
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(350, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.4);
    filter.Q.value = 3.0;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.exponentialRampToValueAtTime(0.005, now + 0.4);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    noise.start(now);
  } catch (err) {
    console.warn("Could not execute shuffle audio synth:", err);
  }
}

// Victory celebration cascade sound
export function playVictorySound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const chords = [261.63, 329.63, 392.00, 523.25]; // C major chords ascending
    chords.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.15, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.7);
    });
  } catch (err) {
    console.warn("Could not execute victory audio synth:", err);
  }
}
