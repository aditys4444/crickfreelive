# CrickFree Deployment & SEO Ranking Playbook

This guide covers deploying **CrickFree** to your custom domain with free SSL, configuring Cloudflare for zero-latency streaming, and ranking #1 on Google to gain thousands of daily live cricket viewers.

---

## 1. Fast Cloud Deployment (Recommended)

### Option A: Render (Free / Low Cost with Auto SSL)
1. Push this project to GitHub (or create a private repository).
2. Go to [Render.com](https://render.com) and click **New +** -> **Web Service**.
3. Connect your GitHub repository.
4. Settings:
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `node server.js`
   * **Plan**: Free or Starter ($7/mo)
5. Click **Create Web Service**. Render provides a free `https://your-app.onrender.com` URL.

### Option B: Railway
1. Go to [Railway.app](https://railway.app) and click **New Project** -> **Deploy from GitHub repo**.
2. Railway detects the `Dockerfile` or `Procfile` and builds automatically.
3. In **Settings** -> **Domains**, click **Generate Domain** or add your Custom Domain.

### Option C: Self-Hosted VPS (DigitalOcean / Hetzner / AWS EC2 / Ubuntu)
```bash
# 1. Update system & install Node.js 20 & PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git
sudo npm install -g pm2

# 2. Clone or copy files
git clone <your-repo-url> /var/www/crickfreelive
cd /var/www/crickfreelive
npm install

# 3. Start with PM2 daemon
pm2 start server.js --name "crickfree"
pm2 startup
pm2 save

# 4. Configure Nginx Reverse Proxy (/etc/nginx/sites-available/default)
# Add proxy_pass http://127.0.0.1:3000; with proxy_buffering off;
```

---

## 2. Connecting Your Custom Domain & SSL (HTTPS)

### Step 1: DNS Configuration
In your domain registrar (GoDaddy, Namecheap, Cloudflare, Hostinger):
* **Type**: `CNAME`
* **Name**: `@` (or `www`)
* **Value**: Your Render or Railway URL (e.g. `crickfree.onrender.com`)

### Step 2: Use Cloudflare (Crucial for Sports Streaming)
1. Point your domain nameservers to Cloudflare (Free plan).
2. Set SSL/TLS encryption mode to **Full** or **Full (Strict)**.
3. Turn on **Cloudflare Edge Caching** for static assets (`/public/*`, CSS, JS, SVG, images).
4. Turn on **Under Attack Mode** or Bot Fight Mode if high-traffic spikes occur during major matches (e.g., IND vs PAK, World Cup, IPL).

---

## 3. How to Rank on Google & Gain Massive Viewers

### A. Instant Search Engine Indexing (Google & Bing)
1. Go to [Google Search Console](https://search.google.com/search-console).
2. Add your custom domain property (e.g., `https://crickfree.live`).
3. Click **Sitemaps** in the left sidebar.
4. Enter: `https://yourdomain.com/sitemap.xml` and click **Submit**.
   * Your pre-configured `sitemap.xml` includes all 9 live channels and match routes with daily/hourly update frequencies.
5. In **URL Inspection**, enter your homepage URL and click **Request Indexing**. Googlebot will crawl your site within 24 hours.

### B. High-Volume Cricket Search Keywords Targeted
Your site's metadata and Schema.org markup are pre-tuned for high-traffic search terms:
* `watch live cricket free hd`
* `sony sports ten 3 hd live hindi stream`
* `dd sports live cricket match today`
* `willow cricket hd live online`
* `india vs new zealand live streaming free`
* `india vs afghanistan u19 asia cup live`
* `free live sports streaming mobile`

### C. Viral Match Sharing (WhatsApp & Telegram Growth)
In live cricket, **80–90% of streaming traffic spreads via word-of-mouth in WhatsApp groups, Telegram channels, and Twitter/X**:
1. **Direct Match Links**:
   * Every channel has a direct deep link:
     * `https://yourdomain.com/#sony-sports-ten-3-hd`
     * `https://yourdomain.com/#willow-cricket-hd`
     * `https://yourdomain.com/#dd-sports-live-cricket`
   * When shared, the recipient lands directly inside the cinema player and the match starts playing instantly.
2. **1-Click Share Button**:
   * Viewers can click the **Share** button on the video player info bar.
   * On mobile phones, this triggers the native share sheet directly to WhatsApp or Telegram with the live match title.
3. **PWA Mobile App Install**:
   * Mobile visitors on Chrome or Safari are prompted to "Add to Home Screen".
   * Once installed, your CrickFree icon lives on their home screen for instant 1-tap match viewing.

---

## 4. Production Health Monitoring & Endpoints

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/health` | GET | Automated container health check and uptime monitor |
| `/sitemap.xml` | GET | XML sitemap for Google/Bing crawlers |
| `/robots.txt` | GET | Crawler directives and sitemap reference |
| `/api/channels` | GET | JSON list of active channels & categories |
| `/api/matches` | GET | Real-time live scores & tournament fixtures |
| `/playlist.m3u` | GET | Downloadable M3U playlist for VLC / IPTV players |

