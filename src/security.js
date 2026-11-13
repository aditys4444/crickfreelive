/**
 * CrickFree Production Security Suite
 * High-performance, zero-dependency defense against SSRF, DDoS, Hotlinking, and Injection.
 */

// In-Memory Sliding Window Rate Limiter
const rateLimitMap = new Map();

// Periodic cleanup every 60s to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (now - data.startTime > 60000) {
      rateLimitMap.delete(key);
    }
  }
}, 60000);

// Rate Limits per minute
const LIMITS = {
  proxy: 360,   // ~6 requests/sec max per IP (normal HLS video player uses ~1 req every 2s)
  api: 60,      // 1 req/sec max per IP
  static: 200   // 200 requests/min for pages/images
};

/**
 * Extract true client IP safely behind proxies (Cloudflare, Nginx, Render)
 */
export function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp.trim();

  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',');
    return ips[0].trim();
  }

  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) return xRealIp.trim();

  return req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Sliding Window Rate Limiter
 */
export function checkRateLimit(ip, type = 'api') {
  const now = Date.now();
  const maxRequests = LIMITS[type] || 60;
  const key = `${type}:${ip}`;

  let record = rateLimitMap.get(key);

  if (!record || now - record.startTime > 60000) {
    record = { startTime: now, count: 1 };
    rateLimitMap.set(key, record);
    return { allowed: true, remaining: maxRequests - 1 };
  }

  record.count += 1;

  if (record.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((record.startTime + 60000 - now) / 1000)
    };
  }

  return { allowed: true, remaining: maxRequests - record.count };
}

/**
 * SSRF Prevention: Validate that target URL is a safe public streaming endpoint
 */
export function isSafeProxyUrl(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') return false;
  if (targetUrl.length > 2048) return false;

  try {
    const parsed = new URL(targetUrl);

    // 1. Only allow HTTP and HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // 2. Block Localhost & Loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
      return false;
    }

    // 3. Block Cloud Provider Metadata Services (AWS, GCP, Azure, DigitalOcean)
    if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.startsWith('169.254.')) {
      return false;
    }

    // 4. Block Private IPv4 Subnets (RFC 1918)
    if (
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    // 5. Block Private IPv6
    if (host.startsWith('fc00:') || host.startsWith('fe80:') || host.startsWith('fd')) {
      return false;
    }

    // 6. Ensure target is a streaming or media resource (m3u8, mpd, ts, m4s, key, or valid streaming path)
    const pathname = parsed.pathname.toLowerCase();
    const isStreamResource = 
      pathname.includes('.m3u8') ||
      pathname.includes('.mpd') ||
      pathname.includes('.ts') ||
      pathname.includes('.m4s') ||
      pathname.includes('.dash') ||
      pathname.includes('.m3u') ||
      pathname.includes('.key') ||
      pathname.includes('.aac') ||
      pathname.includes('.mp4') ||
      pathname.includes('live') ||
      pathname.includes('stream') ||
      pathname.includes('hls') ||
      pathname.includes('bpk-tv') ||
      parsed.search.includes('.m3u8') ||
      parsed.search.includes('.mpd') ||
      parsed.search.includes('.ts');

    if (!isStreamResource) {
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Anti-Hotlinking Protection: Prevent external rogue sites from stealing bandwidth
 */
export function isHotlinkAllowed(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // Whitelisted friendly domains
  const allowedDomains = [
    'crickfreelive.online',
    'www.crickfreelive.online',
    'localhost',
    '127.0.0.1',
    'trycloudflare.com'
  ];

  const isDomainAllowed = (targetHost) => {
    if (!targetHost) return true;
    const clean = targetHost.toLowerCase().split(':')[0];
    return allowedDomains.some(d => clean === d || clean.endsWith('.' + d));
  };

  // If no referer/origin, allow (e.g. direct browser player, VLC, mobile apps, curl)
  if (!origin && !referer) {
    return true;
  }

  // Check Origin
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host || isDomainAllowed(originHost)) {
        return true;
      }
      // Foreign origin attempting to hotlink stream proxy
      return false;
    } catch (e) {
      return false;
    }
  }

  // Check Referer
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === host || isDomainAllowed(refererHost)) {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  return true;
}

/**
 * Apply Standard Enterprise HTTP Security Headers
 */
export function applySecurityHeaders(res, req) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Clickjacking / Iframe Embedding on third-party sites
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Enable XSS Filtering
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict unnecessary browser device APIs
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Enforce HTTPS HSTS when behind SSL/TLS
  const proto = req.headers['x-forwarded-proto'];
  if (proto === 'https' || req.socket.encrypted) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy (Allow HLS.js CDN & media streaming)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' blob: https: http:; connect-src 'self' https: http: blob:; object-src 'none'; base-uri 'self';"
  );
}

