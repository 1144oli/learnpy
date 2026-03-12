const app = document.getElementById("app");
const menuBtn = document.getElementById("menuBtn");
const searchBtn = document.getElementById("searchBtn");
const repoBtn = document.getElementById("repoBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const docBody = document.getElementById("docBody");
const searchPanel = document.getElementById("searchPanel");
const globalSearchInput = document.getElementById("globalSearchInput");
const searchResults = document.getElementById("searchResults");
const searchCloseBtn = document.getElementById("searchCloseBtn");
const shortcutsModal = document.getElementById("shortcutsModal");
const shortcutsCloseBtn = document.getElementById("shortcutsCloseBtn");

const navLinks = Array.from(document.querySelectorAll(".nav-item, .nav-subitem"));
let searchIndex = [];
let searchReady = false;

function animateDoc() {
  docBody.classList.remove("doc-animate");
  void docBody.offsetWidth;
  docBody.classList.add("doc-animate");
}

function enhanceMarkdownLinks() {
  const anchors = Array.from(docBody.querySelectorAll("a[href]"));

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const isExternal = /^(https?:)?\/\//i.test(href);

    if (isExternal) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
      return;
    }

    // Intercept links to other .md files and navigate via the JS system
    if (href.endsWith(".md")) {
      anchor.addEventListener("click", async (event) => {
        event.preventDefault();

        // Resolve the path relative to the current chapter's folder
        const activeLink = navLinks.find((l) =>
          l.classList.contains("nav-item--active")
        );
        const currentPath = activeLink ? activeLink.dataset.md : "";
        const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/") + 1);
        const resolved = currentDir + href;

        // Find a matching sidebar link, if any, and activate it
        const matchingLink = navLinks.find((l) => {
          const lPath = l.dataset.md || "";
          return lPath === resolved || lPath.endsWith("/" + href);
        });

        if (matchingLink) {
          setActiveLink(matchingLink);
          await renderMarkdown(matchingLink);
        } else {
          // No sidebar entry — fetch and render directly
          const fakeLink = { dataset: { md: resolved }, textContent: href };
          await renderMarkdown(fakeLink);
        }
      });
    }
  });
}

function enhanceCodeBlocks() {
  const codeBlocks = Array.from(docBody.querySelectorAll("pre > code"));

  codeBlocks.forEach((codeBlock) => {
    const pre = codeBlock.parentElement;

    if (!(pre instanceof HTMLElement) || pre.querySelector(".code-copy-btn")) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy-btn";
    button.textContent = "Copy";

    button.addEventListener("click", async () => {
      const codeText = codeBlock.textContent || "";

      if (!codeText) {
        return;
      }

      try {
        await navigator.clipboard.writeText(codeText);
        button.textContent = "Copied";
        button.classList.add("is-success");
      } catch (error) {
        button.textContent = "Failed";
        button.classList.add("is-error");
      }

      window.setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("is-success", "is-error");
      }, 1200);
    });

    pre.prepend(button);
  });
}

async function renderMarkdown(link) {
  const filePath = link.dataset.md;

  if (!filePath) {
    docBody.innerHTML = `<h1>${link.textContent.trim()}</h1><p>No markdown file is configured for this section yet.</p>`;
    animateDoc();
    return;
  }

  docBody.innerHTML = "<h1>Loading…</h1>";
  animateDoc();

  try {
    const response = await fetch(filePath);

    if (!response.ok) {
      throw new Error(`Failed to load: ${filePath}`);
    }

    const markdown = await response.text();
    docBody.innerHTML = marked.parse(markdown);
    enhanceMarkdownLinks();
    enhanceCodeBlocks();
    animateDoc();
  } catch (error) {
    docBody.innerHTML = `
      <h1>${link.textContent.trim()}</h1>
      <p>Could not load markdown from <strong>${filePath}</strong>.</p>
      <p>Serve this folder with a local server (not file://), then reload.</p>
    `;
    animateDoc();
  }
}

async function buildSearchIndex() {
  if (searchReady) {
    return;
  }

  const linksWithFiles = navLinks.filter((link) => link.dataset.md);
  const uniqueByPath = new Map();

  linksWithFiles.forEach((link) => {
    uniqueByPath.set(link.dataset.md, link);
  });

  const entries = await Promise.all(
    Array.from(uniqueByPath.values()).map(async (link) => {
      const filePath = link.dataset.md;

      try {
        const response = await fetch(filePath);
        if (!response.ok) {
          return null;
        }

        const markdown = await response.text();
        const plainText = markdown
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/[#>*_\-\[\]\(\)!]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        return {
          link,
          title: link.textContent.trim(),
          text: plainText,
          textLower: plainText.toLowerCase(),
          titleLower: link.textContent.trim().toLowerCase(),
        };
      } catch (error) {
        return null;
      }
    })
  );

  searchIndex = entries.filter(Boolean);
  searchReady = true;
}

function createSnippet(text, queryLower) {
  const sourceLower = text.toLowerCase();
  const matchIndex = sourceLower.indexOf(queryLower);

  if (matchIndex < 0) {
    return text.slice(0, 120);
  }

  const start = Math.max(0, matchIndex - 45);
  const end = Math.min(text.length, matchIndex + queryLower.length + 75);
  const snippet = text.slice(start, end).trim();

  return `${start > 0 ? "…" : ""}${snippet}${end < text.length ? "…" : ""}`;
}

function renderSearchResults(matches, queryLower) {
  if (matches.length === 0) {
    searchResults.innerHTML = '<li class="search-empty">No matches found.</li>';
    return;
  }

  searchResults.innerHTML = "";

  matches.slice(0, 12).forEach((entry) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const snippet = createSnippet(entry.text, queryLower);

    button.type = "button";
    button.className = "search-result-btn";
    button.innerHTML = `<strong>${entry.title}</strong><span>${snippet}</span>`;
    button.addEventListener("click", async () => {
      setActiveLink(entry.link);
      await renderMarkdown(entry.link);
      closeSearchPanel();
    });

    item.appendChild(button);
    searchResults.appendChild(item);
  });
}

function runGlobalSearch(rawQuery) {
  const query = rawQuery.trim();
  const queryLower = query.toLowerCase();

  if (!queryLower) {
    searchResults.innerHTML = '<li class="search-empty">Type to search all chapters.</li>';
    return;
  }

  const matches = searchIndex.filter(
    (entry) => entry.titleLower.includes(queryLower) || entry.textLower.includes(queryLower)
  );

  renderSearchResults(matches, queryLower);
}

function openSearchPanel() {
  searchPanel.classList.add("is-open");
  searchPanel.setAttribute("aria-hidden", "false");
  globalSearchInput.focus();
  runGlobalSearch(globalSearchInput.value);
}

function closeSearchPanel() {
  searchPanel.classList.remove("is-open");
  searchPanel.setAttribute("aria-hidden", "true");
}

function openShortcutsModal() {
  shortcutsModal.classList.add("is-open");
  shortcutsModal.setAttribute("aria-hidden", "false");
}

function closeShortcutsModal() {
  shortcutsModal.classList.remove("is-open");
  shortcutsModal.setAttribute("aria-hidden", "true");
}

function isTypingContext(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;

  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

function scrollByViewport(multiplier) {
  window.scrollBy({
    top: window.innerHeight * 0.88 * multiplier,
    behavior: "smooth",
  });
}

function setActiveLink(selectedLink) {
  navLinks.forEach((link) => link.classList.remove("nav-item--active"));
  selectedLink.classList.add("nav-item--active");
}

menuBtn.addEventListener("click", () => {
  if (window.innerWidth <= 900) {
    app.classList.toggle("sidebar-open");
    return;
  }

  app.classList.toggle("sidebar-collapsed");
});

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  if (
    window.innerWidth <= 900 &&
    app.classList.contains("sidebar-open") &&
    !target.closest("#sidebar") &&
    !target.closest("#menuBtn")
  ) {
    app.classList.remove("sidebar-open");
  }
});

navLinks.forEach((link) => {
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    setActiveLink(link);
    await renderMarkdown(link);

    if (window.innerWidth <= 900) {
      app.classList.remove("sidebar-open");
    }
  });
});

async function goToOffset(offset) {
  const activeIndex = navLinks.findIndex((link) =>
    link.classList.contains("nav-item--active")
  );

  const normalizedIndex = activeIndex >= 0 ? activeIndex : 0;
  const targetIndex = (normalizedIndex + offset + navLinks.length) % navLinks.length;
  const targetLink = navLinks[targetIndex];

  setActiveLink(targetLink);
  await renderMarkdown(targetLink);
}

prevBtn.addEventListener("click", async () => {
  await goToOffset(-1);
});

nextBtn.addEventListener("click", async () => {
  await goToOffset(1);
});

searchBtn.addEventListener("click", () => {
  if (searchPanel.classList.contains("is-open")) {
    closeSearchPanel();
    return;
  }

  buildSearchIndex().then(openSearchPanel);
});

globalSearchInput.addEventListener("input", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  runGlobalSearch(target.value);
});

searchCloseBtn.addEventListener("click", closeSearchPanel);
shortcutsCloseBtn.addEventListener("click", closeShortcutsModal);

shortcutsModal.addEventListener("click", (event) => {
  if (event.target === shortcutsModal) {
    closeShortcutsModal();
  }
});

document.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    if (searchPanel.classList.contains("is-open")) {
      closeSearchPanel();
      return;
    }

    if (shortcutsModal.classList.contains("is-open")) {
      closeShortcutsModal();
      return;
    }
  }

  if (isTypingContext(event.target) || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (event.key === "?") {
    event.preventDefault();

    if (shortcutsModal.classList.contains("is-open")) {
      closeShortcutsModal();
    } else {
      openShortcutsModal();
    }

    return;
  }

  if (event.key === "f" || event.key === "F") {
    event.preventDefault();

    if (searchPanel.classList.contains("is-open")) {
      closeSearchPanel();
    } else {
      buildSearchIndex().then(openSearchPanel);
    }

    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    await goToOffset(1);
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    await goToOffset(-1);
    return;
  }

  if (event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    scrollByViewport(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.key === "PageDown") {
    event.preventDefault();
    scrollByViewport(1);
    return;
  }

  if (event.key === "PageUp") {
    event.preventDefault();
    scrollByViewport(-1);
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    window.scrollBy({ top: 90, behavior: "smooth" });
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    window.scrollBy({ top: -90, behavior: "smooth" });
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }
});

repoBtn.addEventListener("click", () => {
  window.open("https://github.com/1144oli/learnpy", "_blank", "noopener,noreferrer");
});

const initialLink = navLinks.find((link) => link.classList.contains("nav-item--active"));
if (initialLink) {
  renderMarkdown(initialLink);
}
