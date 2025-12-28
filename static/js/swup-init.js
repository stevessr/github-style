// Initialize Swup
const swup = new Swup({
  containers: ["#main-content"],
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
  if (typeof initTheme === 'function') initTheme();

  // Re-run search script if present
  if (document.querySelector('#search-query')) {
    // You might need to re-bind search events here
  }

  // Re-render MathJax/KaTeX
  if (window.renderMathInElement) {
    renderMathInElement(document.body);
  }

  if (window.MathJax) {
      MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
  }

  // Re-initialize obsidian callouts
  if (typeof initObsidianCallouts === 'function') {
      initObsidianCallouts();
  }

  // Re-initialize comments (Gitalk, Giscus, etc.)
  // This is tricky as they often insert iframes or scripts.
  // You might need to manually remove and re-add them.
});
