// Initialize Swup
const swup = new Swup({
  containers: ["#main-content"],
  animationSelector: '[class*="transition-"]',
  cache: false, // Disable cache for debugging
  plugins: [new SwupHeadPlugin()],
  linkSelector: 'a[href^="' + window.location.origin + '"]:not([data-no-swup]), a[href^="/"]:not([data-no-swup]), a[href^="#"]:not([data-no-swup])',
  ignoreVisit: (url, { el } = {}) => {
      // Ignore if specifically marked
      if (el && el.matches('[data-no-swup]')) return true;
      return false;
  }
});

// Enable debug logging
swup.hooks.before('link:click', (visit) => {
    console.log('Swup: Link clicked', visit.trigger.el.href);
});
swup.hooks.on('visit:start', (visit) => {
    console.log('Swup: Visit started', visit.to.url);
});
swup.hooks.on('visit:end', () => {
    console.log('Swup: Visit ended');
});

// Log fetched page content to debug container mismatch
swup.hooks.before('content:replace', (visit, args) => {
    console.log('Swup: About to replace content');
    const incomingDoc = visit.to.document;
    const incomingContainer = incomingDoc.querySelector('#main-content');
    console.log('Swup: Incoming document:', incomingDoc);
    console.log('Swup: Incoming container found:', incomingContainer);
    if (!incomingContainer) {
        console.error('Swup: #main-content MISSING in incoming HTML. Full HTML:', incomingDoc.documentElement.innerHTML);
    }
});

// Re-initialize scripts after content replacement
swup.hooks.on('content:replace', () => {
  console.log('Swup content replaced');

  // Re-run global scripts if needed
  try {
    if (typeof initTheme === 'function') initTheme();
  } catch (e) { console.error('Error re-initializing theme:', e); }

  // Re-render MathJax/KaTeX
  try {
    if (window.renderMathInElement) {
      renderMathInElement(document.body);
    }
  } catch (e) { console.error('Error re-rendering KaTeX:', e); }

  try {
    if (window.MathJax && window.MathJax.Hub && typeof window.MathJax.Hub.Queue === 'function') {
        window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
    }
  } catch (e) { console.error('Error re-rendering MathJax:', e); }

  // Re-initialize obsidian callouts
  try {
    if (typeof initObsidianCallouts === 'function') {
        initObsidianCallouts();
  }
  } catch (e) { console.error('Error re-initializing Obsidian callouts:', e); }

  // Re-initialize Waline for SPA transitions
  try {
    if (typeof initWaline === 'function') {
      initWaline();
    }
  } catch (e) { console.error('Error re-initializing Waline:', e); }
});
