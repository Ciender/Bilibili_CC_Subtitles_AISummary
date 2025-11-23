

# 📺 Bilibili CC Subtitle AI Summary

![Version](https://img.shields.io/badge/Version-3.4-blue.svg) ![License](https://img.shields.io/badge/License-MIT-green.svg) ![Bilibili](https://img.shields.io/badge/Bilibili-Enhanced-pink.svg)

**B站 AI 字幕总结** 是一款基于油猴 (Tampermonkey) 的增强脚本，通过 AI 大模型（如 DeepSeek, OpenAI）将 Bilibili 视频字幕总结为带有时间戳可跳转的总结。  

<img width="727" height="605" alt="image" src="https://github.com/user-attachments/assets/7fa72a0c-d969-4ab0-bf9e-70c53aef1e17" />    
<img width="850" height="605" alt="image" src="https://github.com/user-attachments/assets/143b2ada-298b-497e-82d7-bcf2bc285b32" />    


---

## 🇨🇳 中文介绍

### 核心特性

*   **🧠 强大的 AI 总结能力**
    *   支持任意兼容 OpenAI 接口格式的大模型（DeepSeek, ChatGPT, Claude 等）。
    *   内置 **常规总结** 与 **深度分析** 两种预设模式，并且可以新增任意模型，支持本地，支持自定义 System Prompt 、top p 、温度、以满足不同的分析需求。
*   **📝 字幕与多语言支持**
    *   自动提取 B 站视频的 CC 字幕或 AI 生成字幕。
    *   **新增字幕选择器**：对于拥有多国语言字幕的视频，您可以手动选择发送哪种语言给 AI 进行处理。
*   **⚡ 极速体验与本地缓存**
    *   **重构的数据库架构**：采用 IndexedDB 存储总结历史。
    *   **秒级加载**：同一视频、同一模型配置下，二次打开无需消耗 API Token，瞬间加载历史总结。
*   **⚓ 智能时间戳交互**
    *   AI 生成的总结中包含 `[MM:SS]` 格式的时间戳。
    *   **点击即跳转**：点击时间戳，视频自动跳转至对应进度播放。
*   **🎨 现代化 UI 设计**
    *   **悬浮球与面板**：支持任意拖拽、双击复位。
    *   **自适应布局**：面板大小可自由缩放。
    *   **深色模式**：完美适配 B 站夜间/深色模式，支持透明度无级调节。
    *   **Markdown 渲染**：支持优美的排版、列表与高亮显示。

### 📦 安装指南

1.  **环境准备**：请确保您的浏览器已安装 [Tampermonkey](https://www.tampermonkey.net/) (油猴) 扩展。
2.  **安装脚本**：复制main.js 到 油猴新建脚本。
3.  **配置 API**：
    *   脚本安装后，打开任意 B 站视频页。
    *   点击屏幕右侧蓝色的 **"AI"** 悬浮球。
    *   点击面板右上角的 **设置 (⚙️)** 按钮。
    *   在 **"模型配置"** 中填入您的 API Key（默认预设了 DeepSeek API，只需填入 Key 即可使用）。

### 🚀 使用说明

1.  **启动面板**：在视频页点击 "AI" 悬浮球。
2.  **选择配置**：
    *   **字幕**：下拉选择您希望 AI 阅读的字幕语言（如无字幕则无法使用）。
    *   **模型**：选择您配置好的 AI 模型（如 "DeepSeek - 深度分析"）。
3.  **生成摘要**：点击内容区域的 **"点击开始生成摘要"** 按钮。
4.  **查看与跳转**：等待 AI 生成完毕，点击文中时间戳即可跳转视频。

### 🔧 高级配置

脚本允许您添加无限个自定义模型配置：
*   **System Prompt**：您可以定制 AI 的人设（例如：“你是一个专业的金融分析师，请提取视频中的数据...”）。
*   **Temperature / Top_P**：调节 AI 的创造性与严谨度。
*   **全局设置**：包含 Debug 调试模式开关及“一键清除所有缓存”功能。

### ⚠️ 常见问题

*   **Q: 为什么提示“该视频无字幕”？**
    *   A: 脚本依赖 B 站提供的字幕源。如果视频未上传 CC 字幕且 B 站未生成 AI 字幕，则无法进行总结。
*   **Q: 总结内容未保存？**
    *   A: v3.4 版本已修复数据库事务问题，请确保浏览器未禁用 IndexedDB。
*   **Q: 如何获取 API Key？**
    *   A: 推荐使用 DeepSeek 开放平台，或 OpenAI 官方平台获取。

看不懂怎么用，请复制全文给AI，叫AI教你。
---

## 🇺🇸 English Introduction

### Key Features

*   **🧠 Powerful AI Summarization**
    *   Compatible with any OpenAI-format API (DeepSeek, ChatGPT, Claude, local LLMs).
    *   Includes presets for **Standard Summary** and **Deep Analysis**. Fully customizable System Prompts allow you to tailor the AI's output style.
*   **📝 Subtitle & Multi-Language Support (New)**
    *   Automatically extracts CC subtitles or auto-generated captions from Bilibili.
    *   **Subtitle Selector**: For videos with multiple subtitle tracks, you can manually select which language is sent to the AI.
*   **⚡ Performance & Local Caching**
    *   **Refactored Database**: Built on IndexedDB for robust data storage.
    *   **Instant Load**: Summaries are cached locally. Re-visiting a video loads the summary instantly without consuming API tokens.
*   **⚓ Interactive Timestamps**
    *   Summaries include clickable timestamps (e.g., `[05:23]`).
    *   **Click-to-Seek**: Clicking a timestamp instantly jumps the video player to that specific moment.
*   **🎨 Modern UI/UX**
    *   **Draggable & Resizable**: Floating button and main panel can be moved and resized freely.
    *   **Dark Mode**: Fully supports Bilibili's dark theme with an adjustable opacity slider.
    *   **Markdown Rendering**: Clean, structured output with bold text and lists.

### 📦 Installation

1.  **Prerequisite**: Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.
2.  **Install Script**: [Click here to install](#) (Replace with your link).
3.  **API Configuration**:
    *   Open any Bilibili video.
    *   Click the floating blue **"AI"** button.
    *   Click the **Settings (⚙️)** icon.
    *   Enter your API Key in the **"Model Config"** section (Pre-configured for DeepSeek; just add your key).

### 🚀 Quick Start

1.  **Open Panel**: Click the "AI" orb on the video page.
2.  **Select Options**:
    *   **Subtitle**: Choose the subtitle language you want the AI to read.
    *   **Model**: Select your desired AI configuration.
3.  **Generate**: Click the **"Start Generation"** button.
4.  **Interact**: Read the summary and click timestamps to navigate the video.

### 🔧 Advanced Configuration

You can create unlimited custom model configurations:
*   **System Prompt**: Define the AI's persona (e.g., "You are a financial analyst, extract data points...").
*   **Temperature / Top_P**: Adjust the creativity and randomness of the generation.
*   **Global Settings**: Includes a Debug Mode toggle and a "Clear All Cache" button for storage management.

---

### 📄 Disclaimer / 免责声明

*   This script is for educational and personal use only.
*   API usage costs (if any) are the responsibility of the user.
*   Summaries are generated by AI and may contain inaccuracies. Please verify with the original video content.

*   本脚本仅供学习与个人研究使用。
*   API 调用产生的费用由用户自行承担。
*   AI 生成的内容可能存在误差，请以视频原内容为准。

---

**License**: MIT
