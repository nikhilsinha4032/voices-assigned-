import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.playwright-cli',
  '.aistudio',
  '.vscode',
]);

const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.DS_Store',
]);

const LAPTOP_SETUP_README = `# Personal JARVIS — Laptop Setup & Customization Guide

Welcome! You have downloaded the complete, customizable source code of your Personal JARVIS Assistant.

## 1. Quick Run on Your Laptop (Windows / Mac / Linux)

1. Install **Node.js (v20 or newer)** from https://nodejs.org
2. Open a terminal inside this extracted folder and run:
   \`\`\`bash
   npm install
   \`\`\`
3. (Optional, for real-time Gemini Live Voice & AI Brain):
   Copy \`.env.example\` to \`.env\` and add your Gemini API key:
   \`\`\`
   GEMINI_API_KEY=your_gemini_api_key_here
   \`\`\`
4. Start your personal assistant:
   \`\`\`bash
   npm run dev
   \`\`\`
5. Open **http://localhost:3000** in Chrome or Edge.
   - Click **Install** in the header (or the browser install icon) to install it as a standalone Desktop App on your laptop!

## 2. Built-in Laptop Microphone (No Bluetooth Needed)

- By default, **Built-in Laptop Mic** mode is selected in **Settings -> Microphone Input**, so it prefers your laptop's internal microphone and speakers instead of forcing a Bluetooth headset connection.
- You can also type anytime in the prompt box without a microphone and JARVIS will respond aloud.

## 3. How to Customize Later

- **Inside the App (No Code)**: Click the Settings icon in the top-right to change AI Name, Language (Hinglish / Hindi / English), Voice Persona, Custom Instructions, PIN, and Export/Import your config JSON.
- **In Code**:
  - \`src/components/JarvisHologram3D.tsx\`: Customize 3D hologram colors, rings, and geometry.
  - \`server.ts\`: Customize AI persona prompt, voice style, and streaming endpoints.
  - \`src/engine/nlu.ts\`: Add custom voice commands, routines, or smart home rules.
  - \`src/engine/voiceActivation.ts\`: Customize wake words and sleep phrases.
`;

interface ZipInputEntry {
  name: string;
  data: Buffer;
  mtime: Date;
}

function toDosTimeDate(date: Date): { time: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  return { time, dosDate };
}

function buildZipBuffer(entries: ZipInputEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBuf = Buffer.from(entry.name, 'utf8');
    const crc = zlib.crc32(entry.data) >>> 0;
    const compressed = zlib.deflateRawSync(entry.data);
    const useStore = compressed.length >= entry.data.length;
    const payload = useStore ? entry.data : compressed;
    const method = useStore ? 0 : 8;
    const { time, dosDate } = toDosTimeDate(entry.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(fileNameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileNameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(fileNameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, fileNameBuf);
    offset += localHeader.length + fileNameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

function collectProjectEntries(rootDir: string, currentDir: string, out: ZipInputEntry[]): void {
  const dirItems = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const item of dirItems) {
    const absPath = path.join(currentDir, item.name);
    const relPath = path.relative(rootDir, absPath).split(path.sep).join('/');

    if (item.isDirectory()) {
      if (EXCLUDED_DIRS.has(item.name)) continue;
      if (relPath === 'public/assets/aistudio') continue;
      collectProjectEntries(rootDir, absPath, out);
      continue;
    }

    if (!item.isFile()) continue;
    if (EXCLUDED_FILES.has(item.name) || item.name.endsWith('.log')) continue;

    const stat = fs.statSync(absPath);
    if (stat.size > 4 * 1024 * 1024) continue; // skip oversized media blobs

    out.push({
      name: `jarvis-personal-assistant/${relPath}`,
      data: fs.readFileSync(absPath),
      mtime: stat.mtime,
    });
  }
}

export function createProjectSourceZip(rootDir: string): Buffer {
  const entries: ZipInputEntry[] = [];
  collectProjectEntries(rootDir, rootDir, entries);
  entries.push({
    name: 'jarvis-personal-assistant/README-LAPTOP-SETUP.md',
    data: Buffer.from(LAPTOP_SETUP_README, 'utf8'),
    mtime: new Date(),
  });
  return buildZipBuffer(entries);
}
