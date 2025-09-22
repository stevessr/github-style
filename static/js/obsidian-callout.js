/*
 * Obsidian-style Callout Renderer (Optimized & Robust)
 *
 * - Efficiently transforms markdown-style callouts into styled HTML blocks.
 * - Minimizes DOM manipulation using DocumentFragments to prevent rendering issues.
 * - Consolidates preprocessing and enhancement into a single, atomic operation per callout.
 * - Improves parsing logic for better reliability with various markdown outputs.
 * - Uses WeakSet tracking to ensure elements are processed only once.
 */
(function() {
  "use strict";

  // --- Configuration & State ---

  // Set to true to see detailed logs in the console
  const DEBUG_MODE = false;

  // WeakSets to track processed elements and prevent duplicate processing
  const processedElements = new WeakSet();

  // i18n translations for callout titles
  const i18n = safeJSONParse("obsidian-callout-i18n", {
    note: "Note",
    info: "Info",
    todo: "To-do",
    tip: "Tip",
    success: "Success",
    question: "Question",
    warning: "Warning",
    failure: "Failure",
    danger: "Danger",
    bug: "Bug",
    example: "Example",
    quote: "Quote",
    abstract: "Abstract",
    summary: "Summary",
    tldr: "TLDR",
    hint: "Hint",
    check: "Check",
    done: "Done",
    faq: "FAQ",
    caution: "Caution",
    attention: "Attention",
    fail: "Fail",
    missing: "Missing",
    error: "Error",
    cite: "Cite",
  });

  // Map callout types and aliases to SVG icon IDs from the sprite
  const ICON_MAP = {
    // Primary callout types mapped to specific SVG IDs
    info: "circle-info",
    tip: "lightbulb",
    faq: "far-circle-question",
    question: "far-circle-question",
    note: "pencil", // No direct 'note' icon, 'pencil' is a good substitute
    abstract: "book", // Using 'book' for abstract/summarization
    todo: "list-check", // Specific icon for todo lists
    success: "circle-check", // Using 'circle-check' for success
    warning: "triangle-exclamation",
    failure: "circle-xmark",
    danger: "bolt",
    bug: "bug",
    example: "book-open-reader", // Direct match in SVG sprite
    quote: "quote-left", // Direct match in SVG sprite

    // Aliases mapped directly to the chosen SVG IDs
    summary: "book",          // Alias for abstract
    tldr: "book",             // Alias for abstract
    hint: "lightbulb",        // Alias for tip
    check: "circle-check",    // Alias for success
    done: "circle-check",     // Alias for success
    help: "help-circle",      // Alias for faq
    caution: "triangle-exclamation", // Alias for warning
    attention: "triangle-exclamation", // Alias for warning
    fail: "circle-xmark",     // Alias for failure
    missing: "circle-xmark",  // Alias for failure
    error: "bolt",             // Alias for danger
    cite: "quote-left",       // Alias for quote
  };

  // --- Main Initialization ---

  // Run the script after the DOM is fully loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // --- Core Functions ---

  /**
   * Initializes the callout rendering process.
   */
  function init() {
    log("Initializing callout rendering.");
    try {
      // Find and transform all potential callouts in the document
      transformAllCallouts();
      log("Callout rendering complete.");
    } catch (error) {
      console.warn("obsidian-callout: A critical error occurred during initialization.", error);
    }
  }

  /**
   * Finds and transforms all callout-like structures in the DOM.
   * Starts from blockquotes, which is the standard markdown representation.
   */
  function transformAllCallouts() {
    // Query all blockquotes, the primary container for callouts
    const potentialCallouts = document.querySelectorAll("blockquote");
    let transformedCount = 0;

    // Iterate backwards to safely process nodes without disrupting the NodeList
    for (let i = potentialCallouts.length - 1; i >= 0; i--) {
      const el = potentialCallouts[i];

      // Skip if already processed or part of an existing callout (already nested)
      if (processedElements.has(el) || el.closest(".callout") && el.tagName === 'BLOCKQUOTE' && el.classList.contains('callout')) {
        continue;
      }

      try {
        const isTransformed = createCalloutFromElement(el); // Now returns boolean
        if (isTransformed) {
          transformedCount++;
          // No replacement needed as `el` is modified in place.
        }
      } catch (error) {
        console.warn("obsidian-callout: Failed to process an element.", {
          element: el,
          error: error
        });
      }
    }
    log(`Found ${potentialCallouts.length} potential callouts, transformed ${transformedCount}.`);
  }

  /**
   * Attempts to parse a DOM element (e.g., a blockquote) and transform it into a callout.
   * Modifies the element in-place.
   * @param {HTMLElement} el The element to process (expected to be a blockquote).
   * @returns {boolean} True if transformed successfully, otherwise false.
   */
  function createCalloutFromElement(el) {
    const markerRegex = /^\s*\[!(\w+)\]([+-])?\s*(.*)/;

    // We assume the callout marker and title are on the first line of the first <p> element
    // directly within the blockquote.
    const firstParagraph = el.querySelector('p');
    if (!firstParagraph) {
        return false; // Not a callout if no <p> is found.
    }

    const firstLineText = firstParagraph.textContent.split('\n')[0];
    const match = firstLineText.match(markerRegex);

    if (!match) {
      return false;
    }

    // Mark the original element as processed to avoid re-running
    processedElements.add(el);

    // --- Extract Data ---
    const [fullMatchText, type, collapsibleState, rawCustomTitleText] = match;
    const calloutType = type.toLowerCase();
    const isCollapsible = collapsibleState === "+" || collapsibleState === "-";
    const isCollapsed = collapsibleState === "-";

    log("Found callout:", { type: calloutType, title: rawCustomTitleText, collapsible: isCollapsible });

    // --- Modify the existing blockquote (`el`) in-place ---
    const callout = el; // Use the existing blockquote element
    callout.classList.add("callout");
    callout.dataset.calloutType = calloutType;

    if (isCollapsible) {
      callout.classList.add("is-collapsible");
      if (isCollapsed) {
        callout.classList.add("is-collapsed");
      }
    }

    // Determine the actual title HTML.
    const defaultTitleText = i18n[calloutType] || calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
    let actualTitleHtml = defaultTitleText;

    if (rawCustomTitleText) {
        // Construct a regex to remove the marker part from the HTML
        // Example: "[!caution]+ <a href="...">官方网站</a>" -> "<a href="...">官方网站</a>"
        const markerPartRegex = new RegExp(`^\\s*\\[!${type}\\]([+-])?\\s*`);
        const firstLineHtml = firstParagraph.innerHTML.split('\n')[0];
        
        const extractedHtml = firstLineHtml.replace(markerPartRegex, '').trim();
        
        if (extractedHtml) {
            actualTitleHtml = extractedHtml;
        } else if (rawCustomTitleText.trim()) { // Fallback to raw text if HTML stripping yielded nothing but text was present
            actualTitleHtml = rawCustomTitleText.trim();
        }
    }

    const titleEl = createTitle(calloutType, actualTitleHtml, isCollapsible, isCollapsed);

    // Create content wrapper
    const contentEl = document.createElement("div");
    contentEl.className = "callout-content";

    // --- Move content into `contentEl` ---
    // Store original children before clearing the blockquote, so we can iterate them.
    const originalChildren = Array.from(el.children);
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }

    // Append the new title element
    callout.appendChild(titleEl);

    // Process the first paragraph: extract remaining content (after title line).
    const firstParagraphHtmlLines = firstParagraph.innerHTML.split('\n');
    const remainingPContentHtml = firstParagraphHtmlLines.slice(1).join('\n').trim();

    if (remainingPContentHtml) {
        const tempContentFragment = document.createElement('div');
        tempContentFragment.innerHTML = remainingPContentHtml;
        while(tempContentFragment.firstChild) {
            contentEl.appendChild(tempContentFragment.firstChild);
        }
    }

    // Move all original children (which now only exist in `originalChildren` array)
    // starting from the element *after* `firstParagraph`, into `contentEl`.
    let foundFirstParagraph = false;
    for (const child of originalChildren) {
        if (child === firstParagraph) {
            foundFirstParagraph = true;
            // The first paragraph itself will be explicitly removed from the DOM after processing.
            continue; // Skip the original first paragraph element
        }
        if (foundFirstParagraph) {
            // All subsequent siblings (original children) go directly into contentEl.
            contentEl.appendChild(child);
        }
    }
    
    // Append the content element to the callout.
    callout.appendChild(contentEl);

    // Remove the original firstParagraph from the DOM if it's still there.
    // This handles cases where its content might have been fully moved or it was effectively empty.
    if (firstParagraph.parentNode) {
        firstParagraph.remove();
    }
    
    return true; // Transformation successful
  }

  /**
   * Creates the title element for a callout.
   * @param {string} type - The callout type (e.g., 'note', 'warning').
   * @param {string} titleHtml - The HTML to display in the title.
   * @param {boolean} isCollapsible - Whether the callout can be collapsed.
   * @param {boolean} isCollapsed - The initial collapsed state.
   * @returns {HTMLElement} The generated title element.
   */
  function createTitle(type, titleHtml, isCollapsible, isCollapsed) {
    const title = document.createElement("div");
    title.className = "callout-title";

    // Icon
    const icon = createIcon(type);
    
    // Title Text (now supports HTML)
    const inner = document.createElement("span");
    inner.className = "callout-title-inner";
    inner.innerHTML = titleHtml; // Use innerHTML for rich titles

    title.appendChild(icon);
    title.appendChild(inner);

    if (isCollapsible) {
      const toggleButton = createToggleButton(isCollapsed);
      title.appendChild(toggleButton);
      title.addEventListener("click", (e) => {
        // Allow clicks on links in the title, but toggle for other clicks
        if (e.target.closest("a, button")) return;
        
        const callout = title.closest(".callout");
        if (callout) {
          const isCurrentlyCollapsed = callout.classList.toggle("is-collapsed");
          toggleButton.setAttribute("aria-expanded", !isCurrentlyCollapsed);
        }
      });
    }

    return title;
  }

  /**
   * Creates the SVG icon for a callout.
   * @param {string} type - The callout type.
   * @returns {HTMLElement} The icon span element.
   */
  function createIcon(type) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "callout-icon";
    
    const iconName = ICON_MAP[type] || 'pencil'; // Default to 'pencil'

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "lucide"); 
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `<use href="#${iconName}" xlink:href="#${iconName}"></use>`;
    
    iconWrap.appendChild(svg);
    return iconWrap;
  }

  /**
   * Creates the toggle button for collapsible callouts.
   * @param {boolean} isCollapsed - The initial collapsed state.
   * @returns {HTMLButtonElement} The toggle button.
   */
  function createToggleButton(isCollapsed) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "callout-toggle";
    btn.setAttribute("aria-expanded", !isCollapsed);
    btn.setAttribute("aria-label", "Toggle callout");
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const callout = btn.closest(".callout");
      if (callout) {
        const isCurrentlyCollapsed = callout.classList.toggle("is-collapsed");
        btn.setAttribute("aria-expanded", !isCurrentlyCollapsed);
      }
    });

    return btn;
  }


  // --- Utility Functions ---

  /**
   * Safely parses a JSON string from an element's text content.
   * @param {string} elementId - The ID of the element containing the JSON.
   * @param {object} fallback - A fallback object to return on failure.
   * @returns {object} The parsed JSON object or the fallback.
   */
  function safeJSONParse(elementId, fallback = {}) {
    try {
      const el = document.getElementById(elementId);
      return el ? JSON.parse(el.textContent) : fallback;
    } catch (e) {
      console.warn(`obsidian-callout: Invalid JSON in #${elementId}.`, e);
      return fallback;
    }
  }
  
  /**
   * Logs a message to the console if debug mode is enabled.
   * @param  {...any} args - The message and data to log.
   */
  function log(...args) {
    if (DEBUG_MODE) {
      console.log("obsidian-callout:", ...args);
    }
  }

})();