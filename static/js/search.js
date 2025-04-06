document.addEventListener("DOMContentLoaded", function () {
  // References to header search elements
  const searchInput = document.getElementById("search-input"); // Input field in the header
  const searchResultsContainer = document.getElementById(
    "header-search-results"
  ); // The whole results box
  const searchResultsList = document.getElementById(
    "header-search-results-list"
  ); // The list within the results box
  const searchForm = document.getElementById("header-search-form"); // The search form itself
  const searchTypeSelect = document.getElementById("search-type-select"); // The dropdown (local/google)
  const googleSiteInput = document.getElementById("google-site-input"); // Hidden input for google search

  let fuse; // Fuse.js instance

  // --- Initialize Fuse.js ---
  fetch("/index.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok for index.json");
      }
      return response.json();
    })
    .then((data) => {
      fuse = new Fuse(data, {
        keys: ["title", "content"],
        includeMatches: true,
        minMatchCharLength: 2,
        threshold: 0.3, // Adjust sensitivity as needed
        ignoreLocation: true, // Search entire strings
      });
      console.log("Fuse.js initialized successfully.");
    })
    .catch((error) => {
      console.error("Error loading or initializing search index:", error);
      // Optionally disable local search UI elements if index fails to load
      if (searchTypeSelect) {
        const localOption = searchTypeSelect.querySelector(
          'option[value="local"]'
        );
        if (localOption) {
          localOption.disabled = true;
          localOption.textContent = "Local (Error)";
        }
        // Switch to Google if local fails? Or just show error.
        // searchTypeSelect.value = "google";
      }
    });

  // --- Function to perform local search ---
  window.performLocalSearch = function (query) {
    if (!fuse) {
      console.error("Fuse.js is not initialized.");
      searchResultsList.innerHTML =
        '<div class="Box-row">Search index not loaded.</div>';
      searchResultsContainer.classList.remove("d-none"); // Show container
      return;
    }

    if (query.trim() === "") {
      searchResultsList.innerHTML =
        '<div class="Box-row">Please enter a search term.</div>';
      searchResultsContainer.classList.remove("d-none"); // Show container
      return;
    }

    const results = fuse.search(query);
    renderResults(results);
    searchResultsContainer.classList.remove("d-none"); // Show container
  };

  // --- Function to render search results ---
  function renderResults(results) {
    searchResultsList.innerHTML = ""; // Clear previous results

    if (results.length === 0) {
      searchResultsList.innerHTML =
        '<div class="Box-row">No results found.</div>';
      return;
    }

    const fragment = document.createDocumentFragment(); // Use document fragment for performance

    results.slice(0, 20).forEach((result) => {
      // Limit to e.g., 20 results for header display
      const { item, matches } = result;
      // Get a concise snippet with highlighted matches
      const snippet = getSnippet(item.content, matches);

      const resultElement = document.createElement("div");
      resultElement.className = "Box-row Box-row--hover-blue"; // Use Box styles for consistency
      resultElement.innerHTML = `
        <h5 class="mb-1"><a href="${item.permalink}">${item.title}</a></h5>
        ${
          snippet
            ? `<p class="text-small color-fg-muted mb-0">${snippet}</p>`
            : ""
        }
      `;
      fragment.appendChild(resultElement);
    });

    searchResultsList.appendChild(fragment);
  }

  // --- Function to get a highlighted snippet ---
  function getSnippet(content, matches) {
    const snippetLength = 120; // Max length of the snippet
    let bestSnippet = content.substring(0, snippetLength); // Default snippet
    let bestScore = -1;

    if (matches && matches.length > 0) {
      matches.forEach((match) => {
        if (
          match.key === "content" &&
          match.indices &&
          match.indices.length > 0
        ) {
          match.indices.forEach(([start, end]) => {
            const matchLength = end - start + 1;
            const contextStart = Math.max(
              0,
              start - Math.floor((snippetLength - matchLength) / 2)
            );
            const contextEnd = Math.min(
              content.length,
              contextStart + snippetLength
            );
            let snippet = content.substring(contextStart, contextEnd);

            // Add ellipses
            if (contextStart > 0) snippet = "..." + snippet;
            if (contextEnd < content.length) snippet = snippet + "...";

            // Highlight the specific match within the snippet
            const highlightStart =
              start - contextStart + (contextStart > 0 ? 3 : 0); // Adjust for ellipsis
            const highlightEnd = highlightStart + matchLength;
            snippet =
              snippet.substring(0, highlightStart) +
              `<span class="highlight">${snippet.substring(
                highlightStart,
                highlightEnd
              )}</span>` +
              snippet.substring(highlightEnd);

            // Simple scoring: prioritize snippets containing matches
            const score = match.score !== undefined ? 1 - match.score : 1; // Fuse score (lower is better)
            if (score > bestScore) {
              bestScore = score;
              bestSnippet = snippet;
            }
          });
        } else if (match.key === "title" && bestScore < 0) {
          // If only title matches, use beginning of content as snippet
          bestSnippet =
            content.substring(0, snippetLength) +
            (content.length > snippetLength ? "..." : "");
        }
      });
    } else {
      bestSnippet =
        content.substring(0, snippetLength) +
        (content.length > snippetLength ? "..." : "");
    }

    return bestSnippet;
  }

  // --- Event Listener for Form Submission ---
  if (searchForm) {
    searchForm.addEventListener("submit", function (event) {
      const selectedType = searchTypeSelect.value;
      const query = searchInput.value.trim();
      // const selectedType = searchTypeSelect.value; // Removed duplicate declaration

      event.preventDefault(); // Prevent default submission for all types initially

      if (selectedType === "local") {
        performLocalSearch(query);
        searchInput.blur(); // Remove focus after local search
        return false; // Explicitly prevent default form submission for local search
      } else {
        // Handle external searches (Google, Bing, DuckDuckGo)
        if (query) {
          let searchUrl;
          const siteRestriction = googleSiteInput.value; // e.g., "site:yourdomain.com"
          const combinedQuery = `${query} ${siteRestriction}`;
          if (selectedType === "google") {
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
              combinedQuery
            )}`;
          } else if (selectedType === "bing") {
            searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(
              query
            )}`;
          } else if (selectedType === "duckduckgo") {
            searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
              query
            )}`;
          }

          if (searchUrl) {
            window.open(searchUrl, "_blank"); // Open search in a new tab
            // Hide results container if it was somehow visible
            searchResultsContainer.classList.add("d-none");
          }
        } else {
          // Optional: Handle empty query for external searches if needed
          console.log(`External search query (${selectedType}) is empty.`);
        }
      }
    });
  }

  // --- Event Listener for Search Type Change ---
  if (searchTypeSelect) {
    searchTypeSelect.addEventListener("change", function () {
      const selectedType = this.value;
      // Hide local results if an external search engine is selected
      if (
        selectedType === "google" ||
        selectedType === "bing" ||
        selectedType === "duckduckgo"
      ) {
        searchResultsContainer.classList.add("d-none");
        // Ensure the correct input name is set (though default submit is prevented)
        searchInput.name = "q";
        // Keep the hidden input disabled, its value is read directly
        googleSiteInput.disabled = true;
      } else {
        // Local search selected
        searchInput.name = "q"; // Keep name as 'q' for consistency or local handling
        googleSiteInput.disabled = true;
      }
    });
    // Initial setup based on default selection - ensure hidden input is disabled
    googleSiteInput.disabled = true;
  }

  // --- Event Listener to Hide Results on Outside Click ---
  document.addEventListener("click", function (event) {
    const isClickInsideSearch =
      searchResultsContainer.contains(event.target) ||
      searchInput.contains(event.target) ||
      searchTypeSelect.contains(event.target);

    if (
      !isClickInsideSearch &&
      !searchResultsContainer.classList.contains("d-none")
    ) {
      searchResultsContainer.classList.add("d-none");
    }
  });

  // Optional: Hide results when input loses focus (if not clicking dropdown/results)
  if (searchInput) {
    searchInput.addEventListener("blur", function (event) {
      // Delay check slightly to allow click on results/dropdown
      setTimeout(() => {
        const relatedTarget = event.relatedTarget;
        if (
          !searchResultsContainer.contains(relatedTarget) &&
          !searchTypeSelect.contains(relatedTarget)
        ) {
          searchResultsContainer.classList.add("d-none");
        }
      }, 100);
    });
  }

  // Optional: Perform local search on input typing (debounced)
  let debounceTimer;
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      if (searchTypeSelect.value === "local") {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          performLocalSearch(searchInput.value);
        }, 300); // Adjust debounce time (ms) as needed
      }
    });
  }
});
