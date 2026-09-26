# tools/ · 自动化测试与抓图

这个目录不是游戏运行需要的，是**验证这个游戏真的按设计在工作**用的。

## 为什么要写这些

这个游戏里几乎每一条手感都来自一个可测量的判定：
"光在 9 米内才钉得住她"、"爆闪扣 25% 电冷却 10 秒"、"漏报和误报都推进一格"。
这些数字如果只靠手动玩来验证，改了参数之后根本不知道有没有改坏。

所以核心机制全部写成了断言。改完之后跑一遍，比手玩十分钟可靠。

## 怎么跑

需要 **Node.js**（脚本用到内置 `fetch` / `WebSocket`，Node 22 起开箱可用）
和 **Microsoft Edge**（脚本里写死了 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，
换成 Chromium / Chrome 也可以，改脚本开头的 `EDGE` 常量即可）。

```bash
node tools/test_analog.cjs          # 模拟恐怖层：68 项断言
node tools/test_projectionist.cjs   # 核心玩法：80 项断言
node tools/capture_analog.cjs       # 抓 12 张截图到 screenshots/
```

脚本自己起一个本地 HTTP 服务把游戏喂给浏览器，再用 **CDP（Chrome DevTools Protocol）**
驱动一个无头 Edge：真的发键盘事件、真的拖鼠标、真的按触摸按钮，
然后从 `window.__MP` 里读内部状态做断言。

**不是"跑一遍看有没有报错"，是真的用真实输入去驱动它。**

## 三个脚本各自管什么

| 脚本 | 断言数 | 覆盖 |
|---|---|---|
| `test_projectionist.cjs` | 80 | 开始页六种屏幕尺寸、键鼠/触摸全链路、光锥钉住判定、三种突破手段与代价、电量循环、被抓与复活、四台放映机与开门、脚本化实战跑 3 次、渲染循环不泄漏、设置项、音频与泛光 |
| `test_analog.cjs` | 68 | 素材内联成 data URI、`file://` 双击加载、VHS/CRT 外观、女鬼换成真实贴图、值班台开关与暂停、异常识别循环（误报/漏报/选错路/难度递增/陷阱）、隐藏档案页、四格致死、通关双条件、手机端 |
| `capture_analog.cjs` | — | 抓图 |

## 两个已知的失败（不是 bug）

`test_projectionist.cjs` 里有 **3 条环境音断言会失败**：

```
[FAIL] 环境音已开始循环播放      {"ready":true,"ambDecoded":true,"ambPlaying":false,"ambGain":0}
[FAIL] 环境音有实际音量（不是静默播放）  0
[FAIL] 环境音会随她的距离收紧（越近越响） {"far":0,"near":0}
```

原因是无头浏览器被 `--mute-audio` 静音，音频上下文是静音的，音量读数恒为 0。
音频本身解码成功（`ambDecoded: true`）。手动打开游戏能听到声音。

**在改动之前用原始版本跑过一遍基线，这 3 条同样失败——所以它们是环境限制，不是回归。**

## 跑完之后

测试会在上级目录生成 `_probe_analog/`、`_probe_mp/` 之类的临时目录（浏览器 profile、截图缓存），
已经在 `.gitignore` 里排除了。
