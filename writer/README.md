# 本地写作台

双击桌面上的“LHW 写作台”快捷方式，会自动启动 Hugo 预览和写作台，并打开：

`http://127.0.0.1:1315`

## 数据位置

- 文章：`content/post/<slug>/index.md`
- 文章图片：发布时复制到对应文章目录
- 草稿、媒体库、历史和回收站：`E:\gongzuoqu\LHWblog-writer-data`

## 手动启动

```powershell
cd E:\opencode\LHWblog
powershell -ExecutionPolicy Bypass -File .\writer.ps1
```

写作台只监听 `127.0.0.1`，不会向局域网或互联网开放。
