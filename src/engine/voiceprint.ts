import type { VoiceprintSignature } from '../types/assistant';

export function hashPin(pin: string): string {
  const clean = pin.trim();
  let h = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `pin_${(h >>> 0).toString(16)}`;
}

export function verifyPin(pin: string, expectedHash: string): boolean {
  if (!expectedHash) return false;
  return hashPin(pin) === expectedHash;
}

/**
 * Computes an 8-band normalized vocal spectrum + spectral centroid
 * from an FFT magnitude array (0..255 byte values).
 */
export function computeSpectralSignature(
  frames: number[][],
  sampleRate = 48000,
  fftSize = 2048
): VoiceprintSignature | null {
  if (frames.length === 0) return null;

  const bandCount = 8;
  const bandTotals = new Array<number>(bandCount).fill(0);
  const hzPerBin = sampleRate / fftSize;

  let weightedFreqSum = 0;
  let totalEnergy = 0;
  let validFrames = 0;

  for (const frame of frames) {
    if (!frame || frame.length === 0) continue;
    // Focus on human speech range: ~80 Hz to ~4000 Hz
    const minBin = Math.max(1, Math.floor(80 / hzPerBin));
    const maxBin = Math.min(frame.length - 1, Math.ceil(4000 / hzPerBin));
    const span = Math.max(1, maxBin - minBin + 1);

    let frameSum = 0;
    for (let b = minBin; b <= maxBin; b++) {
      const mag = Math.max(0, frame[b] ?? 0);
      frameSum += mag;
    }
    if (frameSum < 10) continue; // skip silence frames

    validFrames += 1;
    for (let b = minBin; b <= maxBin; b++) {
      const mag = Math.max(0, frame[b] ?? 0);
      const bandIdx = Math.min(
        bandCount - 1,
        Math.floor(((b - minBin) / span) * bandCount)
      );
      bandTotals[bandIdx] += mag;
      weightedFreqSum += b * hzPerBin * mag;
      totalEnergy += mag;
    }
  }

  if (validFrames === 0 || totalEnergy <= 0) return null;

  const normFactor = Math.hypot(...bandTotals) || 1;
  const bandProfile = bandTotals.map((v) => Number((v / normFactor).toFixed(4)));
  const centroidHz = Math.round(weightedFreqSum / totalEnergy);

  let spreadAcc = 0;
  for (let i = 0; i < bandCount; i++) {
    const bandCenter = 80 + ((i + 0.5) / bandCount) * (4000 - 80);
    spreadAcc += bandProfile[i] * Math.abs(bandCenter - centroidHz);
  }

  return {
    centroidHz,
    spectralSpread: Math.round(spreadAcc),
    bandProfile,
    sampleCount: validFrames,
    enrolledAt: new Date().toISOString(),
  };
}

export function matchVoiceprint(
  enrolled: VoiceprintSignature,
  candidate: VoiceprintSignature,
  threshold = 0.82
): { matched: boolean; confidence: number } {
  const len = Math.min(enrolled.bandProfile.length, candidate.bandProfile.length);
  if (len === 0) return { matched: false, confidence: 0 };

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    const a = enrolled.bandProfile[i];
    const b = candidate.bandProfile[i];
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  const cosineSim = dot / ((Math.sqrt(magA) * Math.sqrt(magB)) || 1);
  const centroidDiff = Math.abs(enrolled.centroidHz - candidate.centroidHz);
  const centroidScore = Math.max(0, 1 - centroidDiff / 1200);

  const confidence = Number((cosineSim * 0.78 + centroidScore * 0.22).toFixed(3));
  return {
    matched: confidence >= threshold,
    confidence,
  };
}
