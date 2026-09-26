# 第三方素材与授权 · Third-party assets

游戏本体（代码、关卡、文本、音效合成，以及下表标注为 **自制** 的图像）为原创作品。

下面逐条列出用到的第三方素材。

---

## 一、音频

| 用在哪 | 作品 | 作者 | 授权 | 来源 |
|---|---|---|---|---|
| 环境底噪（循环） | Dark Ambience Loop | Iwan Gabovitch（qubodup） | **CC-BY 3.0** | opengameart.org/content/dark-ambience-loop |

CC-BY 3.0 要求署名。原始音频以 base64 内联在 `index.html` 里（为了 `file://` 双击也能播放），
本条即为其要求的 attribution。

**其余全部音效均为运行时合成，不含音频文件**：脚步、手电开关、放映机转动、爆闪冲击、
心跳、以及"她的存在感"（两个相差 0.8Hz 的正弦叠加产生的拍频）——
全部由 WebAudio 的 `OscillatorNode` + `BiquadFilter` + 噪声缓冲实时生成。

---

## 二、图像

### 自制（AI 生成，作者本人制作）

`_assets/art/` 下的原始生成图，压缩后内联进 `index.html`：

| 用在哪 | 原始文件 |
|---|---|
| CAM 01「前厅」监控画面 | `Grainy_black_and_white_CCTV_se_2026-09-26T02-05-53.png` |
| CAM 02「候映室」监控画面 | `Grainy_black_and_white_CCTV_st_2026-09-26T02-01-05.png` |
| CAM 03「机房」监控画面 | `Grainy_black_and_white_CCTV_se_2026-09-26T02-05-55.png` |
| CAM 05「洗印暗房」监控画面 | `Grainy_black_and_white_CCTV_se_2026-09-26T01-59-32.png` |
| CAM 06「片库」监控画面 | `Analog_horror_still_frame__deg_2026-09-26T01-59-41.png` |
| 结局「监控室里的她」 | `Analog_horror_security_camera__2026-09-26T02-05-52.png` |
| 走廊里追你的她（全身，带 alpha） | `Full_body_photograph_of_a_tall_2026-09-26T02-01-04.png` |
| 她贴近时的背影（上半身，带 alpha） | `Upper_body_photograph_of_a_pal_2026-09-26T02-01-02.png` |
| 突脸（4 张变体，见下） | `Extreme_close_up_of_a_dead_wom_2026-09-26T01-59-29.png` |

**突脸那 4 张不是 4 次独立生成**，而是上面最后那张特写用 `prep_fear.py` 做的变体：
原图 / 镜像压暗 / 极近裁切 / 惨白高饱和。理由是同一张脸连看三次就不吓人了，
而"再做 3 张新图"比"同一张图做 3 个变体"贵得多也慢得多。

### 公有领域实拍

这两张归档自 Wikimedia Commons 的公有领域黑白影像。
**原始下载页链接未随文件保留**——如果你要在此基础上继续发布，建议先核实来源页。

| 用在哪 | 原始文件 | 说明 |
|---|---|---|
| CAM 04「后室通道」监控画面 | `backroom.jpg` | 标为公有领域 |
| 隐藏档案 07「腹语人偶合影」 | `herman.jpg` | 标为公有领域（来源标注：CreepyStock） |

游戏内「档案 07」页面也印了出处：

> 影像来源：Wikimedia Commons / CreepyStock（公有领域）。

---

## 三、代码

仓库里的 `three.min.js` 是 **Three.js r160** 的 UMD 构建（`build/three.min.js`）。
文件头保留的许可声明原文：

```
/**
 * @license
 * Copyright 2010-2023 Three.js Authors
 * SPDX-License-Identifier: MIT
 */
```

MIT License，完整文本见 https://github.com/mrdoob/three.js/blob/dev/LICENSE

> 注：`build/three.min.js` 这个 UMD 构建在 r150+ 已被标记为废弃、并在 r160 移除。
> 这里之所以仍然用 r160 的这个构建，是因为它是**最后一批能用 `<script src>` 直接引入、
> 不需要打包器**的版本——这个项目的硬约束是"双击一个 HTML 就能玩"，
> 引入 ES Modules 就必须上构建工具或改 `importmap`，两者都会破坏这个约束。

游戏本体代码的许可见仓库根目录的 `LICENSE`。
