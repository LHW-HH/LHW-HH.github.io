# ============================================================
#  写文助手 —— 在浏览器里写博客文章，自动保存到 Hugo 内容目录
#  保存并可一键同步到 GitHub（触发线上自动部署）
#  运行后访问 http://127.0.0.1:1314
# ============================================================
$ErrorActionPreference = 'Stop'
$root = 'F:\opencode\LHWblog'
Add-Type -AssemblyName System.Web

# ---------- 页面模板 ----------
$formHtml = @'
<!DOCTYPE html>
<html lang="zh-cn">
<head>
<meta charset="utf-8">
<title>写文助手 · LHW 的博客</title>
<style>
  body{font-family:"Microsoft YaHei",sans-serif;background:#f6f6fb;margin:0;color:#333}
  .wrap{max-width:860px;margin:28px auto 60px;padding:0 20px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#888;font-size:13px;margin-bottom:22px}
  .card{background:#fff;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.07);padding:26px 30px}
  label{display:block;font-size:13px;color:#666;margin:14px 0 6px;font-weight:600}
  input[type=text],select{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px}
  textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:14px;
    font-family:Consolas,"Microsoft YaHei",monospace;height:420px;resize:vertical;line-height:1.7}
  .row{display:flex;gap:14px}.row>div{flex:1}
  .bar{display:flex;justify-content:space-between;align-items:center;margin-top:20px}
  button{background:#4a6cf7;color:#fff;border:none;padding:11px 34px;border-radius:8px;font-size:15px;cursor:pointer}
  button:hover{background:#3a5af0}
  .hint{font-size:12px;color:#999}
  .md{font-size:12px;color:#999;line-height:1.9}
  .md code{background:#eee;padding:1px 5px;border-radius:4px}
  .chk{display:flex;align-items:center;gap:8px;margin-top:18px;padding:10px 14px;background:#f0f4ff;border-radius:8px}
  .chk input{width:auto}
  .chk span{font-size:13px;color:#555}
</style>
</head>
<body>
<div class="wrap">
  <h1>✍️ 写文助手</h1>
  <div class="sub">保存后文章立刻出现在 <a href="http://localhost:1313/" target="_blank">本地博客预览</a>；勾选同步则一分钟内上线到 https://lhw-hh.github.io</div>
  <form action="/publish" method="post" class="card">
    <label>文章标题 *</label>
    <input type="text" name="title" placeholder="例如：2026 年下半年复盘" required>

    <div class="row">
      <div>
        <label>分类（多个用逗号隔开）</label>
        <input type="text" name="categories" placeholder="例如：起点">
      </div>
      <div>
        <label>标签（多个用逗号隔开）</label>
        <input type="text" name="tags" placeholder="例如：随笔, 总结">
      </div>
    </div>

    <div class="row">
      <div>
        <label>状态</label>
        <select name="status">
          <option value="publish">正式发布</option>
          <option value="draft">存为草稿（自己能看到，暂不公开）</option>
        </select>
      </div>
      <div>
        <label>一句话简介（列表页展示，可留空）</label>
        <input type="text" name="description" placeholder="可留空">
      </div>
    </div>

    <label>正文（Markdown 格式）*</label>
    <textarea name="content" placeholder="# 开头写一级标题&#10;&#10;正文直接写，支持 Markdown：&#10;&#10;## 二级标题&#10;- 列表项&#10;**加粗**、*斜体*&#10;&gt; 引用&#10;&#10;```&#10;代码块&#10;```" required></textarea>

    <div class="chk">
      <input type="checkbox" id="autosync" name="autosync" value="1" checked>
      <span>⭐ 保存并同步到 GitHub（约 1 分钟后文章上线到 https://lhw-hh.github.io；不勾则仅保存到本地，之后可在保存成功页手动同步）</span>
    </div>

    <div class="bar">
      <span class="md">常用语法：<code># 标题</code>　<code>- 列表</code>　<code>**加粗**</code>　<code>&gt; 引用</code>　<code>[文字](网址)</code>　<code>![图](图片网址)</code></span>
      <button type="submit">保 存</button>
    </div>
  </form>
</div>
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

function New-Slug($title) {
    $s = ($title -replace '[\\/:\*\?"<>\|]', '') -replace '\s+', '-'
    $s = $s.Trim('-', ' ', '.')
    if ($s.Length -eq 0) { $s = 'post-' + (Get-Date -Format 'yyyyMMddHHmmss') }
    if ($s.Length -gt 60) { $s = $s.Substring(0, 60).Trim('-', ' ', '.') }
    return $s
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
    $syncBlock = ''
    if ($syncDone) {
        $syncBlock = if ($syncOk) {
            '<div class="ok">🚀 已同步到 GitHub：文章将在约 1 分钟后出现在 <a href="https://lhw-hh.github.io/" target="_blank">lhw-hh.github.io</a></div>'
        } else {
            '<div class="bad">⚠️ 同步 GitHub 失败' + $syncHtml + '</div>'
        }
    } else {
        $syncBlock = @'
<div class="ok">📌 这篇文章目前只在本地。想上线时，请点击下面的按钮：</div>
<form method="post" action="/sync" style="margin:16px 0">
  <button type="submit">☁️ 同步到 GitHub（1 分钟后上线）</button>
</form>
'@
    }
    return @"
<!DOCTYPE html>
<html lang="zh-cn"><head><meta charset="utf-8" />
<style>
body{font-family:"Microsoft YaHei",sans-serif;background:#f6f6fb;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;padding:36px 52px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.08);text-align:left;max-width:640px}
.ok{font-size:14px;color:#2e7d32;margin-top:14px;line-height:1.9}
.bad{font-size:14px;color:#c62828;margin-top:14px;line-height:1.9}
a{color:#4a6cf7;font-weight:600}
button{background:#4a6cf7;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:14px;cursor:pointer}
</style></head>
<body><div class="card">
<h2 style="margin-top:0">✅ 已保存：《$title》</h2>
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
        if ($req.HttpMethod -eq 'POST' -and $req.Url.AbsolutePath -eq '/publish') {
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

            if (-not $title -or -not $body) {
                Send-Page $res '<body style="font-family:sans-serif;padding:40px"><h2>标题和正文都不能为空哦</h2><p><a href="/">返回继续写</a></p></body>'
                continue
            }

            $slug = New-Slug $title
            $dir = Join-Path $root ("content\post\" + $slug)
            New-Item -ItemType Directory -Force $dir | Out-Null

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
