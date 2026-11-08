/* global marked, TurndownService, turndownPluginGfm */
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const editor = $("#article-editor");
  const titleInput = $("#article-title");
  const summaryInput = $("#article-summary");
  const categoryInput = $("#article-category");
  const tagsInput = $("#article-tags");
  const slugInput = $("#article-slug");
  const saveState = $("#save-state");
  const wordCount = $("#word-count");
  const readiness = $("#readiness");
  const publishStatus = $("#publish-status");
  const figureTools = $("#figure-tools");
  const imageInput = $("#image-file-input");
  const libraryInput = $("#library-file-input");
  const mediaDrawer = $("#media-drawer");
  const mediaDrawerGrid = $("#media-drawer-grid");
  const promptDialog = $("#prompt-dialog");
  const confirmDialog = $("#confirm-dialog");
  const tableDialog = $("#table-dialog");
  const historyDialog = $("#history-dialog");
  const previewDialog = $("#preview-dialog");
  const previewFrame = $("#preview-frame");
  const toast = $("#toast");

  marked.use({
    gfm: true,
    breaks: false
  });

  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**"
  });
  turndown.use(turndownPluginGfm.gfm);
  turndown.keep(["figure", "figcaption", "video", "iframe"]);
  turndown.addRule("text-style-span", {
    filter(node) {
      return node.nodeName === "SPAN"
        && node.hasAttribute("data-text-style")
        && Boolean(node.style.fontSize || node.style.fontFamily);
    },
    replacement(content, node) {
      const styles = [];
      if (node.style.fontSize) styles.push(`font-size:${node.style.fontSize}`);
      if (node.style.fontFamily) styles.push(`font-family:${node.style.fontFamily.replace(/"/g, "'")}`);
      return styles.length ? `<span style="${styles.join(";")}">${content}</span>` : content;
    }
  });
  turndown.addRule("plain-image", {
    filter: "img",
    replacement(_content, node) {
      if (node.closest("figure")) return "";
      const alt = (node.getAttribute("alt") || "").replace(/([\[\]])/g, "\\$1");
      const src = node.getAttribute("src") || "";
      const title = node.getAttribute("title");
      return `![${alt}](${src}${title ? ` "${title.replace(/"/g, '\\"')}"` : ""})`;
    }
  });

  const state = {
    view: "editor",
    draftId: null,
    editingSlug: null,
    createdAt: new Date().toISOString(),
    dirty: false,
    revision: 0,
    saveTimer: null,
    savePromise: null,
    selectedFigure: null,
    savedRange: null,
    slugTouched: false,
    data: {
      drafts: [],
      articles: [],
      media: [],
      trash: [],
      categories: ["生活随笔", "项目进程", "技术报告"]
    }
  };

  function makeElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }

  function showToast(message, tone = "", duration = 3600) {
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, duration);
  }

  async function api(path, options = {}) {
    const request = { ...options, headers: { ...(options.headers || {}) } };
    if (request.body && typeof request.body !== "string" && !(request.body instanceof Blob)) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(request.body);
    }
    const response = await fetch(path, request);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  function setSaveState(text, tone = "") {
    saveState.textContent = text;
    saveState.dataset.tone = tone;
  }

  function countWords() {
    return editor.innerText.replace(/\s+/g, "").length;
  }

  function hasBody() {
    return Boolean(editor.innerText.trim() || editor.querySelector("img,video,iframe,table"));
  }

  function slugValue(title) {
    const date = new Date(state.createdAt);
    const datePart = Number.isNaN(date.getTime())
      ? new Date().toLocaleDateString("sv-SE")
      : date.toLocaleDateString("sv-SE");
    const titlePart = String(title || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\\/:*?"<>|#%{}[\]]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.\-\s]+|[.\-\s]+$/g, "")
      .slice(0, 52);
    return `${datePart}-${titlePart || "untitled"}`;
  }

  function updateReadiness() {
    const checks = {
      title: Boolean(titleInput.value.trim()),
      category: Boolean(categoryInput.value),
      body: hasBody(),
      saved: Boolean(state.draftId) && !state.dirty
    };
    for (const item of $$("li", readiness)) {
      item.classList.toggle("is-ready", Boolean(checks[item.dataset.check]));
    }
  }

  function updateWordCount() {
    wordCount.textContent = `${countWords()} 字`;
  }

  function stripUnsafe(root) {
    root.querySelectorAll("script,style,meta,link,object,embed,form,input,button,textarea,select").forEach((node) => node.remove());
    root.querySelectorAll(".image-resize").forEach((node) => node.remove());
    for (const node of [root, ...root.querySelectorAll("*")]) {
      for (const attribute of [...node.attributes || []]) {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
        if (/^(href|src)$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value)) {
          node.removeAttribute(attribute.name);
        }
      }
      node.removeAttribute("contenteditable");
    }
  }

  function cloneEditorForSave() {
    const clone = editor.cloneNode(true);
    stripUnsafe(clone);
    for (const image of clone.querySelectorAll("img[data-relative-src]")) {
      image.setAttribute("src", image.dataset.relativeSrc);
      image.removeAttribute("data-relative-src");
    }
    for (const figure of clone.querySelectorAll("figure")) {
      figure.removeAttribute("data-width");
      figure.classList.remove("is-selected");
    }
    return clone;
  }

  function editorHtmlForSave() {
    return cloneEditorForSave().innerHTML;
  }

  function htmlToMarkdown() {
    return turndown.turndown(editorHtmlForSave()).trim();
  }

  function markDirty() {
    state.dirty = true;
    state.revision += 1;
    updateWordCount();
    updateReadiness();
    setSaveState("未保存");
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      state.saveTimer = null;
      saveDraft({ silent: true }).catch((error) => {
        setSaveState("保存失败", "error");
        showToast(error.message, "error", 5200);
      });
    }, 2000);
  }

  function articlePayload() {
    return {
      id: state.draftId,
      title: titleInput.value.trim(),
      description: summaryInput.value.trim(),
      categories: categoryInput.value ? [categoryInput.value] : [],
      tags: tagsInput.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      slug: slugInput.value.trim() || slugValue(titleInput.value),
      bodyHtml: editorHtmlForSave(),
      createdAt: state.createdAt,
      editingSlug: state.editingSlug,
      wordCount: countWords()
    };
  }

  async function saveDraft({ silent = false } = {}) {
    if (!titleInput.value.trim() && !hasBody()) return null;
    if (state.savePromise) {
      await state.savePromise;
      return state.dirty ? saveDraft({ silent }) : null;
    }
    clearTimeout(state.saveTimer);
    const revision = state.revision;
    setSaveState("保存中…");
    state.savePromise = api("/api/drafts", {
      method: "POST",
      body: articlePayload()
    }).then(async (draft) => {
      state.draftId = draft.id;
      state.createdAt = draft.createdAt;
      if (state.revision === revision) state.dirty = false;
      setSaveState(`已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`, "saved");
      updateReadiness();
      await refreshData({ render: true });
      if (!silent) showToast("草稿已保存。", "success");
      return draft;
    }).catch((error) => {
      setSaveState("保存失败", "error");
      throw error;
    }).finally(() => {
      state.savePromise = null;
      if (state.dirty && !state.saveTimer) scheduleSave();
    });
    return state.savePromise;
  }

  function clearEditor() {
    clearTimeout(state.saveTimer);
    state.draftId = null;
    state.editingSlug = null;
    state.createdAt = new Date().toISOString();
    state.dirty = false;
    state.revision = 0;
    state.selectedFigure = null;
    state.slugTouched = false;
    titleInput.value = "";
    summaryInput.value = "";
    categoryInput.value = "生活随笔";
    tagsInput.value = "";
    slugInput.value = slugValue("");
    editor.innerHTML = "<p><br></p>";
    $("#editor-context").textContent = "新文章 · 草稿尚未保存";
    publishStatus.textContent = "";
    figureTools.hidden = true;
    setSaveState("尚未保存");
    updateWordCount();
    updateReadiness();
  }

  async function newArticle() {
    if (state.dirty) await saveDraft({ silent: true }).catch(() => {});
    clearEditor();
    showView("editor");
    titleInput.focus();
  }

  function renderRelativeImages(slug) {
    for (const image of editor.querySelectorAll("img")) {
      const source = image.getAttribute("src") || "";
      image.setAttribute("draggable", "false");
      if (!source || /^(?:https?:|data:|\/media\/)/i.test(source) || image.dataset.relativeSrc) continue;
      image.dataset.relativeSrc = source;
      image.src = `/published-assets/${encodeURIComponent(slug)}/${source}`;
    }
    for (const image of editor.querySelectorAll("img")) {
      if (!image.closest("figure")) {
        const figure = document.createElement("figure");
        figure.className = "figure--full";
        image.before(figure);
        figure.append(image);
      }
      decorateFigure(image.closest("figure"));
    }
  }

  async function openDraft(id) {
    if (state.dirty) await saveDraft({ silent: true }).catch(() => {});
    const draft = await api(`/api/drafts/${encodeURIComponent(id)}`);
    state.draftId = draft.id;
    state.editingSlug = draft.editingSlug || null;
    state.createdAt = draft.createdAt;
    state.dirty = false;
    state.revision = 0;
    state.slugTouched = true;
    titleInput.value = draft.title || "";
    summaryInput.value = draft.description || "";
    categoryInput.value = draft.categories?.[0] || "生活随笔";
    tagsInput.value = (draft.tags || []).join(", ");
    slugInput.value = draft.slug || slugValue(draft.title);
    editor.innerHTML = draft.bodyHtml || "<p><br></p>";
    decorateAllFigures();
    $("#editor-context").textContent = draft.editingSlug ? "正在编辑已发布文章" : "草稿";
    setSaveState("草稿已载入", "saved");
    updateWordCount();
    updateReadiness();
    showView("editor");
  }

  async function openArticle(slug) {
    if (state.dirty) await saveDraft({ silent: true }).catch(() => {});
    const article = await api(`/api/articles/${encodeURIComponent(slug)}`);
    state.draftId = null;
    state.editingSlug = article.slug || null;
    state.createdAt = article.date;
    state.dirty = false;
    state.revision = 0;
    state.slugTouched = true;
    titleInput.value = article.title || "";
    summaryInput.value = article.description || "";
    categoryInput.value = article.categories?.[0] || "生活随笔";
    tagsInput.value = (article.tags || []).join(", ");
    slugInput.value = article.slug || "";
    editor.innerHTML = marked.parse(article.markdown || "");
    renderRelativeImages(article.slug);
    $("#editor-context").textContent = `已发布 · ${formatDate(article.date)}`;
    setSaveState("已发布内容已载入", "saved");
    publishStatus.innerHTML = `<a href="https://lhw-hh.github.io/post/${encodeURIComponent(article.slug)}/" target="_blank" rel="noopener">打开线上文章</a>`;
    updateWordCount();
    updateReadiness();
    showView("editor");
  }

  async function refreshData({ render = true } = {}) {
    state.data = await api("/api/state");
    $('[data-count="drafts"]').textContent = state.data.drafts.length;
    if (render) {
      renderDrafts();
      renderPublished();
      renderMedia();
      renderTrash();
    }
  }

  function emptyState(message) {
    return makeElement("div", "empty-state", message);
  }

  function rowAction(label, handler, className = "") {
    const button = makeElement("button", className, label);
    button.type = "button";
    button.addEventListener("click", (...args) => {
      Promise.resolve(handler(...args)).catch(showError);
    });
    return button;
  }

  function renderDrafts() {
    const list = $("#drafts-list");
    list.replaceChildren();
    if (!state.data.drafts.length) {
      list.append(emptyState("还没有草稿。开始写一篇，输入后会每 2 秒自动保存。"));
      return;
    }
    for (const draft of state.data.drafts) {
      const row = makeElement("article", "data-row");
      const title = makeElement("div", "row-title");
      title.append(makeElement("strong", "", draft.title || "未命名草稿"));
      title.append(makeElement("span", "", draft.editingSlug ? "已发布文章的修改稿" : "草稿"));
      const updated = makeElement("div", "row-meta", `更新 ${formatDate(draft.updatedAt, true)}`);
      const words = makeElement("div", "row-meta", `${draft.wordCount || 0} 字`);
      const actions = makeElement("div", "row-actions");
      actions.append(
        rowAction("继续编辑", () => openDraft(draft.id).catch(showError)),
        rowAction("删除", async () => {
          const answer = await confirmAction({
            title: "删除这份草稿？",
            message: "草稿会进入回收站并保留 30 天。",
            confirmLabel: "移入回收站"
          });
          if (answer !== "confirm") return;
          await api(`/api/drafts/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
          if (state.draftId === draft.id) clearEditor();
          await refreshData();
          showToast("草稿已移入回收站。", "success");
        }, "danger-text")
      );
      row.append(title, updated, words, actions);
      list.append(row);
    }
  }

  function renderPublished() {
    const list = $("#published-list");
    list.replaceChildren();
    if (!state.data.articles.length) {
      list.append(emptyState("还没有已发布文章。"));
      return;
    }
    for (const article of state.data.articles) {
      const row = makeElement("article", "data-row");
      const title = makeElement("div", "row-title");
      title.append(makeElement("strong", "", article.title));
      title.append(makeElement("span", "", article.lastmod ? `更新 ${formatDate(article.lastmod, true)}` : `发布 ${formatDate(article.date, true)}`));
      const statusWrap = makeElement("div");
      statusWrap.append(makeElement("span", `status-pill ${article.draft ? "is-neutral" : ""}`, article.draft ? "已隐藏" : "已上线"));
      const category = makeElement("div", "row-meta", article.categories?.[0] || "未分类");
      const actions = makeElement("div", "row-actions");
      actions.append(
        rowAction("编辑", () => openArticle(article.slug).catch(showError)),
        rowAction("历史", () => showHistory(article.slug).catch(showError)),
        rowAction(article.draft ? "显示" : "隐藏", async () => {
          const answer = await confirmAction({
            title: article.draft ? "重新显示这篇文章？" : "隐藏这篇文章？",
            message: article.draft ? "文章会重新出现在分类页、归档和搜索中。" : "源文件和图片都会保留，可随时恢复。",
            confirmLabel: article.draft ? "显示" : "隐藏"
          });
          if (answer !== "confirm") return;
          await api(`/api/articles/${encodeURIComponent(article.slug)}/visibility`, { method: "POST", body: {} });
          await refreshData();
          showToast(article.draft ? "文章已重新显示。" : "文章已隐藏。", "success");
        }),
        rowAction("删除", async () => {
          const answer = await confirmAction({
            title: "删除这篇文章？",
            message: "整篇文章和图片会移入回收站，保留 30 天。",
            confirmLabel: "移入回收站"
          });
          if (answer !== "confirm") return;
          await api(`/api/articles/${encodeURIComponent(article.slug)}`, { method: "DELETE" });
          if (state.editingSlug === article.slug) clearEditor();
          await refreshData();
          showToast("文章已移入回收站。", "success");
        }, "danger-text")
      );
      row.append(title, statusWrap, category, actions);
      list.append(row);
    }
  }

  function mediaCard(item, onClick) {
    const button = makeElement("button", "media-card");
    button.type = "button";
    button.title = `插入 ${item.originalName}`;
    const image = document.createElement("img");
    image.src = `/media/${encodeURIComponent(item.file)}`;
    image.alt = item.originalName || "媒体图片";
    image.loading = "lazy";
    button.append(image, makeElement("span", "", item.originalName || item.file));
    button.addEventListener("click", () => onClick(item));
    return button;
  }

  function renderMedia() {
    const grid = $("#media-grid");
    const drawer = mediaDrawerGrid;
    grid.replaceChildren();
    drawer.replaceChildren();
    if (!state.data.media.length) {
      grid.append(emptyState("还没有上传图片。"));
      drawer.append(emptyState("媒体库还是空的。"));
      return;
    }
    for (const item of state.data.media) {
      grid.append(mediaCard(item, (selected) => {
        insertMediaRecord(selected);
        showView("editor");
      }));
      drawer.append(mediaCard(item, (selected) => {
        insertMediaRecord(selected);
        mediaDrawer.hidden = true;
      }));
    }
  }

  function renderTrash() {
    const list = $("#trash-list");
    list.replaceChildren();
    if (!state.data.trash.length) {
      list.append(emptyState("回收站是空的。删除的内容会保留 30 天。"));
      return;
    }
    for (const item of state.data.trash) {
      const row = makeElement("article", "data-row");
      const title = makeElement("div", "row-title");
      title.append(makeElement("strong", "", item.title));
      title.append(makeElement("span", "", item.type === "article" ? "文章" : "草稿"));
      const date = makeElement("div", "row-meta", `删除 ${formatDate(item.deletedAt, true)}`);
      const type = makeElement("div", "row-meta", item.type === "article" ? "文章与图片" : "自动保存草稿");
      const actions = makeElement("div", "row-actions");
      actions.append(rowAction("恢复", async () => {
        const answer = await confirmAction({
          title: "恢复这项内容？",
          message: `“${item.title}”会恢复到原来的位置。`,
          confirmLabel: "恢复"
        });
        if (answer !== "confirm") return;
        await api(`/api/trash/${encodeURIComponent(item.id)}/restore`, { method: "POST", body: {} });
        await refreshData();
        showToast("内容已恢复。", "success");
      }));
      row.append(title, date, type, actions);
      list.append(row);
    }
  }

  async function showHistory(slug) {
    const data = await api(`/api/articles/${encodeURIComponent(slug)}/history`);
    $("#history-description").textContent = `${slug} · 每次发布或隐藏前都会保存一个版本`;
    const list = $("#history-list");
    list.replaceChildren();
    if (!data.snapshots.length) {
      list.append(emptyState("这篇还没有历史版本。第一次修改后会自动生成。"));
    } else {
      for (const snapshot of data.snapshots) {
        const item = makeElement("div", "history-item");
        const label = snapshot.replace(/T/, " ").replace(/-(\d\d)-(\d\d)-(\d\d\d)Z$/, ":$1:$2").slice(0, 19);
        item.append(makeElement("span", "", label));
        const restore = rowAction("恢复此版本", async () => {
          const answer = await confirmAction({
            title: "恢复这个历史版本？",
            message: "当前文章会先保存为新的历史版本，然后恢复所选内容。",
            confirmLabel: "恢复"
          });
          if (answer !== "confirm") return;
          await api(`/api/articles/${encodeURIComponent(slug)}/restore`, {
            method: "POST",
            body: { snapshot }
          });
          historyDialog.close();
          await refreshData();
          showToast("历史版本已恢复，请检查后重新发布。", "success");
        });
        item.append(restore);
        list.append(item);
      }
    }
    historyDialog.showModal();
  }

  function showView(name) {
    state.view = name;
    for (const view of $$(".view")) {
      const active = view.id === `${name}-view`;
      view.hidden = !active;
      view.classList.toggle("is-active", active);
    }
    for (const button of $$("[data-view]")) {
      button.classList.toggle("is-active", button.dataset.view === name);
    }
    $$(".mobile-menu").forEach((menu) => menu.removeAttribute("open"));
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showError(error) {
    console.error(error);
    showToast(error.message || String(error), "error", 6200);
  }

  function saveSelection() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      state.savedRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    editor.focus();
    if (!state.savedRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(state.savedRange);
  }

  function insertHtml(html) {
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    markDirty();
    saveSelection();
  }

  function promptValue({ title, description = "", label = "内容", value = "", placeholder = "" }) {
    $("#prompt-title").textContent = title;
    $("#prompt-description").textContent = description;
    $("#prompt-label").textContent = label;
    const input = $("#prompt-input");
    input.value = value;
    input.placeholder = placeholder;
    promptDialog.showModal();
    setTimeout(() => input.focus(), 0);
    return new Promise((resolve) => {
      promptDialog.addEventListener("close", () => {
        resolve(promptDialog.returnValue === "confirm" ? input.value.trim() : null);
      }, { once: true });
    });
  }

  function confirmAction({
    title,
    message,
    confirmLabel = "确认",
    externalLabel = ""
  }) {
    $("#confirm-title").textContent = title;
    $("#confirm-message").textContent = message;
    $("#confirm-button").textContent = confirmLabel;
    const external = $("#dialog-external");
    external.hidden = !externalLabel;
    external.textContent = externalLabel || "使用外链";
    confirmDialog.showModal();
    return new Promise((resolve) => {
      confirmDialog.addEventListener("close", () => resolve(confirmDialog.returnValue || "cancel"), { once: true });
    });
  }

  function sanitizePastedHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    stripUnsafe(template.content);
    template.content.querySelectorAll("img").forEach((image) => image.remove());
    return template.innerHTML;
  }

  function decorateFigure(figure) {
    if (!figure) return;
    if (!figure.classList.contains("figure--full") && !figure.classList.contains("figure--half") && !figure.classList.contains("figure--original")) {
      figure.classList.add("figure--full");
    }
    const image = figure.querySelector("img");
    if (image) image.draggable = false;
    let handle = figure.querySelector(".image-resize");
    if (!handle) {
      handle = makeElement("button", "image-resize");
      handle.type = "button";
      handle.setAttribute("contenteditable", "false");
      handle.setAttribute("aria-label", "拖动调整图片宽度");
      figure.append(handle);
    }
    if (!handle.dataset.bound) {
      handle.dataset.bound = "true";
      handle.addEventListener("pointerdown", startResize);
    }
  }

  function decorateAllFigures() {
    editor.querySelectorAll("figure").forEach(decorateFigure);
  }

  function startResize(event) {
    event.preventDefault();
    const figure = event.currentTarget.closest("figure");
    const editorRect = editor.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = figure.getBoundingClientRect().width;
    figure.classList.remove("figure--half", "figure--original");
    figure.classList.add("figure--full");
    const move = (moveEvent) => {
      const width = Math.min(editorRect.width - 8, Math.max(180, startWidth + moveEvent.clientX - startX));
      figure.style.width = `${Math.round((width / editorRect.width) * 100)}%`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      markDirty();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function selectFigure(figure) {
    state.selectedFigure?.classList.remove("is-selected");
    state.selectedFigure = figure;
    if (!figure) {
      figureTools.hidden = true;
      return;
    }
    figure.classList.add("is-selected");
    figureTools.hidden = false;
  }

  function figureHtml({ src, alt, caption = "", mediaId = "", external = false }) {
    const safeAlt = String(alt || "图片").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const safeSrc = String(src).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<figure class="figure--full"${mediaId ? ` data-media-id="${mediaId}"` : ""}${external ? ' data-external="true"' : ""}><img src="${safeSrc}" alt="${safeAlt}"><figcaption>${caption || ""}</figcaption><button type="button" class="image-resize" contenteditable="false" aria-label="拖动调整图片宽度"></button></figure><p><br></p>`;
  }

  function insertMediaRecord(record) {
    insertHtml(figureHtml({
      src: record.url || `/media/${record.file}`,
      alt: record.originalName || record.file,
      mediaId: record.id
    }));
    decorateAllFigures();
  }

  async function uploadImages(files, { insert = true } = {}) {
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (!images.length) return [];
    const results = [];
    for (const file of images) {
      if (file.size > 15 * 1024 * 1024) {
        showToast(`${file.name} 超过 15 MB。`, "error");
        continue;
      }
      try {
        const response = await fetch("/api/media", {
          method: "POST",
          headers: {
            "Content-Type": file.type,
            "X-File-Name": encodeURIComponent(file.name)
          },
          body: file
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "图片上传失败。");
        results.push(data);
        if (insert) insertMediaRecord(data);
      } catch (error) {
        showError(error);
      }
    }
    await refreshData();
    if (results.length) showToast(`已上传 ${results.length} 张图片。`, "success");
    return results;
  }

  async function insertExternalImage() {
    const imageUrl = await promptValue({
      title: "插入网络图片",
      description: "输入图片地址。默认下载到网站，避免原网站删除图片后失效。",
      label: "图片地址",
      placeholder: "https://your-domain.cn/photo.jpg"
    });
    if (!imageUrl) return;
    const choice = await confirmAction({
      title: "保存这张图片",
      message: "下载进网站更稳定；也可以保留原外链。",
      confirmLabel: "下载并插入",
      externalLabel: "使用外链"
    });
    if (choice === "cancel") return;
    if (choice === "external") {
      insertHtml(figureHtml({
        src: imageUrl,
        alt: imageUrl.split("/").pop() || "网络图片",
        external: true
      }));
      return;
    }
    try {
      const record = await api("/api/media/fetch", {
        method: "POST",
        body: { url: imageUrl }
      });
      insertMediaRecord(record);
    } catch (error) {
      showError(error);
    }
  }

  function videoEmbed(url) {
    try {
      const parsed = new URL(url);
      if (/(^|\.)youtu\.be$/i.test(parsed.hostname)) {
        return `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(parsed.pathname.slice(1))}" title="视频" allowfullscreen></iframe>`;
      }
      if (/(^|\.)youtube\.com$/i.test(parsed.hostname)) {
        const id = parsed.searchParams.get("v");
        if (id) return `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}" title="视频" allowfullscreen></iframe>`;
      }
      if (/(^|\.)bilibili\.com$/i.test(parsed.hostname)) {
        const match = parsed.pathname.match(/\/video\/(BV[\w]+)/i);
        if (match) return `<iframe src="https://player.bilibili.com/player.html?bvid=${encodeURIComponent(match[1])}&page=1&autoplay=0" title="Bilibili 视频" allowfullscreen></iframe>`;
        const avMatch = parsed.pathname.match(/\/video\/av(\d+)/i);
        if (avMatch) return `<iframe src="https://player.bilibili.com/player.html?aid=${avMatch[1]}&page=1&autoplay=0" title="Bilibili 视频" allowfullscreen></iframe>`;
      }
      if (/\.(mp4|webm)(?:$|\?)/i.test(parsed.href)) {
        return `<video src="${parsed.href.replace(/"/g, "&quot;")}" controls preload="metadata"></video>`;
      }
    } catch {
      return "";
    }
    return "";
  }

  async function resolveVideoUrl(url) {
    try {
      const parsed = new URL(url);
      if (/(^|\.)b23\.tv$/i.test(parsed.hostname)) {
        const data = await api("/api/resolve", { method: "POST", body: { url } });
        if (data && data.url) return data.url;
      }
    } catch (error) {
      return url;
    }
    return url;
  }

  async function insertVideo() {
    const url = await promptValue({
      title: "插入视频",
      description: "支持 MP4、WebM、Bilibili（含 b23.tv 短链接）和 YouTube 链接。",
      label: "视频地址",
      placeholder: "https://..."
    });
    if (!url) return;
    const resolved = await resolveVideoUrl(url);
    const embed = videoEmbed(resolved);
    if (!embed) {
      showToast("无法识别这个视频地址。", "error");
      return;
    }
    insertHtml(`${embed}<p><br></p>`);
  }

  function previewDocument() {
    const title = titleInput.value.trim() || "未命名文章";
    const summary = summaryInput.value.trim();
    const clone = cloneEditorForSave();
    for (const image of clone.querySelectorAll("img")) {
      const source = image.getAttribute("src") || "";
      if (source.startsWith("/media/")) image.src = `http://127.0.0.1:1315${source}`;
      if (source && !/^(?:https?:|data:|\/media\/|\/published-assets\/)/i.test(source) && state.editingSlug) {
        image.src = `http://127.0.0.1:1313/post/${encodeURIComponent(state.editingSlug)}/${source}`;
      }
    }
    const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(state.createdAt));
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/[<>&]/g, "")} · 预览</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#090807;color:#f4f6ff;font-family:"SF Pro","Noto Sans CJK SC","Microsoft YaHei UI",sans-serif}
main{width:min(1040px,calc(100% - 40px));margin:0 auto;padding:64px 0 100px}
.meta{color:#c3cce2;font-size:13px}.title{max-width:16ch;margin:18px 0 0;font:800 clamp(48px,7vw,88px)/1 "Noto Serif CJK SC","Songti SC",serif;letter-spacing:-.045em}
.description{max-width:44rem;margin:24px 0 54px;color:#c3cce2;font-size:18px;line-height:1.7}
.content{max-width:72ch;font:18px/1.9 "Noto Serif CJK SC","Songti SC",serif}.content p{text-indent:2em}.content h2,.content h3{line-height:1.3}.content a{color:#8db2ff}.content img{max-width:100%;height:auto;border-radius:10px}.content blockquote{padding-left:20px;border-left:3px solid #8db2ff;color:#c3cce2}.content pre{overflow:auto;padding:18px;border-radius:10px;background:#111;color:#f4f6ff}.content table{width:100%;border-collapse:collapse}.content th,.content td{padding:8px 10px;border:1px solid #2d2925}.content figure{margin:2em auto}.content figure.figure--half{width:50%}.content figure.figure--original{width:auto}.content figcaption{margin-top:8px;color:#c3cce2;font:13px/1.5 sans-serif;text-align:center}.content video,.content iframe{display:block;width:100%;border:0;border-radius:10px}.content iframe{aspect-ratio:16/9}.image-resize{display:none}
@media(max-width:620px){main{width:calc(100% - 32px);padding-top:34px}.title{font-size:46px}.content{font-size:17px}.content figure.figure--half{width:100%}}
</style></head><body><main><div class="meta">${date} · 本地预览</div><h1 class="title">${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</h1>${summary ? `<p class="description">${summary.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : ""}<article class="content">${clone.innerHTML}</article></main></body></html>`;
  }

  async function previewArticle() {
    previewFrame.srcdoc = "<!doctype html><p style='padding:24px;color:#b8c1d5;font-family:sans-serif'>正在生成预览…</p>";
    previewDialog.showModal();
    if (state.dirty) await saveDraft({ silent: true }).catch(() => {});
    previewFrame.srcdoc = previewDocument();
  }

  async function followDeployment(runId, runUrl) {
    if (!runId) {
      publishStatus.textContent = "内容已推送。GitHub 部署通常需要 1–2 分钟。";
      return;
    }
    for (let attempt = 0; attempt < 48; attempt += 1) {
      try {
        const status = await api(`/api/publish/status?runId=${encodeURIComponent(runId)}`);
        if (status.status === "completed") {
          if (status.conclusion === "success") {
            publishStatus.textContent = "部署完成，文章已经上线。";
            showToast("文章已上线。", "success", 5000);
          } else {
            publishStatus.textContent = `部署失败：${status.conclusion || "未知原因"}。`;
            showToast("GitHub 部署失败，请查看运行记录。", "error", 7000);
          }
          return;
        }
        publishStatus.textContent = status.status === "queued" ? "等待 GitHub 构建…" : "正在构建、部署…";
      } catch {
        publishStatus.textContent = "已推送，暂未取得部署状态。";
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    publishStatus.textContent = runUrl
      ? `部署仍在进行：${runUrl}`
      : "部署仍在进行，请稍后刷新线上页面。";
  }

  async function publishArticle() {
    if (!titleInput.value.trim()) {
      titleInput.focus();
      showToast("先填写文章标题。", "error");
      return;
    }
    if (!hasBody()) {
      editor.focus();
      showToast("正文还是空的。", "error");
      return;
    }
    const confirmed = await confirmAction({
      title: "发布这篇文章？",
      message: "系统会先验证 Hugo 构建，再提交并推送到 GitHub。",
      confirmLabel: "现在发布"
    });
    if (confirmed !== "confirm") return;
    const button = $("#publish-article");
    button.disabled = true;
    publishStatus.textContent = "正在保存并验证文章…";
    try {
      const draft = await saveDraft({ silent: true });
      const markdown = htmlToMarkdown();
      publishStatus.textContent = "构建验证中，随后会推送到 GitHub…";
      const result = await api("/api/publish", {
        method: "POST",
        body: {
          draftId: draft?.id || state.draftId,
          editingSlug: state.editingSlug,
          title: titleInput.value.trim(),
          description: summaryInput.value.trim(),
          categories: [categoryInput.value],
          tags: tagsInput.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
          slug: slugInput.value.trim(),
          createdAt: state.createdAt,
          markdown,
          dryRun: new URLSearchParams(location.search).has("dryRun")
        }
      });
      if (result.dryRun) {
        publishStatus.textContent = "发布流程验证通过，本次没有提交或推送。";
        showToast("发布流程验证通过。", "success");
        return;
      }
      state.editingSlug = result.slug;
      state.draftId = null;
      state.dirty = false;
      state.slugTouched = true;
      slugInput.value = result.slug;
      setSaveState("已发布", "saved");
      publishStatus.innerHTML = `<a href="${result.url}" target="_blank" rel="noopener">线上文章</a> · <a href="${result.localUrl}" target="_blank" rel="noopener">本地文章</a>`;
      $("#editor-context").textContent = `已发布 · ${formatDate(new Date())}`;
      await refreshData();
      await followDeployment(result.runId, result.runUrl);
    } catch (error) {
      publishStatus.textContent = error.message;
      showError(error);
      await refreshData().catch(() => {});
    } finally {
      button.disabled = false;
    }
  }

  function applyCommand(button) {
    restoreSelection();
    const command = button.dataset.command;
    const value = button.dataset.value || null;
    document.execCommand(command, false, value);
    markDirty();
    saveSelection();
  }

  function insertLink() {
    promptValue({
      title: "插入链接",
      label: "链接地址",
      placeholder: "https://..."
    }).then((url) => {
      if (!url) return;
      restoreSelection();
      document.execCommand("createLink", false, url);
      markDirty();
    });
  }

  function buildTableHtml(rows, cols) {
    const header = Array.from({ length: cols }, (_, index) => `<th>列${index + 1}</th>`).join("");
    const bodyRow = `<tr>${Array.from({ length: cols }, () => "<td>内容</td>").join("")}</tr>`;
    const body = Array.from({ length: Math.max(0, rows - 1) }, () => bodyRow).join("");
    return `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table><p><br></p>`;
  }

  const FONT_STACKS = {
    serif: '"Noto Serif CJK SC","Songti SC",STSong,serif',
    sans: '"Noto Sans CJK SC","Microsoft YaHei UI",Arial,sans-serif',
    kai: 'KaiTi,STKaiti,"Kaiti SC",serif',
    mono: '"Cascadia Mono",Consolas,monospace'
  };

  function findStyledSpan(range) {
    let node = range.commonAncestorContainer;
    if (node && node.nodeType === 3) node = node.parentElement;
    const span = node ? node.closest("span[data-text-style]") : null;
    if (!span) return null;
    return span.contains(range.startContainer) && span.contains(range.endContainer) ? span : null;
  }

  function explodeStyledSpan(span) {
    const blockSelector = "p,h2,h3,h4,li,td,th,figcaption";
    const blocks = [...span.querySelectorAll(blockSelector)].filter((block) => !block.querySelector(blockSelector));
    if (!blocks.length) return null;
    const styleText = span.getAttribute("style") || "";
    for (const block of blocks) {
      const inner = document.createElement("span");
      inner.setAttribute("data-text-style", "1");
      inner.style.cssText = styleText;
      while (block.firstChild) inner.append(block.firstChild);
      block.append(inner);
    }
    const parent = span.parentNode;
    const first = span.firstElementChild;
    const last = span.lastElementChild;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    span.remove();
    return { first, last };
  }

  function applyTextStyle(property, value) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return false;

    const existing = findStyledSpan(range);
    if (existing && range.toString() === existing.textContent) {
      existing.style[property] = value;
      if (!existing.style.fontSize && !existing.style.fontFamily) {
        const parent = existing.parentNode;
        while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
        existing.remove();
      }
      saveSelection();
      return true;
    }
    if (!value) return false;

    const span = document.createElement("span");
    span.setAttribute("data-text-style", "1");
    span.style[property] = value;
    const fragment = range.extractContents();
    span.append(fragment);
    range.insertNode(span);
    const exploded = explodeStyledSpan(span);
    selection.removeAllRanges();
    const restored = document.createRange();
    if (exploded && exploded.first && exploded.last) {
      restored.setStartBefore(exploded.first);
      restored.setEndAfter(exploded.last);
    } else {
      restored.selectNodeContents(span);
    }
    selection.addRange(restored);
    saveSelection();
    return true;
  }

  function insertTable() {
    saveSelection();
    const rowsInput = $("#table-rows");
    const colsInput = $("#table-cols");
    tableDialog.showModal();
    setTimeout(() => rowsInput.focus(), 0);
    tableDialog.addEventListener("close", () => {
      if (tableDialog.returnValue !== "confirm") return;
      const rows = Math.min(30, Math.max(2, parseInt(rowsInput.value, 10) || 3));
      const cols = Math.min(12, Math.max(1, parseInt(colsInput.value, 10) || 3));
      insertHtml(buildTableHtml(rows, cols));
    }, { once: true });
  }

  function getCaretElement() {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) return null;
    return selection.anchorNode.nodeType === 1
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
  }

  function placeCaretAtEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function appendTableRow(row) {
    const newRow = document.createElement("tr");
    const columns = row.children.length;
    for (let index = 0; index < columns; index += 1) {
      const cell = document.createElement("td");
      cell.textContent = "内容";
      newRow.append(cell);
    }
    row.parentElement.append(newRow);
    return newRow;
  }

  function setFigureWidth(mode) {
    if (!state.selectedFigure) return;
    state.selectedFigure.classList.remove("figure--full", "figure--half", "figure--original");
    state.selectedFigure.style.removeProperty("width");
    const className = mode === "original"
      ? "figure--original"
      : mode === "50"
        ? "figure--half"
        : "figure--full";
    state.selectedFigure.classList.add(className);
    markDirty();
  }

  function toggleCaption() {
    if (!state.selectedFigure) return;
    let caption = state.selectedFigure.querySelector("figcaption");
    if (caption) {
      caption.remove();
    } else {
      caption = document.createElement("figcaption");
      caption.setAttribute("contenteditable", "true");
      caption.textContent = "";
      state.selectedFigure.append(caption);
      caption.focus();
    }
    markDirty();
  }

  function bindEvents() {
    titleInput.addEventListener("input", () => {
      if (!state.slugTouched) slugInput.value = slugValue(titleInput.value);
      markDirty();
    });
    summaryInput.addEventListener("input", markDirty);
    categoryInput.addEventListener("change", markDirty);
    tagsInput.addEventListener("input", markDirty);
    slugInput.addEventListener("input", () => {
      state.slugTouched = true;
      markDirty();
    });

    editor.addEventListener("input", markDirty);
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("focus", () => {
      if (!editor.innerText.trim() && !editor.querySelector("img,video,iframe,table")) {
        editor.innerHTML = "<p><br></p>";
      }
    });
    document.addEventListener("selectionchange", saveSelection);

    editor.addEventListener("paste", (event) => {
      const images = [...(event.clipboardData?.items || [])]
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (images.length) {
        event.preventDefault();
        saveSelection();
        uploadImages(images).catch(showError);
        return;
      }
      const html = event.clipboardData?.getData("text/html");
      if (html) {
        event.preventDefault();
        insertHtml(sanitizePastedHtml(html));
      }
    });

    editor.addEventListener("dragover", (event) => {
      if ([...event.dataTransfer.types].includes("Files")) {
        event.preventDefault();
        editor.classList.add("is-dragging");
      }
    });
    editor.addEventListener("dragleave", () => editor.classList.remove("is-dragging"));
    editor.addEventListener("drop", (event) => {
      if (!event.dataTransfer.files.length) return;
      event.preventDefault();
      editor.classList.remove("is-dragging");
      saveSelection();
      uploadImages(event.dataTransfer.files).catch(showError);
    });

    editor.addEventListener("click", (event) => {
      const figure = event.target.closest("figure");
      if (figure) {
        selectFigure(figure);
      } else if (!event.target.closest("#figure-tools")) {
        selectFigure(null);
      }
    });

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && !event.ctrlKey && !event.metaKey) {
        const caret = getCaretElement();
        const cell = caret ? caret.closest("td, th") : null;
        if (cell) {
          event.preventDefault();
          const table = cell.closest("table");
          const rowsList = Array.from(table.querySelectorAll("tr"));
          const cells = rowsList.flatMap((row) => Array.from(row.children));
          const row = cell.parentElement;
          const lastRow = rowsList[rowsList.length - 1];
          if (!event.shiftKey && row === lastRow && cell === row.lastElementChild) {
            const newRow = appendTableRow(row);
            placeCaretAtEnd(newRow.firstElementChild);
            markDirty();
            return;
          }
          const currentIndex = cells.indexOf(cell);
          const nextIndex = Math.min(cells.length - 1, Math.max(0, currentIndex + (event.shiftKey ? -1 : 1)));
          placeCaretAtEnd(cells[nextIndex]);
          return;
        }
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === "s") {
        event.preventDefault();
        saveDraft().catch(showError);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        previewArticle().catch(showError);
      }
    });

    $$("[data-command]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => applyCommand(button));
    });
    $("#insert-link").addEventListener("click", insertLink);
    $("#insert-image").addEventListener("click", () => {
      saveSelection();
      imageInput.click();
    });
    $("#insert-external-image").addEventListener("click", () => {
      saveSelection();
      insertExternalImage().catch(showError);
    });
    $("#insert-video").addEventListener("click", () => {
      saveSelection();
      insertVideo().catch(showError);
    });
    $("#insert-table").addEventListener("click", insertTable);
    const fontFamilySelect = $("#font-family");
    const fontSizeSelect = $("#font-size");
    [fontFamilySelect, fontSizeSelect].forEach((select) => {
      select.addEventListener("mousedown", () => saveSelection());
      select.addEventListener("change", () => {
        restoreSelection();
        const isSize = select === fontSizeSelect;
        const raw = select.value;
        const value = isSize ? raw : (FONT_STACKS[raw] || "");
        if (applyTextStyle(isSize ? "fontSize" : "fontFamily", value)) {
          markDirty();
        }
      });
    });
    $("#save-draft").addEventListener("click", () => saveDraft().catch(showError));
    $("#preview-article").addEventListener("click", () => previewArticle().catch(showError));
    $("#publish-article").addEventListener("click", publishArticle);
    $("#new-article").addEventListener("click", newArticle);
    $$("[data-new-article]").forEach((button) => button.addEventListener("click", newArticle));

    imageInput.addEventListener("change", () => uploadImages(imageInput.files).finally(() => {
      imageInput.value = "";
    }));
    libraryInput.addEventListener("change", () => uploadImages(libraryInput.files, { insert: false }).finally(() => {
      libraryInput.value = "";
    }));
    $("#library-upload").addEventListener("click", () => libraryInput.click());
    $("#close-media-drawer").addEventListener("click", () => {
      mediaDrawer.hidden = true;
    });
    $("#insert-external-image").addEventListener("contextmenu", (event) => {
      event.preventDefault();
      saveSelection();
      mediaDrawer.hidden = false;
    });

    $$("[data-view]").forEach((button) => {
      button.addEventListener("click", async () => {
        const target = button.dataset.view;
        if (state.view === "editor" && target !== "editor" && state.dirty) {
          await saveDraft({ silent: true }).catch(showError);
        }
        if (target === "media") await refreshData();
        showView(target);
      });
    });

    $$("[data-figure-width]").forEach((button) => {
      button.addEventListener("click", () => setFigureWidth(button.dataset.figureWidth));
    });
    $("#toggle-caption").addEventListener("click", toggleCaption);
    $("#delete-figure").addEventListener("click", () => {
      if (!state.selectedFigure) return;
      state.selectedFigure.remove();
      selectFigure(null);
      markDirty();
    });

    $("#close-history").addEventListener("click", () => historyDialog.close());
    historyDialog.addEventListener("click", (event) => {
      if (event.target === historyDialog) historyDialog.close();
    });
    $("#close-preview").addEventListener("click", () => previewDialog.close());
    previewDialog.addEventListener("click", (event) => {
      if (event.target === previewDialog) previewDialog.close();
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty && !state.savePromise) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  async function init() {
    clearEditor();
    bindEvents();
    try {
      await refreshData();
    } catch (error) {
      showError(error);
    }
  }

  init();
})();
