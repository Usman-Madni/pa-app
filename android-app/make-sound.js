// Butler's reminder sound, made at build time (no sound file kept in the repo): a soft two-note chime, written as a
// 16-bit mono WAV to the path given (the build puts it in res/raw/butler_ring.wav). Reminders ring with it explicitly,
// so they never depend on what a phone picks as its default for a new channel.
const fs = require('fs');

const RATE = 22050;
const notes = [ // [frequency (Hz), start (s), length (s)]
  [659.25, 0, 0.55], // E5
  [880.0, 0.18, 0.8], // A5
];
const total = Math.ceil(RATE * 1.0);
const samples = new Float64Array(total);
for (const [f, start, len] of notes) {
  const from = Math.floor(start * RATE);
  const n = Math.floor(len * RATE);
  for (let i = 0; i < n && from + i < total; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.006); // no click at the start
    const decay = Math.exp(-t * 5.5);
    const tone = Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t) + 0.12 * Math.sin(2 * Math.PI * 3 * f * t);
    samples[from + i] += 0.42 * attack * decay * tone;
  }
}
const data = Buffer.alloc(total * 2);
for (let i = 0; i < total; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);

const head = Buffer.alloc(44);
head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
head.write('data', 36); head.writeUInt32LE(data.length, 40);

const out = process.argv[2];
if (!out) { console.error('Usage: node make-sound.js <out.wav>'); process.exit(1); }
fs.writeFileSync(out, Buffer.concat([head, data]));
console.log(`Wrote ${out} (${head.length + data.length} bytes)`);
