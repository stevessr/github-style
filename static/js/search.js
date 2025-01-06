document.addEventListener("DOMContentLoaded", function () {
  const toggleSearchButton = document.getElementById("toggle-search-button");
  const searchBox = document.getElementById("search-box");
  const searchInput = document.getElementById("search-input");
  const searchButton = document.getElementById("search-button");
  const searchDropdown = document.getElementById("search-dropdown");
  const searchResults = document.getElementById("search-results");
  const loadingIndicator = document.getElementById("loading-indicator");

  let fuse; // Fuse.js 实例
  let allResults = []; // 所有搜索结果
  let visibleResults = []; // 当前可见的搜索结果
  const resultsPerPage = 10; // 每次加载的结果数量
  let currentPage = 0; // 当前加载的页数

  // 显示/隐藏搜索框
  toggleSearchButton.addEventListener("click", function () {
    if (searchBox.style.display === "none" || searchBox.style.display === "") {
      searchBox.style.display = "flex"; // 显示搜索框
      searchInput.focus(); // 聚焦到输入框
    } else {
      searchBox.style.display = "none"; // 隐藏搜索框
      searchDropdown.style.display = "none"; // 隐藏下拉菜单
    }
  });

  // 监听页面滚动事件
  let isScrolling;
  window.addEventListener("scroll", function () {
    clearTimeout(isScrolling);
    searchBox.style.display = "none"; // 隐藏搜索框
    searchDropdown.style.display = "none"; // 隐藏下拉菜单

    // 滚动停止后延迟显示按钮
    isScrolling = setTimeout(function () {
      toggleSearchButton.style.display = "block";
    }, 500);
  });

  // 加载 JSON 索引文件
  fetch("/index.json")
    .then((response) => response.json())
    .then((data) => {
      fuse = new Fuse(data, {
        keys: ["title", "content"],
        includeMatches: true,
        minMatchCharLength: 2,
        threshold: 0.3,
      });

      searchButton.addEventListener("click", function () {
        const query = searchInput.value;
        if (query.trim() === "") {
          searchResults.innerHTML = "<p>Please enter a search term.</p>";
          searchDropdown.style.display = "block"; // 显示下拉菜单
          return;
        }
        currentPage = 0; // 重置页数
        allResults = fuse.search(query); // 获取所有匹配结果
        visibleResults = []; // 清空可见结果
        loadMoreResults(); // 加载第一页结果
        searchDropdown.style.display = "block"; // 显示下拉菜单
      });

      // 监听下拉菜单滚动事件
      searchDropdown.addEventListener("scroll", function () {
        if (shouldLoadMoreResults()) {
          loadMoreResults();
        }
      });

      // 点击外部区域关闭下拉菜单
      document.addEventListener("click", function (event) {
        if (!event.target.closest(".search-container")) {
          searchDropdown.style.display = "none";
        }
      });

      function loadMoreResults() {
        const start = currentPage * resultsPerPage;
        const end = start + resultsPerPage;
        const newResults = allResults.slice(start, end);

        if (newResults.length > 0) {
          visibleResults = visibleResults.concat(newResults);
          renderResults(visibleResults);
          currentPage++;
        }

        // 显示或隐藏加载指示器
        if (end >= allResults.length) {
          loadingIndicator.style.display = "none";
        } else {
          loadingIndicator.style.display = "block";
        }
      }

      function renderResults(results) {
        const fragment = document.createDocumentFragment(); // 使用文档片段优化性能

        results.forEach((result) => {
          const { item, matches } = result;
          const snippets = getSnippets(item.content, matches); // 获取合并后的匹配片段

          const resultElement = document.createElement("div");
          resultElement.className = "search-result";
          resultElement.innerHTML = `
                  <h3><a href="${item.permalink}">${item.title}</a></h3>
                  ${snippets.map((snippet) => `<p>${snippet}</p>`).join("")}
                `;
          fragment.appendChild(resultElement);
        });

        searchResults.innerHTML = ""; // 清空当前结果
        searchResults.appendChild(fragment); // 批量插入新结果
      }

      function highlightMatches(content, matches) {
        let highlightedContent = content;
        matches.forEach((match) => {
          if (match.key === "content") {
            match.indices.forEach(([start, end]) => {
              const matchedText = content.substring(start, end + 1);
              highlightedContent = highlightedContent.replace(
                new RegExp(matchedText, "gi"),
                `<span class="highlight">${matchedText}</span>`
              );
            });
          }
        });
        return highlightedContent;
      }

      function getSnippets(content, matches) {
        const snippetLength = 100; // 每个上下文片段的最大长度
        const snippets = [];

        if (matches.length > 0 && matches[0].indices.length > 0) {
          // 提取所有匹配的范围
          const ranges = matches
            .filter((match) => match.key === "content")
            .flatMap((match) =>
              match.indices.map(([start, end]) => ({ start, end }))
            );

          // 合并所有重叠的范围
          const mergedRanges = mergeRanges(ranges);

          // 根据合并后的范围提取片段
          mergedRanges.forEach(({ start, end }) => {
            const matchStart = Math.max(0, start - snippetLength / 2);
            const matchEnd = Math.min(content.length, end + snippetLength / 2);

            let snippet = content.substring(matchStart, matchEnd);
            if (matchStart > 0) snippet = `...${snippet}`;
            if (matchEnd < content.length) snippet = `${snippet}...`;

            // 高亮匹配的关键词
            const matchedText = content.substring(start, end + 1);
            snippet = snippet.replace(
              new RegExp(matchedText, "gi"),
              `<span class="highlight">${matchedText}</span>`
            );

            snippets.push(snippet);
          });
        } else {
          let snippet = content.substring(0, snippetLength);
          if (content.length > snippetLength) snippet += "...";
          snippets.push(snippet);
        }

        return snippets;
      }

      function mergeRanges(ranges) {
        if (ranges.length === 0) return [];

        // 按起始位置排序
        ranges.sort((a, b) => a.start - b.start);

        const merged = [ranges[0]];
        for (let i = 1; i < ranges.length; i++) {
          const last = merged[merged.length - 1];
          const current = ranges[i];

          // 如果当前范围与上一个范围重叠或相邻，则合并
          if (current.start <= last.end + 1) {
            last.start = Math.min(last.start, current.start);
            last.end = Math.max(last.end, current.end);
          } else {
            merged.push(current);
          }
        }

        return merged;
      }

      function shouldLoadMoreResults() {
        const { scrollTop, scrollHeight, clientHeight } = searchDropdown;
        return scrollTop + clientHeight >= scrollHeight - 10; // 接近底部时加载
      }
    })
    .catch((error) => console.error("Error loading search index:", error));
});

document.addEventListener("DOMContentLoaded", function () {
  const draggableContainer = document.getElementById(
    "draggable-button-container"
  );
  let isDragging = false;
  let offsetX, offsetY;

  // 鼠标按下时开始拖动
  draggableContainer.addEventListener("mousedown", function (event) {
    if (event.target.tagName === "BUTTON") {
      // 如果点击的是按钮，则不拖动
      return;
    }
    isDragging = true;
    offsetX = event.clientX - draggableContainer.getBoundingClientRect().left;
    offsetY = event.clientY - draggableContainer.getBoundingClientRect().top;
  });

  // 鼠标移动时更新位置
  document.addEventListener("mousemove", function (event) {
    if (isDragging) {
      const x = event.clientX - offsetX;
      const y = event.clientY - offsetY;

      // 限制拖动范围在视口内
      const containerWidth = draggableContainer.offsetWidth;
      const containerHeight = draggableContainer.offsetHeight;
      const maxX = window.innerWidth - containerWidth;
      const maxY = window.innerHeight - containerHeight;

      draggableContainer.style.left = `${Math.min(Math.max(x, 0), maxX)}px`;
      draggableContainer.style.top = `${Math.min(Math.max(y, 0), maxY)}px`;
    }
  });

  // 鼠标松开时停止拖动
  document.addEventListener("mouseup", function () {
    isDragging = false;
  });

  // 初始化按钮位置
  draggableContainer.style.position = "fixed";
  draggableContainer.style.left = "20px";
  draggableContainer.style.top = "20px";
});
