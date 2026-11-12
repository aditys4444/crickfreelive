# CrickFree Production Security Architecture

This document details the multi-layer security system implemented for **CrickFree** to protect against DDoS attacks, bandwidth leeching/hotlinking, Server-Side Request Forgery (SSRF), bot scraping, and server crashes during high-traffic live matches.

---

## 1. Built-in Application Security Layers

### A. SSRF & Internal IP Blocking (`src/security.js`)
Free streaming proxies often face SSRF exploits where attackers pass internal or cloud URLs to hijack servers.
* **Cloud Metadata Blocked**: Requests to `169.254.169.254` (AWS, GCP, Azure, DigitalOcean instance credentials) return `403 Forbidden`.
* **Private Network Subnets Blocked**: All private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1`, `localhost`, `0.0.0.0`, `::1`, `fc00::/7`, `fe80::/10`) are strictly blocked.
* **Protocol Enforcement**: Only `http:` and `https:` schemes are accepted. Protocols like `file:`, `ftp:`, `javascript:`, or `data:` are rejected.
* **Target Whitelisting**: The proxy only processes valid live streaming resources (`.m3u8`, `.ts`, `.key`, `.aac`, `.mp4`).

### B. Anti-Hotlinking & Bandwidth Leeching Defense
Rival free sports streaming sites frequently steal streams by embedding another site's `/proxy` URL on their domain.
* **Referer & Origin Verification**: Any request originating from an unauthorized third-party domain is immediately blocked with `403 Forbidden ("Hotlinking not allowed")`.
* Legitimate direct visitors, mobile players, and apps from your domain are allowed full access.

### C. In-Memory Sliding Window Rate Limiting (Anti-DDoS)
Prevents scrapers and botnets from overwhelming the server:
* **/proxy streams**: 360 requests/min per IP (ample for normal HLS video playback).
* **/api/* endpoints**: 60 requests/min per IP.
* **Static pages & assets**: 200 requests/min per IP.
* Violating IPs receive `HTTP 429 Too Many Requests` with a `Retry-After: 15` header.
* Automatic in-memory cache eviction every 60 seconds prevents memory leaks.

### D. Enterprise HTTP Security Headers
Every HTTP response automatically injects standard security headers:
* **`X-Content-Type-Options: nosniff`**: Prevents MIME-confusion attacks.
* **`X-Frame-Options: SAMEORIGIN`**: Stops clickjacking and malicious third-party iframe embedding.
* **`X-XSS-Protection: 1; mode=block`**: Filters reflective script execution.
* **`Referrer-Policy: strict-origin-when-cross-origin`**: Protects user browsing privacy.
* **`Permissions-Policy: camera=(), microphone=(), geolocation=()`**: Disables browser hardware APIs.
* **`Strict-Transport-Security (HSTS)`**: Automatically enforces HTTPS connections.
* **`Content-Security-Policy (CSP)`**: Restricts external script sources strictly to approved CDNs (`cdn.jsdelivr.net` for HLS.js).

---

## 2. Cloudflare Edge Security Setup (Recommended for Domain)

When deploying to a custom domain, routing traffic through **Cloudflare** (Free Tier) provides an outer shield:

### Step 1: Hide Origin IP (Proxy Mode)
* In your Cloudflare DNS tab, ensure the cloud icon next to your `@` and `www` records is **Orange (Proxied)**.
* This conceals your origin server's real IP address from attackers and DMCA probes.

### Step 2: Enable Bot Fight Mode & WAF
1. Go to **Cloudflare Dashboard** -> **Security** -> **Bots**.
2. Turn on **Bot Fight Mode** (blocks automated scrapers and bad bots).
3. Under **Security** -> **WAF** -> **Rate Limiting Rules**, you can optionally set a rule to challenge IPs making more than 100 requests in 10 seconds.

### Step 3: "Under Attack Mode" for Massive Matches
* During viral matches (e.g., India vs Pakistan, World Cup finals), if traffic surges dramatically:
  * In the Cloudflare overview, click **Under Attack Mode**.
  * Cloudflare presents an automatic JS challenge to incoming users, mitigating 100% of Layer 7 HTTP flood attacks before they reach your Node.js server.

