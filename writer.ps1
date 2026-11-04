# ============================================================
#  写文助手 —— 在浏览器里写博客文章，自动保存到 Hugo 内容目录
#  保存并可一键同步到 GitHub（触发线上自动部署）
#  运行后访问 http://127.0.0.1:1314
# ============================================================
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Add-Type -AssemblyName System.Web
$uploadRoot = Join-Path $root '.writer-uploads'
New-Item -ItemType Directory -Force -Path $uploadRoot | Out-Null

# ---------- 页面模板 ----------
$formHtml = @'
<!DOCTYPE html>
<html lang="zh-cn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>写新文章 · LHW 的博客</title>
<style>
  :root{
    color-scheme:dark;
    --page:#050713;
    --panel:#0b1227;
    --field:#0e1730;
    --line:rgba(210,222,255,.16);
    --text:#f4f6ff;
    --muted:#aeb9da;
    --accent:#6f9cff;
    --success:#67f5d4;
    --danger:#ff8ca3;
  }
  *{box-sizing:border-box}
  body{
    min-height:100vh;
    margin:0;
    padding:32px 20px 64px;
    color:var(--text);
    background:
      radial-gradient(circle at 78% 8%,rgba(75,91,211,.2),transparent 34rem),
      radial-gradient(circle at 16% 72%,rgba(126,68,190,.12),transparent 30rem),
      var(--page);
    font:14px/1.6 "Microsoft YaHei UI","Noto Sans CJK SC",sans-serif;
  }
  a{color:var(--accent);text-underline-offset:3px}
  .app{width:min(1080px,100%);margin:0 auto}
  .topbar{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
  h1{margin:0;font-size:28px;line-height:1.2;letter-spacing:-.03em}
  .sub{max-width:66ch;margin:8px 0 0;color:var(--muted);font-size:13px}
  .preview-link{
    display:inline-flex;min-height:40px;align-items:center;padding:0 15px;
    border:1px solid var(--line);border-radius:10px;text-decoration:none;white-space:nowrap
  }
  .panel{
    padding:24px;
    border:1px solid var(--line);
    border-radius:14px;
    background:rgba(11,18,39,.88);
    box-shadow:0 18px 48px rgba(0,0,0,.24)
  }
  .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .field{margin-bottom:18px}
  .field:last-child{margin-bottom:0}
  label,.field-label{display:block;margin-bottom:7px;color:#dfe5fb;font-size:13px;font-weight:700}
  input[type=text],select,textarea{
    width:100%;border:1px solid var(--line);border-radius:10px;background:var(--field);color:var(--text);
    outline:none;transition:border-color 160ms ease,box-shadow 160ms ease
  }
  input[type=text],select{height:43px;padding:0 12px;font:inherit}
  textarea{
    min-height:480px;padding:16px;resize:vertical;
    font:14px/1.75 Consolas,"Cascadia Mono","Microsoft YaHei UI",monospace;
    caret-color:var(--success)
  }
  input:focus,select:focus,textarea:focus{
    border-color:var(--accent);box-shadow:0 0 0 3px rgba(111,156,255,.16)
  }
  button,.file-button{
    min-height:42px;border:1px solid transparent;border-radius:9px;font:700 13px/1 inherit;cursor:pointer
  }
  button:focus-visible,.file-button:focus-within,a:focus-visible{
    outline:2px solid var(--success);outline-offset:3px
  }
  button:disabled{opacity:.5;cursor:wait}
  .editor-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:22px 0 8px}
  .editor-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .small-button{
    min-height:36px;padding:0 13px;border-color:rgba(111,156,255,.38);
    background:rgba(111,156,255,.12);color:var(--text)
  }
  .small-button:hover{background:rgba(111,156,255,.2)}
  .toolbar-hint,.upload-state{color:var(--muted);font-size:12px}
  .upload-state{min-height:18px}
  .upload-state[data-tone="error"]{color:var(--danger)}
  .upload-state[data-tone="success"]{color:var(--success)}
  .editor-shell{
    position:relative;border:1px solid var(--line);border-radius:12px;background:var(--field);
    transition:border-color 160ms ease,background 160ms ease
  }
  .editor-shell.is-dragging{border-color:var(--success);background:rgba(19,54,63,.62)}
  .editor-shell textarea{border:0;background:transparent;box-shadow:none}
  .editor-shell textarea:focus{box-shadow:none}
  .editor-note{display:flex;justify-content:space-between;gap:16px;margin:8px 2px 0;color:var(--muted);font-size:12px}
  kbd{padding:1px 5px;border:1px solid var(--line);border-radius:4px;background:#111b38;color:var(--text)}
  .image-tray{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px;margin-top:14px}
  .image-tray:empty{display:none}
  .image-chip{
    display:grid;min-height:0;padding:8px;text-align:left;background:#0c1530;border-color:var(--line)
  }
  .image-chip img{width:100%;height:84px;object-fit:cover;border-radius:6px;background:#050713}
  .image-chip span{display:block;margin-top:7px;overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
  .image-chip:hover{border-color:rgba(103,245,212,.5);background:#101c3d}
  .sync-row{
    display:flex;align-items:flex-start;gap:10px;margin-top:20px;padding:13px 15px;
    border:1px solid var(--line);border-radius:10px;background:rgba(111,156,255,.07)
  }
  .sync-row input{margin-top:3px;accent-color:var(--accent)}
  .sync-row span{color:#d8dff4;font-size:13px}
  .bar{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-top:22px}
  .save-button{min-width:148px;padding:0 30px;color:#06101a;background:var(--success)}
  .save-button:hover{background:#8ff9df}
  .shortcut{color:var(--muted);font-size:12px}
  @media (max-width:720px){
    body{padding:20px 14px 44px}
    .topbar{align-items:stretch;flex-direction:column}
    .preview-link{justify-content:center;align-self:flex-start}
    .panel{padding:18px}
    .form-grid{grid-template-columns:1fr;gap:0}
    .editor-head{align-items:flex-start;flex-direction:column}
    .editor-tools{width:100%}
    textarea{min-height:420px}
    .bar{align-items:stretch;flex-direction:column}
    .save-button{width:100%}
  }
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div>
      <h1>写新文章</h1>
      <p class="sub">先把光标放到正文中想插图的位置，再选择图片。图片会随文章一起保存并发布。</p>
    </div>
    <a class="preview-link" href="http://localhost:1313/" target="_blank" rel="noopener">打开博客预览</a>
  </header>

  <form action="/publish" method="post" id="editor-form" class="panel">
    <input id="draft-id" type="hidden" name="draftId">
    <div class="field">
      <label for="title">文章标题</label>
      <input id="title" type="text" name="title" placeholder="例如：2026 年下半年复盘" required>
    </div>

    <div class="form-grid">
      <div class="field">
        <label for="categories">分类</label>
        <input id="categories" type="text" name="categories" placeholder="生活随笔">
      </div>
      <div class="field">
        <label for="tags">标签</label>
        <input id="tags" type="text" name="tags" placeholder="随笔, 总结">
      </div>
      <div class="field">
        <label for="status">状态</label>
        <select id="status" name="status">
          <option value="publish">正式发布</option>
          <option value="draft">存为草稿</option>
        </select>
      </div>
      <div class="field">
        <label for="description">一句话简介</label>
        <input id="description" type="text" name="description" placeholder="可留空">
      </div>
    </div>

    <div class="editor-head">
      <span class="field-label">正文</span>
      <div class="editor-tools">
        <button id="pick-image" class="small-button" type="button">插入图片</button>
        <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden>
        <span class="toolbar-hint">可拖入图片或直接粘贴</span>
        <span id="upload-state" class="upload-state" role="status" aria-live="polite"></span>
      </div>
    </div>

    <div id="drop-zone" class="editor-shell">
      <textarea id="content" name="content" required placeholder="# 文章标题&#10;&#10;正文直接写，支持 Markdown。&#10;&#10;## 二级标题&#10;- 列表项&#10;**加粗**、*斜体*&#10;&gt; 引用"></textarea>
    </div>
    <div class="editor-note">
      <span>图片会插入当前光标位置，可继续移动或删除对应 Markdown。</span>
      <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 保存</span>
    </div>
    <div id="image-tray" class="image-tray" aria-label="本次已插入的图片"></div>

    <label class="sync-row">
      <input type="checkbox" id="autosync" name="autosync" value="1" checked>
      <span>保存并同步到 GitHub。取消勾选则只保存到本地。</span>
    </label>

    <div class="bar">
      <span class="shortcut">图片支持 JPG、PNG、WebP、GIF、AVIF，单张不超过 15 MB。</span>
      <button id="save-button" class="save-button" type="submit">保存文章</button>
    </div>
  </form>
</div>
<script>
(() => {
  const form = document.querySelector("#editor-form");
  const textarea = document.querySelector("#content");
  const pickButton = document.querySelector("#pick-image");
  const fileInput = document.querySelector("#image-input");
  const dropZone = document.querySelector("#drop-zone");
  const tray = document.querySelector("#image-tray");
  const status = document.querySelector("#upload-state");
  const saveButton = document.querySelector("#save-button");
  const draftId = globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  document.querySelector("#draft-id").value = draftId;
  let uploading = false;

  const setStatus = (text, tone = "") => {
    status.textContent = text;
    status.dataset.tone = tone;
  };

  const escapeAlt = (name) => name
    .replace(/\.[^.]+$/, "")
    .replace(/[\[\]()\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "图片";

  const insertBlockAtCursor = (markdown) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const leading = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const trailing = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    textarea.setRangeText(leading + markdown + trailing, start, end, "end");
    textarea.focus();
  };

  const addTrayItem = (file, markdown, previewUrl) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "image-chip";
    button.title = "把这张图片再次插入当前光标位置";

    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = "";

    const label = document.createElement("span");
    label.textContent = file.name;

    button.append(image, label);
    button.addEventListener("click", () => insertBlockAtCursor(markdown));
    tray.append(button);
  };

  const uploadFiles = async (files) => {
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (uploading) return;
    if (!images.length) {
      setStatus("请选择 JPG、PNG、WebP、GIF 或 AVIF 图片", "error");
      return;
    }

    const oversized = images.find((file) => file.size > 15 * 1024 * 1024);
    if (oversized) {
      setStatus(`${oversized.name} 超过 15 MB`, "error");
      return;
    }

    uploading = true;
    pickButton.disabled = true;
    saveButton.disabled = true;
    setStatus(`正在上传 ${images.length} 张图片…`);

    try {
      const marks = [];
      for (const file of images) {
        const query = new URLSearchParams({ draftId, name: file.name });
        const response = await fetch("/upload?" + query, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file
        });

        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error || "图片上传失败");
        }

        const uploaded = await response.json();
        const markdown = `![${escapeAlt(uploaded.name)}]({{image:${uploaded.id}}})`;
        marks.push(markdown);
        addTrayItem(file, markdown, URL.createObjectURL(file));
      }

      insertBlockAtCursor(marks.join("\n\n"));
      setStatus(`已插入 ${marks.length} 张图片`, "success");
    } catch (error) {
      setStatus(error.message || "图片上传失败，请重试", "error");
    } finally {
      uploading = false;
      pickButton.disabled = false;
      saveButton.disabled = false;
      fileInput.value = "";
    }
  };

  pickButton.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => uploadFiles(fileInput.files));

  dropZone.addEventListener("dragover", (event) => {
    if ([...event.dataTransfer.types].includes("Files")) {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    }
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    uploadFiles(event.dataTransfer.files);
  });

  textarea.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.items || [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length) {
      event.preventDefault();
      uploadFiles(files);
    }
  });

  textarea.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      form.requestSubmit();
    }
  });
})();
</script>
</body>
</html>
'@;

# ---------- 工具函数 ----------
function Send-Page($res, $html, $status = 200) {
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
    $res.StatusCode = $status
    $res.ContentType = 'text/html; charset=utf-8'
    $res.ContentLength64 = $buffer.Length
    $res.OutputStream.Write($buffer, 0, $buffer.Length)
    $res.OutputStream.Close()
}

function Send-Json($res, $data, $status = 200) {
    $json = $data | ConvertTo-Json -Compress
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
    $res.StatusCode = $status
    $res.ContentType = 'application/json; charset=utf-8'
    $res.ContentLength64 = $buffer.Length
    $res.OutputStream.Write($buffer, 0, $buffer.Length)
    $res.OutputStream.Close()
}

function New-Slug($title) {
    $s = ($title -replace '[\\/:\*\?"<>\|]', '') -replace '\s+', '-'
    $s = $s.Trim('-', ' ', '.')
    if ($s.Length -eq 0) { $s = 'post-' + (Get-Date -Format 'yyyyMMddHHmmss') }
    if ($s.Length -gt 60) { $s = $s.Substring(0, 60).Trim('-', ' ', '.') }
    return $s
}

function Remove-UploadDraft($draftId) {
    if ($draftId -notmatch '^[a-f0-9-]{8,64}$') { return }
    $basePath = [System.IO.Path]::GetFullPath($uploadRoot)
    $draftPath = [System.IO.Path]::GetFullPath((Join-Path $basePath $draftId))
    $prefix = $basePath.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if ($draftPath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $draftPath)) {
        Remove-Item -LiteralPath $draftPath -Recurse -Force
    }
}

function Copy-UploadedImages($body, $draftId, $articleDir) {
    if ($draftId -notmatch '^[a-f0-9-]{8,64}$') {
        if ($body -match '\{\{image:') { throw '图片上传信息无效，请重新插入图片。' }
        return $body
    }

    $draftDir = Join-Path $uploadRoot $draftId
    if (-not (Test-Path -LiteralPath $draftDir)) {
        if ($body -match '\{\{image:') { throw '找不到已上传的图片，请重新插入。' }
        return $body
    }

    $allowedExtensions = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')
    $pattern = '\{\{image:([a-f0-9]{32})\}\}'
    $imageNames = @{}

    foreach ($match in [regex]::Matches($body, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
        $imageId = $match.Groups[1].Value
        if ($imageNames.ContainsKey($imageId)) { continue }

        $source = Get-ChildItem -LiteralPath $draftDir -File |
            Where-Object { $_.BaseName -eq $imageId -and $allowedExtensions -contains $_.Extension.ToLowerInvariant() } |
            Select-Object -First 1

        if (-not $source) {
            throw "文章引用了不存在或格式不支持的图片：$imageId"
        }

        $fileName = 'image-' + $imageId + $source.Extension.ToLowerInvariant()
        Copy-Item -LiteralPath $source.FullName -Destination (Join-Path $articleDir $fileName) -Force
        $imageNames[$imageId] = $fileName
    }

    foreach ($imageId in $imageNames.Keys) {
        $body = $body.Replace('{{image:' + $imageId + '}}', $imageNames[$imageId])
    }

    if ($body -match '\{\{image:') {
        throw '有图片没有成功插入，请检查 Markdown 中的图片占位符。'
    }

    return $body
}

# 同步到 GitHub：add / commit / push，返回 (成功?, 说明文本[已HtmlEncode])
function Invoke-Sync($note) {
    try {
        $null = & git -C $root add -A 2>&1
        $changed = (& git -C $root status --porcelain 2>&1)
        $commitNote = ''
        if ($changed) {
            $out = & git -C $root commit -m $note 2>&1 | Out-String
            $commitNote = 'commit: ' + $out.Trim()
        } else {
            $commitNote = '没有新的改动需要提交（已是最新的）'
        }
        $pushOut = (& git -C $root push origin main 2>&1) | Out-String
        if ($LASTEXITCODE -eq 0) {
            return $true, ($commitNote + '<br>push: 已推送到 GitHub，网站约 1 分钟后更新 ✅')
        } else {
            $enc = [System.Web.HttpUtility]::HtmlEncode($pushOut)
            return $false, ('push 失败：<pre style="white-space:pre-wrap">' + $enc + '</pre>')
        }
    } catch {
        $msg = [System.Web.HttpUtility]::HtmlEncode([string]$_)
        return $false, ('同步出错：<pre style="white-space:pre-wrap">' + $msg + '</pre>')
    }
}

function Build-ResultPage($title, $stateText, $syncDone, $syncOk, $syncHtml) {
    $safeTitle = [System.Web.HttpUtility]::HtmlEncode($title)
    $syncBlock = ''
    if ($syncDone) {
        $syncBlock = if ($syncOk) {
            '<div class="ok">已同步到 GitHub。文章将在约 1 分钟后出现在 <a href="https://lhw-hh.github.io/" target="_blank">lhw-hh.github.io</a>。</div>'
        } else {
            '<div class="bad">同步 GitHub 失败。' + $syncHtml + '</div>'
        }
    } else {
        $syncBlock = @'
<div class="ok">这篇文章目前只保存在本地。</div>
<form method="post" action="/sync" style="margin:16px 0">
  <button type="submit">同步到 GitHub</button>
</form>
'@
    }
    return @"
<!DOCTYPE html>
<html lang="zh-cn"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{color-scheme:dark}
body{font-family:"Microsoft YaHei UI","Noto Sans CJK SC",sans-serif;background:#050713;color:#f4f6ff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box}
.card{width:min(640px,100%);box-sizing:border-box;background:#0b1227;padding:36px;border:1px solid rgba(210,222,255,.16);border-radius:14px;box-shadow:0 20px 52px rgba(0,0,0,.3)}
h2{margin-top:0;font-size:24px;line-height:1.35}
.ok{font-size:14px;color:#67f5d4;margin-top:14px;line-height:1.8}
.bad{font-size:14px;color:#ff8ca3;margin-top:14px;line-height:1.8}
a{color:#6f9cff;font-weight:700;text-underline-offset:3px}
button{background:#67f5d4;color:#06101a;border:0;padding:11px 24px;border-radius:8px;font:700 14px/1 "Microsoft YaHei UI",sans-serif;cursor:pointer}
button:hover{background:#8ff9df}
button:focus-visible,a:focus-visible{outline:2px solid #fff;outline-offset:3px}
@media(max-width:560px){.card{padding:24px}}
</style></head>
<body><div class="card">
<h2>已保存：《$safeTitle》</h2>
<p>状态：$stateText</p>
$syncBlock
<p>3 秒后自动返回发布台，<a href="http://localhost:1313/" target="_blank">点这里去博客看效果</a></p>
</div></body></html>
"@
}

# ---------- 启动监听 ----------
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://127.0.0.1:1314/')
$listener.Start()
Write-Host '[写文助手] 已启动: http://127.0.0.1:1314' -ForegroundColor Green

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
        if ($req.HttpMethod -eq 'POST' -and $req.Url.AbsolutePath -eq '/upload') {
            $draftId = [string]$req.QueryString['draftId']
            $originalName = [System.IO.Path]::GetFileName([string]$req.QueryString['name'])
            $extension = [System.IO.Path]::GetExtension($originalName).ToLowerInvariant()
            $allowedExtensions = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')

            if ($draftId -notmatch '^[a-f0-9-]{8,64}$') {
                Send-Json $res @{ error = '图片上传会话无效，请刷新页面后重试。' } 400
                continue
            }
            if ([string]::IsNullOrWhiteSpace($originalName) -or $allowedExtensions -notcontains $extension) {
                Send-Json $res @{ error = '只支持 JPG、PNG、WebP、GIF 和 AVIF 图片。' } 415
                continue
            }
            if ($req.ContentLength64 -gt 15MB) {
                Send-Json $res @{ error = '图片不能超过 15 MB。' } 413
                continue
            }

            $draftDir = Join-Path $uploadRoot $draftId
            New-Item -ItemType Directory -Force -Path $draftDir | Out-Null
            $imageId = [guid]::NewGuid().ToString('N')
            $destination = Join-Path $draftDir ($imageId + $extension)
            $inputStream = $req.InputStream
            $fileStream = [System.IO.File]::Open($destination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            $totalBytes = 0

            try {
                $buffer = New-Object byte[] 81920
                while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $totalBytes += $read
                    if ($totalBytes -gt 15MB) {
                        throw '图片不能超过 15 MB。'
                    }
                    $fileStream.Write($buffer, 0, $read)
                }
            }
            finally {
                $fileStream.Dispose()
            }

            if ($totalBytes -eq 0) {
                Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
                Send-Json $res @{ error = '没有收到图片数据。' } 400
                continue
            }

            Send-Json $res @{
                id = $imageId
                name = $originalName
                size = $totalBytes
            }
            Write-Host ("[图片] " + $originalName + " -> " + $imageId) -ForegroundColor DarkCyan
        }
        elseif ($req.HttpMethod -eq 'POST' -and $req.Url.AbsolutePath -eq '/publish') {
            $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
            $raw = $reader.ReadToEnd()
            $form = [System.Web.HttpUtility]::ParseQueryString($raw)

            $title = ([string]$form['title']).Trim()
            $desc  = ([string]$form['description']).Trim()
            $tags  = ([string]$form['tags']).Trim() -split '[,，]' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
            $cats  = ([string]$form['categories']).Trim() -split '[,，]' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
            $draft = ([string]$form['status']) -eq 'draft'
            $body  = ([string]$form['content']).Trim()
            $doSync = ([string]$form['autosync']) -eq '1'
            $draftId = [string]$form['draftId']

            if (-not $title -or -not $body) {
                Send-Page $res '<body style="font-family:sans-serif;padding:40px"><h2>标题和正文都不能为空哦</h2><p><a href="/">返回继续写</a></p></body>'
                continue
            }

            $slug = New-Slug $title
            $dir = Join-Path $root ("content\post\" + $slug)
            New-Item -ItemType Directory -Force $dir | Out-Null
            $body = Copy-UploadedImages $body $draftId $dir

            $date = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
            $fm = New-Object System.Text.StringBuilder
            [void]$fm.AppendLine('---')
            [void]$fm.AppendLine('title: "' + ($title -replace '"', '\"') + '"')
            if ($desc) { [void]$fm.AppendLine('description: "' + ($desc -replace '"', '\"') + '"') }
            [void]$fm.AppendLine('date: ' + $date)
            [void]$fm.AppendLine('draft: ' + $draft.ToString().ToLower())
            if ($cats.Count) {
                [void]$fm.AppendLine('categories:')
                foreach ($c in $cats) { [void]$fm.AppendLine('  - "' + ($c -replace '"', '\"') + '"') }
            }
            if ($tags.Count) {
                [void]$fm.AppendLine('tags:')
                foreach ($t in $tags) { [void]$fm.AppendLine('  - "' + ($t -replace '"', '\"') + '"') }
            }
            [void]$fm.AppendLine('---')
            [void]$fm.AppendLine()
            [void]$fm.Append($body)

            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText((Join-Path $dir 'index.md'), $fm.ToString(), $utf8NoBom)
            Remove-UploadDraft $draftId

            $stateText = if ($draft) { '草稿（保存成功，暂不公开）' } else { '正式发布' }

            $syncDone = $false; $syncOk = $false; $syncHtml = ''
            if ($doSync) {
                $syncDone = $true
                $note = '发布文章：' + $title + '（' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '）'
                $syncOk, $syncHtml = Invoke-Sync $note
            }

            $okPage = Build-ResultPage $title $stateText $syncDone $syncOk $syncHtml
            Send-Page $res $okPage
            Write-Host ("[已保存] " + $slug + " (" + $stateText + " 同步=" + $doSync + ")") -ForegroundColor Cyan
        }
        elseif ($req.HttpMethod -eq 'POST' -and $req.Url.AbsolutePath -eq '/sync') {
            $ok, $html = Invoke-Sync ('手动同步：' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
            $page = Build-ResultPage '手动同步' '已完成' $true $ok $html
            Send-Page $res $page
            Write-Host '[手动同步] git push 已执行' -ForegroundColor Cyan
        }
        elseif ($req.HttpMethod -eq 'GET' -and $req.Url.AbsolutePath -eq '/') {
            Send-Page $res $formHtml
        }
        else {
            Send-Page $res '<h2>404</h2>' 404
        }
    }
    catch {
        Write-Host ("[错误] " + $_) -ForegroundColor Red
        Send-Page $res ('<h2>出错了：' + $_.Exception.Message + '</h2><p><a href="/">返回</a></p>') 500
    }
}
