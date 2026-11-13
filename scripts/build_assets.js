import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CRICKET_CHANNELS, CATEGORIES } from '../src/data/cricketChannels.js';
import { UPCOMING_BANNERS } from '../src/data/liveMatches.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Write public/channels.json
const apiPayload = {
  version: "1.0.0",
  updatedAt: new Date().toISOString(),
  source: "Aditya Proj Live TV Extractor",
  totalChannels: CRICKET_CHANNELS.length,
  totalServers: CRICKET_CHANNELS.reduce((acc, c) => acc + c.servers.length, 0),
  categories: CATEGORIES,
  channels: CRICKET_CHANNELS,
  featuredMatches: UPCOMING_BANNERS
};

fs.writeFileSync(path.join(publicDir, 'channels.json'), JSON.stringify(apiPayload, null, 2), 'utf8');
console.log('✓ Wrote public/channels.json');

// 2. Write public/playlist.m3u
let m3u = `#EXTM3U\n#PLAYLIST:CrickFreeLive - Live Cricket & Sports Streams\n\n`;

CRICKET_CHANNELS.forEach(ch => {
  ch.servers.forEach((srv, idx) => {
    m3u += `#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}" tvg-logo="${ch.logo}" group-title="${ch.network}",${ch.name} [${srv.name}]\n`;
    m3u += `${srv.url}\n\n`;
  });
});

fs.writeFileSync(path.join(publicDir, 'playlist.m3u'), m3u, 'utf8');
console.log('✓ Wrote public/playlist.m3u');

// 3. Write public/favicon.svg
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="ballGrad" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#EF4444"/>
      <stop offset="60%" stop-color="#DC2626"/>
      <stop offset="100%" stop-color="#7F1D1D"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <circle cx="50" cy="50" r="44" fill="url(#ballGrad)" stroke="#B91C1C" stroke-width="2"/>
  <!-- Cricket Ball Seam -->
  <path d="M 22 22 C 38 38, 38 62, 22 78" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M 22 22 C 38 38, 38 62, 22 78" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="3,3" fill="none"/>
  <path d="M 78 22 C 62 38, 62 62, 78 78" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M 78 22 C 62 38, 62 62, 78 78" stroke="#E2E8F0" stroke-width="2" stroke-dasharray="3,3" fill="none"/>
  <!-- Live indicator dot -->
  <circle cx="75" cy="25" r="9" fill="#10B981" filter="url(#glow)"/>
  <circle cx="75" cy="25" r="4" fill="#FFFFFF"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf8');
console.log('✓ Wrote public/favicon.svg');

