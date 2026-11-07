import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { createReadStream, existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WRITER_DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(WRITER_DIR, "..");
const PUBLIC_DIR = join(WRITER_DIR, "public");
const CONTENT_DIR = join(ROOT, "content", "post");
const HUGO_EXE = join(ROOT, "tools", "hugo.exe");
const DATA_DIR = process.env.WRITER_DATA_DIR || "E:\\gongzuoqu\\LHWblog-writer-data";
const DRAFTS_DIR = join(DATA_DIR, "drafts");
const MEDIA_DIR = join(DATA_DIR, "media");
const TRASH_DIR = join(DATA_DIR, "trash");
const HISTORY_DIR = join(DATA_DIR, "history");
const MEDIA_INDEX = join(DATA_DIR, "media-index.json");
const PORT = Number(process.env.WRITER_PORT || 1315);
const HOST = "127.0.0.1";
const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_JSON = 25 * 1024 * 1024;
const CATEGORIES = new Set(["生活随笔", "项目进程", "技术报告"]);
const IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"]
]);

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".avif", "image/avif"],
  [".svg", "image/svg+xml"]
]);

await Promise.all(
  [DRAFTS_DIR, MEDIA_DIR, TRASH_DIR, join(HISTORY_DIR, "articles"), join(HISTORY_DIR, "trash")]
    .map((dir) => mkdir(dir, { recursive: true }))
);

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function safeJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON) throw new HttpError(413, "请求内容过大。");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON 格式无效。");
  }
}

async function readBuffer(req, limit = MAX_UPLOAD) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "文件不能超过 15 MB。");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function assertInside(base, target) {
  const root = resolve(base);
  const candidate = resolve(target);
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    throw new HttpError(403, "路径无效。");
  }
  return candidate;
}

function safeSlug(input) {
  const value = String(input || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}[\]]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "")
    .slice(0, 72);
  return value || `post-${Date.now()}`;
}

function validDraftId(id) {
  return /^[0-9a-f-]{20,64}$/i.test(String(id || ""));
}

function atomicJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  return writeFile(temp, JSON.stringify(value, null, 2), "utf8")
    .then(() => rename(temp, file))
    .catch(async (error) => {
      await rm(temp, { force: true }).catch(() => {});
      throw error;
    });
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((item) => item.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function parseFrontMatter(source) {
  if (!source.startsWith("---")) {
    return { data: {}, body: source };
  }
  const end = source.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: source };
  const matter = source.slice(source.indexOf("\n") + 1, end);
  const body = source.slice(end + 4).replace(/^\r?\n/, "");
  const data = {};
  let listKey = null;
  for (const original of matter.split(/\r?\n/)) {
    const line = original.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && listKey) {
      data[listKey].push(parseScalar(listMatch[1]));
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const [, key, raw = ""] = match;
    if (!raw.trim()) {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = parseScalar(raw);
      listKey = null;
    }
  }
  return { data, body };
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function frontMatter(article) {
  const lines = ["---", `title: ${yamlString(article.title)}`];
  if (article.description) lines.push(`description: ${yamlString(article.description)}`);
  lines.push(`date: ${article.createdAt}`);
  if (article.updatedAt && article.updatedAt !== article.createdAt) {
    lines.push(`lastmod: ${article.updatedAt}`);
  }
  lines.push(`draft: ${article.draft ? "true" : "false"}`);
  if (article.categories?.length) {
    lines.push("categories:");
    for (const category of article.categories) lines.push(`  - ${yamlString(category)}`);
  }
  if (article.tags?.length) {
    lines.push("tags:");
    for (const tag of article.tags) lines.push(`  - ${yamlString(tag)}`);
  }
  for (const [key, value] of Object.entries(article.extra || {})) {
    if (["title", "description", "date", "lastmod", "draft", "categories", "tags"].includes(key)) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      value.forEach((item) => lines.push(`  - ${yamlString(item)}`));
    } else {
      lines.push(`${key}: ${yamlString(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function arrays(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeDate(value, fallback = new Date().toISOString()) {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

async function listDrafts() {
  const files = (await readdir(DRAFTS_DIR).catch(() => [])).filter((name) => name.endsWith(".json"));
  const drafts = [];
  for (const name of files) {
    const item = safeJson(await readFile(join(DRAFTS_DIR, name), "utf8").catch(() => ""));
    if (!item) continue;
    drafts.push({
      id: item.id,
      title: item.title || "未命名草稿",
      category: item.categories?.[0] || "",
      updatedAt: item.updatedAt,
      editingSlug: item.editingSlug || null,
      wordCount: item.wordCount || 0
    });
  }
  return drafts.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function readDraft(id) {
  if (!validDraftId(id)) throw new HttpError(400, "草稿编号无效。");
  const file = join(DRAFTS_DIR, `${id}.json`);
  const data = safeJson(await readFile(file, "utf8").catch(() => ""));
  if (!data) throw new HttpError(404, "没有找到这篇草稿。");
  return data;
}

async function saveDraft(input) {
  let id = input.id;
  let existing = null;
  if (validDraftId(id)) {
    existing = safeJson(await readFile(join(DRAFTS_DIR, `${id}.json`), "utf8").catch(() => ""));
  } else {
    id = randomUUID();
  }
  const now = new Date().toISOString();
  const draft = {
    id,
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    categories: arrays(input.categories),
    tags: arrays(input.tags),
    slug: safeSlug(input.slug || input.title),
    bodyHtml: String(input.bodyHtml || ""),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    editingSlug: input.editingSlug || existing?.editingSlug || null,
    wordCount: Number(input.wordCount || 0)
  };
  await atomicJson(join(DRAFTS_DIR, `${id}.json`), draft);
  return draft;
}

async function loadMediaIndex() {
  const index = safeJson(await readFile(MEDIA_INDEX, "utf8").catch(() => ""), {});
  return index && typeof index === "object" ? index : {};
}

async function listMedia() {
  const index = await loadMediaIndex();
  return Object.values(index).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function articleFile(slug) {
  const clean = safeSlug(slug);
  const dir = assertInside(CONTENT_DIR, join(CONTENT_DIR, clean));
  return { slug: clean, dir, file: join(dir, "index.md") };
}

async function listArticles() {
  const entries = await readdir(CONTENT_DIR, { withFileTypes: true }).catch(() => []);
  const articles = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(CONTENT_DIR, entry.name, "index.md");
    const source = await readFile(file, "utf8").catch(() => "");
    if (!source) continue;
    const parsed = parseFrontMatter(source);
    articles.push({
      slug: entry.name,
      title: String(parsed.data.title || entry.name),
      description: String(parsed.data.description || ""),
      date: normalizeDate(parsed.data.date),
      lastmod: parsed.data.lastmod ? normalizeDate(parsed.data.lastmod) : null,
      draft: parsed.data.draft === true,
      categories: arrays(parsed.data.categories),
      tags: arrays(parsed.data.tags)
    });
  }
  return articles.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function readArticle(slug) {
  const { slug: clean, file } = await articleFile(slug);
  const source = await readFile(file, "utf8").catch(() => "");
  if (!source) throw new HttpError(404, "没有找到这篇文章。");
  const parsed = parseFrontMatter(source);
  return {
    slug: clean,
    title: String(parsed.data.title || clean),
    description: String(parsed.data.description || ""),
    date: normalizeDate(parsed.data.date),
    lastmod: parsed.data.lastmod ? normalizeDate(parsed.data.lastmod) : null,
    draft: parsed.data.draft === true,
    categories: arrays(parsed.data.categories),
    tags: arrays(parsed.data.tags),
    markdown: parsed.body,
    extra: parsed.data
  };
}

async function snapshotArticle(slug) {
  const { dir, file } = await articleFile(slug);
  if (!existsSync(file)) return null;
  const folder = join(HISTORY_DIR, "articles", slug);
  await mkdir(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = join(folder, stamp);
  await mkdir(snapshotDir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await copyFile(join(dir, entry.name), join(snapshotDir, entry.name));
  }
  return stamp;
}

async function restoreSnapshot(slug, snapshot) {
  const sourceDir = assertInside(join(HISTORY_DIR, "articles"), join(HISTORY_DIR, "articles", slug, snapshot));
  if (!existsSync(sourceDir)) throw new HttpError(404, "没有找到这个历史版本。");
  const { dir } = await articleFile(slug);
  await mkdir(dir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await copyFile(join(sourceDir, entry.name), join(dir, entry.name));
  }
}

async function listSnapshots(slug) {
  const { clean } = await articleFile(slug);
  const folder = join(HISTORY_DIR, "articles", clean);
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
}

async function moveToTrash(type, item) {
  const id = randomUUID();
  const record = {
    id,
    type,
    title: item.title,
    deletedAt: new Date().toISOString(),
    payload: item
  };
  await atomicJson(join(TRASH_DIR, `${id}.json`), record);
  return record;
}

async function trashArticle(slug) {
  const article = await readArticle(slug);
  const { dir } = await articleFile(slug);
  const archive = join(HISTORY_DIR, "trash", `${Date.now()}-${slug}`);
  await mkdir(archive, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await copyFile(join(dir, entry.name), join(archive, entry.name));
  }
  await rm(dir, { recursive: true, force: true });
  return moveToTrash("article", { ...article, archive });
}

async function listTrash() {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const files = (await readdir(TRASH_DIR).catch(() => [])).filter((name) => name.endsWith(".json"));
  const records = [];
  for (const file of files) {
    const full = join(TRASH_DIR, file);
    const record = safeJson(await readFile(full, "utf8").catch(() => ""));
    if (!record) continue;
    if (new Date(record.deletedAt).getTime() < cutoff) {
      await rm(full, { force: true });
      continue;
    }
    records.push({
      id: record.id,
      type: record.type,
      title: record.title || "无标题",
      deletedAt: record.deletedAt
    });
  }
  return records.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

async function restoreTrash(id) {
  if (!validDraftId(id)) throw new HttpError(400, "回收站编号无效。");
  const recordFile = join(TRASH_DIR, `${id}.json`);
  const record = safeJson(await readFile(recordFile, "utf8").catch(() => ""));
  if (!record) throw new HttpError(404, "没有找到这条回收站记录。");
  if (record.type === "draft") {
    const draft = record.payload;
    await atomicJson(join(DRAFTS_DIR, `${draft.id}.json`), draft);
    await rm(recordFile, { force: true });
    return { restored: true };
  } else if (record.type === "article") {
    const { dir } = await articleFile(record.payload.slug);
    await mkdir(dir, { recursive: true });
    const entries = await readdir(record.payload.archive, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      await copyFile(join(record.payload.archive, entry.name), join(dir, entry.name));
    }
    await validateHugo();
    const publish = await publishGit(record.payload);
    await rm(recordFile, { force: true });
    return { restored: true, ...publish };
  }
  throw new HttpError(400, "回收站记录类型无效。");
}

async function saveDraftToTrash(id) {
  const draft = await readDraft(id);
  await moveToTrash("draft", draft);
  await rm(join(DRAFTS_DIR, `${id}.json`), { force: true });
}

async function mediaRecordForUrl(url) {
  const match = String(url || "").match(/\/media\/([^/?#]+)(?:[?#].*)?$/);
  if (!match) return null;
  const file = match[1];
  const index = await loadMediaIndex();
  const entry = Object.values(index).find((item) => item.file === file || item.id === file);
  return entry ? { ...entry, url: `/media/${entry.file}` } : null;
}

async function materializeMedia(markdown, articleDir) {
  const mediaMatches = [...String(markdown).matchAll(/\/media\/([^/\s)"'<>]+)/g)];
  const unique = [...new Set(mediaMatches.map((match) => decodeURIComponent(match[1])))];
  const replacements = new Map();
  for (const fileOrId of unique) {
    const index = await loadMediaIndex();
    const entry = Object.values(index).find((item) => item.file === fileOrId || item.id === fileOrId);
    if (!entry) continue;
    const extension = extname(entry.file).toLowerCase();
    const targetName = `image-${entry.id.slice(0, 12)}${extension}`;
    await copyFile(join(MEDIA_DIR, entry.file), join(articleDir, targetName));
    replacements.set(fileOrId, targetName);
  }
  let result = markdown;
  for (const [from, to] of replacements) {
    result = result.split(`/media/${from}`).join(to);
  }
  return result;
}

function validateArticle(input) {
  const title = String(input.title || "").trim();
  if (!title) throw new HttpError(400, "文章标题不能为空。");
  if (title.length > 120) throw new HttpError(400, "文章标题不能超过 120 个字符。");
  const categories = arrays(input.categories);
  if (categories.length !== 1 || !CATEGORIES.has(categories[0])) {
    throw new HttpError(400, "请选择生活随笔、项目进程或技术报告其中一个分类。");
  }
  const markdown = String(input.markdown || "").trim();
  if (!markdown) throw new HttpError(400, "正文不能为空。");
  if (/<script\b|on(?:error|load|click)\s*=|<style\b/i.test(markdown)) {
    throw new HttpError(400, "正文包含不安全的 HTML。");
  }
  return {
    title,
    description: String(input.description || "").trim(),
    categories,
    tags: arrays(input.tags),
    slug: safeSlug(input.slug || title),
    markdown,
    createdAt: normalizeDate(input.createdAt),
    updatedAt: new Date().toISOString(),
    editingSlug: input.editingSlug ? safeSlug(input.editingSlug) : null
  };
}

async function writeArticle(input) {
  const article = validateArticle(input);
  const targetSlug = article.editingSlug || article.slug;
  const { dir, file } = await articleFile(targetSlug);
  let oldSource = "";
  if (existsSync(file)) oldSource = await readFile(file, "utf8");
  const oldParsed = oldSource ? parseFrontMatter(oldSource) : { data: {} };
  const createdAt = oldParsed.data.date ? normalizeDate(oldParsed.data.date) : article.createdAt;
  const changed = oldSource && oldParsed.body.trim() !== article.markdown.trim()
    || String(oldParsed.data.title || "") !== article.title;
  const lastmod = oldSource && changed ? new Date().toISOString() : oldParsed.data.lastmod;
  await mkdir(dir, { recursive: true });
  const markdown = await materializeMedia(article.markdown, dir);
  const output = frontMatter({
    ...article,
    createdAt,
    updatedAt: lastmod,
    draft: Boolean(input.draft),
    extra: oldParsed.data
  }) + markdown.trimEnd() + "\n";
  await writeFile(file, output, "utf8");
  return { ...article, slug: targetSlug, dir, file, oldSource, createdAt, lastmod };
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      windowsHide: true,
      env: process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    const max = options.maxOutput || 200000;
    child.stdout.on("data", (chunk) => {
      if (stdout.length < max) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < max) stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} 超时`));
    }, options.timeout || 120000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function validateHugo() {
  const result = await run(HUGO_EXE, ["--minify", "--renderToMemory", "--noBuildLock"], {
    cwd: ROOT,
    timeout: 120000
  });
  if (result.code !== 0) {
    throw new HttpError(422, `Hugo 构建失败：${(result.stderr || result.stdout).trim().slice(-1800)}`);
  }
}

function canConnect(host, port, timeout = 400) {
  return new Promise((resolvePromise) => {
    const socket = connect({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolvePromise(ok);
    };
    socket.setTimeout(timeout, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

const PROXY_PORTS = [21827, 7897, 7890, 7891, 10809, 10808, 1080, 2080];

async function pushWithFallbacks() {
  const attempts = [
    {
      label: "direct",
      timeout: 45000,
      args: ["-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=20", "push", "origin", "main"]
    }
  ];
  for (const port of PROXY_PORTS) {
    if (!(await canConnect("127.0.0.1", port))) continue;
    const proxy = `http://127.0.0.1:${port}`;
    attempts.push({
      label: `proxy ${port}`,
      timeout: 120000,
      args: [
        "-c", `http.proxy=${proxy}`,
        "-c", `https.proxy=${proxy}`,
        "-c", "http.lowSpeedLimit=1000",
        "-c", "http.lowSpeedTime=20",
        "push", "origin", "main"
      ]
    });
  }
  attempts.push({
    label: "ssh",
    timeout: 45000,
    args: ["push", "ssh://git@ssh.github.com:443/LHW-HH/LHW-HH.github.io.git", "main"]
  });

  let last = null;
  for (const attempt of attempts) {
    last = await git(attempt.args, attempt.timeout);
    if (last.code === 0) return { ok: true, via: attempt.label };
  }
  return { ok: false, stdout: last?.stdout || "", stderr: last?.stderr || "" };
}

async function git(args, timeout = 120000) {
  return run("git", ["-c", `safe.directory=${ROOT}`, "-C", ROOT, ...args], { timeout });
}

async function publishGit(article) {
  const add = await git(["add", "--", `content/post/${article.slug}`]);
  if (add.code !== 0) throw new Error(add.stderr || "Git add 失败");
  const status = await git(["status", "--porcelain", "--", `content/post/${article.slug}`]);
  if (status.stdout.trim()) {
    const commit = await git([
      "commit",
      "-m",
      `发布文章：${article.title}`,
      "--",
      `content/post/${article.slug}`
    ]);
    if (commit.code !== 0) throw new Error(commit.stderr || commit.stdout || "Git commit 失败");
  }

  const ahead = await git(["rev-list", "--count", "origin/main..main"]);
  const pending = Number((ahead.stdout || "0").trim()) || 0;
  if (!status.stdout.trim() && pending === 0) {
    return { pushed: false, message: "内容没有变化，无需再次发布。", runId: null };
  }

  const pushed = await pushWithFallbacks();
  if (!pushed.ok) {
    throw new Error(pushed.stderr || pushed.stdout || "Git push 失败");
  }

  const latest = await run("gh", [
    "run",
    "list",
    "--repo",
    "LHW-HH/LHW-HH.github.io",
    "--workflow",
    "deploy.yml",
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion,url,headSha"
  ], { cwd: ROOT, timeout: 30000 });
  const runs = latest.code === 0 ? safeJson(latest.stdout, []) : [];
  return {
    pushed: true,
    message: "已推送到 GitHub，正在等待网站部署。",
    runId: runs?.[0]?.databaseId || null,
    runUrl: runs?.[0]?.url || null
  };
}

async function getRunStatus(runId) {
  if (!runId) return { status: "unknown", conclusion: null };
  const result = await run("gh", [
    "run",
    "view",
    String(runId),
    "--repo",
    "LHW-HH/LHW-HH.github.io",
    "--json",
    "status,conclusion,url,headSha"
  ], { cwd: ROOT, timeout: 30000 });
  if (result.code !== 0) throw new HttpError(502, result.stderr || "无法读取部署状态。");
  return safeJson(result.stdout, { status: "unknown" });
}

async function saveMedia(buffer, mimeType, originalName) {
  const extension = IMAGE_TYPES.get(mimeType);
  if (!extension) throw new HttpError(415, "只支持 JPG、PNG、WebP、GIF 和 AVIF 图片。");
  if (!buffer.length) throw new HttpError(400, "没有收到图片数据。");
  const hash = createHash("sha256").update(buffer).digest("hex");
  const index = await loadMediaIndex();
  const existing = Object.values(index).find((item) => item.hash === hash);
  if (existing) return existing;
  const id = randomUUID();
  const base = String(originalName || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "image";
  const file = `${id.slice(0, 12)}-${base}${extension}`;
  await writeFile(join(MEDIA_DIR, file), buffer);
  const record = {
    id,
    file,
    originalName: String(originalName || file).slice(0, 160),
    mimeType,
    size: buffer.length,
    hash,
    createdAt: new Date().toISOString()
  };
  index[id] = record;
  await atomicJson(MEDIA_INDEX, index);
  return record;
}

async function resolveRedirect(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, "链接地址无效。");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "只允许 HTTP 或 HTTPS 链接。");
  }
  if (!/(^|\.)b23\.tv$/i.test(parsed.hostname)) {
    throw new HttpError(400, "只支持 b23.tv 短链接的解析。");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    return { url: response.url };
  } catch (error) {
    throw new HttpError(422, `链接解析失败：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRemoteImage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, "图片地址无效。");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "只允许 HTTP 或 HTTPS 图片地址。");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "LHW-Blog-Writer/1.0" }
    });
    if (!response.ok) throw new HttpError(422, `图片下载失败：HTTP ${response.status}`);
    const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!IMAGE_TYPES.has(type)) throw new HttpError(415, "这个地址不是受支持的图片格式。");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_UPLOAD) throw new HttpError(413, "图片不能超过 15 MB。");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_UPLOAD) throw new HttpError(413, "图片不能超过 15 MB。");
    const pathname = decodeURIComponent(parsed.pathname.split("/").pop() || "image");
    return saveMedia(buffer, type, pathname);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, `图片下载失败：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function serveFile(res, file, cache = "no-store") {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("not file");
    res.writeHead(200, {
      "Content-Type": MIME.get(extname(file).toLowerCase()) || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": cache
    });
    createReadStream(file).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, root: ROOT, dataDir: DATA_DIR });
  }

  if (req.method === "GET" && pathname === "/api/state") {
    return sendJson(res, 200, {
      drafts: await listDrafts(),
      articles: await listArticles(),
      media: await listMedia(),
      trash: await listTrash(),
      categories: [...CATEGORIES]
    });
  }

  if (req.method === "GET" && pathname === "/api/drafts") {
    return sendJson(res, 200, { drafts: await listDrafts() });
  }

  if (req.method === "GET" && pathname.startsWith("/api/drafts/")) {
    return sendJson(res, 200, await readDraft(pathname.slice("/api/drafts/".length)));
  }

  if (req.method === "POST" && pathname === "/api/drafts") {
    return sendJson(res, 200, await saveDraft(await readJson(req)));
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/drafts/")) {
    await saveDraftToTrash(pathname.slice("/api/drafts/".length));
    return sendJson(res, 200, { movedToTrash: true });
  }

  if (req.method === "GET" && pathname === "/api/articles") {
    return sendJson(res, 200, { articles: await listArticles() });
  }

  if (req.method === "GET" && pathname.startsWith("/api/articles/") && !pathname.includes("/history")) {
    return sendJson(res, 200, await readArticle(pathname.slice("/api/articles/".length)));
  }

  if (req.method === "GET" && pathname.match(/^\/api\/articles\/[^/]+\/history$/)) {
    const slug = pathname.split("/")[3];
    return sendJson(res, 200, { snapshots: await listSnapshots(slug) });
  }

  if (req.method === "POST" && pathname.match(/^\/api\/articles\/[^/]+\/restore$/)) {
    const parts = pathname.split("/");
    const { snapshot } = await readJson(req);
    await restoreSnapshot(parts[3], snapshot);
    return sendJson(res, 200, { restored: true });
  }

  if (req.method === "POST" && pathname.match(/^\/api\/articles\/[^/]+\/visibility$/)) {
    const slug = pathname.split("/")[3];
    const article = await readArticle(slug);
    await snapshotArticle(slug);
    const { file } = await articleFile(slug);
    const parsed = parseFrontMatter(await readFile(file, "utf8"));
    parsed.data.draft = !article.draft;
    await writeFile(file, frontMatter({
      title: String(parsed.data.title || article.title),
      description: String(parsed.data.description || ""),
      createdAt: normalizeDate(parsed.data.date),
      updatedAt: new Date().toISOString(),
      draft: parsed.data.draft,
      categories: arrays(parsed.data.categories),
      tags: arrays(parsed.data.tags),
      extra: parsed.data
    }) + parsed.body.trimEnd() + "\n", "utf8");
    const result = await publishGit({ ...article, slug });
    return sendJson(res, 200, { draft: parsed.data.draft, ...result });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/articles/")) {
    const record = await trashArticle(pathname.slice("/api/articles/".length));
    let publish;
    try {
      publish = await publishGit(record.payload);
    } catch (error) {
      throw new HttpError(502, `文章已移入回收站，但 GitHub 删除发布失败：${error.message}`);
    }
    return sendJson(res, 200, { movedToTrash: true, id: record.id, ...publish });
  }

  if (req.method === "GET" && pathname === "/api/trash") {
    return sendJson(res, 200, { trash: await listTrash() });
  }

  if (req.method === "POST" && pathname.match(/^\/api\/trash\/[^/]+\/restore$/)) {
    const id = pathname.split("/")[3];
    return sendJson(res, 200, await restoreTrash(id));
  }

  if (req.method === "GET" && pathname === "/api/media") {
    return sendJson(res, 200, { media: await listMedia() });
  }

  if (req.method === "POST" && pathname === "/api/media") {
    const buffer = await readBuffer(req);
    const mimeType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
    const originalName = decodeURIComponent(String(req.headers["x-file-name"] || "image"));
    const record = await saveMedia(buffer, mimeType, originalName);
    return sendJson(res, 200, { ...record, url: `/media/${record.file}` });
  }

  if (req.method === "POST" && pathname === "/api/resolve") {
    const { url: target } = await readJson(req);
    return sendJson(res, 200, await resolveRedirect(target));
  }

  if (req.method === "POST" && pathname === "/api/media/fetch") {
    const { url: imageUrl } = await readJson(req);
    const record = await fetchRemoteImage(String(imageUrl || ""));
    return sendJson(res, 200, { ...record, url: `/media/${record.file}` });
  }

  if (req.method === "POST" && pathname === "/api/publish") {
    const input = await readJson(req);
    const snapshot = input.editingSlug ? await snapshotArticle(String(input.editingSlug)) : null;
    let article;
    try {
      article = await writeArticle(input);
      await validateHugo();
      if (input.dryRun === true) {
        if (snapshot) {
          await restoreSnapshot(String(input.editingSlug), snapshot);
        } else if (article?.dir) {
          await rm(article.dir, { recursive: true, force: true });
        }
        return sendJson(res, 200, {
          ok: true,
          dryRun: true,
          slug: article.slug,
          url: `https://lhw-hh.github.io/post/${encodeURIComponent(article.slug)}/`,
          localUrl: `http://127.0.0.1:1313/post/${encodeURIComponent(article.slug)}/`,
          pushed: false
        });
      }
    } catch (error) {
      if (snapshot) await restoreSnapshot(String(input.editingSlug), snapshot).catch(() => {});
      else if (article?.dir) await rm(article.dir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    let publish;
    try {
      publish = await publishGit(article);
    } catch (error) {
      throw new HttpError(502, `文章已保存到本地，但 GitHub 发布失败：${error.message}`);
    }
    if (publish.pushed && input.draftId && validDraftId(input.draftId)) {
      await rm(join(DRAFTS_DIR, `${input.draftId}.json`), { force: true }).catch(() => {});
    }
    return sendJson(res, 200, {
      ok: true,
      slug: article.slug,
      url: `https://lhw-hh.github.io/post/${encodeURIComponent(article.slug)}/`,
      localUrl: `http://127.0.0.1:1313/post/${encodeURIComponent(article.slug)}/`,
      snapshot,
      ...publish
    });
  }

  if (req.method === "GET" && pathname === "/api/publish/status") {
    return sendJson(res, 200, await getRunStatus(url.searchParams.get("runId")));
  }

  if (req.method === "GET" && pathname.startsWith("/media/")) {
    const file = pathname.slice("/media/".length);
    return serveFile(res, assertInside(MEDIA_DIR, join(MEDIA_DIR, file)), "public, max-age=3600");
  }

  if (req.method === "GET" && pathname.startsWith("/published-assets/")) {
    const [, , slug, ...parts] = pathname.split("/");
    const { dir } = await articleFile(slug);
    return serveFile(res, assertInside(dir, join(dir, parts.join("/"))));
  }

  if (req.method === "GET" && pathname === "/") {
    return serveFile(res, join(PUBLIC_DIR, "index.html"));
  }

  if (req.method === "GET") {
    const file = assertInside(PUBLIC_DIR, join(PUBLIC_DIR, pathname.replace(/^\/+/, "")));
    return serveFile(res, file);
  }

  throw new HttpError(404, "Not found");
}

await Promise.all([mkdir(DATA_DIR, { recursive: true }), mkdir(PUBLIC_DIR, { recursive: true })]);

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(`[writer] ${req.method} ${req.url}`, error);
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
    } else {
      sendJson(res, 500, { error: error.message || "服务器内部错误。" });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[writer] http://${HOST}:${PORT}`);
  console.log(`[writer] site: ${ROOT}`);
  console.log(`[writer] data: ${DATA_DIR}`);
});
