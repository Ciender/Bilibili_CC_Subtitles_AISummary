# Bilibili CC Subtitles AI Summary (B站CC字幕AI总结)

![Script Screenshot](https://github.com/user-attachments/assets/d7d4a1ef-95d3-42a8-a275-81f54e9226e0)

---

## 中文

一个油猴脚本，通过AI一键总结B站视频CC字幕内容，支持双模型、自定义API和本地模型。

### ✨ 主要功能

*   **AI 总结**: 提供“常规总结”与“深度分析”两种模式，快速把握或深入理解视频内容。
*   **交互式时间戳**: 总结带有可点击的时间戳 `[HH:MM:SS]`，一键跳转到视频对应位置。
*   **高度自定义**: 轻松配置API Key、模型，支持 DeepSeek 及兼容 OpenAI 接口的本地模型。
*   **便捷 UI**: 窗口可拖动、可调整大小和透明度，并自适应网站的亮/暗模式。

### 🚀 如何使用

1.  **安装脚本管理器**: 浏览器需安装 [Tampermonkey](https://www.tampermonkey.net/) 或类似扩展。
2.  **安装本脚本**: [点击此处从 GreasyFork 安装](<此处替换为您的GreasyFork链接>)。
3.  **配置 API Key (必需)**: 编辑脚本，在 `用户配置区` 填入你的 DeepSeek API Key。
    ```javascript
    // —————————————— 用户配置区 START ——————————————
    // 获取地址: https://platform.deepseek.com/api_keys
    const DEEPSEEK_API_KEY = "sk-xxxxxxxxxx"; // <--- 替换成你的 KEY
    // —————————————— 用户配置区 END ——————————————
    ```
4.  **开始使用**: 打开B站视频页面，点击右侧的 "AI Σ" 悬浮按钮即可。

---

## English

A UserScript to summarize Bilibili video CC subtitles with one click using AI. Features dual models, custom API endpoints, and local model support.

### ✨ Key Features

*   **AI Summaries**: Offers two modes: 'Standard Summary' for key points and 'Deep Analysis' for in-depth insights.
*   **Clickable Timestamps**: Each summary point includes a clickable timestamp `[HH:MM:SS]` to jump directly to that moment in the video.
*   **Highly Customizable**: Easily configure your API Key and model. Supports DeepSeek and any OpenAI-compatible API, including local models.
*   **Convenient UI**: A floating panel that is draggable, resizable, has adjustable opacity, and adapts to the site's light/dark theme.

### 🚀 How to Use

1.  **Install a UserScript Manager**: Your browser needs an extension like [Tampermonkey](https://www.tampermonkey.net/).
2.  **Install this Script**: [Click here to install from GreasyFork](<REPLACE_WITH_YOUR_GREASYFORK_LINK>).
3.  **Configure API Key (Required)**: Edit the script and enter your DeepSeek API key in the `User Configuration` section.
    ```javascript
    // —————————————— User Configuration Area START ——————————————
    // Get yours at: https://platform.deepseek.com/api_keys
    const DEEPSEEK_API_KEY = "sk-xxxxxxxxxx"; // <--- Replace with your key
    // —————————————— User Configuration Area END ——————————————
    ```
4.  **Start Summarizing**: Open a Bilibili video, and click the floating "AI Σ" button on the right.

---

### 🙏 致谢 (Acknowledgements)

字幕获取功能参考了 [indefined](https://github.com/indefined) 的 [bilibiliCCHelper](https://github.com/indefined/UserScripts/tree/master/bilibiliCCHelper) 插件。

Subtitle fetching functionality is based on the [bilibiliCCHelper](https://github.com/indefined/UserScripts/tree/master/bilibiliCCHelper) plugin by [indefined](https://github.com/indefined).

### 📄 许可证 (License)

This project is licensed under the [MIT License](LICENSE).
