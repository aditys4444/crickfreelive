import http from 'http';
import https from 'https';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CRICKET_CHANNELS, CATEGORIES } from './src/data/cricketChannels.js';
import { UPCOMING_BANNERS } from './src/data/liveMatches.js';
import {
  getClientIp,
  checkRateLimit,
  isSafeProxyUrl,
  isHotlinkAllowed,
  applySecurityHeaders
} from './src/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let currentSonyToken = 'hdntl=exp=1794591697~acl=%2f*~id=08618765184985467156334867388948~data=hdntl~hmac=61ee8b9f8402d1b764effb768511573efefe72278c6f62ac099d418983a801e2';
let tokenExpiresAt = 1794591697;

function loadSavedToken() {
  try {
    const tokenFile = path.join(__dirname, 'data', 'token.json');
    if (fs.existsSync(tokenFile)) {
      const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
      if (saved.token) {
        currentSonyToken = saved.token;
        tokenExpiresAt = saved.expiresAt || 0;
      }
    }
  } catch (e) {
    console.warn('Could not read saved token:', e.message);
  }
}
loadSavedToken();

let cachedBanners = null;
let lastBannersFetch = 0;

const STADIUM_BANNERS = [
  'public/banners/stadium-floodlights.svg',
  'public/banners/stadium-t20.svg',
  'public/banners/stadium-international.svg',
  'public/banners/stadium-dusk.svg',
  'public/banners/stadium-championship.svg'
];

const MARQUEE_BANNERS = [
  {
    id: "ind-afg-u19",
    title: "India vs Afghanistan",
    tournament: "DP World Men's U19 Asia Cup 2026",
    subline: "U19 Asia Cup • Semi-Final • Live on DD Sports HD",
    badge: "SEMI-FINAL • LIVE TODAY",
    isLive: true,
    channelId: "dd-sports-live-cricket",
    broadcaster: "Live on DD Sports HD & Sony Ten",
    bannerImage: "public/banners/ind-afg-u19.jpg"
  },
  {
    id: "ind-nz-marquee",
    title: "India vs New Zealand",
    tournament: "International Cricket Series",
    subline: "Stream Free on Willow Cricket HD",
    badge: "STREAM FREE",
    isLive: true,
    channelId: "willow-cricket-hd",
    broadcaster: "Stream Free on Willow Cricket HD",
    bannerImage: "public/banners/ind-nz-clean.jpg"
  }
];

function fetchRealCricketBanners() {
  const now = Date.now();
  if (cachedBanners && (now - lastBannersFetch < 45000)) {
    return Promise.resolve(cachedBanners);
  }

  return new Promise((resolve) => {
    const u = 'https://site.api.espn.com/apis/personalized/v2/scoreboard/header?sport=cricket&region=in&tz=Asia/Kolkata';
    const req = https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const leagues = json.sports?.[0]?.leagues || [];
          const matches = [];

          leagues.forEach((l, lIdx) => {
            const leagueName = l.name || 'International Cricket';
            l.events?.forEach((ev, evIdx) => {
              const t1 = ev.competitors?.[0];
              const t2 = ev.competitors?.[1];
              if (!t1 || !t2) return;

              const isLive = ev.status === 'in';
              const isPre = ev.status === 'pre';
              const isPost = ev.status === 'post';

              // Only show active live and upcoming scheduled matches
              // (Skip old completed matches unless list is too short)
              let badge = 'LIVE';
              if (isLive) {
                if (t1.score && t2.score) {
                  badge = `LIVE • ${t1.score} vs ${t2.score}`;
                } else if (t1.score) {
                  badge = `LIVE • ${t1.score}`;
                } else if (ev.summary && ev.summary !== 'Live') {
                  badge = `LIVE • ${ev.summary}`;
                } else {
                  badge = 'LIVE';
                }
              } else if (isPre) {
                badge = 'UPCOMING';
              } else if (ev.summary && ev.summary.toLowerCase().includes('stump')) {
                badge = 'DAY STUMPS';
              } else {
                badge = 'MATCH RESULT';
              }

              const t1Name = t1.displayName || t1.name || 'Team 1';
              const t2Name = t2.displayName || t2.name || 'Team 2';
              const title = `${t1Name} vs ${t2Name}`;
              const combined = (title + ' ' + leagueName).toLowerCase();

              // Map to authentic local broadcasting channel that exists on website
              let channelId = 'sony-sports-ten-3-hd';
              let broadcaster = 'Sony Sports Ten 3 HD & DD Sports';

              if (combined.includes('india') || combined.includes('pakistan') || combined.includes('asia')) {
                channelId = 'sony-sports-ten-3-hd';
                broadcaster = 'Sony Sports Ten 3 HD & DD Sports';
              } else if (combined.includes('sri lanka') || combined.includes('zimbabwe') || combined.includes('ireland')) {
                channelId = 'sony-sports-ten-1-hd';
                broadcaster = 'Sony Sports Ten 1 HD';
              } else if (combined.includes('england') || combined.includes('new zealand') || combined.includes('south africa')) {
                channelId = 'sony-sports-ten-1-hd';
                broadcaster = 'Sony Sports Ten 1 HD';
              } else if (combined.includes('wbbl') || combined.includes('women') || combined.includes('emerging')) {
                channelId = 'willow-cricket-hd';
                broadcaster = 'Willow Cricket HD';
              } else if (combined.includes('nepal') || combined.includes('premier') || combined.includes('bbl')) {
                channelId = 'willow-cricket-hd';
                broadcaster = 'Willow Cricket HD';
              } else if (combined.includes('shield') || combined.includes('quaid') || combined.includes('trophy')) {
                channelId = 'sony-sports-ten-2-hd';
                broadcaster = 'Sony Sports Ten 2 HD & Cricket Gold';
              }

              // Dynamic authentic stadium graphic
              let bannerImage = STADIUM_BANNERS[(lIdx + evIdx) % STADIUM_BANNERS.length];
              if (combined.includes('t20') || combined.includes('bash') || combined.includes('premier')) {
                bannerImage = 'public/banners/stadium-t20.svg';
              } else if (combined.includes('shield') || combined.includes('trophy') || combined.includes('test')) {
                bannerImage = 'public/banners/stadium-floodlights.svg';
              } else if (combined.includes('cup') || combined.includes('tour') || combined.includes('india') || combined.includes('pakistan')) {
                bannerImage = 'public/banners/stadium-international.svg';
              }

              // Priority calculation: Top live international matches first
              let priority = 10;
              if (isLive) {
                if (combined.includes('india') || combined.includes('pakistan') || combined.includes('cup') || combined.includes('tour')) {
                  priority = 1;
                } else if (combined.includes('women') || combined.includes('bash') || combined.includes('premier')) {
                  priority = 2;
                } else {
                  priority = 3;
                }
              } else if (isPre) {
                if (combined.includes('india') || combined.includes('cup') || combined.includes('tour')) {
                  priority = 4;
                } else {
                  priority = 5;
                }
              } else if (isLive || (ev.summary && ev.summary.toLowerCase().includes('stump'))) {
                priority = 6;
              } else {
                priority = 20; // completed
              }

              matches.push({
                id: 'espn-' + ev.id,
                title: title,
                tournament: leagueName,
                badge: badge,
                isLive: isLive,
                isUpcoming: isPre,
                channelId: channelId,
                broadcaster: broadcaster,
                bannerImage: bannerImage,
                priority: priority
              });
            });
          });

          if (matches.length > 0) {
            matches.sort((a, b) => a.priority - b.priority);
            const internationalMatches = matches.filter(m => {
              const c = (m.title + ' ' + m.tournament).toLowerCase();
              if (c.includes('region') || c.includes('quaid') || c.includes('silver') || c.includes('victoria')) return false;
              return m.priority <= 6;
            });
            const finalMatches = [...MARQUEE_BANNERS, ...internationalMatches.slice(0, 2)];
            cachedBanners = finalMatches;
            lastBannersFetch = Date.now();
            resolve(finalMatches);
          } else {
            resolve(MARQUEE_BANNERS);
          }
        } catch (e) {
          resolve(cachedBanners || MARQUEE_BANNERS);
        }
      });
    });

    req.on('error', () => resolve(cachedBanners || MARQUEE_BANNERS));
    req.on('timeout', () => { req.destroy(); resolve(cachedBanners || MARQUEE_BANNERS); });
  });
}

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=UTF-8',
  '.txt': 'text/plain; charset=UTF-8',
  '.webmanifest': 'application/manifest+json; charset=UTF-8',
  '.m3u': 'audio/x-mpegurl; charset=UTF-8',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
  '.dash': 'video/mp4'
};

// High-performance Keep-Alive Connection Pools to reduce TLS handshake overhead
const httpsKeepAliveAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 25,
  keepAliveMsecs: 30000,
  timeout: 15000
});

const httpKeepAliveAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 25,
  keepAliveMsecs: 30000,
  timeout: 15000
});

// High-speed In-Memory Segment Cache for 0ms latency video playback
const segmentCache = new Map();
const MAX_CACHE_ITEMS = 40;

setInterval(() => {
  const now = Date.now();
  for (const [key, item] of segmentCache.entries()) {
    if (now - item.time > 90000) {
      segmentCache.delete(key);
    }
  }
}, 30000);

// High-Security Stream Token Obfuscation Engine (Masks all upstream APIs/tokens from browser DevTools)
const STREAM_SECRET = crypto.randomBytes(32);
const STREAM_IV_LENGTH = 16;

function encodeStreamToken(plainText) {
  try {
    const iv = crypto.randomBytes(STREAM_IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', STREAM_SECRET, iv);
    let encrypted = cipher.update(plainText, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return Buffer.concat([iv, encrypted]).toString('base64url');
  } catch (e) {
    return Buffer.from(plainText, 'utf8').toString('base64url');
  }
}

function decodeStreamToken(token) {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= STREAM_IV_LENGTH) return null;
    const iv = raw.subarray(0, STREAM_IV_LENGTH);
    const encrypted = raw.subarray(STREAM_IV_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-cbc', STREAM_SECRET, iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
}

const STREAM_ALIASES = {
  '/stream/live/ten3-720p.m3u8': 'https://dishmt.slivcdn.com/hls/live/2020591/TEN3HD/master_900.m3u8',
  '/stream/live/ten3-1080p.m3u8': 'https://dishmt.slivcdn.com/hls/live/2020591/TEN3HD/master_2000.m3u8',
  '/stream/live/ten3-3500p.m3u8': 'https://dishmt.slivcdn.com/hls/live/2020591/TEN3HD/master_3500.m3u8'
};

// Stream Proxy handler to bypass CORS, geo-restrictions, and mixed-content blocks safely
function proxyStream(targetUrl, req, res) {
  try {
    const parsed = new URL(targetUrl);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const agent = isHttps ? httpsKeepAliveAgent : httpKeepAliveAgent;

    const isSegment = targetUrl.includes('.ts') || targetUrl.includes('.m4s') || targetUrl.includes('.mp4');
    const isKey = targetUrl.includes('.key') || targetUrl.includes('key=');

    // 1. Instant Cache HIT for video segments (0ms latency, zero buffering)
    if (isSegment && segmentCache.has(targetUrl)) {
      const cached = segmentCache.get(targetUrl);
      res.writeHead(200, {
        'Content-Type': cached.contentType || 'video/MP2T',
        'Content-Length': cached.buffer.length,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
        'X-Cache': 'HIT'
      });
      res.end(cached.buffer);
      return;
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': parsed.origin,
      'Accept': '*/*',
    };

    if (parsed.hostname.includes('slivcdn.com')) {
      headers['Cookie'] = currentSonyToken;
    }

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const proxyReq = mod.get(targetUrl, { headers, agent, timeout: 10000 }, (proxyRes) => {
      console.log('[Proxy Stream]', targetUrl.slice(0, 70), '-> upstream status:', proxyRes.statusCode);
      // Follow redirects
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        try {
          const nextUrl = new URL(proxyRes.headers.location, targetUrl).toString();
          return proxyStream(nextUrl, req, res);
        } catch (e) {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Invalid Redirect URL');
          }
          return;
        }
      }

      const contentType = proxyRes.headers['content-type'] || '';
      const isM3U8 = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL');

      if (isM3U8) {
        let chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          if (res.headersSent) return;
          const body = Buffer.concat(chunks).toString('utf8');
          const lines = body.split('\n');
          const rewritten = lines.map(line => {
            let l = line.trim();
            if (!l) return line;
            if (l.startsWith('#')) {
              if (l.includes('URI=')) {
                return l.replace(/URI="([^"]+)"/, (m, uri) => {
                  try {
                    const resolved = new URL(uri, targetUrl).toString();
                    return `URI="/stream/key?t=${encodeStreamToken(resolved)}"`;
                  } catch (e) {
                    return m;
                  }
                });
              }
              return line;
            }
            try {
              const resolved = new URL(l, targetUrl).toString();
              return `/stream/seg?t=${encodeStreamToken(resolved)}`;
            } catch (e) {
              return line;
            }
          }).join('\n');

          res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'no-cache, no-store'
          });
          res.end(rewritten);
        });

        proxyRes.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            res.end('Stream Read Error');
          }
        });
      } else {
        if (res.headersSent) return;
        const responseHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
        };
        if (proxyRes.headers['content-type']) responseHeaders['Content-Type'] = proxyRes.headers['content-type'];
        if (proxyRes.headers['content-length']) responseHeaders['Content-Length'] = proxyRes.headers['content-length'];
        if (proxyRes.headers['content-range']) responseHeaders['Content-Range'] = proxyRes.headers['content-range'];
        if (proxyRes.headers['accept-ranges']) responseHeaders['Accept-Ranges'] = proxyRes.headers['accept-ranges'];

        if (isSegment) {
          responseHeaders['Cache-Control'] = 'public, max-age=86400, s-maxage=86400, immutable';
        } else if (isKey) {
          responseHeaders['Cache-Control'] = 'public, max-age=3600';
        }

        res.writeHead(proxyRes.statusCode, responseHeaders);

        if (isSegment && proxyRes.statusCode === 200) {
          const segChunks = [];
          proxyRes.on('data', (c) => {
            segChunks.push(c);
            res.write(c);
          });
          proxyRes.on('end', () => {
            res.end();
            if (segChunks.length > 0) {
              if (segmentCache.size >= MAX_CACHE_ITEMS) {
                const oldest = segmentCache.keys().next().value;
                segmentCache.delete(oldest);
              }
              segmentCache.set(targetUrl, {
                buffer: Buffer.concat(segChunks),
                contentType: proxyRes.headers['content-type'] || 'video/MP2T',
                time: Date.now()
              });
            }
          });
        } else {
          proxyRes.pipe(res);
        }

        proxyRes.on('error', () => {
          try { res.end(); } catch (e) {}
        });
      }
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('Proxy Error: ' + err.message);
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('Proxy Gateway Timeout');
      }
    });

    req.on('close', () => {
      try { proxyReq.destroy(); } catch (e) {}
    });
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('Invalid URL: ' + err.message);
    }
  }
}

const server = http.createServer(async (req, res) => {
  console.log('[HTTP INCOMING]', req.method, req.url.slice(0, 80), 'Host:', req.headers.host);
  // 1. Enterprise Security Headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function(statusCode, headers = {}) {
    if (typeof headers === 'object' && headers !== null) {
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'SAMEORIGIN';
      headers['X-XSS-Protection'] = '1; mode=block';
      headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
      headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(), payment=()';
      headers['Access-Control-Allow-Origin'] = '*';
      headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Range, Authorization';
      headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' blob: https: http: data:; connect-src 'self' https: http: blob:; object-src 'none'; base-uri 'self';";
      
      const proto = req.headers['x-forwarded-proto'];
      if (proto === 'https' || req.socket.encrypted) {
        headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
      }
    }
    return origWriteHead(statusCode, headers);
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }


  // 3. Rate Limiting Protection (Anti-DDoS & Bot Scraping)
  const clientIp = getClientIp(req);
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;

  const rateType = pathname === '/proxy' ? 'proxy' : (pathname.startsWith('/api') ? 'api' : 'static');
  const rateLimit = checkRateLimit(clientIp, rateType);

  if (!rateLimit.allowed) {
    res.writeHead(429, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Retry-After': String(rateLimit.retryAfter || 15)
    });
    res.end(JSON.stringify({
      status: 'error',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down and try again shortly.',
      retryAfter: rateLimit.retryAfter
    }));
    return;
  }

  // 4. Secure Obfuscated Stream Segments & Keys (Upstream origin & tokens are 100% hidden)
  if (pathname === '/stream/key' || pathname === '/stream/seg') {
    if (!isHotlinkAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Hotlinking not allowed');
      return;
    }

    const token = parsedUrl.searchParams.get('t');
    if (!token) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing stream token');
      return;
    }

    const realTargetUrl = decodeStreamToken(token);
    if (!realTargetUrl || !isSafeProxyUrl(realTargetUrl)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Invalid stream token');
      return;
    }

    proxyStream(realTargetUrl, req, res);
    return;
  }

  // 5. Named Obfuscated Stream Master Playlists (No upstream URLs exposed in DevTools)
  if (STREAM_ALIASES[pathname]) {
    if (!isHotlinkAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Hotlinking not allowed');
      return;
    }

    const realTargetUrl = STREAM_ALIASES[pathname];
    proxyStream(realTargetUrl, req, res);
    return;
  }

  // 6. Stream Proxy endpoint with SSRF & Hotlinking Defense (Backward Compatibility)
  if (pathname === '/proxy') {
    // Anti-Hotlinking: prevent rogue third-party sites from stealing your bandwidth
    if (!isHotlinkAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Hotlinking not allowed');
      return;
    }

    let targetUrl = parsedUrl.searchParams.get('url');
    const token = parsedUrl.searchParams.get('t');
    if (token) {
      targetUrl = decodeStreamToken(token);
    }

    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing "url" or "t" query parameter');
      return;
    }

    // SSRF Defense: Block loopback, internal IPs, cloud metadata, and non-streaming targets
    if (!isSafeProxyUrl(targetUrl)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Invalid or unauthorized stream target');
      return;
    }

    proxyStream(targetUrl, req, res);
    return;
  }

  // Adaptive Multi-Bitrate Master Playlist for Sony Sports Ten 3 HD (Masked)
  if (pathname === '/stream/live/ten3-adaptive.m3u8' || pathname === '/sony-ten3-adaptive.m3u8' || pathname === '/api/sony-ten3-adaptive.m3u8') {
    const adaptiveM3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=900000,AVERAGE-BANDWIDTH=850000,RESOLUTION=1280x720,FRAME-RATE=25.000,NAME="720p HD (Smooth & Fast)"
/stream/live/ten3-720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,AVERAGE-BANDWIDTH=1900000,RESOLUTION=1920x1080,FRAME-RATE=50.000,NAME="1080p HD (Balanced)"
/stream/live/ten3-1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3500000,AVERAGE-BANDWIDTH=3400000,RESOLUTION=1920x1080,FRAME-RATE=50.000,NAME="1080p Full HD (Ultra)"
/stream/live/ten3-3500p.m3u8
`;
    res.writeHead(200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store'
    });
    res.end(adaptiveM3u8);
    return;
  }

  // Admin Page: /admin or /admin/update-token
  if (pathname === '/admin' || pathname === '/admin/update-token') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          let tokenStr = body.trim();
          if (tokenStr.startsWith('{')) {
            const parsed = JSON.parse(tokenStr);
            tokenStr = parsed.hdntl || parsed.token || '';
          }
          if (!tokenStr.includes('hdntl=')) {
            if (tokenStr.includes('exp=')) {
              tokenStr = 'hdntl=' + tokenStr.replace(/^hdntl=/, '');
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'error', message: 'Invalid token format. Must contain "hdntl=exp=..."' }));
              return;
            }
          }

          const expMatch = tokenStr.match(/exp=(\d+)/);
          const exp = expMatch ? parseInt(expMatch[1], 10) : Math.floor(Date.now() / 1000) + 36000;

          currentSonyToken = tokenStr;
          tokenExpiresAt = exp;

          const dataDir = path.join(__dirname, 'data');
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(path.join(dataDir, 'token.json'), JSON.stringify({
            token: tokenStr,
            expiresAt: exp,
            updatedAt: new Date().toISOString()
          }, null, 2));

          console.log('[Admin] Sony Token updated successfully! Expires at:', new Date(exp * 1000).toLocaleString());

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'success',
            message: 'Sony Token updated successfully!',
            expiresAt: exp,
            expiresReadable: new Date(exp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: err.message }));
        }
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpired = now >= tokenExpiresAt;
    const remainingSec = Math.max(0, tokenExpiresAt - now);
    const remHours = Math.floor(remainingSec / 3600);
    const remMin = Math.floor((remainingSec % 3600) / 60);
    const expDateStr = new Date(tokenExpiresAt * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrickFree - Stream Token Control Center</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0b0f19; color: #f3f4f6; min-height: 100vh; padding: 24px; display: flex; justify-content: center; align-items: flex-start; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; width: 100%; max-width: 640px; padding: 28px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    p.sub { font-size: 14px; color: #9ca3af; margin-bottom: 24px; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    .status-active { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-expired { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .info-box { background: #1e293b; border-radius: 10px; padding: 16px; margin-bottom: 24px; font-size: 14px; display: flex; flex-direction: column; gap: 8px; }
    .info-row { display: flex; justify-content: space-between; align-items: center; }
    .info-label { color: #94a3b8; }
    .info-val { font-weight: 600; color: #f8fafc; }
    label { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 8px; display: block; }
    textarea { width: 100%; height: 120px; background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 12px; color: #f8fafc; font-size: 13px; font-family: monospace; resize: vertical; margin-bottom: 16px; }
    textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); }
    button { background: #2563eb; color: #fff; border: none; border-radius: 10px; padding: 14px 20px; font-size: 15px; font-weight: 600; width: 100%; cursor: pointer; transition: all 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px; }
    button:hover { background: #1d4ed8; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .toast { display: none; margin-top: 16px; padding: 12px 16px; border-radius: 8px; font-size: 14px; text-align: center; }
    .toast-success { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
    .toast-error { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
    .back-link { display: inline-block; margin-top: 20px; color: #60a5fa; font-size: 14px; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🏏 Sony Sports Stream Token Manager</h1>
    <p class="sub">Update your live stream authentication cookie instantly from any device.</p>

    <div class="status-badge ${isExpired ? 'status-expired' : 'status-active'}">
      <span class="dot"></span>
      ${isExpired ? 'TOKEN EXPIRED' : 'TOKEN ACTIVE & STREAMING'}
    </div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Channel</span>
        <span class="info-val">Sony Sports Ten 3 HD (1080p)</span>
      </div>
      <div class="info-row">
        <span class="info-label">Expires At (IST)</span>
        <span class="info-val" id="expDisplay">${expDateStr}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Time Remaining</span>
        <span class="info-val" id="remDisplay">${isExpired ? '0m (Expired)' : remHours + 'h ' + remMin + 'm'}</span>
      </div>
    </div>

    <label for="tokenInput">Paste Fresh Token or Full Token JSON:</label>
    <textarea id="tokenInput" placeholder='Paste hdntl=exp=... or {"hdntl":"...", ...}'></textarea>

    <button id="saveBtn" onclick="updateToken()">
      <span>⚡ Save & Activate Token Immediately</span>
    </button>

    <div id="toast" class="toast"></div>

    <a href="/" class="back-link">← Return to Player</a>
  </div>

  <script>
    async function updateToken() {
      const val = document.getElementById('tokenInput').value.trim();
      const toast = document.getElementById('toast');
      const btn = document.getElementById('saveBtn');

      if (!val) {
        showToast('Please paste a token before saving.', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const res = await fetch('/admin/update-token', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: val
        });
        const data = await res.json();
        if (data.status === 'success') {
          showToast('✅ ' + data.message + ' Valid until ' + data.expiresReadable, 'success');
          document.getElementById('expDisplay').textContent = data.expiresReadable;
          setTimeout(() => window.location.reload(), 1500);
        } else {
          showToast('❌ ' + (data.message || 'Failed to update token'), 'error');
        }
      } catch (err) {
        showToast('❌ Network error: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡ Save & Activate Token Immediately</span>';
      }
    }

    function showToast(msg, type) {
      const toast = document.getElementById('toast');
      toast.className = 'toast toast-' + type;
      toast.textContent = msg;
      toast.style.display = 'block';
    }
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(html);
    return;
  }

  // API 1: /api/channels
  if (pathname === '/api/channels') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({
      status: 'success',
      totalChannels: CRICKET_CHANNELS.length,
      channels: CRICKET_CHANNELS,
      categories: CATEGORIES
    }));
    return;
  }

  // API 2: /api/live-matches & /api/matches (Real-Time Live Cricket & Background Banners)
  if (pathname === '/api/live-matches' || pathname === '/api/matches') {
    try {
      const liveBanners = await fetchRealCricketBanners();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        status: 'success',
        updatedAt: new Date().toISOString(),
        totalMatches: liveBanners.length,
        banners: liveBanners,
        matches: liveBanners
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ status: 'error', message: err.message, banners: UPCOMING_BANNERS }));
    }
    return;
  }

  // API 3: /api/servers
  if (pathname === '/api/servers') {
    const channelId = parsedUrl.searchParams.get('channel');
    if (channelId) {
      const channel = CRICKET_CHANNELS.find(c => c.id === channelId);
      if (channel) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ status: 'success', channel: channel.name, servers: channel.servers }));
        return;
      }
    }
    const allServers = CRICKET_CHANNELS.map(c => ({
      channelId: c.id,
      channelName: c.name,
      network: c.network,
      servers: c.servers
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({ status: 'success', servers: allServers }));
    return;
  }

  // Health Check Endpoint (for Docker, Cloud Run, Render, Railway, Uptime monitors)
  if (pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-cache, no-store'
    });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'crickfreelive',
      serverInstance: 'LOCAL_PUNE_WINDOWS_PC',
      uptime: Math.floor(process.uptime()),
      channels: CRICKET_CHANNELS.length,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // SEO: Direct /sitemap.xml & /robots.txt routing
  if (pathname === '/sitemap.xml') {
    const sitemapPath = path.join(__dirname, 'public', 'sitemap.xml');
    fs.readFile(sitemapPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Sitemap not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=UTF-8',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(data);
    });
    return;
  }

  if (pathname === '/robots.txt') {
    const robotsPath = path.join(__dirname, 'public', 'robots.txt');
    fs.readFile(robotsPath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Robots.txt not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(data);
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

  if (!fs.existsSync(filePath)) {
    const publicPath = path.join(__dirname, 'public', pathname);
    if (fs.existsSync(publicPath)) {
      filePath = publicPath;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Production Caching & Security Headers
  const isHtml = ext === '.html' || pathname === '/';
  const isCode = ext === '.js' || ext === '.json' || ext === '.css';
  const isMediaAsset = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.woff2', '.ttf'].includes(ext);

  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };

  if (isHtml || isCode) {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
    headers['Pragma'] = 'no-cache';
    headers['Expires'] = '0';
  } else if (isMediaAsset) {
    headers['Cache-Control'] = 'public, max-age=86400';
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server Error: ${err.code}`);
      return;
    }
    res.writeHead(200, headers);
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🏏 CrickFreeLive Server running at http://0.0.0.0:${PORT}`);
  console.log(`📡 Stream Proxy: /proxy?url=<streamUrl>`);
  console.log(`📡 API Endpoints:`);
  console.log(`   - /api/channels`);
  console.log(`   - /api/matches`);
  console.log(`   - /api/servers`);
  console.log(`   - /playlist.m3u`);
  console.log(`   - /health`);
  console.log(`   - /sitemap.xml`);
  console.log(`   - /robots.txt`);
  console.log(`=======================================================`);
});
