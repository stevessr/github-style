(() => {
  const ROOT_SELECTOR = '[data-custom-audio-player-root="true"]';
  const LOOP_STATES = ["all", "one", "off"];
  const LOOP_LABELS = {
    all: "循环：全部",
    one: "循环：单曲",
    off: "循环：关闭",
  };
  const PLACEHOLDER_COVER = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#79c0ff"/><stop offset="1" stop-color="#1f6feb"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><circle cx="80" cy="66" r="26" fill="rgba(255,255,255,0.9)"/><rect x="42" y="104" width="76" height="12" rx="6" fill="rgba(255,255,255,0.92)"/><rect x="54" y="124" width="52" height="10" rx="5" fill="rgba(255,255,255,0.78)"/></svg>'
  )}`;
  const ICONS = {
    prev: '<svg class="custom-audio-player__btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM18 6v12l-8-6z"/></svg>',
    next: '<svg class="custom-audio-player__btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM6 6v12l8-6z"/></svg>',
    play: '<svg class="custom-audio-player__btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12l10-6z"/></svg>',
    pause: '<svg class="custom-audio-player__btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h3v12H8zm5 0h3v12h-3z"/></svg>',
    collapse:
      '<svg class="custom-audio-player__btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.29 6.71 13.58 11l-4.29 4.29 1.42 1.42L16.41 11l-5.7-5.71z"/></svg>',
  };

  function icon(name) {
    return ICONS[name] || "";
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) {
      return "--:--";
    }
    const total = Math.max(0, Math.floor(value));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }

  function parseLrc(text) {
    if (!text) {
      return [];
    }
    const lines = text.split(/\r?\n/);
    const output = [];
    const timeTagPattern = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;

    for (const line of lines) {
      timeTagPattern.lastIndex = 0;
      const plainText = line.replace(timeTagPattern, "").trim();
      let match = timeTagPattern.exec(line);
      while (match) {
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fractionRaw = match[3] || "0";
        const fraction = Number(`0.${fractionRaw.padEnd(3, "0")}`);
        const time = minutes * 60 + seconds + fraction;
        output.push({
          time,
          text: plainText || " ",
        });
        match = timeTagPattern.exec(line);
      }
    }

    output.sort((a, b) => a.time - b.time);
    return output;
  }

  function extractTrackList(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && Array.isArray(payload.audio)) {
      return payload.audio;
    }
    if (payload && Array.isArray(payload.list)) {
      return payload.list;
    }
    return [];
  }

  function extractAlbumName(rawTrack, artist) {
    const rawAlbum =
      normalizeText(rawTrack.album) ||
      normalizeText(rawTrack.albumName) ||
      normalizeText(rawTrack.collection);
    if (rawAlbum) {
      return rawAlbum;
    }

    const coverUrl = normalizeText(rawTrack.cover);
    if (coverUrl) {
      try {
        const plainPath = coverUrl.split(/[?#]/)[0];
        const filename = plainPath.split("/").pop() || "";
        const decoded = decodeURIComponent(filename);
        const noExt = decoded.replace(/\.[^.]+$/, "").trim();
        if (noExt) {
          return noExt;
        }
      } catch (_) {
        // Ignore decode fallback errors, we will use default album name.
      }
    }

    return `${artist} · 单曲`;
  }

  function normalizeTrack(rawTrack, index) {
    if (!rawTrack || typeof rawTrack !== "object") {
      return null;
    }

    const url = normalizeText(rawTrack.url);
    if (!url) {
      return null;
    }

    const name = normalizeText(rawTrack.name) || `Track ${index + 1}`;
    const artist = normalizeText(rawTrack.artist) || "Unknown Artist";
    const album = extractAlbumName(rawTrack, artist);

    return {
      name,
      artist,
      album,
      url,
      cover: normalizeText(rawTrack.cover) || PLACEHOLDER_COVER,
      lrc: normalizeText(rawTrack.lrc),
    };
  }

  async function loadPlaylist(source) {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const raw = (await response.text()).replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  }

  class CustomAudioPlayer {
    constructor(root) {
      this.root = root;
      this.source = root.dataset.source || "";
      this.inlinePlaylist = root.dataset.inlinePlaylist || "";
      this.tracks = [];
      this.filteredIndices = [];
      this.currentIndex = -1;
      this.loopMode = "all";
      this.durationCache = new Map();
      this.lyrics = [];
      this.lyricCursor = -1;
      this.lyricToken = 0;
      this.isDockedOpen = false;
      this.themeObserver = null;
    }

    init() {
      this.renderShell();
      this.cacheElements();
      this.bindEvents();
      this.updateLoopButton();
      this.setDocked(false);
      this.syncThemeMode();
      this.watchThemeMode();
      this.setVolume(0.75);
      this.updateCounter();
      document.body.classList.add("has-custom-audio-player");

      if (!this.inlinePlaylist && !this.source) {
        this.showStatus("未配置歌单地址");
        this.elements.title.textContent = "歌单未配置";
        this.elements.artist.textContent = "请检查 musicplayer 配置";
        return;
      }

      this.loadTracks();
    }

    renderShell() {
      this.root.innerHTML = `
        <div class="custom-audio-player-host" data-docked="false">
          <button type="button" class="custom-audio-player__edge-handle" aria-expanded="false" title="展开播放器">
            音乐
          </button>
          <section class="custom-audio-player" data-open="false" aria-label="音乐播放器">
            <audio class="custom-audio-player__audio" preload="metadata"></audio>
            <div class="custom-audio-player__bar">
              <button type="button" class="custom-audio-player__icon-btn custom-audio-player__toggle-list" aria-expanded="false" title="显示歌单">歌单</button>
              <div class="custom-audio-player__cover-box">
                <img class="custom-audio-player__cover" src="${PLACEHOLDER_COVER}" alt="封面" loading="lazy" />
              </div>
              <div class="custom-audio-player__meta">
                <p class="custom-audio-player__title">歌单加载中...</p>
                <p class="custom-audio-player__artist">请稍候</p>
              </div>
              <div class="custom-audio-player__controls">
                <button type="button" class="custom-audio-player__icon-btn custom-audio-player__icon-btn--icon" data-action="prev" title="上一首">${icon(
                  "prev"
                )}</button>
                <button type="button" class="custom-audio-player__icon-btn custom-audio-player__icon-btn--icon custom-audio-player__play" data-action="toggle-play" title="播放">${icon(
                  "play"
                )}</button>
                <button type="button" class="custom-audio-player__icon-btn custom-audio-player__icon-btn--icon" data-action="next" title="下一首">${icon(
                  "next"
                )}</button>
                <button type="button" class="custom-audio-player__icon-btn custom-audio-player__icon-btn--icon" data-action="collapse" title="收起播放器">${icon(
                  "collapse"
                )}</button>
                <button type="button" class="custom-audio-player__icon-btn custom-audio-player__loop" data-action="loop" title="循环：全部">循环：全部</button>
              </div>
              <label class="custom-audio-player__volume" title="音量">
                <span>音量</span>
                <input class="custom-audio-player__volume-input" type="range" min="0" max="1" step="0.01" value="0.75" />
              </label>
              <div class="custom-audio-player__time">00:00 / --:--</div>
            </div>
            <button type="button" class="custom-audio-player__progress-track" aria-label="播放进度">
              <span class="custom-audio-player__progress-current"></span>
            </button>
            <div class="custom-audio-player__panel" hidden>
              <div class="custom-audio-player__panel-top">
                <input type="search" class="custom-audio-player__search" placeholder="搜索歌名 / 歌手" />
                <span class="custom-audio-player__counter">0 / 0</span>
                <button type="button" class="custom-audio-player__icon-btn custom-audio-player__locate-current">定位当前</button>
              </div>
              <div class="custom-audio-player__status" role="status" aria-live="polite"></div>
              <div class="custom-audio-player__panel-main">
                <div class="custom-audio-player__list-viewport" tabindex="0">
                  <div class="custom-audio-player__list-items"></div>
                </div>
                <aside class="custom-audio-player__lyric">
                  <h4 class="custom-audio-player__lyric-title">歌词</h4>
                  <p class="custom-audio-player__lyric-current">暂无歌词</p>
                  <p class="custom-audio-player__lyric-next"></p>
                </aside>
              </div>
            </div>
          </section>
        </div>
      `;
    }

    cacheElements() {
      const host = this.root.querySelector(".custom-audio-player-host");
      const player = this.root.querySelector(".custom-audio-player");
      this.elements = {
        host,
        player,
        edgeHandle: host.querySelector(".custom-audio-player__edge-handle"),
        audio: player.querySelector(".custom-audio-player__audio"),
        toggleList: player.querySelector(".custom-audio-player__toggle-list"),
        cover: player.querySelector(".custom-audio-player__cover"),
        title: player.querySelector(".custom-audio-player__title"),
        artist: player.querySelector(".custom-audio-player__artist"),
        controls: player.querySelector(".custom-audio-player__controls"),
        playButton: player.querySelector(".custom-audio-player__play"),
        loopButton: player.querySelector(".custom-audio-player__loop"),
        volumeInput: player.querySelector(".custom-audio-player__volume-input"),
        time: player.querySelector(".custom-audio-player__time"),
        progressTrack: player.querySelector(".custom-audio-player__progress-track"),
        progressCurrent: player.querySelector(".custom-audio-player__progress-current"),
        panel: player.querySelector(".custom-audio-player__panel"),
        search: player.querySelector(".custom-audio-player__search"),
        counter: player.querySelector(".custom-audio-player__counter"),
        status: player.querySelector(".custom-audio-player__status"),
        locateCurrent: player.querySelector(".custom-audio-player__locate-current"),
        listViewport: player.querySelector(".custom-audio-player__list-viewport"),
        listItems: player.querySelector(".custom-audio-player__list-items"),
        lyricCurrent: player.querySelector(".custom-audio-player__lyric-current"),
        lyricNext: player.querySelector(".custom-audio-player__lyric-next"),
      };
    }

    bindEvents() {
      this.elements.edgeHandle.addEventListener("click", () => {
        this.setDocked(!this.isDockedOpen);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.isDockedOpen) {
          this.setDocked(false);
        }
      });

      this.elements.toggleList.addEventListener("click", () => {
        if (this.elements.panel.hidden) {
          this.setPanelOpen(true);
          return;
        }
        this.setDocked(false);
      });

      this.elements.controls.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
          return;
        }
        const action = button.dataset.action;
        if (action === "prev") {
          this.playPrevious();
          return;
        }
        if (action === "next") {
          this.playNext(true);
          return;
        }
        if (action === "toggle-play") {
          this.togglePlay();
          return;
        }
        if (action === "collapse") {
          this.setDocked(false);
          return;
        }
        if (action === "loop") {
          this.toggleLoopMode();
        }
      });

      this.elements.volumeInput.addEventListener("input", (event) => {
        this.setVolume(event.target.value);
      });

      this.elements.progressTrack.addEventListener("click", (event) => {
        this.seekByPointer(event.clientX);
      });

      this.elements.search.addEventListener("input", (event) => {
        this.applyFilter(event.target.value);
      });

      this.elements.locateCurrent.addEventListener("click", () => {
        this.scrollToCurrent();
      });

      this.elements.listItems.addEventListener("click", (event) => {
        const button = event.target.closest(".custom-audio-player__track");
        if (!button) {
          return;
        }
        const trackIndex = Number(button.dataset.trackIndex);
        if (Number.isInteger(trackIndex)) {
          this.selectTrack(trackIndex, { autoplay: true });
        }
      });

      const audio = this.elements.audio;
      audio.addEventListener("loadedmetadata", () => {
        const currentTrack = this.tracks[this.currentIndex];
        if (currentTrack && Number.isFinite(audio.duration)) {
          this.durationCache.set(currentTrack.url, audio.duration);
        }
        this.updateTimeAndProgress();
        this.renderGroupedList();
      });
      audio.addEventListener("timeupdate", () => {
        this.updateTimeAndProgress();
        this.syncLyric();
      });
      audio.addEventListener("play", () => {
        this.updatePlayButton();
      });
      audio.addEventListener("pause", () => {
        this.updatePlayButton();
      });
      audio.addEventListener("ended", () => {
        this.handleEnded();
      });
      audio.addEventListener("error", () => {
        this.showStatus("播放失败，自动跳过");
        this.playNext(true);
      });
    }

    async loadTracks() {
      this.showStatus("正在加载歌单...");
      try {
        let payload;
        if (this.inlinePlaylist) {
          payload = JSON.parse(this.inlinePlaylist);
        } else {
          payload = await loadPlaylist(this.source);
        }
        const rawTracks = extractTrackList(payload);
        const tracks = rawTracks.map(normalizeTrack).filter(Boolean);

        if (!tracks.length) {
          throw new Error("Playlist is empty");
        }

        this.tracks = tracks;
        this.filteredIndices = tracks.map((_, index) => index);
        this.updateCounter();
        this.renderGroupedList();
        this.selectTrack(0, { autoplay: false });
        this.showStatus(`歌单加载完成，共 ${tracks.length} 首`);
      } catch (error) {
        console.error("[custom-audio-player] failed to load playlist:", error);
        this.elements.title.textContent = "歌单加载失败";
        this.elements.artist.textContent = "请检查 jsonurl 或 JSON 内容";
        this.showStatus("加载失败，无法解析歌单");
      }
    }

    setPanelOpen(open) {
      if (open) {
        this.setDocked(true);
      }
      this.elements.panel.hidden = !open;
      this.elements.player.dataset.open = open ? "true" : "false";
      this.elements.toggleList.setAttribute("aria-expanded", open ? "true" : "false");
      this.elements.toggleList.textContent = open ? "收起" : "歌单";
      if (open) {
        this.renderGroupedList();
      }
    }

    setDocked(open) {
      this.isDockedOpen = Boolean(open);
      this.elements.host.dataset.docked = this.isDockedOpen ? "true" : "false";
      this.elements.edgeHandle.setAttribute(
        "aria-expanded",
        this.isDockedOpen ? "true" : "false"
      );
      this.elements.edgeHandle.textContent = this.isDockedOpen ? "收起" : "音乐";
      this.elements.edgeHandle.title = this.isDockedOpen ? "收起播放器" : "展开播放器";

      if (!this.isDockedOpen && !this.elements.panel.hidden) {
        this.setPanelOpen(false);
      }
    }

    syncThemeMode() {
      const mode = document.documentElement.getAttribute("data-color-mode");
      this.elements.host.dataset.theme = mode === "dark" ? "dark" : "light";
    }

    watchThemeMode() {
      if (typeof MutationObserver !== "function") {
        return;
      }
      this.themeObserver = new MutationObserver(() => {
        this.syncThemeMode();
      });
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-color-mode"],
      });
    }

    applyFilter(keyword) {
      const normalized = normalizeText(keyword).toLowerCase();
      if (!normalized) {
        this.filteredIndices = this.tracks.map((_, index) => index);
      } else {
        this.filteredIndices = this.tracks.reduce((accumulator, track, index) => {
          const haystack = `${track.name} ${track.artist} ${track.album}`.toLowerCase();
          if (haystack.includes(normalized)) {
            accumulator.push(index);
          }
          return accumulator;
        }, []);
      }
      this.elements.listViewport.scrollTop = 0;
      this.updateCounter();
      this.renderGroupedList();
    }

    updateCounter() {
      this.elements.counter.textContent = `${this.filteredIndices.length} / ${this.tracks.length}`;
    }

    buildAlbumGroups() {
      const grouped = new Map();
      this.filteredIndices.forEach((trackIndex, order) => {
        const track = this.tracks[trackIndex];
        const album = track.album || "未分类专辑";
        if (!grouped.has(album)) {
          grouped.set(album, []);
        }
        grouped.get(album).push({ trackIndex, order });
      });
      return Array.from(grouped.entries()).map(([album, items]) => ({ album, items }));
    }

    renderGroupedList() {
      if (!this.tracks.length) {
        return;
      }
      const items = this.elements.listItems;
      if (this.filteredIndices.length === 0) {
        items.innerHTML = '<div class="custom-audio-player__empty">没有匹配歌曲</div>';
        return;
      }

      const groups = this.buildAlbumGroups();
      const blocks = groups.map((group) => {
        const rows = group.items
          .map(({ trackIndex, order }) => {
            const track = this.tracks[trackIndex];
            const isActive = trackIndex === this.currentIndex;
            const cachedDuration = this.durationCache.get(track.url);
            const indexText = String(order + 1).padStart(2, "0");
            return `
              <button type="button" class="custom-audio-player__track${isActive ? " is-active" : ""}" data-track-index="${trackIndex}">
                <span class="custom-audio-player__track-index">${indexText}</span>
                <span class="custom-audio-player__track-info">
                  <span class="custom-audio-player__track-name">${escapeHTML(track.name)}</span>
                  <span class="custom-audio-player__track-artist">${escapeHTML(track.artist)}</span>
                </span>
                <span class="custom-audio-player__track-duration">${formatTime(cachedDuration)}</span>
              </button>
            `;
          })
          .join("");

        return `
          <section class="custom-audio-player__album-block">
            <header class="custom-audio-player__album-header">
              <span class="custom-audio-player__album-title">${escapeHTML(group.album)}</span>
              <span class="custom-audio-player__album-count">${group.items.length} 首</span>
            </header>
            ${rows}
          </section>
        `;
      });

      items.innerHTML = blocks.join("");
    }

    selectTrack(index, options = {}) {
      if (!Number.isInteger(index) || index < 0 || index >= this.tracks.length) {
        return;
      }

      const autoplay = Boolean(options.autoplay);
      this.currentIndex = index;

      const track = this.tracks[index];
      const audio = this.elements.audio;
      this.elements.cover.src = track.cover || PLACEHOLDER_COVER;
      this.elements.title.textContent = track.name;
      this.elements.artist.textContent = track.artist;
      this.elements.cover.alt = `${track.name} 封面`;

      audio.src = track.url;
      audio.load();
      this.updateTimeAndProgress();
      this.renderGroupedList();
      this.loadLyric(track);

      if (autoplay) {
        audio.play().catch((error) => {
          console.error("[custom-audio-player] autoplay failed:", error);
          this.showStatus("浏览器阻止自动播放，请手动点击播放");
          this.updatePlayButton();
        });
      } else {
        this.updatePlayButton();
      }

      this.showStatus(`正在准备: ${track.name}`);
    }

    togglePlay() {
      if (this.currentIndex === -1 || !this.tracks.length) {
        return;
      }
      if (this.elements.audio.paused) {
        this.elements.audio.play().catch((error) => {
          console.error("[custom-audio-player] play failed:", error);
          this.showStatus("播放失败，请稍后重试");
        });
      } else {
        this.elements.audio.pause();
      }
    }

    playNext(forceCycle) {
      if (!this.tracks.length) {
        return;
      }

      if (this.currentIndex < this.tracks.length - 1) {
        this.selectTrack(this.currentIndex + 1, { autoplay: true });
        return;
      }

      if (this.loopMode === "all" || forceCycle) {
        this.selectTrack(0, { autoplay: true });
        return;
      }

      this.elements.audio.pause();
      this.updatePlayButton();
    }

    playPrevious() {
      if (!this.tracks.length) {
        return;
      }
      const target = this.currentIndex > 0 ? this.currentIndex - 1 : this.tracks.length - 1;
      this.selectTrack(target, { autoplay: true });
    }

    handleEnded() {
      if (this.loopMode === "one") {
        this.elements.audio.currentTime = 0;
        this.elements.audio.play().catch((error) => {
          console.error("[custom-audio-player] replay failed:", error);
        });
        return;
      }
      this.playNext(false);
    }

    toggleLoopMode() {
      const current = LOOP_STATES.indexOf(this.loopMode);
      const next = (current + 1) % LOOP_STATES.length;
      this.loopMode = LOOP_STATES[next];
      this.updateLoopButton();
      this.showStatus(LOOP_LABELS[this.loopMode]);
    }

    updateLoopButton() {
      const label = LOOP_LABELS[this.loopMode];
      this.elements.loopButton.textContent = label;
      this.elements.loopButton.title = label;
    }

    updatePlayButton() {
      if (this.elements.audio.paused) {
        this.elements.playButton.innerHTML = icon("play");
        this.elements.playButton.title = "播放";
      } else {
        this.elements.playButton.innerHTML = icon("pause");
        this.elements.playButton.title = "暂停";
      }
    }

    updateTimeAndProgress() {
      const audio = this.elements.audio;
      const progress =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? clamp((audio.currentTime / audio.duration) * 100, 0, 100)
          : 0;

      this.elements.progressCurrent.style.width = `${progress}%`;
      this.elements.time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    }

    seekByPointer(clientX) {
      const audio = this.elements.audio;
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        return;
      }
      const rect = this.elements.progressTrack.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      audio.currentTime = ratio * audio.duration;
      this.updateTimeAndProgress();
      this.syncLyric();
    }

    setVolume(value) {
      const volume = clamp(Number(value), 0, 1);
      this.elements.audio.volume = volume;
      this.elements.volumeInput.value = String(volume);
    }

    scrollToCurrent() {
      if (this.currentIndex < 0) {
        return;
      }

      let visibleIndex = this.filteredIndices.indexOf(this.currentIndex);
      if (visibleIndex === -1) {
        this.elements.search.value = "";
        this.applyFilter("");
      }
      visibleIndex = this.filteredIndices.indexOf(this.currentIndex);
      if (visibleIndex === -1) {
        return;
      }

      this.renderGroupedList();
      const currentTrackElement = this.elements.listItems.querySelector(
        `.custom-audio-player__track[data-track-index="${this.currentIndex}"]`
      );
      if (currentTrackElement) {
        currentTrackElement.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    async loadLyric(track) {
      this.lyrics = [];
      this.lyricCursor = -1;
      this.elements.lyricCurrent.textContent = track.lrc ? "正在加载歌词..." : "暂无歌词";
      this.elements.lyricNext.textContent = "";

      if (!track.lrc) {
        return;
      }

      const token = Date.now();
      this.lyricToken = token;

      try {
        const response = await fetch(track.lrc, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const raw = await response.text();
        if (this.lyricToken !== token) {
          return;
        }
        const parsed = parseLrc(raw);
        if (!parsed.length) {
          this.elements.lyricCurrent.textContent = "歌词格式不受支持";
          this.elements.lyricNext.textContent = "";
          return;
        }
        this.lyrics = parsed;
        this.syncLyric();
      } catch (error) {
        if (this.lyricToken !== token) {
          return;
        }
        console.error("[custom-audio-player] failed to load lyric:", error);
        this.elements.lyricCurrent.textContent = "歌词加载失败";
        this.elements.lyricNext.textContent = "";
      }
    }

    syncLyric() {
      if (!this.lyrics.length) {
        return;
      }

      const currentTime = this.elements.audio.currentTime;
      let left = 0;
      let right = this.lyrics.length - 1;
      let match = -1;

      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        if (this.lyrics[middle].time <= currentTime) {
          match = middle;
          left = middle + 1;
        } else {
          right = middle - 1;
        }
      }

      if (match === this.lyricCursor) {
        return;
      }
      this.lyricCursor = match;

      if (match === -1) {
        this.elements.lyricCurrent.textContent = this.lyrics[0].text || " ";
        this.elements.lyricNext.textContent = this.lyrics[1] ? this.lyrics[1].text : "";
        return;
      }

      const current = this.lyrics[match];
      const next = this.lyrics[match + 1];
      this.elements.lyricCurrent.textContent = current ? current.text : "";
      this.elements.lyricNext.textContent = next ? next.text : "";
    }

    showStatus(message) {
      this.elements.status.textContent = message || "";
    }
  }

  function bootstrap() {
    const roots = document.querySelectorAll(ROOT_SELECTOR);
    if (!roots.length) {
      return;
    }
    roots.forEach((root) => {
      if (root.dataset.initialized === "true") {
        return;
      }
      root.dataset.initialized = "true";
      const player = new CustomAudioPlayer(root);
      player.init();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
