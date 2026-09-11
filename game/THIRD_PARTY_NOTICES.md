# 第三方组件说明

本项目的本地谱面分析页使用下列 npm 组件。它们只在本机浏览器中处理音频，不连接外部服务。

## audiojs beat 组件

- `@audio/beat` 2.1.3
- `@audio/beat-detect` 1.0.3
- `@audio/beat-onset` 1.0.3
- `@audio/beat-tempo` 1.0.3
- `@audio/beat-track` 1.0.3
- `@audio/onset` 1.0.1
- 来源：https://github.com/audiojs/beat
- npm 元数据许可：MIT
- Copyright (c) Dmitry Iv

`@audio/beat` 随包 `LICENSE` 在标准 MIT 文本之后还附有一行 Krishnized License 声明。项目保留原始许可文件于 `node_modules/@audio/beat/LICENSE`；发布或重新分发前应一并保留该原文。

## fourier-transform

- `fourier-transform` 2.4.1
- 来源：https://github.com/scijs/fourier-transform
- 许可：MIT
- Copyright (c) Dmitry Ivanov

## window-function

- `window-function` 3.0.2
- 来源：https://github.com/scijs/window-function
- 许可：MIT；随包许可还附有 Krishnized License / seva 声明
- Copyright (c) window-function contributors

完整许可文本随 `node_modules` 中各组件保存。音频录音本身不属于上述开源许可，也不会被加入本项目。
