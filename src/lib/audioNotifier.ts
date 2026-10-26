/**
 * Web Audio API synthesizer for high-clarity notification chimes.
 * Does not require external audio files, works offline and in all modern browsers.
 */

let audioCtx: AudioContext | null = null;
let isSoundEnabled = true;

export function initAudioContext() {
  if (typeof window === 'undefined') return;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

export function setSoundEnabled(enabled: boolean) {
  isSoundEnabled = enabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem('guaranesia_sound_enabled', enabled ? 'true' : 'false');
  }
}

export function getSoundEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('guaranesia_sound_enabled');
    if (saved !== null) {
      return saved === 'true';
    }
  }
  return isSoundEnabled;
}

/**
 * Plays a pleasant, distinct 3-tone chime for new ticket alerts (D5 -> A5 -> D6)
 */
export function playTicketAlertSound() {
  if (!isSoundEnabled) return;
  
  try {
    initAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    const notes = [
      { freq: 587.33, start: 0, duration: 0.18 },    // D5
      { freq: 880.00, start: 0.14, duration: 0.22 },   // A5
      { freq: 1174.66, start: 0.30, duration: 0.45 },  // D6
    ];

    notes.forEach(note => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      // Smooth attack and exponential decay
      gain.gain.setValueAtTime(0.001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(0.3, now + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);

      osc.connect(gain);
      gain.connect(audioCtx!.destination);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration + 0.05);
    });
  } catch (err) {
    console.warn('Audio playback was blocked or failed:', err);
  }
}
