[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![排名](https://make.fun/badge/gta6-cover-art-01/jinglue25/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![奖励](https://make.fun/badge/gta6-cover-art-01/jinglue25/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

# Afterglow · 把余晖做成封面

一个完全离线的照片封面工作台。用斜切拼贴、浓烈光影、大字标题和霓虹签名，把旅途照片变成自己的电影封面。全中文界面，无账号、无上传、无构建步骤，所有处理都在设备上完成。

## 使用

1. 在桌面 Chrome 中直接打开 `app/index.html`，两张可自由使用的模型生成样张会自动载入。
2. 点击“添加你的照片”选择多张本机图片，或把照片拖入页面。导入成功后首张会分配给当前面板。
3. 点击画布里的面板，再点击素材缩略图分配照片；“用选中照片填满所有面板”可以一图铺满。
4. 选择斜切城市、九宫格、主图加三小图、全幅、双联或倾斜快照布局。在画布上拖动照片调整裁剪，用缩放滑杆放大；“重置当前面板”恢复该面板的裁剪位置和缩放。
5. 输入主标题与霓虹签名，也可以点击原创标题灵感。标题支持手动换行，最多三行。
6. 选择日落、霓虹、复古胶片、黑白高对比、青蓝夜色滤镜，按需开启胶片颗粒、镜头暗角和复古网点。颗粒使用固定种子，同一状态可复现。
7. 可用工具栏或 Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z 重做，保留最近 80 步。拖动、缩放和连续文本编辑会合并为一次操作。
8. 选择方形 1080×1080、竖版 1080×1350 或横版 1920×1080，点击“导出 PNG”。输出不含编辑面板编号，无水印。顶部导出按钮使用当前选定尺寸。

编辑内容保存在当前页面内存中，刷新会恢复默认封面。支持常见浏览器可解码的图片格式；中文标题由设备字体回退渲染。

## 本地预览与打包

无需安装依赖。Node 22.18+ 或 Node 24 可直接运行根目录 TypeScript 入口：

```sh
node serve.ts
node serve.ts --port 8081
node verify.mjs
MAKEFUN_OUTPUT_DIR=/tmp/afterglow-output node main.ts
```

默认预览地址为 `http://localhost:8080`。不启动服务器也可以双击 HTML 使用。`main.ts` 默认输出到 `/output`，会从仓库复制 `app/` 与 `screenshots/`，并调用原样保留的 `vendor/makefun-app.ts` 生成确定性的 `dossier.json`。重跑时清理输出目录中的旧应用与旧截图，避免残留资源。

## 截图与模式

`?shot=editor` 显示带样张的编辑器；`?shot=cover&format=wide|portrait|square` 全屏显示对应比例的默认成品封面。截图与 PNG 导出共用绘制逻辑。

| 文件 | 场景 | 视口 |
| --- | --- | --- |
| `1-cover.jpg` | 横版成品，`?shot=cover&format=wide` | 1280×720 |
| `2-editor.jpg` | 样张编辑器，`?shot=editor` | 1280×720 |
| `3-cover.jpg` | 竖版成品，`?shot=cover&format=portrait` | 1024×1280 |
| `4-cover.jpg` | 方形成品，`?shot=cover&format=square` | 1024×1024 |

`capture.mjs` 读取 `shots.json`，使用环境提供的 playwright-core 和 chrome-headless-shell。通过 `page.route` 从磁盘提供全部资源，不监听 TCP 端口。先断言样张、布局、三种 PNG 实际尺寸、四种截图模式及 390px 无横向溢出，再以 JPEG quality 85 截图，不做后期处理。执行命令为 `node capture.mjs`，由截图阶段单独安排。

## 字体与许可证

本次先以 15 秒超时尝试下载 Anton 与 Pacifico，因网络连接不可用而采用本地回退方案：封面标题使用 DejaVu Sans Bold；霓虹签名使用 DejaVu Serif 的合成斜体。字体复制自系统 `/usr/share/fonts/truetype/dejavu/`，完整许可证来自 `/usr/share/doc/fonts-dejavu-core/copyright`，保存在 `app/fonts/LICENSE-DejaVu.txt`；实际来源与使用记录见 `app/fonts/FONT-NOTES.txt`。

两张原始样张保留在 `app/samples/`。`embedded.min.js` 是这两张图片的数据 URI 副本，用于本地文件模式下可靠导出 Canvas；不引入外部代码或请求。所有标题、排版与装饰均为原创设计。
