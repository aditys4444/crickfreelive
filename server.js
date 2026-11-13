import http from 'http';
import https from 'https';
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

// Stream Proxy handler to bypass CORS, geo-restrictions, and mixed-content blocks safely
function proxyStream(targetUrl, req, res) {
  try {
    const parsed = new URL(targetUrl);
    const mod = parsed.protocol === 'https:' ? https : http;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': parsed.origin,
      'Accept': '*/*',
    };

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const proxyReq = mod.get(targetUrl, { headers, timeout: 10000 }, (proxyRes) => {
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
                    return `URI="/proxy?url=${encodeURIComponent(resolved)}"`;
                  } catch (e) {
                    return m;
                  }
                });
              }
              return line;
            }
            try {
              const resolved = new URL(l, targetUrl).toString();
              return `/proxy?url=${encodeURIComponent(resolved)}`;
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

        res.writeHead(proxyRes.statusCode, responseHeaders);
        proxyRes.pipe(res);

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
      headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' blob: https: http:; connect-src 'self' https: http: blob:; object-src 'none'; base-uri 'self';";
      
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

  // 4. Stream Proxy endpoint with SSRF & Hotlinking Defense
  if (pathname === '/proxy') {
    // Anti-Hotlinking: prevent rogue third-party sites from stealing your bandwidth
    if (!isHotlinkAllowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden: Hotlinking not allowed');
      return;
    }

    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing "url" query parameter');
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
