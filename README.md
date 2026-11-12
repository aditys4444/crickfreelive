# 🏏 CrickFree - Free Live Cricket Streaming Portal

A modern, high-performance, dark-themed live cricket streaming portal built with **pure zero-dependency Node.js**, **HLS.js adaptive video streaming**, **multi-server failover redundancy**, and an **enterprise security suite**.

---

## 🌟 Features

* **9 Verified 1080p Cricket & Sports Channels**:
  * **Sony Sports Ten 3 HD (Hindi)**: Bilateral tours, international tests, ODIs, and T20s with Hindi commentary.
  * **Sony Sports Ten 1 HD (English)**: World cricket, Australian cricket tours, The Ashes, and WWE.
  * **Sony Sports Ten 2 HD**: International cricket tournaments and European sports.
  * **Sony Sports Ten 5 HD**: Formerly Sony Six, T20 cricket leagues and live combat sports.
  * **Willow Cricket HD**: 24/7 dedicated international cricket coverage across ICC member nations.
  * **DD Sports HD (1080p 60fps)**: Free-to-Air Team India live matches and national events.
  * **Cricket Gold**: 24/7 non-stop classic matches, historic run-chases, and tournament highlights.
  * **M Sports HD**: Live international cricket events and regional tournaments.
  * **Eurosport HD**: Global cricket championships, cycling, and international sports network.

* **Cinema Theater Player**:
  * Clean 16:9 responsive canvas without clutter or disruptive overlays.
  * Instant server switcher (`Server 1`, `Server 2`, `Server 3`) with automatic failover if any feed drops.
  * 1-Click **Share Match** button with direct URL deep-linking (`#channel-id`) for WhatsApp, Telegram, and Twitter/X.

* **Dynamic Hero Carousel**:
  * Live stadium floodlight graphics and curated match banners (India vs Afghanistan U19, India vs New Zealand).
  * Direct "Watch Live" CTA launching the top live channel immediately.

* **Enterprise Security Suite**:
  * **SSRF Defense**: Blocks cloud metadata endpoints (`169.254.169.254`) and private subnets (`127.0.0.1`, `10.x`, `192.168.x`, `172.16-31.x`).
  * **Anti-Hotlinking**: Protects your server's bandwidth by blocking rogue third-party websites from stealing proxy streams.
  * **Sliding Window Rate Limiter**: Mitigates DDoS floods and bot scrapers on `/proxy` and `/api/*`.
  * **Security Headers**: HSTS, CSP, X-Frame-Options (`SAMEORIGIN`), and X-Content-Type-Options (`nosniff`).

* **SEO & Viral Viewership Architecture**:
  * Schema.org JSON-LD structured data (`WebSite`, `BroadcastService`, `SportsEvent`, `FAQPage`).
  * Open Graph and Twitter Cards with high-resolution brand banner.
  * PWA Web App Manifest (`manifest.json`) for Android & iOS "Add to Home Screen".
  * Auto-generated `/sitemap.xml` and `/robots.txt`.

---

## 🚀 Quick Start

### Prerequisites
* [Node.js](https://nodejs.org) (v18 or higher)

### Installation & Run
```bash
# 1. Clone repository
git clone https://github.com/aditys4444/crickfreelive.git
cd crickfreelive

# 2. Install dependencies
npm install

# 3. Start server
npm start
```
The streaming server runs at `http://localhost:3000`.

---

## 📡 API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/proxy?url=<targetUrl>` | GET | Secure HLS stream proxy with SSRF & hotlink protection |
| `/api/channels` | GET | List of all 9 active channels, languages, categories & qualities |
| `/api/matches` | GET | Dynamic live matches & hero banners |
| `/api/servers?channel=<id>` | GET | Multi-server failover endpoints for a specific channel |
| `/playlist.m3u` | GET | Downloadable M3U playlist for VLC, Kodi, or IPTV players |
| `/health` | GET | Automated container health check and uptime monitor |
| `/sitemap.xml` | GET | XML sitemap for Google/Bing crawlers |
| `/robots.txt` | GET | Crawler directives |

---

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
docker compose up -d
```

---

## 📄 License
MIT License. Created by [Aditya Yadav](https://github.com/aditys4444).
