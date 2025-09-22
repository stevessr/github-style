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
  });

  // Map callout types to Lucide icon names (for SVG sprite)
  const ICON_MAP = {
    note: "pencil",
    info: "info",
    todo: "check-circle-2",
    tip: "flame",
    success: "check-circle",
    question: "help-circle",
    warning: "alert-triangle",
    failure: "x-circle",
    danger: "zap",
    bug: "bug",
    example: "list",
    quote: "quote",
    abstract: "clipboard-list",
    // Aliases
    summary: "clipboard-list",
    tldr: "clipboard-list",
    hint: "flame",
    done: "check-circle",
    faq: "help-circle",
    caution: "alert-triangle",
    attention: "alert-triangle",
    fail: "x-circle",
    missing: "x-circle",
    error: "zap",
    cite: "quote",
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

    // Iterate backwards to safely replace nodes without disrupting the NodeList
    for (let i = potentialCallouts.length - 1; i >= 0; i--) {
      const el = potentialCallouts[i];

      // Skip if already processed or part of an existing callout
      if (processedElements.has(el) || el.closest(".callout")) {
        continue;
      }

      try {
        const newCallout = createCalloutFromElement(el);
        if (newCallout) {
          // Atomically replace the old blockquote with the new callout div
          el.parentNode.replaceChild(newCallout, el);
          transformedCount++;
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
   * @param {HTMLElement} el The element to process.
   * @returns {HTMLElement|null} A new callout element if successful, otherwise null.
   */
  function createCalloutFromElement(el) {
    const markerRegex = /^\s*\[!(\w+)\]([+-])?\s*(.*)/;
    const firstTextNode = findFirstTextNode(el);

    if (!firstTextNode || !firstTextNode.textContent.includes("[!")) {
      return null;
    }

    const match = firstTextNode.textContent.match(markerRegex);
    if (!match) {
      return null;
    }

    // Mark the original element as processed to avoid re-running
    processedElements.add(el);

    // --- Extract Data ---
    const [fullMatch, type, collapsibleState, customTitle] = match;
    const calloutType = type.toLowerCase();
    const isCollapsible = collapsibleState === "+" || collapsibleState === "-";
    const isCollapsed = collapsibleState === "-";

    log("Found callout:", { type: calloutType, title: customTitle, collapsible: isCollapsible });

    // --- Create Callout Structure (in memory) ---
    const callout = document.createElement("div");
    callout.className = "callout";
    callout.dataset.calloutType = calloutType;

    if (isCollapsible) {
      callout.classList.add("is-collapsible");
      if (isCollapsed) {
        callout.classList.add("is-collapsed");
      }
    }

    // Create title element
    const titleText = customTitle.trim() || i18n[calloutType] || calloutType.charAt(0).toUpperCase() + calloutType.slice(1);
    const titleEl = createTitle(calloutType, titleText, isCollapsible, isCollapsed);

    // Create content wrapper
    const contentEl = document.createElement("div");
    contentEl.className = "callout-content";

    // Clean the marker from the text node that contained it
    firstTextNode.textContent = firstTextNode.textContent.replace(fullMatch, "").trimStart();

    // Move all of the original element's children into the new content wrapper
    while (el.firstChild) {
      contentEl.appendChild(el.firstChild);
    }
    
    // Assemble the final callout structure
    callout.appendChild(titleEl);
    callout.appendChild(contentEl);

    return callout;
  }

  /**
   * Creates the title element for a callout.
   * @param {string} type - The callout type (e.g., 'note', 'warning').
   * @param {string} titleText - The text to display in the title.
   * @param {boolean} isCollapsible - Whether the callout can be collapsed.
   * @param {boolean} isCollapsed - The initial collapsed state.
   * @returns {HTMLElement} The generated title element.
   */
  function createTitle(type, titleText, isCollapsible, isCollapsed) {
    const title = document.createElement("div");
    title.className = "callout-title";

    // Icon
    const icon = createIcon(type);
    
    // Title Text
    const inner = document.createElement("span");
    inner.className = "callout-title-inner";
    inner.textContent = titleText;

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
    svg.innerHTML = `<use href="#${iconName}" xlink:href="#obsidian-icon-${iconName}"></use>`;
    
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
   * Finds the first meaningful text node within an element.
   * @param {Node} node - The node to search within.
   * @returns {Node|null} The first text node with content, or null.
   */
  function findFirstTextNode(node) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== "") {
      return node;
    }
    for (const child of node.childNodes) {
      // Do not search inside nested blockquotes
      if (child.tagName === 'BLOCKQUOTE') continue;
      
      const result = findFirstTextNode(child);
      if (result) {
        return result;
      }
    }
    return null;
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