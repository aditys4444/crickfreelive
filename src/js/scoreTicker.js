/**
 * CrickFreeLive Scorecard & Live Match Center Engine
 */

import { FEATURED_MATCHES } from '../data/liveMatches.js';

export class ScoreTicker {
  constructor(options = {}) {
    this.matches = [...FEATURED_MATCHES];
    this.currentMatchIndex = 0;
    this.container = options.container || document.getElementById('liveScorecard');
    this.headerTicker = options.headerTicker || document.getElementById('tickerMarquee');
    this.onWatchMatch = options.onWatchMatch || (() => {});
    
    this.init();
  }

  init() {
    this.renderScorecard();
    this.renderHeaderTicker();
    this.startLiveSimulation();
  }

  getCurrentMatch() {
    return this.matches[this.currentMatchIndex];
  }

  renderScorecard() {
    if (!this.container) return;
    const match = this.getCurrentMatch();

    this.container.innerHTML = `
      <div class="scorecard-box">
        <div class="match-tourney">
          <span>${match.tournament}</span>
          <span style="color: ${match.status === 'LIVE' ? '#EF4444' : '#F59E0B'}; font-weight: 800;">
            ${match.status === 'LIVE' ? '● LIVE' : match.status}
          </span>
        </div>
        
        <div style="font-size: 12px; color: #94A3B8; margin-top: -6px;">
          ${match.venue} • ${match.matchType}
        </div>

        <div class="teams-scores">
          <div class="team-row">
            <div class="team-meta">
              <span style="font-size: 20px;">${match.team1.flag}</span>
              <span>${match.team1.name}</span>
              <span style="font-size: 10px; padding: 2px 6px; background: rgba(16, 185, 129, 0.2); color: #10B981; border-radius: 4px;">${match.team1.badge}</span>
            </div>
            <div class="team-score">${match.team1.score} <span style="font-size: 13px; color: #94A3B8;">(${match.team1.overs} ov)</span></div>
          </div>

          <div class="team-row">
            <div class="team-meta">
              <span style="font-size: 20px;">${match.team2.flag}</span>
              <span style="color: #94A3B8;">${match.team2.name}</span>
              <span style="font-size: 10px; padding: 2px 6px; background: rgba(255, 255, 255, 0.05); color: #94A3B8; border-radius: 4px;">${match.team2.badge}</span>
            </div>
            <div class="team-score ${match.team2.score.includes('Yet') || match.team2.score === '--' ? 'inactive' : ''}">${match.team2.score}</div>
          </div>
        </div>

        ${match.batsmen.length > 0 ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 6px;">
            <div>
              <div style="color: #94A3B8; font-size: 10px;">BATSMEN ON STRIKE</div>
              <div style="font-weight: 700; color: #FFF;">${match.batsmen[0].name}*: <span style="color: #10B981;">${match.batsmen[0].runs}</span> (${match.batsmen[0].balls})</div>
              ${match.batsmen[1] ? `<div style="color: #CBD5E1;">${match.batsmen[1].name}: ${match.batsmen[1].runs} (${match.batsmen[1].balls})</div>` : ''}
            </div>
            ${match.bowler ? `
              <div>
                <div style="color: #94A3B8; font-size: 10px;">CURRENT BOWLER</div>
                <div style="font-weight: 700; color: #FFF;">${match.bowler.name}</div>
                <div style="color: #CBD5E1;">${match.bowler.figures} (Econ ${match.bowler.econ})</div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <div class="commentary-ticker">
          <strong style="color: #10B981;">Live Beat:</strong> ${match.commentarySnippet}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
          <div class="ball-tracker">
            <span style="font-size: 11px; color: #94A3B8; margin-right: 4px;">This Over:</span>
            <span class="ball-pill">1</span>
            <span class="ball-pill four">4</span>
            <span class="ball-pill">0</span>
            <span class="ball-pill six">6</span>
            <span class="ball-pill">1</span>
            <span class="ball-pill wicket">W</span>
          </div>

          <button id="btnWatchLiveMatch" class="btn btn-primary" style="padding: 6px 14px; font-size: 12px;">
            📺 Watch Stream
          </button>
        </div>

        <div style="display: flex; gap: 6px; justify-content: center; margin-top: 8px;">
          ${this.matches.map((m, idx) => `
            <button class="match-dot-btn" data-index="${idx}" style="width: 8px; height: 8px; border-radius: 50%; border: none; background: ${idx === this.currentMatchIndex ? '#10B981' : 'rgba(255,255,255,0.2)'}; cursor: pointer;"></button>
          `).join('')}
        </div>
      </div>
    `;

    // Bind event
    const watchBtn = this.container.querySelector('#btnWatchLiveMatch');
    if (watchBtn) {
      watchBtn.addEventListener('click', () => {
        this.onWatchMatch(match.associatedChannelId, match.altChannelId);
      });
    }

    // Bind dots
    this.container.querySelectorAll('.match-dot-btn').forEach(dot => {
      dot.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index, 10);
        this.currentMatchIndex = idx;
        this.renderScorecard();
      });
    });
  }

  renderHeaderTicker() {
    if (!this.headerTicker) return;
    const items = this.matches.map(m => `
      <span style="display: inline-flex; align-items: center; gap: 8px; margin-right: 28px;">
        <span class="ticker-pill"><span class="ticker-dot"></span> ${m.status}</span>
        <strong>${m.team1.short} vs ${m.team2.short}</strong>:
        ${m.team1.score} ${m.team1.overs ? `(${m.team1.overs} ov)` : ''} 
        ${m.team2.score !== '--' ? `vs ${m.team2.score}` : ''}
        • <span style="color: #10B981;">${m.tournament}</span>
      </span>
    `).join('');

    this.headerTicker.innerHTML = `<div class="ticker-content">${items} ${items}</div>`;
  }

  startLiveSimulation() {
    // Every 8 seconds, advance ball and commentary for realistic live action
    setInterval(() => {
      const match = this.matches[0];
      if (match && match.status === 'LIVE') {
        const runsArr = [1, 2, 4, 0, 6, 1];
        const addedRun = runsArr[Math.floor(Math.random() * runsArr.length)];
        
        // update score
        const parts = match.team1.score.split('/');
        let currentRuns = parseInt(parts[0], 10) + addedRun;
        let wickets = parts[1] || '4';
        match.team1.score = `${currentRuns}/${wickets}`;
        
        if (addedRun === 6) {
          match.commentarySnippet = `MAXIMUM! Cracking shot straight down the ground into the sightscreen! What a connection!`;
        } else if (addedRun === 4) {
          match.commentarySnippet = `FOUR! Cut away behind point with razor precision, races to the fence!`;
        } else if (addedRun === 0) {
          match.commentarySnippet = `Good length delivery on off stump, defended solidly towards mid-off. No run.`;
        } else {
          match.commentarySnippet = `Pushed softly into the gap on the on-side for a sharp single. Good running between wickets.`;
        }

        // re-render if current active is 0
        if (this.currentMatchIndex === 0) {
          this.renderScorecard();
        }
        this.renderHeaderTicker();
      }
    }, 9000);
  }
}

