(() => {
  const ROOT_SELECTOR = '[data-custom-audio-player-root="true"]';

  function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
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

  function normalizeTrack(rawTrack, index) {
    if (!rawTrack || typeof rawTrack !== "object") {
      return null;
    }

    const url = normalizeText(rawTrack.url);
    if (!url) {
      return null;
    }

    const track = {
      name: normalizeText(rawTrack.name) || `Track ${index + 1}`,
      artist: normalizeText(rawTrack.artist) || "Unknown Artist",
      url,
    };

    const optionalFields = ["cover", "lrc", "theme", "type"];
    optionalFields.forEach((field) => {
      const value = normalizeText(rawTrack[field]);
      if (value) {
        track[field] = value;
      }
    });

    return track;
  }

  async function loadPlaylistFromUrl(source) {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`歌单加载失败：HTTP ${response.status}`);
    }

    const text = (await response.text()).replace(/^\uFEFF/, "");
    return extractTrackList(JSON.parse(text));
  }

  function loadInlinePlaylist(rawValue) {
    const value = normalizeText(rawValue);
    if (!value) {
      return [];
    }

    return extractTrackList(JSON.parse(value));
  }

  async function resolveTracks(root) {
    if (normalizeText(root.dataset.inlinePlaylist)) {
      return loadInlinePlaylist(root.dataset.inlinePlaylist);
    }

    if (normalizeText(root.dataset.source)) {
      return loadPlaylistFromUrl(root.dataset.source);
    }

    throw new Error("未配置歌单地址");
  }

  function renderError(root, message) {
    root.innerHTML = `<div class="aplayer-bootstrap-error" role="status">${escapeHTML(
      message || "播放器初始化失败"
    )}</div>`;
    root.dataset.initialized = "error";
  }

  function getAccentColor(root) {
    const styles = getComputedStyle(root);
    return normalizeText(styles.getPropertyValue("--player-accent")) || "#0969da";
  }

  async function initRoot(root) {
    if (!root || root.dataset.initialized === "true" || root.dataset.initialized === "loading") {
      return;
    }

    if (typeof window.APlayer !== "function") {
      renderError(root, "APlayer 资源加载失败");
      return;
    }

    root.dataset.initialized = "loading";

    try {
      const tracks = (await resolveTracks(root)).map(normalizeTrack).filter(Boolean);

      if (!tracks.length) {
        throw new Error("歌单为空，或没有可播放的音频地址");
      }

      root.innerHTML = "";
      root._aplayer = new window.APlayer({
        container: root,
        fixed: true,
        autoplay: false,
        mutex: true,
        loop: "all",
        order: "list",
        preload: "metadata",
        volume: 0.7,
        listFolded: true,
        listMaxHeight: "320px",
        theme: getAccentColor(root),
        audio: tracks,
      });

      root.dataset.initialized = "true";
      document.body.classList.add("has-aplayer-fixed");
    } catch (error) {
      console.error("[aplayer-bootstrap] failed to initialize player:", error);
      renderError(root, error instanceof Error ? error.message : "播放器初始化失败");
    }
  }

  function bootstrap() {
    const roots = document.querySelectorAll(ROOT_SELECTOR);
    if (!roots.length) {
      return;
    }

    roots.forEach((root) => {
      void initRoot(root);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }

  document.addEventListener("swup:page:view", bootstrap);
})();
