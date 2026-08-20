# Bilibili CC 字幕 AI 总结

一个给 Bilibili 视频做省流总结的用户脚本。它读取视频 CC 字幕，交给你选择的 AI，生成带时间点、分段、表格和专家点评的 Markdown 总结。

![Version](https://img.shields.io/badge/version-4.2.2-00a1d6.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## UI

![Light UI](docs/screenshots/ui-light.png)

总结正文中的时间点可以点击跳转。带来源的 `[1]`、`[2]` 等标记支持鼠标悬浮查看标题、链接和引用片段。

![Citation hover](docs/screenshots/citation-hover.png)

![Settings / 设置（API Key 已遮罩）](docs/screenshots/settings.png)



## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 打开 [`main.js`](main.js)，点击安装；也可以复制到脚本管理器的新建脚本中。
3. 打开带 CC 字幕的 Bilibili 视频，点击右侧 `AI` 按钮。

## 使用

1. 选择字幕语言和模型。
2. 点击生成，等待总结完成。
3. 点击蓝色时间点回看原视频。
4. 鼠标移到引用标记上查看来源。

## 配置

打开 `AI 字幕总结 -> 设置 -> 模型配置`，填写这四项即可：

| 项目 | 示例 |
| --- | --- |
| API 格式 | OpenAI / NewAPI Chat Completions |
| API URL | `https://api.example.com/v1` |
| API Key | 你的服务商密钥 |
| 模型名称 | `example-model` |

支持 OpenAI Chat Completions、OpenAI Responses 和 Gemini 原生 `generateContent`。OpenAI 兼容接口的根地址会自动补全端点；Gemini 地址可使用 `{model}` 占位符。

代理是可选项，例如 `http://127.0.0.1:7897`。是否生效取决于脚本管理器和本机代理设置。

脚本默认的总结提示词会要求：中文 Markdown、分段总结、表格、时间区间、重要时间点和“这个领域的专家应该评价的内容”；必要时让模型联网并优先引用权威来源。可在模型配置中自行修改 System Prompt。

## 隐私和费用

- API Key、字幕和总结只发送到你配置的 AI 服务商；项目不会收集这些内容。
- 总结会缓存在浏览器本地 IndexedDB，方便再次打开视频时复用。
- API 服务商可能产生费用或记录请求，请以服务商的政策为准。
- AI 内容可能有误，重要信息请回看原视频。

## English

### Bilibili CC Subtitle AI Summary

A userscript that reads Bilibili CC captions and turns them into a concise Markdown summary with timestamps, sections, tables, and expert commentary.

### Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install [`main.js`](main.js), or paste it into a new userscript.
3. Open a Bilibili video with CC captions and click the `AI` button.

### Configure

Open `AI Summary -> Settings -> Model configuration` and enter the API format, API URL, API key, and model name. OpenAI Chat Completions, OpenAI Responses, and native Gemini `generateContent` are supported. An optional proxy such as `http://127.0.0.1:7897` depends on userscript-manager support.

The default prompt asks for Chinese Markdown, sections, a summary, a table, timestamp ranges, important time points, and expert evaluation. It can be edited in the model settings.

Captions and summaries are sent only to your selected provider and cached locally in the browser. Check important claims against the original video.

## License

MIT. See [`CHANGELOG.md`](CHANGELOG.md) for update history.
