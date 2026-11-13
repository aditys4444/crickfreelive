/**
 * CrickFree - Live Cricket Streaming Engine
 * Minimal, Fast, High-Performance Sports Web Application
 */

import { CRICKET_CHANNELS, CATEGORIES } from '../data/cricketChannels.js?v=20261113_04';
import { UPCOMING_BANNERS } from '../data/liveMatches.js';

class CrickFreeApp {
  constructor() {
    this.channels = [...CRICKET_CHANNELS];
    this.banners = [...UPCOMING_BANNERS];
    this.currentChannel = this.channels[0];
    this.currentServerIndex = 0;
    this.hls = null;
    this.shakaPlayer = null;
    this.failoverTimeout = null;
    this.playbackWatchdog = null;
    this.failoverAttempts = 0;
    this.isPlayingSuccessfully = false;
    this.boundVideoError = null;
    this.boundVideoPlaying = null;
    this.boundVideoTimeUpdate = null;
    this.activeCategory = 'all';

    // Hero Carousel State
    this.activeBannerIndex = 0;
    this.bannerTimer = null;

    // DOM Elements
    this.pageLanding = document.getElementById('pageLanding');
    this.pagePlayer = document.getElementById('pagePlayer');
    this.btnHeaderBack = document.getElementById('btnHeaderBack');

    // Video Player
    this.video = document.getElementById('videoPlayer');
    this.channelNameEl = document.getElementById('playerChannelName');
    this.channelLogoEl = document.getElementById('playerChannelLogo');
    this.qualityTagEl = document.getElementById('playerQualityTag');
    this.serverButtonsContainer = document.getElementById('serverButtonsContainer');

    // Hero Section
    this.heroSection = document.getElementById('heroSection');
    this.heroBgBanner = document.getElementById('heroBgBanner');
    this.heroMatchBadge = document.getElementById('heroMatchBadge');
    this.heroBadgeText = document.getElementById('heroBadgeText');
    this.heroMatchTitle = document.getElementById('heroMatchTitle');
    this.heroMatchSub = document.getElementById('heroMatchSub');
    this.heroBannerDots = document.getElementById('heroBannerDots');
    this.btnPrevBanner = document.getElementById('btnPrevBanner');
    this.btnNextBanner = document.getElementById('btnNextBanner');
    this.btnHeroWatchLive = document.getElementById('btnHeroWatchLive');
    this.btnHeroWatchText = document.getElementById('btnHeroWatchText');

    // Channels Grid
    this.categoryTabsLanding = document.getElementById('categoryTabsLanding');
    this.channelsGridLanding = document.getElementById('channelsGridLanding');
    this.channelsGridPlayer = document.getElementById('channelsGridPlayer');
    this.brandLogoEl = document.getElementById('brandLogo');
    this.btnShareMatch = document.getElementById('btnShareMatch');
    this.toastEl = document.getElementById('toast');

    window.crickFreeApp = this;

    this.init();
  }

  async init() {
    this.setupNavigation();
    this.setupHeroBanners();
    this.setupCategories();
    this.renderChannels();
    this.fetchLiveBanners();
    await this.syncChannelsFromApi();
    
    // Auto-sync real match scores and fixtures every 45s
    setInterval(() => this.fetchLiveBanners(), 45000);
    setInterval(() => this.syncChannelsFromApi(), 60000);

    // Deep-linking: auto-play channel if passed via #channel-id or ?channel=channel-id
    setTimeout(() => this.handleDeepLink(), 80);
    window.addEventListener('hashchange', () => this.handleDeepLink());
  }

  async syncChannelsFromApi() {
    try {
      const apiOrigin = (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1'))
        ? ''
        : 'https://stream.crickfreelive.online';
      const res = await fetch(`${apiOrigin}/api/channels?_nocache=` + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.channels) && data.channels.length > 0) {
          this.channels = data.channels;
          this.renderChannels();

          // Re-sync current channel servers if player is active
          if (this.currentChannel) {
            const fresh = this.channels.find(c => c.id === this.currentChannel.id);
            if (fresh) {
              this.currentChannel = fresh;
              this.renderServerButtons(fresh);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[CrickFree] Live channels sync skipped:', e.message);
    }
  }

  handleDeepLink() {
    const hash = window.location.hash.replace('#', '').trim();
    const urlParams = new URLSearchParams(window.location.search);
    const channelParam = urlParams.get('channel') || hash;

    if (channelParam) {
      const matched = this.channels.find(c => c.id === channelParam);
      if (matched) {
        this.showPlayerPage(matched, 0);
      }
    }
  }

  async shareCurrentMatch() {
    const ch = this.currentChannel;
    if (!ch) return;
    const shareUrl = window.location.origin + window.location.pathname + '#' + ch.id;
    const shareText = `🏏 Watch ${ch.name} live in HD on CrickFree! Free live cricket streaming:`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${ch.name} Live Streaming - CrickFree`,
          text: shareText,
          url: shareUrl
        });
        this.showToast('Shared successfully!');
        return;
      } catch (e) {
        // fall through to clipboard
      }
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(`${shareText} ${shareUrl}`)
        .then(() => this.showToast('Match link copied! Share with friends'))
        .catch(() => this.fallbackCopyText(shareUrl));
    } else {
      this.fallbackCopyText(shareUrl);
    }
  }

  fallbackCopyText(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      this.showToast('Match link copied! Share with friends');
    } catch (e) {
      this.showToast(text);
    }
    document.body.removeChild(input);
  }

  async fetchLiveBanners() {
    try {
      const apiOrigin = (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1'))
        ? ''
        : 'https://stream.crickfreelive.online';
      const res = await fetch(`${apiOrigin}/api/live-matches`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.banners) && data.banners.length > 0) {
        this.banners = data.banners;
        if (this.activeBannerIndex >= this.banners.length) {
          this.activeBannerIndex = 0;
        }
        this.renderActiveBanner();
      }
    } catch (e) {
      console.warn('[CrickFree] Dynamic match sync skipped:', e.message);
    }
  }

  // ==============================================================
  // NAVIGATION & VIEW SWITCHING
  // ==============================================================
  setupNavigation() {
    // Watch Live CTA on Hero - Always play Sony Sports Ten 3 HD first
    if (this.btnHeroWatchLive) {
      this.btnHeroWatchLive.addEventListener('click', () => {
        const sonyTen3 = this.channels.find(c => c.id === 'sony-sports-ten-3-hd') || this.channels[0];
        this.showPlayerPage(sonyTen3, 0);
        this.showToast(`Playing ${sonyTen3.name}`);
      });
    }

    // Single Back Button in Header
    if (this.btnHeaderBack) {
      this.btnHeaderBack.addEventListener('click', () => this.showLandingPage());
    }

    // Share Match Button
    if (this.btnShareMatch) {
      this.btnShareMatch.addEventListener('click', () => this.shareCurrentMatch());
    }

    // Brand Logo click returns to landing page
    if (this.brandLogoEl) {
      this.brandLogoEl.addEventListener('click', (e) => {
        e.preventDefault();
        this.showLandingPage();
      });
    }
  }

  showLandingPage() {
    this.clearWatchdogsAndTimers();
    this.failoverAttempts = 0;
    this.isPlayingSuccessfully = false;

    // Clear hash URL
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch (e) {}

    // Cleanly stop video & destroy HLS
    if (this.video) {
      if (this.boundVideoError) {
        this.video.removeEventListener('error', this.boundVideoError);
        this.boundVideoError = null;
      }
      if (this.boundVideoPlaying) {
        this.video.removeEventListener('playing', this.boundVideoPlaying);
        this.boundVideoPlaying = null;
      }
      if (this.boundVideoTimeUpdate) {
        this.video.removeEventListener('timeupdate', this.boundVideoTimeUpdate);
        this.boundVideoTimeUpdate = null;
      }
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }

    if (this.hls) {
      try {
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch (e) {}
      this.hls = null;
    }

    if (this.shakaPlayer) {
      try {
        this.shakaPlayer.destroy();
      } catch (e) {}
      this.shakaPlayer = null;
    }

    // Toggle views
    if (this.pagePlayer) this.pagePlayer.classList.add('hidden');
    if (this.pageLanding) this.pageLanding.classList.remove('hidden');
    if (this.btnHeaderBack) this.btnHeaderBack.classList.add('hidden');
    const badge = document.getElementById('headerLiveBadge');
    if (badge) badge.classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.renderChannels();
    this.startBannerAutoRotation();
  }

  showPlayerPage(channel, serverIdx = 0) {
    this.stopBannerAutoRotation();

    // Toggle views
    if (this.pageLanding) this.pageLanding.classList.add('hidden');
    if (this.pagePlayer) this.pagePlayer.classList.remove('hidden');
    if (this.btnHeaderBack) this.btnHeaderBack.classList.remove('hidden');
    const badge = document.getElementById('headerLiveBadge');
    if (badge) badge.classList.add('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update URL hash for sharing & deep-linking
    if (channel && channel.id) {
      try {
        history.replaceState(null, '', '#' + channel.id);
      } catch (e) {}
    }

    // Stream selected channel
    this.playChannel(channel, serverIdx, true);
  }

  // ==============================================================
  // HERO STADIUM BANNERS CAROUSEL
  // ==============================================================
  setupHeroBanners() {
    if (this.btnPrevBanner) {
      this.btnPrevBanner.addEventListener('click', () => this.prevBanner());
    }

    if (this.btnNextBanner) {
      this.btnNextBanner.addEventListener('click', () => this.nextBanner());
    }

    if (this.heroSection) {
      this.heroSection.addEventListener('mouseenter', () => this.stopBannerAutoRotation());
      this.heroSection.addEventListener('mouseleave', () => this.startBannerAutoRotation());

      // Touch gestures for mobile & tablets
      let touchStartX = 0;
      let touchStartY = 0;

      this.heroSection.addEventListener('touchstart', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
      }, { passive: true });

      this.heroSection.addEventListener('touchend', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        const diffX = e.changedTouches[0].clientX - touchStartX;
        const diffY = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0) {
            this.nextBanner();
          } else {
            this.prevBanner();
          }
        }
      }, { passive: true });
    }

    this.renderActiveBanner();
    this.startBannerAutoRotation();
  }

  nextBanner() {
    if (this.banners.length === 0) return;
    this.activeBannerIndex = (this.activeBannerIndex + 1) % this.banners.length;
    this.renderActiveBanner();
    this.startBannerAutoRotation();
  }

  prevBanner() {
    if (this.banners.length === 0) return;
    this.activeBannerIndex = (this.activeBannerIndex - 1 + this.banners.length) % this.banners.length;
    this.renderActiveBanner();
    this.startBannerAutoRotation();
  }

  startBannerAutoRotation() {
    this.stopBannerAutoRotation();
    this.bannerTimer = setInterval(() => {
      this.nextBanner();
    }, 8000);
  }

  stopBannerAutoRotation() {
    if (this.bannerTimer) {
      clearInterval(this.bannerTimer);
      this.bannerTimer = null;
    }
  }

  renderActiveBanner() {
    const banner = this.banners[this.activeBannerIndex];
    if (!banner) return;

    // 1. Background image
    if (this.heroBgBanner) {
      this.heroBgBanner.style.backgroundImage = `url("${banner.bannerImage}")`;
    }

    // 2. Headline & Subline
    if (this.heroMatchTitle) {
      this.heroMatchTitle.textContent = banner.title;
    }

    if (this.heroMatchSub) {
      this.heroMatchSub.textContent = banner.subline || (banner.broadcaster ? `${banner.broadcaster}` : banner.tournament);
    }

    // 3. Status Badge
    if (this.heroBadgeText) {
      this.heroBadgeText.textContent = banner.badge || (banner.isLive ? 'LIVE' : 'UPCOMING');
    }

    if (this.heroMatchBadge) {
      this.heroMatchBadge.classList.toggle('live', Boolean(banner.isLive));
    }

    // 4. Button Text
    if (this.btnHeroWatchText) {
      this.btnHeroWatchText.textContent = 'Watch Live';
    }

    // 5. Indicators
    if (this.heroBannerDots) {
      this.heroBannerDots.innerHTML = this.banners.map((_, idx) => `
        <button class="hero-banner-dot ${idx === this.activeBannerIndex ? 'active' : ''}" data-idx="${idx}" aria-label="Slide ${idx + 1}"></button>
      `).join('');

      this.heroBannerDots.querySelectorAll('.hero-banner-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          this.activeBannerIndex = parseInt(e.currentTarget.dataset.idx, 10);
          this.renderActiveBanner();
          this.startBannerAutoRotation();
        });
      });
    }
  }

  // ==============================================================
  // VIDEO STREAMING ENGINE & RELIABLE MULTI-SERVER FAILOVER
  // ==============================================================
  clearWatchdogsAndTimers() {
    if (this.playbackWatchdog) {
      clearTimeout(this.playbackWatchdog);
      this.playbackWatchdog = null;
    }
    if (this.failoverTimeout) {
      clearTimeout(this.failoverTimeout);
      this.failoverTimeout = null;
    }
  }

  switchToNextServer(reason = '') {
    this.clearWatchdogsAndTimers();
    const channel = this.currentChannel;
    if (!channel || !channel.servers || channel.servers.length <= 1) {
      this.showToast(`${channel?.name || 'Channel'} is buffering. Please wait...`);
      return;
    }

    if (this.failoverAttempts < channel.servers.length - 1) {
      this.failoverAttempts++;
      const nextIdx = (this.currentServerIndex + 1) % channel.servers.length;
      console.warn(`[CrickFree] Auto-failover: Server ${this.currentServerIndex + 1} -> Server ${nextIdx + 1} (${reason})`);
      this.showToast(`Auto-switching to Server ${nextIdx + 1}...`);

      this.failoverTimeout = setTimeout(() => {
        this.playChannel(channel, nextIdx, false);
      }, 400);
    } else {
      console.warn(`[CrickFree] Reached max failover attempts for ${channel.name}`);
      this.showToast(`${channel.name} connecting... Please click another server below.`);
    }
  }

  playChannel(channel, serverIdx = 0, isManual = true) {
    this.clearWatchdogsAndTimers();

    if (isManual || (this.currentChannel && this.currentChannel.id !== channel.id)) {
      this.failoverAttempts = 0;
    }

    this.isPlayingSuccessfully = false;
    this.currentChannel = channel;
    this.currentServerIndex = (serverIdx >= 0 && serverIdx < channel.servers.length) ? serverIdx : 0;
    const server = channel.servers[this.currentServerIndex];

    if (this.channelNameEl) this.channelNameEl.textContent = channel.name;
    if (this.channelLogoEl) this.channelLogoEl.src = channel.logo;
    const subEl = document.getElementById('playerChannelSub');
    if (subEl) subEl.textContent = `${channel.language} • ${server.name || 'HD Line'} • ${server.bitrate || channel.quality || '1080p HD'}`;
    if (this.qualityTagEl) this.qualityTagEl.textContent = channel.quality || '1080p HD';

    this.renderServerButtons(channel);
    this.renderChannels();

    if (!this.video) return;

    let streamUrl = server.url;
    if (streamUrl.startsWith('/')) {
      const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
      if (!isLocal) {
        streamUrl = `https://stream.crickfreelive.online${streamUrl}`;
      }
    }

    console.log(`[CrickFree] Playing ${channel.name} -> Server ${this.currentServerIndex + 1} [${server.name || 'HD'}]: ${streamUrl}`);

    // Tear down active player instances
    if (this.hls) {
      try {
        this.hls.stopLoad();
        this.hls.detachMedia();
        this.hls.destroy();
      } catch (e) {}
      this.hls = null;
    }

    if (this.shakaPlayer) {
      try {
        this.shakaPlayer.destroy();
      } catch (e) {}
      this.shakaPlayer = null;
    }

    // Remove previous video element listeners
    if (this.boundVideoError) {
      this.video.removeEventListener('error', this.boundVideoError);
      this.boundVideoError = null;
    }
    if (this.boundVideoPlaying) {
      this.video.removeEventListener('playing', this.boundVideoPlaying);
      this.boundVideoPlaying = null;
    }
    if (this.boundVideoTimeUpdate) {
      this.video.removeEventListener('timeupdate', this.boundVideoTimeUpdate);
      this.boundVideoTimeUpdate = null;
    }

    // Reset video element
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    } catch (e) {}

    // Attach fresh video element monitoring
    this.boundVideoPlaying = () => {
      this.isPlayingSuccessfully = true;
      this.clearWatchdogsAndTimers();
      this.failoverAttempts = 0;
      console.log(`[CrickFree] Channel ${channel.name} playing on Server ${this.currentServerIndex + 1} (ready: ${this.video.readyState})`);
    };
    this.video.addEventListener('playing', this.boundVideoPlaying);

    this.boundVideoTimeUpdate = () => {
      if (this.video && this.video.currentTime > 0.1) {
        this.isPlayingSuccessfully = true;
        if (this.playbackWatchdog) {
          clearTimeout(this.playbackWatchdog);
          this.playbackWatchdog = null;
        }
      }
    };
    this.video.addEventListener('timeupdate', this.boundVideoTimeUpdate);

    this.boundVideoError = (err) => {
      console.warn(`[CrickFree] Native video element error on Server ${this.currentServerIndex + 1}:`, err);
      this.switchToNextServer('Video element error');
    };
    this.video.addEventListener('error', this.boundVideoError);

    // Watchdog Timer: give HLS sufficient time to fetch manifest, AES-128 key & decrypt initial segment (15s)
    this.playbackWatchdog = setTimeout(() => {
      // If video is paused (e.g. mobile waiting for user tap/interaction), do not auto-failover
      if (this.video && this.video.paused) {
        return;
      }
      if (this.video && this.video.readyState < 2 && !this.isPlayingSuccessfully) {
        console.warn(`[CrickFree] Watchdog triggered: Server ${this.currentServerIndex + 1} stalled/unreachable`);
        this.switchToNextServer('Connection timeout');
      }
    }, 15000);

    const isDash = streamUrl.toLowerCase().includes('.mpd') || server.type === 'dash';

    if (isDash && window.shaka) {
      shaka.polyfill.installAll();
      if (shaka.Player.isBrowserSupported()) {
        const player = new shaka.Player(this.video);
        this.shakaPlayer = player;

        if (server.drm) {
          player.configure({ drm: server.drm });
        } else if (server.clearKey) {
          player.configure({
            drm: {
              clearKeys: server.clearKey
            }
          });
        }

        player.load(streamUrl).then(() => {
          this.failoverAttempts = 0;
          this.video.muted = false;
          this.video.play().catch(() => {
            this.video.muted = true;
            this.video.play().catch(() => {});
          });
        }).catch((err) => {
          console.warn(`[CrickFree] Shaka DASH error on Server ${this.currentServerIndex + 1}:`, err);
          this.switchToNextServer('DASH stream error');
        });
        return;
      }
    }

    if (window.Hls && Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false, // Ensures deep buffer cushion against network drops
        backBufferLength: 30,
        maxBufferLength: 30, // Maintains up to 30s buffer ahead in RAM
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        liveSyncDurationCount: 3, // Maintain 12s safety cushion so it never stutters
        liveMaxLatencyDurationCount: 8,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        startLevel: 0, // Starts immediately with fastest segment for instant 0s buffering
        manifestLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 800,
        levelLoadingTimeOut: 15000,
        levelLoadingMaxRetry: 4,
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 800
      });

      this.hls.loadSource(streamUrl);
      this.hls.attachMedia(this.video);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const playPromise = this.video.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            this.video.muted = true;
            this.video.play().catch(() => {});
          });
        }
      });

      let netErrorRetries = 0;
      this.hls.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) return;

        console.warn(`[CrickFree] HLS fatal error on Server ${this.currentServerIndex + 1}:`, data.type, data.details);

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try {
            this.hls.recoverMediaError();
            return;
          } catch (e) {
            this.switchToNextServer('Unrecoverable media error');
            return;
          }
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (netErrorRetries < 2) {
            netErrorRetries++;
            console.warn('[CrickFree] Network glitch detected, recovering stream...');
            this.hls.startLoad();
            return;
          }
        }

        this.switchToNextServer(data.details || 'Network stream error');
      });
    } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = streamUrl;
      this.video.addEventListener('loadedmetadata', () => {
        this.video.play().catch(() => {});
      });
    } else {
      this.switchToNextServer('Browser unsupported');
    }
  }

  renderServerButtons(channel) {
    if (!this.serverButtonsContainer) return;

    this.serverButtonsContainer.innerHTML = channel.servers.map((srv, idx) => `
      <button class="server-pill ${idx === this.currentServerIndex ? 'active' : ''}" data-idx="${idx}" title="${srv.name}">
        Server ${idx + 1}
      </button>
    `).join('');

    this.serverButtonsContainer.querySelectorAll('.server-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        if (idx === this.currentServerIndex && this.isPlayingSuccessfully) {
          return;
        }
        this.clearWatchdogsAndTimers();
        this.failoverAttempts = 0;
        this.playChannel(channel, idx, true);
        this.showToast(`Switched to Server ${idx + 1}`);
      });
    });
  }

  // ==============================================================
  // CATEGORIES & CHANNELS DIRECTORY
  // ==============================================================
  setupCategories() {
    if (!this.categoryTabsLanding) return;

    this.categoryTabsLanding.innerHTML = CATEGORIES.map(cat => `
      <button class="category-tab ${cat.id === this.activeCategory ? 'active' : ''}" data-id="${cat.id}">
        ${cat.name}
      </button>
    `).join('');

    this.categoryTabsLanding.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.activeCategory = e.currentTarget.dataset.id;
        this.categoryTabsLanding.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.renderChannels();
      });
    });
  }

  renderChannels() {
    let filtered = this.channels;

    if (this.activeCategory !== 'all') {
      filtered = filtered.filter(c => c.category === this.activeCategory);
    }

    const isPlayerOpen = this.pagePlayer && !this.pagePlayer.classList.contains('hidden');

    const generateCardsHtml = (channelsList) => {
      if (channelsList.length === 0) {
        return `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #94A3B8;">
            <p style="font-size: 15px; font-weight: 500;">No channels found</p>
          </div>
        `;
      }

      return channelsList.map(ch => {
        const isCurrent = isPlayerOpen && (ch.id === this.currentChannel.id);
        return `
          <div class="channel-card ${isCurrent ? 'active' : ''}" data-id="${ch.id}">
            <div class="card-banner-wrapper">
              <img class="card-banner-img" src="${ch.logo}" alt="${ch.name}" loading="lazy"/>
              <span class="card-live-pill">LIVE</span>
            </div>
            <div class="card-info">
              <h3 class="card-title">${ch.name}</h3>
              <p class="card-meta">${ch.language} • ${ch.quality || '1080p'}</p>
            </div>
          </div>
        `;
      }).join('');
    };

    // 1. Landing Grid
    if (this.channelsGridLanding) {
      this.channelsGridLanding.innerHTML = generateCardsHtml(filtered);
      this.channelsGridLanding.querySelectorAll('.channel-card').forEach(card => {
        card.addEventListener('click', (e) => {
          const id = e.currentTarget.dataset.id;
          const selected = this.channels.find(c => c.id === id);
          if (selected) {
            this.showPlayerPage(selected, 0);
            this.showToast(`Playing ${selected.name}`);
          }
        });
      });
    }

    // 2. Player Page Grid (Under video player)
    if (this.channelsGridPlayer) {
      this.channelsGridPlayer.innerHTML = generateCardsHtml(this.channels);
      this.channelsGridPlayer.querySelectorAll('.channel-card').forEach(card => {
        card.addEventListener('click', (e) => {
          const id = e.currentTarget.dataset.id;
          const selected = this.channels.find(c => c.id === id);
          if (selected) {
            this.playChannel(selected, 0);
            this.showToast(`Playing ${selected.name}`);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        });
      });
    }
  }

  showToast(message) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 2400);
  }
}

// Bootstrap app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new CrickFreeApp();
});
