/* Obsidian-style callout behavior
   - Reads translations from a JSON blob in the page with id 'obsidian-callout-i18n'
   - Ensures callouts have titles (from data-callout-title or translation of data-callout-type)
   - Supports collapsible callouts (class 'is-collapsible' or data-collapsible)
   - Improved robustness with WeakSet tracking and better error handling
 */
(function () {
  "use strict";

  // Debug logging function
  function debugLog(message, data) {
    if (window.obsidianCalloutDebug === true) {
      console.log("obsidian-callout:", message, data || "");
    }
  }

  function safeJSON(id) {
    try {
      var el = document.getElementById(id);
      if (!el) {
        debugLog("JSON element not found", id);
        return {};
      }
      return JSON.parse(el.textContent || el.innerText || "{}");
    } catch (e) {
      console.warn("obsidian-callout: invalid json", e);
      return {};
    }
  }

  var i18n = safeJSON("obsidian-callout-i18n");
  debugLog("i18n loaded", i18n);

  // WeakSets to track processed elements and prevent duplicate processing
  var processedElements = new WeakSet();
  var processedCallouts = new WeakSet();

  // Map callout types to symbol ids in the inline sprite
  var ICON_SYMBOL_ID = {
    info: "circle-info",
    tip: "lightbulb",
    faq: "circle-question",
    question: "circle-question",
    note: "note",
    abstract: "book",
    todo: "clipboard",
    success: "check",
    warning: "circle-exclamation",
    failure: "circle-xmark",
    danger: "triangle-exclamation",
    bug: "bug",
    example: "book-open-reader",
    quote: "quote-left",
  };

  var ICON_ALIAS = {
    summary: "abstract",
    tldr: "abstract",
    hint: "tip",
    check: "success",
    done: "success",
    help: "faq",
    caution: "warning",
    attention: "warning",
    fail: "failure",
    missing: "failure",
    error: "danger",
    cite: "quote",
  };

  // Preprocess: convert Obsidian-style markers in blockquotes or paragraphs
  // Example patterns:
  //   > [!note]
  //   > content...
  // or a paragraph that starts with [!note] Title
  function preprocessObsidianCallouts() {
    // capture: 1=type, 2=suffix '+' or '-' (optional), 3=title remainder (optional)
    var marker = /^\s*\[!(\w+)\]([+-])?\s*(.*)$/;
    debugLog("Starting preprocessObsidianCallouts");

    function findLeadingTextNode(el) {
      if (!el) return null;

      try {
        // find first visible text node inside el that's not inside code/pre
        var walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function (node) {
              if (!node.nodeValue || !node.nodeValue.trim()) {
                return NodeFilter.FILTER_REJECT;
              }
              var p = node.parentNode;
              var tag = p && p.tagName ? p.tagName.toLowerCase() : "";
              if (
                tag === "code" ||
                tag === "pre" ||
                (p.closest && p.closest("code, pre"))
              ) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          },
          false
        );
        return walker.nextNode();
      } catch (e) {
        debugLog("Error in findLeadingTextNode", e);
        return null;
      }
    }

    function processElement(el, replaceRoot) {
      if (!el || processedElements.has(el)) {
        debugLog("Element already processed or null", el);
        return false;
      }

      // Check if already converted
      if (el.classList && el.classList.contains("callout")) {
        debugLog("Element already converted", el);
        return false;
      }

      debugLog("Processing element", el);

      var txtNode = findLeadingTextNode(el);
      if (!txtNode) {
        debugLog("No leading text node found", el);
        return false;
      }

      var txt = txtNode.nodeValue.trim();
      var m = txt.match(marker);
      if (!m) {
        debugLog("No marker found in text", txt);
        return false;
      }

      var type = m[1].toLowerCase();
      var suffix = m[2];
      var titleRem = m[3] && m[3].trim() ? m[3].trim() : null;

      debugLog("Found callout marker", { type, suffix, titleRem });

      // Mark element as processed
      processedElements.add(el);

      // Remove marker from the text node's leading content (only in this node)
      try {
        var removeRegex = new RegExp("^\\s*\\[!" + type + "\\]([+-])?\\s*");
        var remainder = txtNode.nodeValue.replace(removeRegex, "");
        remainder = remainder.replace(/^\s+/, "");
      } catch (e) {
        debugLog("Regex error, using fallback", e);
        var remainder = txtNode.nodeValue.replace(m[0], "").replace(/^\s+/, "");
      }

      if (remainder.length) {
        txtNode.nodeValue = remainder;
      } else {
        // If node became empty, remove it
        try {
          if (txtNode.parentNode) {
            txtNode.parentNode.removeChild(txtNode);
          }
        } catch (e) {
          debugLog("Error removing empty text node", e);
        }
      }

      var call = document.createElement("div");
      call.className = "callout";
      call.setAttribute("data-callout-type", type);
      if (titleRem) call.setAttribute("data-callout-title", titleRem);

      // Mark collapsible/collapsed via attributes if suffix present
      if (suffix === "+" || suffix === "-") {
        call.setAttribute("data-collapsible", "true");
        if (suffix === "-") call.setAttribute("data-collapsed", "true");
      }

      try {
        if (
          replaceRoot &&
          el.tagName &&
          el.tagName.toLowerCase() === "blockquote"
        ) {
          // Move children into call and replace blockquote
          while (el.firstChild) {
            call.appendChild(el.firstChild);
          }
          el.parentNode.replaceChild(call, el);
        } else if (el.tagName && el.tagName.toLowerCase() === "li") {
          // Preserve list structure: insert call inside li and move the relevant children
          while (el.firstChild) {
            call.appendChild(el.firstChild);
          }
          el.appendChild(call);
        } else {
          // Default: replace element with call wrapping its children
          while (el.firstChild) {
            call.appendChild(el.firstChild);
          }
          el.parentNode.replaceChild(call, el);
        }
      } catch (e) {
        debugLog("Error during element replacement", e);
        return false;
      }

      debugLog("Successfully processed element", { type, titleRem });
      return true;
    }

    try {
      // Get all potential callout elements, prioritizing deepest nesting
      var allElements = document.querySelectorAll("blockquote, li, p, div");
      var elementsArray = Array.from(allElements);

      // Sort by depth (deepest first) to handle nested structures properly
      elementsArray.sort(function(a, b) {
        var depthA = 0;
        var parent = a.parentNode;
        while (parent && parent !== document.body) {
          depthA++;
          parent = parent.parentNode;
        }

        var depthB = 0;
        parent = b.parentNode;
        while (parent && parent !== document.body) {
          depthB++;
          parent = parent.parentNode;
        }

        return depthB - depthA; // Descending order (deepest first)
      });

      debugLog("Sorted elements by depth", elementsArray.length);

      // Process elements in depth order
      elementsArray.forEach(function (el) {
        try {
          var isBlockquote = el.tagName && el.tagName.toLowerCase() === "blockquote";
          processElement(el, isBlockquote);
        } catch (e) {
          debugLog("Error processing individual element", e);
        }
      });

    } catch (e) {
      debugLog("Error in preprocessObsidianCallouts", e);
    }
  }

  function createTitle(type, titleText) {
    var title = document.createElement("div");
    title.className = "callout-title";

    var iconWrap = document.createElement("span");
    iconWrap.className = "callout-icon";
    // pick symbol id from ICON_SYMBOL_ID or alias mapping
    var pick = type in ICON_SYMBOL_ID ? type : ICON_ALIAS[type] || null;
    var symbolId = pick && ICON_SYMBOL_ID[pick] ? ICON_SYMBOL_ID[pick] : null;
    // render an svg that references the inlined sprite via <use>
    var svgStr;
    if (symbolId) {
      svgStr =
        '<svg class="lucide" aria-hidden="true" focusable="false" viewBox="0 0 24 24" style="width:1.2em;height:1.2em;">' +
        '<use href="#' +
        symbolId +
        '" fill="currentColor" stroke="currentColor"></use></svg>';
    } else {
      svgStr =
        '<svg viewBox="0 0 24 24" class="lucide" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.06"></circle></svg>';
    }
    iconWrap.innerHTML = svgStr;

    var inner = document.createElement("span");
    inner.className = "callout-title-inner";
    inner.textContent = titleText || i18n[type] || type || "Note";

    title.appendChild(iconWrap);
    title.appendChild(inner);

    return title;
  }

  function makeToggleButton() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "callout-toggle";
    btn.setAttribute("aria-expanded", "true");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="lucide" width="16" height="16"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    return btn;
  }

  function enhanceCallout(node) {
    try {
      var type =
        node.getAttribute("data-callout-type") ||
        node.getAttribute("data-type") ||
        node.getAttribute("data-type") ||
        "note";
      // If there's already a .callout-title, don't add another
      if (!node.querySelector(".callout-title")) {
        var providedTitle =
          node.getAttribute("data-callout-title") ||
          node.getAttribute("data-title");
        var titleEl = createTitle(type, providedTitle);
        // If collapsible
        var collapsible =
          node.classList.contains("is-collapsible") ||
          node.getAttribute("data-collapsible") === "true" ||
          node.getAttribute("data-collapsible") === "";
        var collapsed =
          node.getAttribute("data-collapsed") === "true" ||
          node.getAttribute("data-collapsed") === "";
        if (collapsible) {
          node.classList.add("is-collapsible");
          if (collapsed) node.classList.add("is-collapsed");
          var toggle = makeToggleButton();
          // set initial aria-expanded based on collapsed state
          var isCollapsed = node.classList.contains("is-collapsed");
          toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
          toggle.addEventListener("click", function (e) {
            e.preventDefault();
            node.classList.toggle("is-collapsed");
            var expanded = !node.classList.contains("is-collapsed");
            toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
          });
          titleEl.appendChild(toggle);
        }

        // insert as first child
        node.insertBefore(titleEl, node.firstChild);
      }

      // ensure content wrapper exists
      var content =
        node.querySelector(".callout-content") ||
        node.querySelector(".callout-body");
      if (!content) {
        // wrap remaining children into callout-content
        var wrapper = document.createElement("div");
        wrapper.className = "callout-content";
        while (node.children.length > 1) {
          // leave the title we just inserted
          wrapper.appendChild(node.children[1]);
        }
        node.appendChild(wrapper);
      }
    } catch (e) {
      console.warn("obsidian-callout enhance failed", e);
    }
  }

  function init() {
    // first preprocess possible markdown-parsing artifacts
    preprocessObsidianCallouts();

    var nodes = document.querySelectorAll(".callout");
    if (!nodes || nodes.length === 0) return;
    nodes.forEach(function (n) {
      enhanceCallout(n);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();
