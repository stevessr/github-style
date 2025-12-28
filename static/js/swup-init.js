// Initialize Swup
const swup = new Swup({
  containers: ["#main-content"],
  cache: true,
  plugins: [new SwupHeadPlugin()],
  linkSelector: 'a[href^="' + window.location.origin + '"]:not([data-no-swup]), a[href^="/"]:not([data-no-swup]), a[href^="#"]:not([data-no-swup])',
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
