// Voice for the guided tour (SRS 16): the browser's own speech (Web Speech API), free and offline.
// Prefers an Indian English voice, then a natural-sounding English one, then any English voice.

export const voiceAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  return (
    voices.find((v) => v.lang === 'en-IN' && /natural|neural|online/i.test(v.name)) ??
    voices.find((v) => /natural|neural|online/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => /google/i.test(v.name)) ??
    voices[0]
  );
}

/** Reads the text aloud, stopping anything still being read. */
export function speak(text: string) {
  if (!voiceAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/⠿/g, 'the grip'));
  const voice = pickVoice();
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  }
  u.rate = 1;
  synth.speak(u);
}

export function stopSpeaking() {
  if (voiceAvailable()) window.speechSynthesis.cancel();
}
