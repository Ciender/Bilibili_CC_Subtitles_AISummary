// ==UserScript==
// @name         Bilibili_CC_Subtitles_AISummary
// @version      3.7
// @description  B站CC字幕AI总结 (支持拖拽排序模型、记忆深色模式)
// @author       Ciender
// @match        http*://www.bilibili.com/video/*
// @match        http*://www.bilibili.com/bangumi/play/ss*
// @match        http*://www.bilibili.com/bangumi/play/ep*
// @match        https://www.bilibili.com/cheese/play/ss*
// @match        https://www.bilibili.com/cheese/play/ep*
// @match        http*://www.bilibili.com/list/watchlater*
// @match        https://www.bilibili.com/medialist/play/watchlater/*
// @match        http*://www.bilibili.com/medialist/play/ml*
// @match        http*://www.bilibili.com/blackboard/html5player.html*
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @license      MIT
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    // —————————————— 全局常量与默认设置 ——————————————

    const DB_NAME = 'BiliAISummaryDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'summaries';

    // 默认预设配置
    const DEFAULT_PRESETS = [
        {
            id: 'gemini-2.5-flash-preview-09-2025',
            name: 'gemini-2.5-flash-preview-09-2025',
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            apiKey: ' ',
            modelName: 'gemini-2.5-flash-preview-09-2025',
            systemPrompt: '你是一个视频内容总结助手。用户会提供一个SRT字幕，请你从中提取核心。简体中文回复。以markdown形式返回给我。重要：有些观点对于时间戳不一定完全参照我发你的字幕文件，你可以提前或者延后数秒，以确保准确性。对于每个总结要点，请在其开头附上对应的起始时间戳，格式为 [HH:MM:SS]。例如：[00:01:23] 这是一个总结点。请注意[]请顶格生成。每生成一个总结点空一行，提行。请重点关注相关数字、引用等各方方面事实内容，多注重细节。有可以列表展示的内容，请务必以列表格式展示。如果有分点分部的地方，以正确缩进返回。',
            temperature: 1.0,
            top_p: 1.0,
            proxy: ''
        },
        {
            id: 'default_standard',
            name: 'DeepSeek - 常规总结',
            apiUrl: 'https://www.sophnet.com/api/open-apis/v1/chat/completions',
            apiKey: ' ',
            modelName: 'DeepSeek-V3.1-Fast',
            systemPrompt: '你是一个视频内容总结助手。用户会提供一个SRT格式的字幕文件内容，请你从中提取核心要点，用详细并且分点完善，先分析场景，然后对于视频核心内容细分总结。分析场景的部分不要发出来。中文进行总结。以markdown形式返回给我。重要：有些观点对于时间戳不一定完全参照我发你的字幕文件，你可以提前或者延后数秒，以确保准确性。对于每个总结要点，请在其开头附上对应的起始时间戳，格式为 [HH:MM:SS]。例如：[00:01:23] 这是一个总结点。请注意[]请顶格生成。每生成一个总结点空一行，提行。请重点关注相关数字、引用等各方方面事实内容，多注重细节。如果有可以列表展示的内容，请务必以列表格式展示。',
            temperature: 1.0,
            top_p: 1.0,
            proxy: ''
        }
    ];

    // —————————————— 全局配置管理 (Debug等) ——————————————
    const GlobalSettings = {
        get debug() { return GM_getValue('setting_debug_mode', false); },
        set debug(val) { GM_setValue('setting_debug_mode', val); }
    };

    // —————————————— 工具类模块 ——————————————

    const Logger = {
        info: (...args) => { if (GlobalSettings.debug) console.log('%c[AI Summary]', 'color: #00a1d6; font-weight: bold;', ...args); },
        error: (...args) => { if (GlobalSettings.debug) console.error('%c[AI Summary Error]', 'color: #ff4d4f; font-weight: bold;', ...args); },
        dir: (obj) => { if (GlobalSettings.debug) console.dir(obj); }
    };

    const HashUtils = {
        cyrb53: (str, seed = 0) => {
            let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
            for (let i = 0, ch; i < str.length; i++) {
                ch = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            return 4294967296 * (2097151 & h2) + (h1 >>> 0);
        }
    };

    // —————————————— 数据库模块 (IndexedDB) ——————————————

    const DBHelper = {
        db: null,
        async open() {
            if (this.db) return this.db;
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('cid_model', ['cid', 'modelConfigId'], { unique: false });
                    }
                };
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve(this.db);
                };
                request.onerror = (event) => reject('DB Open Error');
            });
        },
        async saveSummary(data) {
            try {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const index = store.index('cid_model');
                    const request = index.get([data.cid, data.modelConfigId]);

                    request.onsuccess = (e) => {
                        const existingRecord = e.target.result;
                        if (existingRecord) {
                            data.id = existingRecord.id;
                        }
                        const putReq = store.put(data);
                        putReq.onsuccess = () => resolve(true);
                        putReq.onerror = (err) => {
                            Logger.error("DB Put Error:", err);
                            reject(putReq.error);
                        };
                    };
                    request.onerror = (err) => {
                        const putReq = store.put(data);
                        putReq.onsuccess = () => resolve(true);
                        putReq.onerror = () => reject(putReq.error);
                    };
                });
            } catch (e) {
                Logger.error('Save Summary Fatal Error', e);
                return false;
            }
        },
        async getSummary(cid, modelConfigId) {
            try {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const index = store.index('cid_model');
                    const request = index.get([cid, modelConfigId]);
                    request.onsuccess = (e) => resolve(e.target.result);
                    request.onerror = (e) => reject(e);
                });
            } catch (e) { return null; }
        },
        async clearAll() {
            try {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const req = store.clear();
                    req.onsuccess = () => resolve(true);
                    req.onerror = (e) => reject(e);
                });
            } catch (e) { throw e; }
        }
    };

    // —————————————— 配置管理模块 ——————————————

    const ConfigManager = {
        key: 'ai_model_configs',
        getAll() {
            let configs = GM_getValue(this.key, null);
            if (!configs || !Array.isArray(configs) || configs.length === 0) {
                configs = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
                this.save(configs);
            }
            return configs;
        },
        save(configs) { GM_setValue(this.key, configs); },
        add(config) {
            const list = this.getAll();
            list.push(config);
            this.save(list);
        },
        update(updatedConfig) {
            let list = this.getAll();
            const idx = list.findIndex(c => c.id === updatedConfig.id);
            if (idx !== -1) {
                list[idx] = updatedConfig;
                this.save(list);
            }
        },
        remove(id) {
            let list = this.getAll();
            list = list.filter(c => c.id !== id);
            this.save(list);
        },
        getById(id) { return this.getAll().find(c => c.id === id); }
    };

    // —————————————— B站数据与字幕模块 ——————————————

    const SubtitleHelper = {
        encodeToSRT(data) {
            return data.map(({ from, to, content }, index) => {
                return `${index + 1}\r\n${this.encodeTime(from)} --> ${this.encodeTime(to)}\r\n${content}`;
            }).join('\r\n\r\n');
        },
        encodeTime(input) {
            let time = new Date(input * 1000);
            let second = time.getSeconds();
            let minute = time.getMinutes();
            let hour = Math.floor(input / 60 / 60);
            if (hour < 10) hour = '0' + hour;
            if (minute < 10) minute = '0' + minute;
            if (second < 10) second = '0' + second;
            return `${hour}:${minute}:${second}`;
        }
    };

    const BilibiliHelper = {
        cid: null, aid: null, bvid: null, subtitleInfo: null, cachedSubs: {},
        getEpInfo() {
            const w = unsafeWindow;
            let info = w.playerRaw?.getManifest() || w.__INITIAL_STATE__?.epInfo || w.__INITIAL_STATE__?.videoData;
            if (!info && location.pathname.includes('html5player')) {
                const args = new URLSearchParams(location.search);
                return { cid: args.get('cid'), aid: args.get('aid'), bvid: args.get('bvid') };
            }
            if (info) return { cid: info.cid, aid: info.aid, bvid: info.bvid };
            return null;
        },
        async fetchSubtitleList() {
            const info = this.getEpInfo();
            if (!info || !info.cid) throw new Error("无法获取视频CID");

            if (this.cid !== info.cid) {
                this.cachedSubs = {};
            }

            this.cid = info.cid; this.aid = info.aid; this.bvid = info.bvid;
            const apiUrl = `https://api.bilibili.com/x/player/wbi/v2?cid=${this.cid}&aid=${this.aid}`;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET', url: apiUrl, withCredentials: true,
                    onload: (res) => {
                        try {
                            const json = JSON.parse(res.responseText);
                            if (json.code === 0 && json.data && json.data.subtitle) {
                                this.subtitleInfo = json.data.subtitle;
                                resolve(this.subtitleInfo);
                            } else resolve({ subtitles: [] });
                        } catch (e) { reject(e); }
                    },
                    onerror: (e) => reject(e)
                });
            });
        },
        async fetchSubtitleContent(lan) {
            if (this.cachedSubs[lan]) return this.cachedSubs[lan];
            const subItem = this.subtitleInfo.subtitles.find(s => s.lan === lan);
            if (!subItem) throw new Error(`未找到语言 ${lan} 的字幕`);
            const url = subItem.subtitle_url.startsWith('//') ? 'https:' + subItem.subtitle_url : subItem.subtitle_url;
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET', url: url,
                    onload: (res) => {
                        try {
                            const json = JSON.parse(res.responseText);
                            this.cachedSubs[lan] = json;
                            resolve(json);
                        } catch (e) { reject(e); }
                    },
                    onerror: reject
                });
            });
        }
    };

    // —————————————— LLM 请求模块 ——————————————

    const LLMHelper = {
        async sendRequest(config, srtText) {
            if (!config.apiKey || !config.apiUrl) throw new Error("请先在设置中填写 API Key 和 URL。");
            const requestBody = {
                model: config.modelName,
                temperature: config.temperature,
                top_p: config.top_p,
                messages: [
                    { role: "system", content: config.systemPrompt },
                    { role: "user", content: srtText }
                ],
                stream: false
            };
            return new Promise((resolve, reject) => {
                const options = {
                    method: "POST", url: config.apiUrl,
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
                    data: JSON.stringify(requestBody),
                    timeout: 180000,
                    onload: (response) => {
                        Logger.info("API Response Status:", response.status);
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const json = JSON.parse(response.responseText);
                                Logger.dir(json);
                                if (json.choices && json.choices.length > 0) resolve(json.choices[0].message.content);
                                else if (json.result) resolve(json.result);
                                else throw new Error("API返回格式无法解析");
                            } catch (e) { reject(new Error("JSON 解析失败: " + e.message)); }
                        } else {
                            let errMsg = response.statusText;
                            try {
                                const errJson = JSON.parse(response.responseText);
                                if (errJson.error && errJson.error.message) errMsg = errJson.error.message;
                            } catch (e) { }
                            reject(new Error(`API Error (${response.status}): ${errMsg}`));
                        }
                    },
                    onerror: (err) => reject(new Error("网络请求失败")),
                    ontimeout: () => reject(new Error("请求超时"))
                };
                if (config.proxy) {
                    options.proxy = config.proxy;
                }
                GM_xmlhttpRequest(options);
            });
        }
    };

    // —————————————— UI 管理器 (核心) ——————————————

    const UIManager = {
        panel: null,
        settingsModal: null,
        floatBtn: null,
        currentCid: null,
        lastLoadedSubtitleLan: null,
        isDarkMode: false,
        isLoading: false,

        init() {
            // 逻辑更新：优先检查本地存储的设置
            const savedTheme = GM_getValue('setting_ui_theme', null);

            if (savedTheme !== null) {
                // 如果用户手动切换过，遵循用户设置
                this.isDarkMode = savedTheme === 'dark';
            } else {
                // 如果没有手动设置，自动跟随浏览器/系统深色模式 (与Chrome统一)
                this.isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            }

            this.createFloatButton();
            this.setupStyle();
            this.startStateMonitor();
        },

        startStateMonitor() {
            setInterval(() => {
                const ep = BilibiliHelper.getEpInfo();
                if (ep && ep.cid && ep.cid !== this.currentCid) {
                    Logger.info(`Detected CID Change: ${this.currentCid} -> ${ep.cid}`);
                    this.currentCid = ep.cid;
                    this.resetForNewVideo();
                }
            }, 1000);
        },

        async resetForNewVideo() {
            if (!this.panel) return;
            const contentDiv = document.getElementById('ai-content-area');
            const statusSpan = document.getElementById('ai-status');
            const subSelect = document.getElementById('ai-subtitle-select');

            if (contentDiv) contentDiv.innerHTML = '<div style="text-align:center;color:#999;margin-top:40px">视频已切换，正在获取字幕列表...</div>';
            if (statusSpan) statusSpan.textContent = '';
            if (subSelect) {
                subSelect.innerHTML = '<option value="">加载中...</option>';
                subSelect.disabled = true;
            }

            if (this.panel.style.display !== 'none') {
                await this.loadSubtitleList();
                this.handleContentLoad(false, true);
            }
        },

        setupStyle() {
            const css = `
                /* 主面板样式 */
                .ai-summary-panel {
                    position: fixed; width: 600px; height: 500px;
                    min-width: 350px; min-height: 250px;
                    background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    border-radius: 8px; z-index: 2147483647 !important;
                    display: flex; flex-direction: column;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    border: 1px solid #e0e0e0; transition: opacity 0.2s ease;
                }
                .ai-dark-mode { background: #222 !important; color: #eee !important; border-color: #444 !important; }

                /* 头部 */
                .ai-header {
                    padding: 8px 14px; border-bottom: 1px solid #eee;
                    display: flex; justify-content: space-between; align-items: center;
                    user-select: none; background: #f9f9f9; border-radius: 8px 8px 0 0; cursor: move; flex-shrink: 0;
                }
                .ai-dark-mode .ai-header { background: #333 !important; border-bottom-color: #444 !important; }

                /* 工具条 */
                .ai-toolbar {
                    padding: 8px 14px; background: #fff; border-bottom: 1px solid #eee;
                    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
                }
                .ai-dark-mode .ai-toolbar { background: #222; border-bottom-color: #444; }

                .ai-resizer {
                    width: 15px; height: 15px; background: transparent;
                    position: absolute; right: 0; bottom: 0; cursor: se-resize; z-index: 10;
                }
                .ai-resizer::after {
                    content: ''; position: absolute; right: 4px; bottom: 4px;
                    width: 6px; height: 6px; border-right: 2px solid #ccc; border-bottom: 2px solid #ccc;
                }

                .ai-controls { display: flex; align-items: center; gap: 6px; cursor: default; }

                .ai-select { padding: 4px 6px; border-radius: 4px; border: 1px solid #ddd; font-size: 12px; outline: none; max-width: 140px; }
                .ai-dark-mode .ai-select { background: #444; color: #eee; border-color: #555; }

                .ai-btn-icon { cursor: pointer; padding: 4px; border-radius: 4px; font-size: 16px; transition: background 0.2s; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
                .ai-btn-icon:hover { background: rgba(0,0,0,0.1); }
                .ai-dark-mode .ai-btn-icon:hover { background: rgba(255,255,255,0.1); }
                .ai-btn-icon.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }

                .ai-opacity-slider { width: 60px; height: 4px; cursor: pointer; }

                .ai-content { flex: 1; overflow-y: auto; padding: 16px; font-size: 14px; line-height: 1.6; position: relative; }
                .ai-content .markdown-body { font-family: inherit; color: inherit; text-align: left !important; }
                .ai-content .markdown-body h1, .ai-content .markdown-body h2, .ai-content .markdown-body h3 {
                    margin-top: 16px !important; margin-bottom: 8px !important; font-weight: bold !important; line-height: 1.4 !important; color: #00a1d6;
                }
                .ai-dark-mode .ai-content .markdown-body h1, .ai-dark-mode .ai-content .markdown-body h2 { color: #4db3ff !important; }
                .ai-content .markdown-body p { margin-bottom: 12px !important; }
                .ai-content .markdown-body ul, .ai-content .markdown-body ol { list-style-type: inherit !important; padding-left: 24px !important; margin-bottom: 12px !important; }
                .ai-content .markdown-body strong { font-weight: bold !important; color: #fb7299; }
                .ai-content a { color: #00a1d6; text-decoration: none; font-weight: bold; cursor: pointer; }
                .ai-content a:hover { text-decoration: none; background: #00a1d6; border-radius: 3px; }

                /* Settings Modal */
                .ai-modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5); z-index: 2147483648; display: flex; justify-content: center; align-items: center;
                }
                .ai-settings-box {
                    width: 700px; height: 500px; background: #fff; border-radius: 8px; display: flex; overflow: hidden; position: relative;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                }
                .ai-dark-mode .ai-settings-box { background: #2c2c2c; color: #eee; }

                .ai-settings-close {
                    position: absolute; top: 10px; right: 10px; width: 30px; height: 30px;
                    background: transparent; border: none; font-size: 20px; cursor: pointer;
                    color: #666; z-index: 100; display: flex; align-items: center; justify-content: center;
                    border-radius: 50%;
                }
                .ai-settings-close:hover { background: rgba(0,0,0,0.1); color: #333; }
                .ai-dark-mode .ai-settings-close { color: #aaa; }

                .ai-settings-list { width: 200px; border-right: 1px solid #eee; overflow-y: auto; background: #f5f5f5; }
                .ai-dark-mode .ai-settings-list { background: #222; border-right-color: #444; }

                /* Config Item & Dragging */
                .ai-config-item {
                    padding: 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid #eaeaea; color: #333;
                    display: flex; align-items: center; gap: 8px; /* For drag handle layout */
                }
                .ai-dark-mode .ai-config-item { border-bottom-color: #444; color: #eee; }
                .ai-config-item:hover, .ai-config-item.active { background: #e6f7ff; color: #00a1d6; }
                .ai-dark-mode .ai-config-item:hover, .ai-dark-mode .ai-config-item.active { background: #333; }

                .ai-drag-handle {
                    cursor: grab; color: #999; padding: 0 2px; font-weight: bold; font-size: 16px; user-select: none;
                    display: flex; align-items: center;
                }
                .ai-drag-handle:hover { color: #666; }
                .ai-dark-mode .ai-drag-handle { color: #777; }

                /* Dragging visual states */
                .ai-config-item.dragging { opacity: 0.5; background: #e6f7ff; }
                .ai-config-item.drag-over { border-top: 2px solid #00a1d6; }

                .ai-config-section-title { font-size: 12px; font-weight: bold; padding: 8px 12px; color: #999; background: #eee; }
                .ai-dark-mode .ai-config-section-title { background: #333; color: #777; }

                .ai-settings-form { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
                .ai-form-group { display: flex; flex-direction: column; gap: 4px; }
                .ai-form-label { font-size: 12px; font-weight: bold; color: #666; }
                .ai-dark-mode .ai-form-label { color: #aaa; }
                .ai-form-input, .ai-form-textarea { padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
                .ai-form-textarea { height: 100px; resize: vertical; font-family: monospace; }
                .ai-dark-mode .ai-form-input, .ai-dark-mode .ai-form-textarea { background: #444; border-color: #555; color: #eee; }
                .ai-btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
                .ai-btn-primary { background: #00a1d6; color: #fff; }
                .ai-btn-danger { background: #ff4d4f; color: #fff; }

                .ai-checkbox-wrapper { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }

                .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 2s linear infinite; margin: 0 auto 10px; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `;
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        },

        createFloatButton() {
            this.floatBtn = document.createElement('div');
            this.floatBtn.textContent = 'AI';
            this.floatBtn.title = 'AI 字幕总结 (双击重置位置)';
            Object.assign(this.floatBtn.style, {
                position: 'fixed', top: '200px', right: '20px',
                width: '40px', height: '40px', background: '#00a1d6', color: '#fff',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 'bold', cursor: 'pointer', zIndex: 2147483647,
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)', userSelect: 'none'
            });

            let isDragging = false, startX, startY, startLeft, startTop, hasMoved = false;

            this.floatBtn.onmousedown = (e) => {
                e.preventDefault(); isDragging = false; hasMoved = false;
                startX = e.clientX; startY = e.clientY;
                const rect = this.floatBtn.getBoundingClientRect();
                this.floatBtn.style.right = 'auto'; this.floatBtn.style.left = rect.left + 'px'; this.floatBtn.style.top = rect.top + 'px';
                startLeft = rect.left; startTop = rect.top;

                const onMove = (ev) => {
                    const dx = ev.clientX - startX, dy = ev.clientY - startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { isDragging = true; hasMoved = true; }
                    if (isDragging) {
                        this.floatBtn.style.left = (startLeft + dx) + 'px';
                        this.floatBtn.style.top = (startTop + dy) + 'px';
                    }
                };
                const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            this.floatBtn.onclick = (e) => { if (!hasMoved) this.togglePanel(); };
            this.floatBtn.ondblclick = (e) => {
                if (this.panel) {
                    this.panel.style.top = '50%'; this.panel.style.left = '50%';
                    this.panel.style.transform = 'translate(-50%, -50%)';
                    setTimeout(() => {
                        const rect = this.panel.getBoundingClientRect();
                        this.panel.style.transform = 'none'; this.panel.style.left = rect.left + 'px'; this.panel.style.top = rect.top + 'px';
                        this.panel.style.width = '600px'; this.panel.style.height = '500px'; this.panel.style.opacity = '1';
                    }, 10);
                }
            };
            document.body.appendChild(this.floatBtn);
        },

        togglePanel() {
            if (this.panel && this.panel.style.display !== 'none') {
                this.panel.style.display = 'none';
            } else {
                this.showPanel();
            }
        },

        async showPanel() {
            if (!this.panel) this.createPanel();
            this.panel.style.display = 'flex';
            this.updateModelSelect();
            await this.loadSubtitleList();
            this.handleContentLoad(false, true);
        },

        createPanel() {
            this.panel = document.createElement('div');
            this.panel.className = 'ai-summary-panel';

            const initialWidth = 600, initialHeight = 500;
            this.panel.style.width = initialWidth + 'px'; this.panel.style.height = initialHeight + 'px';
            this.panel.style.left = (window.innerWidth / 2 - initialWidth / 2) + 'px';
            this.panel.style.top = (window.innerHeight / 2 - initialHeight / 2) + 'px';

            // Header
            const header = document.createElement('div');
            header.className = 'ai-header';
            header.innerHTML = '<div style="display:flex;align-items:center;"><b>AI 字幕总结</b> <span id="ai-status" style="font-size:12px;color:#999;margin-left:8px"></span></div>';

            let isDragging = false;
            header.onmousedown = (e) => {
                if (e.target.closest('.ai-controls') || e.target.closest('select') || e.target.tagName === 'INPUT') return;
                isDragging = true;
                const startX = e.clientX, startY = e.clientY, startLeft = this.panel.offsetLeft, startTop = this.panel.offsetTop;
                const onMove = (ev) => {
                    if (!isDragging) return; ev.preventDefault();
                    this.panel.style.left = (startLeft + ev.clientX - startX) + 'px';
                    this.panel.style.top = (startTop + ev.clientY - startY) + 'px';
                };
                const onUp = () => { isDragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            const controls = document.createElement('div');
            controls.className = 'ai-controls';

            const opacitySlider = document.createElement('input');
            opacitySlider.type = 'range'; opacitySlider.min = '0.2'; opacitySlider.max = '1.0'; opacitySlider.step = '0.1'; opacitySlider.value = '1.0';
            opacitySlider.className = 'ai-opacity-slider'; opacitySlider.title = '调节面板透明度';
            opacitySlider.oninput = (e) => { this.panel.style.opacity = e.target.value; };

            const btnTheme = this.createIconBtn(this.isDarkMode ? '🌙' : '☀️', '切换深色/浅色模式', () => this.toggleTheme(btnTheme));
            const btnRefresh = this.createIconBtn('🔄', '重新生成 (强制更新)', () => this.handleContentLoad(true, false));
            btnRefresh.id = 'ai-btn-refresh';
            const btnSettings = this.createIconBtn('⚙️', '设置', () => this.openSettings());
            const btnClose = this.createIconBtn('✕', '关闭', () => this.panel.style.display = 'none');

            controls.append(opacitySlider, btnTheme, btnRefresh, btnSettings, btnClose);
            header.appendChild(controls);

            // Toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'ai-toolbar';

            const modelSelect = document.createElement('select');
            modelSelect.className = 'ai-select'; modelSelect.id = 'ai-model-select';
            modelSelect.title = '选择AI模型配置';
            modelSelect.onchange = () => this.handleContentLoad(false, true);

            const subSelect = document.createElement('select');
            subSelect.className = 'ai-select'; subSelect.id = 'ai-subtitle-select';
            subSelect.title = '选择字幕语言';
            subSelect.innerHTML = '<option value="">检测中...</option>';
            subSelect.onchange = () => this.handleContentLoad(false, true);

            toolbar.innerHTML = '<span style="font-size:12px;color:#888;">字幕:</span>';
            toolbar.appendChild(subSelect);
            toolbar.appendChild(document.createTextNode(' '));
            toolbar.innerHTML += '<span style="font-size:12px;color:#888;">模型:</span>';
            toolbar.appendChild(modelSelect);

            const content = document.createElement('div');
            content.className = 'ai-content'; content.id = 'ai-content-area';
            content.innerHTML = '<div style="text-align:center;color:#999;margin-top:40px">AI 准备就绪...</div>';

            content.addEventListener('click', (e) => {
                if (e.target.tagName === 'A' && e.target.dataset.time) {
                    e.preventDefault(); this.seekVideo(e.target.dataset.time);
                }
            });

            const resizer = document.createElement('div');
            resizer.className = 'ai-resizer';
            resizer.onmousedown = (e) => {
                e.stopPropagation(); e.preventDefault();
                const startX = e.clientX, startY = e.clientY, startW = this.panel.offsetWidth, startH = this.panel.offsetHeight;
                const onResizeMove = (ev) => {
                    ev.preventDefault();
                    this.panel.style.width = Math.max(320, startW + (ev.clientX - startX)) + 'px';
                    this.panel.style.height = Math.max(200, startH + (ev.clientY - startY)) + 'px';
                };
                const onResizeUp = () => { document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('mouseup', onResizeUp); };
                document.addEventListener('mousemove', onResizeMove); document.addEventListener('mouseup', onResizeUp);
            };

            this.panel.append(header, toolbar, content, resizer);
            document.body.appendChild(this.panel);
            if (this.isDarkMode) this.panel.classList.add('ai-dark-mode');

            this.panel.querySelector('#ai-model-select').onchange = () => this.handleContentLoad(false, true);
            this.panel.querySelector('#ai-subtitle-select').onchange = () => this.handleContentLoad(false, true);
        },

        createIconBtn(text, title, onClick) {
            const btn = document.createElement('div');
            btn.className = 'ai-btn-icon'; btn.textContent = text; btn.title = title; btn.onclick = onClick;
            return btn;
        },

        toggleTheme(btn) {
            this.isDarkMode = !this.isDarkMode;
            if (this.isDarkMode) { this.panel.classList.add('ai-dark-mode'); btn.textContent = '🌙'; }
            else { this.panel.classList.remove('ai-dark-mode'); btn.textContent = '☀️'; }

            // 逻辑更新：保存用户偏好设置
            GM_setValue('setting_ui_theme', this.isDarkMode ? 'dark' : 'light');
        },

        updateModelSelect() {
            const select = this.panel.querySelector('#ai-model-select');
            if (!select) return;
            const configs = ConfigManager.getAll();
            const currentVal = select.value;
            select.innerHTML = '';
            configs.forEach(cfg => {
                const opt = document.createElement('option');
                opt.value = cfg.id; opt.textContent = cfg.name;
                select.appendChild(opt);
            });
            // 默认选第一个（即默认模型），或者保持之前选中的
            if (currentVal && configs.find(c => c.id === currentVal)) {
                select.value = currentVal;
            } else if (configs.length > 0) {
                select.value = configs[0].id;
            }
        },

        async loadSubtitleList() {
            const select = document.getElementById('ai-subtitle-select');
            if (!select) return;

            try {
                const info = await BilibiliHelper.fetchSubtitleList();
                this.currentCid = BilibiliHelper.cid;
                const subs = info.subtitles || [];

                select.innerHTML = '';
                if (subs.length === 0) {
                    const opt = document.createElement('option');
                    opt.text = "无字幕"; opt.value = "";
                    select.appendChild(opt);
                    select.disabled = true;
                    return;
                }

                select.disabled = false;
                subs.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub.lan;
                    opt.textContent = sub.lan_doc;
                    if (sub.lan.startsWith('zh') && !select.value) {
                        opt.selected = true;
                    }
                    select.appendChild(opt);
                });

                if (!select.value && subs.length > 0) {
                    select.value = subs[0].lan;
                }

            } catch (e) {
                Logger.error("Load Subtitles Failed", e);
                select.innerHTML = '<option value="">加载失败</option>';
            }
        },

        async handleContentLoad(forceRefresh, isAutoLoad = false) {
            if (this.isLoading) return;

            const statusSpan = document.getElementById('ai-status');
            const contentDiv = document.getElementById('ai-content-area');
            const modelSelect = document.getElementById('ai-model-select');
            const subSelect = document.getElementById('ai-subtitle-select');
            const refreshBtn = document.getElementById('ai-btn-refresh');

            const configId = modelSelect ? modelSelect.value : null;
            const subLan = subSelect ? subSelect.value : null;

            if (!configId) return;
            if (subSelect && !subSelect.disabled && !subLan) {
                contentDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#999">该视频无字幕，无法生成总结。</div>';
                return;
            }

            const config = ConfigManager.getById(configId);
            if (!config) return;

            try {
                statusSpan.textContent = '检查缓存...';

                if (!forceRefresh) {
                    const cached = await DBHelper.getSummary(this.currentCid, config.id);
                    if (cached) {
                        const selectedOption = subSelect.options[subSelect.selectedIndex];
                        const selectedLabel = selectedOption ? selectedOption.text : '';

                        let isMatch = true;
                        if (cached.subtitleLabel && selectedLabel && !selectedLabel.includes(cached.subtitleLabel) && !cached.subtitleLabel.includes(selectedLabel)) {
                            isMatch = false;
                        }

                        if (isMatch) {
                            statusSpan.textContent = '已加载缓存';
                            this.renderMarkdown(cached.summaryContent);
                            this.lastLoadedSubtitleLan = subLan;
                            return;
                        }
                    }
                }

                if (isAutoLoad) {
                    statusSpan.textContent = '待机';
                    contentDiv.innerHTML = `
                        <div style="text-align:center;padding:40px;color:#666;">
                            <p>当前字幕/模型暂无缓存。</p>
                            <br>
                            <button id="ai-start-btn" class="ai-btn ai-btn-primary" style="font-size:14px;padding:8px 20px;">
                                点击开始生成摘要
                            </button>
                            <p style="font-size:12px;color:#999;margin-top:10px">生成将消耗 API Token</p>
                        </div>
                    `;
                    document.getElementById('ai-start-btn').onclick = () => this.handleContentLoad(true, false);
                    return;
                }

                this.isLoading = true;
                if (refreshBtn) refreshBtn.classList.add('disabled');

                statusSpan.textContent = '获取字幕...';
                const subData = await BilibiliHelper.fetchSubtitleContent(subLan);
                if (!subData || !subData.body) throw new Error("字幕内容为空");

                const srtText = SubtitleHelper.encodeToSRT(subData.body);
                const subtitleHash = HashUtils.cyrb53(srtText);
                const subtitleLabel = subSelect.options[subSelect.selectedIndex].text;

                statusSpan.textContent = `调用 ${config.modelName}...`;
                contentDiv.innerHTML = '<div style="text-align:center;padding:20px"><div class="loader"></div><p>AI 正在思考中...</p><p style="font-size:12px;color:#999">长视频可能需要1-2分钟</p></div>';

                Logger.info("Sending Request to LLM...");
                const summary = await LLMHelper.sendRequest(config, srtText);
                Logger.info("Summary Received");

                statusSpan.textContent = '完成';
                this.renderMarkdown(summary);

                Logger.info("Saving to DB...");
                DBHelper.saveSummary({
                    cid: this.currentCid,
                    bvid: BilibiliHelper.bvid,
                    pageUrl: location.href,
                    modelConfigId: config.id,
                    subtitleHash: subtitleHash,
                    subtitleLabel: subtitleLabel,
                    srtContent: srtText,
                    summaryContent: summary,
                    timestamp: Date.now()
                }).then(() => {
                    Logger.info("DB Save Success");
                }).catch(err => {
                    Logger.error("DB Save Failed", err);
                    statusSpan.textContent = '完成 (未保存)';
                });

            } catch (err) {
                Logger.error(err);
                statusSpan.textContent = '错误';
                contentDiv.innerHTML = `<div style="color:red;padding:20px">错误: ${err.message}<br><br>请检查控制台(F12)日志或配置。</div>`;
            } finally {
                this.isLoading = false;
                if (refreshBtn) refreshBtn.classList.remove('disabled');
            }
        },

        renderMarkdown(text) {
            const contentDiv = document.getElementById('ai-content-area');
            if (typeof marked !== 'undefined') {
                let rawHtml = marked.parse(text);
                rawHtml = rawHtml.replace(/\[(\d{1,2}):(\d{1,2}):(\d{1,2})\]/g, (match, h, m, s) => {
                    const seconds = parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s);
                    return `<a data-time="${seconds}">${match}</a>`;
                }).replace(/\[(\d{1,2}):(\d{1,2})\]/g, (match, m, s) => {
                    const seconds = parseInt(m) * 60 + parseInt(s);
                    return `<a data-time="${seconds}">${match}</a>`;
                });
                contentDiv.innerHTML = `<div class="markdown-body">${rawHtml}</div>`;
            } else {
                contentDiv.innerText = text;
            }
            contentDiv.scrollTop = 0;
        },

        seekVideo(seconds) {
            const video = document.querySelector('video');
            if (video) { video.currentTime = parseFloat(seconds); video.play(); }
        },

        openSettings() {
            if (this.settingsModal) {
                this.settingsModal.style.display = 'flex';
                this.renderSettingsList(); // 重新渲染以确保顺序正确
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'ai-modal-overlay';

            const box = document.createElement('div');
            box.className = 'ai-settings-box';

            const closeBtn = document.createElement('button');
            closeBtn.className = 'ai-settings-close';
            closeBtn.innerHTML = '✕';
            closeBtn.title = '关闭设置';
            closeBtn.onclick = () => { overlay.style.display = 'none'; };
            box.appendChild(closeBtn);

            const listCol = document.createElement('div');
            listCol.className = 'ai-settings-list';

            const listContainer = document.createElement('div');
            listContainer.id = 'ai-settings-list-container';
            listCol.appendChild(listContainer);

            const formCol = document.createElement('div');
            formCol.className = 'ai-settings-form';
            formCol.id = 'ai-settings-form';
            formCol.innerHTML = '';

            box.append(listCol, formCol);
            overlay.append(box);
            this.settingsModal = overlay;
            document.body.appendChild(overlay);

            this.renderSettingsList();
            this.loadGlobalSettings();
        },

        renderSettingsList() {
            const container = document.getElementById('ai-settings-list-container');
            if (!container) return;
            container.innerHTML = '';

            // 1. 全局设置入口
            const globalItem = document.createElement('div');
            globalItem.className = 'ai-config-item';
            globalItem.innerHTML = '<span>🛠️ 全局设置</span>';
            globalItem.onclick = (e) => {
                this.setActiveItem(globalItem);
                this.loadGlobalSettings();
            };
            container.appendChild(globalItem);

            // 分割线/标题
            const sectionTitle = document.createElement('div');
            sectionTitle.className = 'ai-config-section-title';
            sectionTitle.textContent = '模型配置 (拖拽排序)';
            container.appendChild(sectionTitle);

            // 2. 新建配置入口
            const addBtn = document.createElement('div');
            addBtn.className = 'ai-config-item';
            addBtn.style.textAlign = 'center'; addBtn.style.fontWeight = 'bold';
            addBtn.style.justifyContent = 'center';
            addBtn.textContent = '+ 新建模型';
            addBtn.onclick = () => {
                this.setActiveItem(addBtn);
                this.loadModelForm(null);
            };
            container.appendChild(addBtn);

            // 3. 现有配置列表 (可拖拽)
            const configs = ConfigManager.getAll();

            configs.forEach((cfg, index) => {
                const div = document.createElement('div');
                div.className = 'ai-config-item';
                div.setAttribute('data-id', cfg.id);
                div.setAttribute('data-index', index);

                // 拖拽手柄
                const handle = document.createElement('span');
                handle.className = 'ai-drag-handle';
                handle.textContent = '≡';
                handle.title = '拖拽排序';

                // 名称
                const nameSpan = document.createElement('span');
                nameSpan.textContent = cfg.name;
                nameSpan.style.flex = '1';

                div.append(handle, nameSpan);

                // 点击选择逻辑 (避免拖拽时触发)
                div.onclick = (e) => {
                    // 如果点击的是手柄，不触发编辑
                    if (e.target.classList.contains('ai-drag-handle')) return;
                    this.setActiveItem(div);
                    this.loadModelForm(cfg.id);
                };

                // --- 拖拽逻辑 ---
                div.draggable = true;

                div.ondragstart = (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index); // 传输当前的索引
                    div.classList.add('dragging');
                };

                div.ondragover = (e) => {
                    e.preventDefault(); // 允许放置
                    e.dataTransfer.dropEffect = 'move';
                    const target = e.target.closest('.ai-config-item[draggable="true"]');
                    if (target && target !== div) {
                        target.classList.add('drag-over');
                    }
                };

                div.ondragleave = (e) => {
                    const target = e.target.closest('.ai-config-item[draggable="true"]');
                    if (target) {
                        target.classList.remove('drag-over');
                    }
                };

                div.ondrop = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    const targetDiv = e.target.closest('.ai-config-item[draggable="true"]');

                    // 清理样式
                    document.querySelectorAll('.ai-config-item').forEach(el => {
                        el.classList.remove('dragging');
                        el.classList.remove('drag-over');
                    });

                    if (targetDiv) {
                        const toIndex = parseInt(targetDiv.getAttribute('data-index'));

                        if (fromIndex !== toIndex && !isNaN(fromIndex) && !isNaN(toIndex)) {
                            // 重新排序数据
                            const list = ConfigManager.getAll();
                            const [movedItem] = list.splice(fromIndex, 1);
                            list.splice(toIndex, 0, movedItem);
                            ConfigManager.save(list);

                            // 刷新列表和主下拉框
                            this.renderSettingsList();
                            this.updateModelSelect();
                        }
                    }
                };

                div.ondragend = () => {
                     document.querySelectorAll('.ai-config-item').forEach(el => {
                        el.classList.remove('dragging');
                        el.classList.remove('drag-over');
                    });
                };

                container.appendChild(div);
            });
        },

        setActiveItem(el) {
            const items = document.querySelectorAll('.ai-config-item');
            items.forEach(i => i.classList.remove('active'));
            el.classList.add('active');
        },

        loadGlobalSettings() {
            const formContainer = document.getElementById('ai-settings-form');
            formContainer.innerHTML = `
                <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">全局设置</h3>

                <div style="margin-bottom: 20px;">
                    <label class="ai-checkbox-wrapper">
                        <input type="checkbox" id="ai-debug-toggle" ${GlobalSettings.debug ? 'checked' : ''}>
                        <span>开启调试日志 (Debug Log)</span>
                    </label>
                    <p style="font-size:12px; color:#999; margin-left:24px; margin-top:4px;">
                        开启后，脚本运行日志将输出到浏览器控制台 (F12 -> Console)。
                    </p>
                </div>

                <div style="border-top:1px solid #eee; padding-top:20px;">
                    <h4 style="margin-top:0;">缓存管理</h4>
                    <p style="font-size:12px; color:#666;">
                        所有总结内容存储在本地 IndexedDB (Database: <b>${DB_NAME}</b>)。<br>
                        如果遇到数据显示错误或占用空间过大，可以清除缓存。
                    </p>
                    <button id="ai-clear-cache-btn" class="ai-btn ai-btn-danger" style="margin-top:10px;">
                        🗑️ 清除所有缓存数据
                    </button>
                </div>
            `;

            document.getElementById('ai-debug-toggle').onchange = (e) => {
                GlobalSettings.debug = e.target.checked;
                Logger.info("Debug mode changed to:", e.target.checked);
            };

            document.getElementById('ai-clear-cache-btn').onclick = async () => {
                if (confirm('确定要清空所有 AI 总结缓存吗？此操作不可恢复。')) {
                    try {
                        await DBHelper.clearAll();
                        alert('缓存已清空。');
                        this.resetForNewVideo();
                    } catch (e) {
                        alert('清空失败: ' + e.message);
                    }
                }
            };
        },

        loadModelForm(id) {
            const formContainer = document.getElementById('ai-settings-form');
            const isNew = !id;
            const data = isNew ? {
                id: crypto.randomUUID(), name: '新模型配置', apiUrl: 'https://', apiKey: '', modelName: '',
                systemPrompt: '你是一个AI助手...', temperature: 1.0, top_p: 1.0, proxy: ''
            } : ConfigManager.getById(id);

            formContainer.innerHTML = `
                <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">${isNew ? '新建模型配置' : '编辑配置'}</h3>
                <div class="ai-form-group"><label class="ai-form-label">配置名称</label><input class="ai-form-input" id="cfg-name" value="${data.name}"></div>
                <div class="ai-form-group"><label class="ai-form-label">API URL</label><input class="ai-form-input" id="cfg-url" value="${data.apiUrl}"></div>
                <div class="ai-form-group"><label class="ai-form-label">API Key</label><input class="ai-form-input" type="password" id="cfg-key" value="${data.apiKey}"></div>
                <div class="ai-form-group"><label class="ai-form-label">模型名称 (Model Name)</label><input class="ai-form-input" id="cfg-model" value="${data.modelName}"></div>
                <div class="ai-form-group"><label class="ai-form-label">System Prompt</label><textarea class="ai-form-textarea" id="cfg-prompt">${data.systemPrompt}</textarea></div>
                <div style="display:flex; gap:10px">
                    <div class="ai-form-group" style="flex:1"><label class="ai-form-label">Temp</label><input class="ai-form-input" type="number" step="0.1" id="cfg-temp" value="${data.temperature}"></div>
                    <div class="ai-form-group" style="flex:1"><label class="ai-form-label">Top_P</label><input class="ai-form-input" type="number" step="0.1" id="cfg-topp" value="${data.top_p}"></div>
                </div>
                <div class="ai-form-group"><label class="ai-form-label">Proxy (可选)</label><input class="ai-form-input" id="cfg-proxy" value="${data.proxy || ''}" placeholder="默认为空"></div>
                <div style="margin-top:20px; display:flex; gap:10px; justify-content:flex-end">
                    ${!isNew ? `<button class="ai-btn ai-btn-danger" id="btn-del">删除</button>` : ''}
                    <button class="ai-btn ai-btn-primary" id="btn-save">保存</button>
                </div>
            `;

            document.getElementById('btn-save').onclick = () => {
                const newConfig = {
                    id: data.id,
                    name: document.getElementById('cfg-name').value,
                    apiUrl: document.getElementById('cfg-url').value,
                    apiKey: document.getElementById('cfg-key').value,
                    modelName: document.getElementById('cfg-model').value,
                    systemPrompt: document.getElementById('cfg-prompt').value,
                    temperature: parseFloat(document.getElementById('cfg-temp').value),
                    top_p: parseFloat(document.getElementById('cfg-topp').value),
                    proxy: document.getElementById('cfg-proxy').value
                };
                if (isNew) ConfigManager.add(newConfig); else ConfigManager.update(newConfig);
                this.renderSettingsList(); this.updateModelSelect();
                alert('保存成功');
            };

            if (!isNew) {
                document.getElementById('btn-del').onclick = () => {
                    if (confirm('删除此配置？')) {
                        ConfigManager.remove(data.id);
                        this.renderSettingsList(); this.updateModelSelect();
                        this.loadGlobalSettings();
                    }
                };
            }
        }
    };

    // —————————————— 启动 ——————————————
    const observer = new MutationObserver(() => {
        if (document.querySelector('#bilibili-player') || document.querySelector('#bpx-player-container')) {
            UIManager.init();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
