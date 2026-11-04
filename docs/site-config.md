# 网站配置

需要修改网站内容时，优先编辑以下两个文件。

## 个人信息与首页文案

文件：`data/site.yaml`

- `hero.title`：首页大标题。
- `hero.portal_heading`：三个入口上方的提示。
- `hero.enter_label`：“进入博客”按钮文字。
- `hero.facts`：首页右侧四行介绍。
- `profile.school`：学校，留空不显示。
- `profile.birthday`：生日，留空不显示。
- `profile.wechat`：微信号，留空不显示图标。
- `profile.qq`：QQ 号，留空不显示图标。
- `profile.github`：GitHub 地址，留空不显示图标。
- `footer.description`：首页页脚简介。

## 三类内容

文件：`data/categories.yaml`

每一项支持：

- `id`：内部标识，修改后需同步修改对应内容页的 `sectionid`。
- `name`：分类页和入口方框名称。
- `nav_name`：顶部和侧栏导航名称。
- `description`：分类页简介。
- `portal_caption`：入口方框内的小字。
- `channel`：分类页上方短标签。
- `category`：文章 front matter 中使用的分类值。
- `href`：入口链接。
- `media_type`：`video` 或 `image`。
- `media`：远程 URL 或站内绝对路径，例如 `/images/life.webp`。
- `poster`：视频封面，可留空。

修改后运行：

```powershell
.\tools\hugo.exe server -D --port 1313
```

公开部署时提交并推送 `main`，GitHub Actions 会自动发布。
