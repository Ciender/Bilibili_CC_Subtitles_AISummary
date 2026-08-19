# Changelog

本文件记录当前 `Bilibili_CC_Subtitles_AISummary.user.js` 的文档化更新。日期使用 `YYYY-MM-DD`。

## [4.2.2] - 2026-08-20

### Added / 新增

- 中英文 README，覆盖安装、快速使用、模型配置、代理、联网搜索、隐私和故障排查。
- 使用真实 Bilibili CC 字幕页面重新截取浅色、深色、NT4、设置、来源列表和引用悬浮卡片截图。
- 删除旧版 `Old_Version.js`，主页仅保留当前 `main.js`。
- 三种 API 格式说明：OpenAI Chat Completions、OpenAI Responses、Gemini 原生 `generateContent`。
- 连接测试和测试报告说明，包含 HTTP 状态码、响应类型和截断后的原始响应。

### Documented / 已记录功能

- 支持 Bilibili CC/自动生成字幕、多语言字幕选择和无字幕提示。
- 支持 Markdown、KaTeX、可点击时间戳、来源引用和联网搜索。
- 支持拖拽/缩放面板、浅色/深色/NT4 主题、背景透明度和重新生成。
- 使用 IndexedDB（`BiliAISummaryDB`）缓存视频总结；支持按模型和字幕语言区分缓存。
- 模型配置支持自定义 System Prompt、Temperature、Top P、思考强度、最大输出 Token、附加 JSON 参数和代理。
- 全局设置支持时间轴标题深度、Debug 日志和清空缓存。
- 默认视频总结 Prompt 统一为 2026 年 8 月版本：要求分段、总结、表格、专家评价、时间区间/重要时间点，并在需要时联网搜索权威来源。

### Compatibility / 兼容性说明

- 需要支持 `GM_xmlhttpRequest`、`GM_getValue` 和 `GM_setValue` 的 Tampermonkey 或 Violentmonkey。
- 外部依赖仍由脚本头部的 `@require` / `@resource` 从 CDN 加载。
- 代理字段（例如 `http://127.0.0.1:7897`）是否生效取决于脚本管理器实现。

## Previous history / 既有历史

此前 GitHub 项目版本主要以 `main.js` 和 README 迭代。4.2.2 文档以当前源文件实际行为为准；旧版本说明可能仍提到已经迁移的模型名称或旧界面，请优先参考本 README 的配置表。
