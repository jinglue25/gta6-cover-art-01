# Afterglow · 离线封面工作台

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![排名](https://make.fun/badge/gta6-cover-art-01/jinglue25/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![奖励](https://make.fun/badge/gta6-cover-art-01/jinglue25/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

以日落、霓虹和海岸城市为灵感的原创多面板海报生成器。纯 HTML、CSS、原生 JavaScript 与 Canvas 2D，无依赖、无构建步骤。使用随仓库提供的本地静态服务器即可断网使用；所有资源在本地，照片不会上传。

## 使用

1. 选择横版 1920×1080、竖版 1080×1350 或方形 1080×1080。
2. 在六种布局中选择：斜切城市拼贴、九宫格、主图加三小图、全幅、双联、倾斜快照。
3. 用文件选择器或拖放导入多张照片。点击画布面板，再点击照片缩略图分配照片；也可一图填满全部面板。
4. 拖动画布中的照片调整裁剪，使用 Zoom 缩放；Reset 恢复当前面板。
5. 编辑标题、副标题，切换五种滤镜和颗粒、暗角、网点。标题点子按钮提供原创文案。
6. 使用撤销/重做按钮，或在画布区域使用 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z。导出 PNG 会按原始分辨率下载。

照片仅保存在当前标签页内存中，刷新会恢复示例。界面和作品均不含任何游戏官方素材、标识或字体。预载照片仅使用 `app/samples/` 中两张模型生成样张。

## 本地预览与提交

Node 22.18+（或支持 TypeScript 类型擦除的较新版本）标准库即可：

```sh
node serve.ts
# 浏览器打开本地 8080 端口
MAKEFUN_OUTPUT_DIR=/tmp/afterglow-output node main.ts
```

`main.ts` 从自身目录复制 `app/` 和 `screenshots/`，再通过未修改的 `vendor/makefun-app.ts` 生成规范 dossier。严格执行题目指定的文件、字节数、路径和截图限制。输出不含时间戳或随机值；颗粒也使用固定种子的纹理。

## 字体与许可证

已尝试下载题目要求的 Anton、Pacifico 及 OFL 文本，但本次环境的网络代理不可连接。按题目允许的回退方案，复制系统 `DejaVuSans-Bold.ttf`，同时使用本地 `DejaVuSerif.ttf` 的合成斜体作为霓虹签名字体。字形并非真正的连笔手写体，这是回退方案的视觉限制。完整 DejaVu 许可证在 `app/fonts/LICENSE-DejaVu.txt`。应用代码遵循根目录 `LICENSE`。

## 截图与验证状态

截图场景已实现：

| 文件 | 场景 | 浏览器视口 |
| --- | --- | --- |
| 1-cover.jpg | `?shot=cover&format=wide` | 1280×720 |
| 2-editor.jpg | `?shot=editor` | 1280×720 |
| 3-cover.jpg | `?shot=cover&format=portrait` | 1024×1280 |
| 4-cover.jpg | `?shot=cover&format=square` | 1024×1024 |

`capture.mjs` 使用指定路径的 playwright-core 与 chrome-headless-shell，执行核心交互检查，再直接拍摄四张 JPEG；绝不对截图做后期处理。它默认通过本地 HTTP 服务器读取 app；可用 `--routed` 选项改用进程内本地静态响应器，不产生网络请求。

本次环境禁止 TCP/Unix socket 监听，浏览器又在启动时因 `sandbox_host_linux.cc` 的 `shutdown: Operation not permitted` 错误退出。因此本次未产生实拍截图，已移除 starter 旧截图，提交尚不满足截图门槛。不能把此状态当作完成的参赛产物。取得允许浏览器和本地服务器运行的环境后，执行 `node capture.mjs`，随后运行下列检查：

```sh
node verify.mjs
mkdir -p /tmp/out1 /tmp/out2
MAKEFUN_OUTPUT_DIR=/tmp/out1 node main.ts
MAKEFUN_OUTPUT_DIR=/tmp/out2 node main.ts
diff -r /tmp/out1 /tmp/out2
python3 verify-images.py
```

未能执行的浏览器断言不计作通过。所有开发源文件均通过 Codex 的 apply_patch 手写，未复用 starter 应用源码。

本次已运行 `node verify.mjs`：本地资源引用、禁用词扫描、vendor 哈希、钱包内容和编辑状态逻辑测试通过。已执行题目指定的双次构建命令，但第一次运行就因截图目录为空被 buildDossier 拒绝，后续命令未执行；因此 dossier 字节一致性未验证。已运行 Python PIL 检查脚本，结果同样为缺少截图，未通过。当前运行环境实际提供 Node 24.22.1，源码仅使用 Node 22 标准库及可擦除类型语法。
