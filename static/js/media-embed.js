(() => {
  const LINK_SELECTOR = "article.markdown-body p > a.js-auto-embed-link:only-child";

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseEmbedMeta(urlText) {
    const source = normalizeText(urlText);
    if (!source) {
      return null;
    }

    const youtubeMatch = source.match(
      /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^#\s]*v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{6,}).*$/i
    );
    if (youtubeMatch) {
      return {
        provider: "youtube",
        embedSrc: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
      };
    }

    const pageMatch = source.match(/[?&]p=(\d+)/i);
    const page = pageMatch ? pageMatch[1] : "1";
    const bvidMatch = source.match(/(BV[0-9A-Za-z]{10})/i);
    if (bvidMatch) {
      return {
        provider: "bilibili",
        embedSrc: `https://player.bilibili.com/player.html?bvid=${bvidMatch[1]}&page=${page}&high_quality=1`,
      };
    }

    const avidMatch = source.match(/(?:av|aid=)(\d+)/i);
    if (avidMatch) {
      return {
        provider: "bilibili",
        embedSrc: `https://player.bilibili.com/player.html?aid=${avidMatch[1]}&page=${page}&high_quality=1`,
      };
    }

    const spotifyMatch = source.match(
      /^https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+).*$/i
    );
    if (spotifyMatch) {
      const type = spotifyMatch[1].toLowerCase();
      let embedHeight = 352;
      if (type === "track") {
        embedHeight = 152;
      } else if (type === "episode") {
        embedHeight = 232;
      }
      return {
        provider: "spotify",
        embedSrc: `https://open.spotify.com/embed/${type}/${spotifyMatch[2]}?utm_source=generator`,
        embedHeight,
      };
    }

    return null;
  }

  function resolveSummaryText(fullText, urlText) {
    const normalized = normalizeText(fullText);
    const url = normalizeText(urlText);
    if (!normalized || !url) {
      return null;
    }
    if (normalized === url) {
      return "";
    }
    if (normalized.startsWith(url)) {
      return normalizeText(normalized.slice(url.length));
    }
    if (normalized.endsWith(url)) {
      return normalizeText(normalized.slice(0, normalized.length - url.length));
    }
    return null;
  }

  function resolveParagraphSummary(link) {
    const paragraph = link.parentElement;
    if (!paragraph || paragraph.tagName !== "P") {
      return null;
    }
    if (paragraph.childElementCount !== 1 || paragraph.firstElementChild !== link) {
      return null;
    }

    return resolveSummaryText(paragraph.textContent, link.textContent);
  }

  function extractSingleVideoURL(text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return "";
    }
    const matches = normalized.match(/https?:\/\/[^\s<>"'））\])]+/gi) || [];
    if (matches.length !== 1) {
      return "";
    }
    return matches[0].replace(/[),.;!?，。！？；：]+$/u, "");
  }

  function buildIframe(provider, src) {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.title = `${provider} embed player`;

    if (provider === "youtube") {
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.setAttribute("allowfullscreen", "");
      return iframe;
    }

    if (provider === "bilibili") {
      iframe.allow = "autoplay; fullscreen; picture-in-picture";
      iframe.setAttribute("allowfullscreen", "");
      return iframe;
    }

    iframe.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    return iframe;
  }

  function buildEmbed(link, summaryText) {
    const provider = (link.dataset.embedProvider || "").toLowerCase();
    const src = link.dataset.embedSrc || "";
    if (!provider || !src) {
      return null;
    }

    let url;
    try {
      url = new URL(src, window.location.origin);
    } catch (_) {
      return null;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    const figure = document.createElement("figure");
    figure.className = `auto-embed auto-embed--${provider}`;

    const frame = document.createElement("div");
    frame.className = "auto-embed__frame";
    if (provider === "spotify") {
      const rawHeight = Number(link.dataset.embedHeight);
      const height = Number.isFinite(rawHeight) ? Math.max(152, rawHeight) : 352;
      frame.style.setProperty("--embed-height", `${height}px`);
    }

    frame.appendChild(buildIframe(provider, url.toString()));
    figure.appendChild(frame);

    const caption = document.createElement("figcaption");
    caption.className = "auto-embed__caption";
    if (summaryText) {
      const summary = document.createElement("p");
      summary.className = "auto-embed__summary";
      summary.textContent = summaryText;
      caption.appendChild(summary);
    }
    const source = document.createElement("a");
    source.href = link.href;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = normalizeText(link.textContent) || link.href;
    caption.append("来源：", source);
    figure.appendChild(caption);

    return figure;
  }

  function enhanceEmbeds(scope = document) {
    const links = scope.querySelectorAll(LINK_SELECTOR);
    links.forEach((link) => {
      const summaryText = resolveParagraphSummary(link);
      if (summaryText === null) {
        return;
      }
      const embed = buildEmbed(link, summaryText);
      if (!embed) {
        return;
      }
      link.parentElement.replaceWith(embed);
    });

    const paragraphs = scope.querySelectorAll("article.markdown-body p");
    paragraphs.forEach((paragraph) => {
      if (paragraph.childElementCount !== 0) {
        return;
      }
      const url = extractSingleVideoURL(paragraph.textContent);
      if (!url) {
        return;
      }
      const meta = parseEmbedMeta(url);
      if (!meta) {
        return;
      }
      const summaryText = resolveSummaryText(paragraph.textContent, url);
      if (summaryText === null) {
        return;
      }

      const pseudoLink = {
        dataset: {
          embedProvider: meta.provider,
          embedSrc: meta.embedSrc,
          embedHeight: meta.embedHeight || "",
        },
        href: url,
        textContent: url,
      };

      const embed = buildEmbed(pseudoLink, summaryText);
      if (!embed) {
        return;
      }
      paragraph.replaceWith(embed);
    });
  }

  function bootstrap() {
    enhanceEmbeds(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }

  document.addEventListener("swup:page:view", () => {
    enhanceEmbeds(document);
  });
})();
