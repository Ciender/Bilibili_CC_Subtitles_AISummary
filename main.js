// ==UserScript==
// @name         Bilibili_CC_Subtitles_AISummary
// @version      4.2.2
// @description  B站CC字幕AI总结 (多供应商、联网搜索与轻量现代 UI)
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
// @require      https://cdn.bootcdn.net/ajax/libs/marked/12.0.2/marked.min.js
// @require      https://cdn.bootcdn.net/ajax/libs/KaTeX/0.16.9/katex.min.js
// @require      https://cdn.bootcdn.net/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js
// @resource     katexCss https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
// @license      MIT
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      *
// ==/UserScript==

(function () {
    'use strict';

    // —————————————— 全局常量与默认设置 ——————————————

    const DB_NAME = 'BiliAISummaryDB';
    const DB_VERSION = 2;
    const STORE_NAME = 'summaries';

    const API_FORMATS = {
        OPENAI_CHAT: 'openai_chat',
        OPENAI_RESPONSES: 'openai_responses',
        GEMINI_NATIVE: 'gemini_native'
    };

    const VIDEO_SUMMARY_PROMPT = '现在是2026年8月。你是一个AI总结助手，省流总结这个视频的所有内容。并以分段+总结+表格+"这个领域的专家应该评价的内容"的格式发给我。如果中间出现了时间戳，在其开头附上对应的起始和结束区间，格式为 [HH:MM:SS]。例如：[00:01:23]。如果是时间段，则应该像这样表示 [00:06:11] - [00:09:52]，区间前后都有[]。重点！除了区间时间，在必要时，也应该插入[]时间点来提示重要内容！"领域专家评价"里面一定要有思考，例如TGA最简年度游戏小机器人就被网友冲烂了，这时候你应该先讲解为什么被网友骂，其次给出你的理解。又例如去了台湾才知道，发展真不是靠高楼去决定的！这句话，你根据字幕也应该发表你的看法，阐述为什么，以及这句话是否偏激、中肯。又例如，阿拉伯半岛属于西亚还是非洲、或者更靠近欧洲？这里不应该只局限于地理分界线，应该从政治、经济、文化等多角度考虑。中文回复，要求返回 Markdown 格式。需要搜索的地方，请联网搜索，请务必使用权威可靠信源。';

    const createPreset = (config) => ({
        apiKey: '',
        systemPrompt: VIDEO_SUMMARY_PROMPT,
        temperature: '',
        top_p: '',
        reasoningEffort: '',
        maxCompletionTokens: 12000,
        extraParams: '',
        proxy: '',
        webSearch: false,
        webSearchSupported: 'unknown',
        builtIn: true,
        ...config
    });

    const DEFAULT_PRESETS = [
        createPreset({
            id: 'preset-deepseek-chat',
            name: 'DeepSeek V4 Pro',
            apiUrl: 'https://api.deepseek.com/chat/completions',
            modelName: 'deepseek-v4-pro',
            apiFormat: API_FORMATS.OPENAI_CHAT,
            temperature: 0.7,
            top_p: 0.95,
            webSearchSupported: 'unsupported'
        }),
        createPreset({
            id: 'preset-gemini-pro',
            name: 'Gemini 3.1 Pro',
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            modelName: 'gemini-3.1-pro',
            apiFormat: API_FORMATS.GEMINI_NATIVE,
            temperature: 0.7,
            top_p: 0.95,
            reasoningEffort: 'high',
            maxCompletionTokens: 32768,
            webSearch: true,
            webSearchSupported: 'supported'
        }),
        createPreset({
            id: 'preset-gemini-flash',
            name: 'Gemini 3.5 Flash',
            apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            modelName: 'gemini-3.5-flash',
            apiFormat: API_FORMATS.GEMINI_NATIVE,
            temperature: 0.7,
            top_p: 0.95,
            reasoningEffort: 'medium',
            maxCompletionTokens: 16384,
            webSearch: true,
            webSearchSupported: 'supported'
        }),
        createPreset({
            id: 'preset-gpt-5-6-luna',
            name: 'GPT-5.6 Luna',
            apiUrl: 'https://api.openai.com/v1/responses',
            modelName: 'gpt-5.6-luna',
            apiFormat: API_FORMATS.OPENAI_RESPONSES,
            reasoningEffort: 'medium',
            webSearch: true,
            webSearchSupported: 'supported'
        }),
        createPreset({
            id: 'preset-gpt-5-6-terra',
            name: 'GPT-5.6 Terra',
            apiUrl: 'https://api.openai.com/v1/responses',
            modelName: 'gpt-5.6-terra',
            apiFormat: API_FORMATS.OPENAI_RESPONSES,
            reasoningEffort: 'high',
            webSearch: true,
            webSearchSupported: 'supported'
        }),
        createPreset({
            id: 'preset-gpt-5-6-sol',
            name: 'GPT-5.6 Sol',
            apiUrl: 'https://api.openai.com/v1/responses',
            modelName: 'gpt-5.6-sol',
            apiFormat: API_FORMATS.OPENAI_RESPONSES,
            reasoningEffort: 'xhigh',
            webSearch: true,
            webSearchSupported: 'supported'
        })
    ];

    // —————————————— 全局配置 ——————————————
    const GlobalSettings = {
        get debug() { return GM_getValue('setting_debug_mode', false); },
        set debug(val) { GM_setValue('setting_debug_mode', val); },
        get headingDepth() {
            const depth = Number(GM_getValue('setting_heading_depth', 2));
            return [1, 2, 3].includes(depth) ? depth : 2;
        },
        set headingDepth(val) {
            const depth = Number(val);
            GM_setValue('setting_heading_depth', [1, 2, 3].includes(depth) ? depth : 2);
        }
    };

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

    // —————————————— 数据库模块 ——————————————
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
                        store.createIndex('cid_model_subtitle', ['cid', 'modelConfigId', 'subtitleLan'], { unique: false });
                    } else {
                        const store = event.target.transaction.objectStore(STORE_NAME);
                        if (!store.indexNames.contains('cid_model_subtitle')) {
                            store.createIndex('cid_model_subtitle', ['cid', 'modelConfigId', 'subtitleLan'], { unique: false });
                        }
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
                    const index = store.index('cid_model_subtitle');
                    const request = index.get([data.cid, data.modelConfigId, data.subtitleLan]);

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
        async getSummary(cid, modelConfigId, subtitleLan) {
            try {
                const db = await this.open();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const index = store.index('cid_model_subtitle');
                    const request = index.get([cid, modelConfigId, subtitleLan]);
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
        presetVersionKey: 'ai_model_presets_version',
        presetVersion: 3,
        inferApiFormat(config) {
            const url = String(config.apiUrl || '').toLowerCase();
            if (url.includes(':generatecontent') || url.includes('generativelanguage.googleapis.com/v1beta/models/')) {
                return API_FORMATS.GEMINI_NATIVE;
            }
            if (/\/responses\/?(?:\?|$)/.test(url)) return API_FORMATS.OPENAI_RESPONSES;
            return API_FORMATS.OPENAI_CHAT;
        },
        normalize(config) {
            return {
                ...config,
                apiFormat: config.apiFormat || this.inferApiFormat(config),
                webSearch: config.webSearch === true,
                webSearchSupported: config.webSearchSupported || 'unknown'
            };
        },
        getAll() {
            let configs = GM_getValue(this.key, null);
            if (!configs || !Array.isArray(configs) || configs.length === 0) {
                configs = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
                this.save(configs);
                GM_setValue(this.presetVersionKey, this.presetVersion);
                return configs;
            }

            let changed = false;
            const installedVersion = GM_getValue(this.presetVersionKey, 0);
            if (installedVersion < this.presetVersion) {
                const beforeCleanup = configs.length;
                configs = configs.filter(config => !(config.id === 'preset-deepseek-reasoner' && config.builtIn === true));
                if (configs.length !== beforeCleanup) changed = true;

                DEFAULT_PRESETS.forEach(preset => {
                    const index = configs.findIndex(config => config.id === preset.id);
                    if (index === -1) {
                        configs.push(JSON.parse(JSON.stringify(preset)));
                        changed = true;
                    } else if (configs[index].builtIn === true) {
                        const existing = configs[index];
                        configs[index] = {
                            ...JSON.parse(JSON.stringify(preset)),
                            apiKey: existing.apiKey || '',
                            apiUrl: existing.apiUrl || preset.apiUrl,
                            proxy: existing.proxy || '',
                            extraParams: existing.extraParams || ''
                        };
                        changed = true;
                    }
                });

                const oldGeminiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
                configs = configs.map(config => {
                    if (config.id === 'gemini-2.5-flash-总结版' || config.id === 'gemini-2.5-flash-preview-09-2025') {
                        const usesOldOfficialUrl = config.apiUrl === oldGeminiUrl;
                        changed = true;
                        return {
                            ...config,
                            name: 'Gemini 3.5 Flash',
                            modelName: 'gemini-3.5-flash',
                            apiUrl: usesOldOfficialUrl ? 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent' : config.apiUrl,
                            apiFormat: usesOldOfficialUrl ? API_FORMATS.GEMINI_NATIVE : (config.apiFormat || API_FORMATS.OPENAI_CHAT),
                            systemPrompt: VIDEO_SUMMARY_PROMPT,
                            webSearch: usesOldOfficialUrl ? true : config.webSearch === true,
                            webSearchSupported: usesOldOfficialUrl ? 'supported' : (config.webSearchSupported || 'unknown')
                        };
                    }
                    if (config.id === 'default_standard' && ['deepseek-chat', 'deepseek-v4-flash'].includes(config.modelName)) {
                        changed = true;
                        return {
                            ...config,
                            name: 'DeepSeek V4 Pro',
                            modelName: 'deepseek-v4-pro',
                            systemPrompt: VIDEO_SUMMARY_PROMPT,
                            webSearch: false,
                            webSearchSupported: 'unsupported'
                        };
                    }
                    return config;
                });
                GM_setValue(this.presetVersionKey, this.presetVersion);
            }

            configs = configs.map(config => {
                const normalized = this.normalize(config);
                if (!config.apiFormat || typeof config.webSearch !== 'boolean' || !config.webSearchSupported) changed = true;
                const cleanNames = {
                    'Gemini 3.5 Flash（旧配置已升级）': 'Gemini 3.5 Flash',
                    'DeepSeek V4 Pro（旧配置已升级）': 'DeepSeek V4 Pro'
                };
                if (cleanNames[normalized.name]) {
                    normalized.name = cleanNames[normalized.name];
                    changed = true;
                }
                if (config.id === 'gemini-2.5-flash-总结版' && String(config.systemPrompt || '').startsWith('现在是2025年12月')) {
                    normalized.systemPrompt = VIDEO_SUMMARY_PROMPT;
                    changed = true;
                }
                return normalized;
            });
            if (changed) this.save(configs);
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
            //直接按秒数差计算时分秒，避免new Date()读取本地时区导致字幕时间整体偏移
            let total = Math.round(input * 1000),
                hour = Math.floor(total / 3600000),
                minute = Math.floor(total / 60000) % 60,
                second = Math.floor(total / 1000) % 60;
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
            const params = new URLSearchParams(location.search);

            // 1. 常规视频的多P逻辑 (通过 URL 的 p 参数定位)
            const p = parseInt(params.get('p') || '1', 10);
            if (w.__INITIAL_STATE__?.videoData?.pages && w.__INITIAL_STATE__.videoData.pages[p - 1]) {
                const pageData = w.__INITIAL_STATE__.videoData.pages[p - 1];
                return {
                    cid: pageData.cid,
                    aid: w.__INITIAL_STATE__.videoData.aid,
                    bvid: w.__INITIAL_STATE__.videoData.bvid
                };
            }

            // 2. 尝试获取播放器实例中的 Manifest (动态更新最及时)
            if (w.player && typeof w.player.getManifest === 'function') {
                const manifest = w.player.getManifest();
                if (manifest) return { cid: manifest.cid, aid: manifest.aid, bvid: manifest.bvid };
            }

            // 3. Bangumi 或其他模式的 fallback
            let info = w.__INITIAL_STATE__?.epInfo || w.__INITIAL_STATE__?.videoData;

            // 4. 内嵌播放器
            if (!info && location.pathname.includes('html5player')) {
                return { cid: params.get('cid'), aid: params.get('aid'), bvid: params.get('bvid') };
            }

            // 5. 基础 Info 对象
            if (info) return { cid: info.cid, aid: info.aid, bvid: info.bvid };

            // 6. 全局变量保底 (B站有时会把当前cid挂在window上)
            if (w.cid) return { cid: w.cid, aid: w.aid, bvid: w.bvid };

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
        activeRequest: null,
        lastReport: null,
        abortActiveRequest() {
            if (this.activeRequest && typeof this.activeRequest.abort === 'function') {
                this.activeRequest.abort();
            }
            this.activeRequest = null;
        },
        parseExtraParams(config) {
            let extraParams = {};
            if (String(config.extraParams || '').trim()) {
                try {
                    extraParams = JSON.parse(config.extraParams);
                } catch (error) {
                    throw new Error(`附加请求参数不是有效 JSON: ${error.message}`);
                }
                if (!extraParams || Array.isArray(extraParams) || typeof extraParams !== 'object') {
                    throw new Error('附加请求参数必须是一个 JSON 对象。');
                }
            }
            return extraParams;
        },
        getOptionalNumbers(config) {
            const values = {};
            const temperature = Number(config.temperature);
            if (config.temperature !== '' && config.temperature !== null && Number.isFinite(temperature)) values.temperature = temperature;

            const topP = Number(config.top_p);
            if (config.top_p !== '' && config.top_p !== null && Number.isFinite(topP)) values.topP = topP;

            const maxTokens = Number(config.maxCompletionTokens);
            if (config.maxCompletionTokens !== '' && config.maxCompletionTokens !== null) {
                if (!Number.isInteger(maxTokens) || maxTokens <= 0) throw new Error('最大输出 Token 必须是正整数。');
                values.maxTokens = maxTokens;
            }
            return values;
        },
        resolveApiUrl(apiFormat, apiUrl, modelName = '') {
            const rawUrl = String(apiUrl || '').trim();
            if (apiFormat === API_FORMATS.GEMINI_NATIVE) {
                return rawUrl.replace('{model}', encodeURIComponent(modelName));
            }

            const endpoint = apiFormat === API_FORMATS.OPENAI_RESPONSES ? '/responses' : '/chat/completions';
            try {
                const parsed = new URL(rawUrl);
                const path = parsed.pathname.replace(/\/+$/, '');
                if (!path) {
                    parsed.pathname = `/v1${endpoint}`;
                } else if (/\/v1$/i.test(path)) {
                    parsed.pathname = `${path}${endpoint}`;
                }
                return parsed.toString();
            } catch (error) {
                return rawUrl;
            }
        },
        buildRequest(config, srtText) {
            const apiFormat = config.apiFormat || ConfigManager.inferApiFormat(config);
            const extraParams = this.parseExtraParams(config);
            const values = this.getOptionalNumbers(config);
            const headers = { 'Content-Type': 'application/json' };
            let url = this.resolveApiUrl(apiFormat, config.apiUrl, config.modelName);
            let body;

            if (apiFormat === API_FORMATS.OPENAI_RESPONSES) {
                headers.Authorization = `Bearer ${config.apiKey}`;
                body = { ...extraParams, model: config.modelName, instructions: config.systemPrompt, input: srtText, stream: false };
                if (values.temperature !== undefined) body.temperature = values.temperature;
                if (values.topP !== undefined) body.top_p = values.topP;
                if (values.maxTokens !== undefined) body.max_output_tokens = values.maxTokens;
                if (config.reasoningEffort) body.reasoning = { effort: config.reasoningEffort };
                if (config.webSearch) body.tools = [{ type: 'web_search' }];
            } else if (apiFormat === API_FORMATS.GEMINI_NATIVE) {
                headers['x-goog-api-key'] = config.apiKey;
                const generationConfig = {
                    ...(extraParams.generationConfig && typeof extraParams.generationConfig === 'object' ? extraParams.generationConfig : {})
                };
                if (values.temperature !== undefined) generationConfig.temperature = values.temperature;
                if (values.topP !== undefined) generationConfig.topP = values.topP;
                if (values.maxTokens !== undefined) generationConfig.maxOutputTokens = values.maxTokens;
                if (config.reasoningEffort) {
                    if (/^gemini-3(?:\.|-)/i.test(config.modelName)) {
                        const levels = { none: 'MINIMAL', minimal: 'MINIMAL', low: 'LOW', medium: 'MEDIUM', high: 'HIGH', xhigh: 'HIGH' };
                        generationConfig.thinkingConfig = { thinkingLevel: levels[config.reasoningEffort] || 'HIGH' };
                    } else {
                        const budgets = { none: 0, minimal: 512, low: 2048, medium: 8192, high: 16384, xhigh: 24576 };
                        generationConfig.thinkingConfig = { thinkingBudget: budgets[config.reasoningEffort] ?? -1 };
                    }
                }
                body = {
                    ...extraParams,
                    systemInstruction: { parts: [{ text: config.systemPrompt }] },
                    contents: [{ role: 'user', parts: [{ text: srtText }] }],
                    generationConfig
                };
                if (config.webSearch) body.tools = [{ google_search: {} }];
            } else {
                headers.Authorization = `Bearer ${config.apiKey}`;
                body = {
                    ...extraParams,
                    model: config.modelName,
                    messages: [
                        { role: 'system', content: config.systemPrompt },
                        { role: 'user', content: srtText }
                    ],
                    stream: false
                };
                if (values.temperature !== undefined) body.temperature = values.temperature;
                if (values.topP !== undefined) body.top_p = values.topP;
                if (values.maxTokens !== undefined) body.max_completion_tokens = values.maxTokens;
                if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
                if (config.webSearch) body.web_search_options = { search_context_size: 'medium' };
            }

            return { apiFormat, url, headers, body };
        },
        buildRequestBody(config, srtText) {
            return this.buildRequest(config, srtText).body;
        },
        formatSourcesMarkdown(sources) {
            if (!sources.length) return '';
            const list = sources.map((source, index) => {
                const safeTitle = String(source.title || source.url || `来源 ${index + 1}`).replace(/[\[\]]/g, '');
                const link = source.url ? `[${safeTitle}](${source.url})` : safeTitle;
                return `${index + 1}. ${link}`;
            }).join('\n\n');
            return `\n\n### 来源\n\n${list}`;
        },
        appendSourcesSection(text, sources) {
            if (!sources.length) return text;
            if (/(?:^|\n)#{1,6}\s*来源\b/.test(text)) return text;
            return `${text}${this.formatSourcesMarkdown(sources)}`;
        },
        extractResponseText(apiFormat, json) {
            if (apiFormat === API_FORMATS.OPENAI_RESPONSES) {
                const sources = [];
                const sourceIndexes = new Map();
                const getSourceIndex = (annotation, text) => {
                    if (!annotation || annotation.type !== 'url_citation' || !annotation.url) return null;
                    const key = String(annotation.url);
                    if (!sourceIndexes.has(key)) {
                        sourceIndexes.set(key, sources.length);
                        sources.push({
                            title: String(annotation.title || annotation.url),
                            url: key,
                            snippets: []
                        });
                    }
                    const source = sources[sourceIndexes.get(key)];
                    const start = Number(annotation.start_index);
                    const end = Number(annotation.end_index);
                    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                        const snippet = String(text || '').slice(Math.max(0, start), Math.min(text.length, end)).trim();
                        if (snippet && !source.snippets.includes(snippet)) source.snippets.push(snippet);
                    }
                    return sourceIndexes.get(key) + 1;
                };
                const annotateText = (item) => {
                    const text = String(item.text || '');
                    const annotations = Array.isArray(item.annotations) ? item.annotations : [];
                    const insertions = new Map();
                    annotations.forEach(annotation => {
                        const sourceIndex = getSourceIndex(annotation, text);
                        if (!sourceIndex) return;
                        const rawEnd = Number(annotation.end_index);
                        if (!Number.isFinite(rawEnd)) return;
                        const end = Math.max(0, Math.min(text.length, rawEnd));
                        if (!insertions.has(end)) insertions.set(end, []);
                        if (!insertions.get(end).includes(sourceIndex)) insertions.get(end).push(sourceIndex);
                    });
                    if (!insertions.size) return text;
                    return Array.from(insertions.keys()).sort((a, b) => b - a)
                        .reduce((result, position) => {
                            const markers = insertions.get(position).map(index => `[${index}]`).join('');
                            return result.slice(0, position) + markers + result.slice(position);
                        }, text);
                };
                const texts = (json.output || []).flatMap(item => item.content || [])
                    .filter(item => item.type === 'output_text' && typeof item.text === 'string')
                    .map(annotateText);
                if (texts.length) return this.appendSourcesSection(texts.join('\n'), sources);
                if (typeof json.output_text === 'string' && json.output_text) return json.output_text;
            } else if (apiFormat === API_FORMATS.GEMINI_NATIVE) {
                const candidate = (json.candidates || [])[0] || {};
                const texts = (json.candidates || []).flatMap(item => item.content?.parts || [])
                    .filter(part => typeof part.text === 'string')
                    .map(part => part.text);
                if (texts.length) {
                    let result = texts.join('\n');
                    const grounding = candidate.groundingMetadata || {};
                    const chunks = Array.isArray(grounding.groundingChunks) ? grounding.groundingChunks : [];
                    const sources = chunks.map((chunk, index) => {
                        const web = chunk.web || chunk.retrievedContext || {};
                        return {
                            title: String(web.title || web.uri || web.url || `来源 ${index + 1}`),
                            url: String(web.uri || web.url || ''),
                            snippets: []
                        };
                    });
                    const supports = Array.isArray(grounding.groundingSupports) ? grounding.groundingSupports : [];
                    supports.forEach((support) => {
                        const snippet = String(support.segment?.text || '').trim();
                        (support.groundingChunkIndices || []).forEach((chunkIndex) => {
                            if (!sources[chunkIndex] || !snippet) return;
                            if (!sources[chunkIndex].snippets.includes(snippet)) sources[chunkIndex].snippets.push(snippet);
                        });
                    });
                    if (sources.length && texts.length === 1 && !/\[\d{1,3}\]/.test(result) && supports.length) {
                        const text = texts[0];
                        const insertions = new Map();
                        supports.forEach((support) => {
                            const rawEnd = Number(support.segment?.endIndex);
                            if (!Number.isFinite(rawEnd)) return;
                            const nums = (support.groundingChunkIndices || []).map((chunkIndex) => chunkIndex + 1).filter((num) => num > 0);
                            if (!nums.length) return;
                            const end = Math.max(0, Math.min(text.length, rawEnd));
                            if (!insertions.has(end)) insertions.set(end, []);
                            nums.forEach((num) => {
                                if (!insertions.get(end).includes(num)) insertions.get(end).push(num);
                            });
                        });
                        if (insertions.size) {
                            result = Array.from(insertions.keys()).sort((a, b) => b - a).reduce((value, position) => {
                                const markers = insertions.get(position).map((num) => `[${num}]`).join('');
                                return value.slice(0, position) + markers + value.slice(position);
                            }, text);
                        }
                    }
                    return this.appendSourcesSection(result, sources);
                }
            } else {
                const content = json.choices?.[0]?.message?.content;
                if (typeof content === 'string') return content;
                if (Array.isArray(content)) {
                    const texts = content.filter(item => typeof item.text === 'string').map(item => item.text);
                    if (texts.length) return texts.join('\n');
                }
                if (typeof json.result === 'string') return json.result;
            }
            throw new Error('API 返回成功，但没有找到可用的文本内容。');
        },
        async sendRequest(config, srtText) {
            if (!config.apiKey || !config.apiUrl) throw new Error("请先在设置中填写 API Key 和 URL。");
            if (!config.modelName) throw new Error('请先填写模型名称。');
            const request = this.buildRequest(config, srtText);
            this.lastReport = { method: 'POST', url: request.url, status: '等待响应', contentType: '', responseText: '' };
            return new Promise((resolve, reject) => {
                let requestHandle = null;
                const finish = (callback, value) => {
                    if (this.activeRequest === requestHandle) this.activeRequest = null;
                    callback(value);
                };
                const options = {
                    method: 'POST', url: request.url,
                    headers: request.headers,
                    data: JSON.stringify(request.body),
                    timeout: 180000,
                    onload: (response) => {
                        Logger.info("API Response Status:", response.status);
                        const contentTypeMatch = String(response.responseHeaders || '').match(/^content-type:\s*([^\r\n]+)/im);
                        this.lastReport = {
                            method: 'POST',
                            url: request.url,
                            status: `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
                            contentType: contentTypeMatch ? contentTypeMatch[1].trim() : '未提供',
                            responseText: String(response.responseText || '').slice(0, 4000)
                        };
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const json = JSON.parse(response.responseText);
                                Logger.dir(json);
                                finish(resolve, this.extractResponseText(request.apiFormat, json));
                            } catch (e) { finish(reject, new Error('响应解析失败: ' + e.message)); }
                        } else {
                            let errMsg = response.statusText;
                            try {
                                const errJson = JSON.parse(response.responseText);
                                if (errJson.error && errJson.error.message) errMsg = errJson.error.message;
                            } catch (e) { }
                            finish(reject, new Error(`API Error (${response.status}): ${errMsg}`));
                        }
                    },
                    onerror: () => {
                        this.lastReport = { method: 'POST', url: request.url, status: '网络请求失败', contentType: '无', responseText: '' };
                        finish(reject, new Error("网络请求失败"));
                    },
                    ontimeout: () => {
                        this.lastReport = { method: 'POST', url: request.url, status: '请求超时', contentType: '无', responseText: '' };
                        finish(reject, new Error("请求超时"));
                    },
                    onabort: () => {
                        const error = new Error('请求已取消');
                        error.name = 'AbortError';
                        finish(reject, error);
                    }
                };
                if (config.proxy) {
                    options.proxy = config.proxy;
                }
                requestHandle = GM_xmlhttpRequest(options);
                this.activeRequest = requestHandle;
            });
        }
    };

    const MarkdownRenderer = {
        getParser() {
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') return marked;
            if (globalThis.marked && typeof globalThis.marked.parse === 'function') return globalThis.marked;
            return null;
        },
        normalize(text) {
            const source = String(text ?? '').replace(/^\uFEFF/, '').trim();
            const fencedMarkdown = source.match(/^```(?:markdown|md)[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
            return fencedMarkdown ? fencedMarkdown[1].trim() : source;
        },
        sanitize(html) {
            const template = document.createElement('template');
            template.innerHTML = html;
            template.content.querySelectorAll('script, iframe, object, embed, form, input, button, textarea, select, meta, link, base').forEach(el => el.remove());

            template.content.querySelectorAll('*').forEach(el => {
                [...el.attributes].forEach(attr => {
                    const name = attr.name.toLowerCase();
                    const value = attr.value.trim();
                    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
                        el.removeAttribute(attr.name);
                        return;
                    }
                    if ((name === 'href' || name === 'src') && !/^(?:https?:|mailto:|#|\/)/i.test(value)) {
                        el.removeAttribute(attr.name);
                    }
                });
                if (el.tagName === 'A') {
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                }
            });
            return template.content;
        },
        addTimestampButtons(root) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) {
                const parent = walker.currentNode.parentElement;
                if (parent && !parent.closest('code, pre, a, button, .katex')) textNodes.push(walker.currentNode);
            }

            const timestampPattern = /[\[【](\d{1,2}):([0-5]?\d)(?::([0-5]?\d))?[\]】]/g;
            textNodes.forEach(node => {
                const source = node.nodeValue;
                timestampPattern.lastIndex = 0;
                if (!timestampPattern.test(source)) return;

                timestampPattern.lastIndex = 0;
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                let match;
                while ((match = timestampPattern.exec(source)) !== null) {
                    fragment.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
                    const toSeconds = (hoursOrMinutes, minutesOrSeconds, seconds) => seconds !== undefined
                        ? Number(hoursOrMinutes) * 3600 + Number(minutesOrSeconds) * 60 + Number(seconds)
                        : Number(hoursOrMinutes) * 60 + Number(minutesOrSeconds);
                    const startSeconds = toSeconds(match[1], match[2], match[3]);
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'ai-timestamp';
                    button.dataset.time = String(startSeconds);
                    button.textContent = match[0];
                    button.title = `跳转到 ${match[0].slice(1, -1)}`;
                    fragment.appendChild(button);
                    lastIndex = timestampPattern.lastIndex;
                }
                fragment.appendChild(document.createTextNode(source.slice(lastIndex)));
                node.replaceWith(fragment);
            });
        },
        render(contentDiv, text) {
            const parser = this.getParser();
            if (!parser) throw new Error('Markdown 渲染器未加载，请检查 BootCDN 连接后刷新页面。');

            const rawHtml = parser.parse(this.normalize(text), { breaks: true, gfm: true });
            const body = document.createElement('div');
            body.className = 'markdown-body';
            body.appendChild(this.sanitize(rawHtml));
            body.querySelectorAll('table').forEach(table => {
                const wrapper = document.createElement('div');
                wrapper.className = 'ai-table-scroll';
                table.replaceWith(wrapper);
                wrapper.appendChild(table);
            });
            this.addTimestampButtons(body);
            const citations = this.addCitations(body);
            contentDiv.replaceChildren(body);
            return citations;
        },
        addCitations(root) {
            const headingPattern = /^(来源|参考(?:文献)?|引用来源|References?|Sources?)\s*$/i;
            const heading = [...root.querySelectorAll('h1, h2, h3, h4')].find((node) => headingPattern.test(node.textContent.trim()));
            const sources = new Map();
            if (heading) {
                heading.id = heading.id || 'ai-source-heading';
                let node = heading.nextElementSibling;
                while (node && !/^H[1-6]$/.test(node.tagName)) {
                    if (node.tagName === 'OL' || node.tagName === 'UL') {
                        node.classList.add('ai-source-list');
                        [...node.children].forEach((item, index) => {
                            if (item.tagName !== 'LI') return;
                            this.decorateSourceItem(item, index + 1, sources);
                        });
                    }
                    node = node.nextElementSibling;
                }
            }
            if (sources.size) {
                this.wrapCitationMarks(root, sources);
                this.attachPassageSnippets(root, sources);
            }
            return sources;
        },
        decorateSourceItem(item, index, sources) {
            item.id = `ai-source-${index}`;
            item.classList.add('ai-source-item');
            item.dataset.cite = String(index);
            const link = item.querySelector('a[href]');
            let title = '';
            const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                if (walker.currentNode.parentElement?.closest('blockquote')) continue;
                title += walker.currentNode.nodeValue;
            }
            title = title.replace(/^\s*\d+[\.)、]\s*/, '').replace(/\s+/g, ' ').trim()
                || (link ? link.textContent.trim() : '')
                || `来源 ${index}`;
            const indexPrefix = new RegExp(`^${index}[.)、]\\s*`);
            title = title.replace(indexPrefix, '').trim() || title;
            sources.set(index, {
                index,
                title,
                url: link ? link.href : '',
                snippets: []
            });

            const back = document.createElement('button');
            back.type = 'button';
            back.className = 'ai-source-back';
            back.dataset.cite = String(index);
            back.textContent = String(index);
            back.setAttribute('aria-label', `返回正文中的引用 ${index}`);
            item.insertBefore(back, item.firstChild);
        },
        wrapCitationMarks(root, sources) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) {
                const parent = walker.currentNode.parentElement;
                if (!parent || parent.closest('code, pre, a, button, .katex, .ai-cite, .ai-source-item')) continue;
                if (/[\[［]\d{1,3}[\]］]/.test(walker.currentNode.nodeValue)) textNodes.push(walker.currentNode);
            }

            const pattern = /(?:[\(（]([^)）\n]{1,80})[\)）])?\s*[\[［](\d{1,3})[\]］]/g;
            textNodes.forEach((node) => {
                const source = node.nodeValue;
                pattern.lastIndex = 0;
                if (!pattern.test(source)) return;
                pattern.lastIndex = 0;
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                let match;
                while ((match = pattern.exec(source)) !== null) {
                    const index = Number(match[2]);
                    if (!sources.has(index)) continue;
                    fragment.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
                    const cite = document.createElement('span');
                    cite.className = 'ai-cite';
                    cite.dataset.cite = String(index);
                    if (match[1]) {
                        const host = document.createElement('span');
                        host.className = 'ai-cite-host';
                        host.textContent = `(${match[1]})`;
                        cite.appendChild(host);
                    }
                    const mark = document.createElement('button');
                    mark.type = 'button';
                    mark.className = 'ai-cite-mark';
                    mark.dataset.cite = String(index);
                    mark.textContent = `[${index}]`;
                    mark.setAttribute('aria-label', `跳转到第 ${index} 条来源`);
                    cite.appendChild(mark);
                    fragment.appendChild(cite);
                    lastIndex = pattern.lastIndex;
                }
                fragment.appendChild(document.createTextNode(source.slice(lastIndex)));
                node.replaceWith(fragment);
            });
        },
        extractCitePassage(cite) {
            const block = cite.closest('p, li, td, th, h1, h2, h3, h4, blockquote, dd');
            if (!block || block.closest('.ai-source-item')) return '';
            const full = block.textContent.replace(/\s+/g, ' ').trim();
            if (!full) return '';
            if (full.length <= 240) return full;

            const mark = `[${cite.dataset.cite}]`;
            const pos = full.indexOf(mark);
            const anchor = pos >= 0 ? pos : Math.floor(full.length / 2);
            const boundary = /[。！？!?；;\n]/;
            let start = 0;
            for (let i = anchor - 1; i >= 0; i--) {
                if (boundary.test(full[i])) { start = i + 1; break; }
            }
            let end = full.length;
            for (let i = anchor; i < full.length; i++) {
                if (boundary.test(full[i])) { end = i + 1; break; }
            }
            let snippet = full.slice(start, end).trim();
            if (snippet.length < 16) {
                snippet = full.slice(Math.max(0, anchor - 90), Math.min(full.length, anchor + 130)).trim();
            }
            return snippet;
        },
        attachPassageSnippets(root, sources) {
            sources.forEach((source) => { source.snippets = []; });
            root.querySelectorAll('.ai-cite').forEach((cite) => {
                const source = sources.get(Number(cite.dataset.cite));
                if (!source) return;
                const snippet = this.extractCitePassage(cite);
                if (snippet && !source.snippets.includes(snippet)) source.snippets.push(snippet);
            });
        }
    };

    const rafThrottle = (callback) => {
        let frameId = 0;
        let latestArgs;
        return (...args) => {
            latestArgs = args;
            if (frameId) return;
            frameId = requestAnimationFrame(() => {
                frameId = 0;
                callback(...latestArgs);
            });
        };
    };

    // —————————————— UI 管理器 (核心) ——————————————

    const UIManager = {
        panel: null,
        settingsModal: null,
        floatBtn: null,
        currentCid: null,
        lastLoadedSubtitleLan: null,
        flatTheme: 'light',
        isNt4Mode: false,
        isDarkMode: false,
        isLoading: false,
        stateMonitorTimer: null,
        tocOnScroll: null,
        citationCatalog: null,
        citePopover: null,
        citePopoverTimer: 0,

        init() {
            // 扁平明暗主题与 NT4 模式分开保存，并兼容 4.0.9 的主题值。
            const savedTheme = GM_getValue('setting_ui_theme', null);
            const systemTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            const savedFlatTheme = GM_getValue('setting_ui_flat_theme', null);
            this.flatTheme = ['light', 'dark'].includes(savedFlatTheme)
                ? savedFlatTheme
                : (['light', 'dark'].includes(savedTheme) ? savedTheme : systemTheme);
            this.isNt4Mode = savedTheme === 'nt4';
            this.isDarkMode = !this.isNt4Mode && this.flatTheme === 'dark';

            this.createFloatButton();
            this.setupStyle();
            this.startStateMonitor();
        },

        startStateMonitor() {
            const checkState = () => {
                if (document.hidden) return;
                const ep = BilibiliHelper.getEpInfo();
                if (ep && ep.cid && ep.cid !== this.currentCid) {
                    Logger.info(`Detected CID Change: ${this.currentCid} -> ${ep.cid}`);
                    this.currentCid = ep.cid;
                    this.resetForNewVideo();
                }
            };
            window.addEventListener('popstate', checkState, { passive: true });
            window.addEventListener('hashchange', checkState, { passive: true });
            document.addEventListener('visibilitychange', checkState, { passive: true });
            this.stateMonitorTimer = window.setInterval(checkState, 2500);
            checkState();
        },

        async resetForNewVideo() {
            LLMHelper.abortActiveRequest();
            if (!this.panel) return;
            const contentDiv = document.getElementById('ai-content-area');
            const statusSpan = document.getElementById('ai-status');
            const subSelect = document.getElementById('ai-subtitle-select');

            if (contentDiv) contentDiv.innerHTML = '<div style="text-align:center;color:var(--ai-muted);margin-top:40px">视频已切换，正在获取字幕列表...</div>';
            this.citationCatalog = new Map();
            this.hideCitePopover();
            this.refreshToc();
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
            this.setupKatexStyle();

            const css = `
                /* 主面板样式 */
                .ai-summary-panel {
                    --ai-bg: #ffffff; --ai-surface: #eef1f5; --ai-toolbar: #f7f8fa; --ai-border: #cfd5dc; --ai-text: #20242a;
                    --ai-bg-rgb: 255, 255, 255; --ai-surface-rgb: 238, 241, 245; --ai-toolbar-rgb: 247, 248, 250; --ai-panel-opacity: 1; --ai-text-protection: 0;
                    --ai-muted: #68717d; --ai-accent: #1677a6; --ai-accent-soft: #eaf5fa; --ai-window-border: #0078d4; --ai-window-glow: rgba(0, 120, 212, .34);
                    position: fixed; width: 640px; height: 540px;
                    min-width: min(350px, calc(100vw - 24px)); min-height: min(250px, calc(100vh - 24px));
                    max-width: calc(100vw - 24px); max-height: calc(100vh - 24px);
                    background: transparent; color: var(--ai-text);
                    box-shadow: 0 2px 6px rgba(0, 0, 0, .20) !important;
                    border-radius: 4px !important; overflow: hidden; box-sizing: border-box; isolation: isolate; z-index: 2147483647 !important;
                    display: flex; flex-direction: column;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    border: 1px solid var(--ai-window-border) !important; backdrop-filter: none !important; transition: background-color 0.15s ease;
                }
                .ai-summary-panel.ai-dark-mode, .ai-modal-overlay.ai-dark-mode {
                    --ai-bg: #292a2d; --ai-surface: #3c4043; --ai-toolbar: #303134; --ai-border: #6f7479; --ai-text: #e8eaed;
                    --ai-bg-rgb: 41, 42, 45; --ai-surface-rgb: 60, 64, 67; --ai-toolbar-rgb: 48, 49, 52;
                    --ai-muted: #9aa0a6; --ai-accent: #8ab4f8; --ai-accent-soft: #394457; --ai-window-border: #4cc2ff; --ai-window-glow: rgba(76, 194, 255, .58);
                }
                .ai-summary-panel.ai-dark-mode { background: transparent !important; color: var(--ai-text) !important; border-color: var(--ai-window-border) !important; color-scheme: dark; }
                .ai-modal-overlay.ai-dark-mode { color: var(--ai-text); color-scheme: dark; }
                .ai-summary-panel.ai-nt4-mode, .ai-modal-overlay.ai-nt4-mode {
                    --ai-bg: #ffffff; --ai-surface: #c0c0c0; --ai-toolbar: #c0c0c0; --ai-border: #808080; --ai-text: #000000;
                    --ai-bg-rgb: 255, 255, 255; --ai-surface-rgb: 192, 192, 192; --ai-toolbar-rgb: 192, 192, 192;
                    --ai-muted: #000000; --ai-accent: #000080; --ai-accent-soft: #000080; --ai-window-border: #000000; --ai-window-glow: transparent;
                }
                /* Header & Toolbar */
                .ai-header { min-height: 46px; padding: 6px 10px 6px 16px; border-bottom: 1px solid var(--ai-border); display: flex; justify-content: space-between; align-items: center; gap: 12px; user-select: none; background: rgba(var(--ai-surface-rgb), var(--ai-panel-opacity)); border-radius: 0; cursor: move; flex-shrink: 0; box-sizing: border-box; }
                .ai-dark-mode .ai-header { background: rgba(var(--ai-surface-rgb), var(--ai-panel-opacity)) !important; border-bottom-color: var(--ai-border) !important; }
                .ai-toolbar { min-height: 44px; padding: 7px 16px; background: rgba(var(--ai-toolbar-rgb), var(--ai-panel-opacity)); border-bottom: 1px solid var(--ai-border); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; box-sizing: border-box; }
                .ai-dark-mode .ai-toolbar { background: rgba(var(--ai-toolbar-rgb), var(--ai-panel-opacity)); border-bottom-color: var(--ai-border); }
                .ai-toolbar-label { font-size: 12px; color: var(--ai-muted); }
                .ai-body { flex: 1; min-height: 0; display: flex; align-items: stretch; position: relative; }

                /* 基于 MIT-licensed 98.css (https://jdan.github.io/98.css/) 规则的独立 NT4 窗口皮肤。 */
                .ai-summary-panel.ai-nt4-mode {
                    padding: 3px; border: 0 !important;
                    background:
                        linear-gradient(rgba(192,192,192,var(--ai-panel-opacity)), rgba(192,192,192,var(--ai-panel-opacity))) top / 100% 3px no-repeat,
                        linear-gradient(rgba(192,192,192,var(--ai-panel-opacity)), rgba(192,192,192,var(--ai-panel-opacity))) bottom / 100% 3px no-repeat,
                        linear-gradient(rgba(192,192,192,var(--ai-panel-opacity)), rgba(192,192,192,var(--ai-panel-opacity))) left / 3px 100% no-repeat,
                        linear-gradient(rgba(192,192,192,var(--ai-panel-opacity)), rgba(192,192,192,var(--ai-panel-opacity))) right / 3px 100% no-repeat !important;
                    box-shadow: inset -1px -1px rgba(10,10,10,var(--ai-panel-opacity)), inset 1px 1px rgba(223,223,223,var(--ai-panel-opacity)), inset -2px -2px rgba(128,128,128,var(--ai-panel-opacity)), inset 2px 2px rgba(255,255,255,var(--ai-panel-opacity)), 2px 2px 0 rgba(0, 0, 0, .45) !important;
                    border-radius: 0 !important; backdrop-filter: none; font-family: Tahoma, "MS Sans Serif", "Segoe UI", sans-serif;
                }
                .ai-nt4-mode .ai-header { min-height: 30px; padding: 3px 2px 3px 6px; background: linear-gradient(90deg, rgba(0,0,128,var(--ai-panel-opacity)), rgba(16,132,208,var(--ai-panel-opacity))) !important; color: #fff; border: 0 !important; }
                .ai-nt4-mode .ai-header > div:first-child { font-size: 12px; font-weight: 700; }
                .ai-nt4-mode .ai-header #ai-status, .ai-nt4-mode .ai-opacity-control { color: #fff !important; }
                .ai-nt4-mode .ai-toolbar { min-height: 39px; padding: 6px 8px; background: rgba(192,192,192,var(--ai-panel-opacity)); border: 0; box-shadow: inset 0 -1px #808080, inset 0 -2px #fff; color: #000; }
                .ai-nt4-mode .ai-content { margin: 0; padding: 16px 17px; box-sizing: border-box; background: rgba(192, 192, 192, var(--ai-panel-opacity)); color: #000; border: 3px solid #c0c0c0; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; }
                .ai-nt4-mode .ai-content .markdown-body, .ai-nt4-mode .ai-content .markdown-body p, .ai-nt4-mode .ai-content .markdown-body li { background: transparent; color: #000; }
                .ai-nt4-mode .ai-btn-icon, .ai-nt4-mode .ai-settings-close, .ai-nt4-mode .ai-btn {
                    border: 0; border-radius: 0; background: #c0c0c0; color: #000; text-shadow: none; transition: none;
                    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
                }
                .ai-nt4-mode .ai-btn-icon:hover, .ai-nt4-mode .ai-settings-close:hover { background: #c0c0c0; color: #000; }
                .ai-nt4-mode .ai-btn-icon:not(:disabled):active, .ai-nt4-mode .ai-settings-close:not(:disabled):active, .ai-nt4-mode .ai-btn:not(:disabled):active, .ai-nt4-mode .ai-btn-icon.is-active {
                    color: #000; box-shadow: inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080;
                }
                .ai-nt4-mode .ai-btn-icon .ai-btn-symbol, .ai-nt4-mode .ai-btn-icon span { color: #000; text-shadow: none; }
                .ai-nt4-mode .ai-btn-icon { min-width: 26px; height: 24px; padding: 0 6px; font-size: 12px; }
                .ai-nt4-mode .ai-btn-symbol { font-size: 13px; }
                .ai-nt4-mode .ai-select, .ai-nt4-mode .ai-form-input, .ai-nt4-mode .ai-form-textarea {
                    border: 0; border-radius: 0; color: #000; outline: none;
                    box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a;
                }
                /* 控件叠在已半透明的工具栏上，不能再套一层 panel-opacity，否则会比周围更实 */
                .ai-nt4-mode .ai-select { background-color: transparent; }
                .ai-nt4-mode .ai-form-input, .ai-nt4-mode .ai-form-textarea { background-color: #fff; }
                .ai-nt4-mode .ai-select { height: 24px; padding: 3px 18px 3px 5px; }
                .ai-nt4-mode .ai-select:focus, .ai-nt4-mode .ai-form-input:focus, .ai-nt4-mode .ai-form-textarea:focus { box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; }
                .ai-nt4-mode .ai-resizer::after { border-color: #0a0a0a; }
                .ai-nt4-mode .markdown-body h1, .ai-nt4-mode .markdown-body h2, .ai-nt4-mode .markdown-body h3 { color: #000080 !important; border-bottom-color: #808080 !important; }
                .ai-nt4-mode .markdown-body strong { color: #000 !important; }
                .ai-nt4-mode .ai-content a, .ai-nt4-mode .ai-timestamp { color: #000080; }
                .ai-nt4-mode .ai-timestamp:hover, .ai-nt4-mode .ai-timestamp:focus-visible { background: #000080; color: #fff; box-shadow: none; }
                .ai-nt4-mode .markdown-body th, .ai-nt4-mode .markdown-body td { border-color: #808080 !important; }
                .ai-nt4-mode .markdown-body th { background: color-mix(in srgb, #000 8%, transparent) !important; color: #000 !important; }
                .ai-nt4-mode .markdown-body tr:nth-child(2n) { background: color-mix(in srgb, #fff 22%, transparent) !important; }
                .ai-nt4-mode .markdown-body blockquote { color: #000; border-left-color: #808080; }
                .ai-nt4-mode .markdown-body hr { background: #808080; }
                .ai-nt4-mode .ai-table-scroll { padding: 2px; background: transparent; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; scrollbar-color: auto; scrollbar-width: auto; }
                .ai-nt4-mode .ai-table-scroll table { margin: 0 !important; border-collapse: collapse !important; background: transparent; border: 1px solid #808080; }
                .ai-nt4-mode .ai-table-scroll th, .ai-nt4-mode .ai-table-scroll td { padding: 4px 8px !important; border: 1px solid #808080 !important; color: #000 !important; }
                .ai-nt4-mode .ai-table-scroll th { background: color-mix(in srgb, #000 8%, transparent) !important; box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf; font-weight: 400; white-space: nowrap; }
                .ai-nt4-mode .ai-table-scroll td { background: transparent !important; }
                /* 只用轻微罩色区分斑马纹，避免再乘一次 --ai-panel-opacity */
                .ai-nt4-mode .ai-table-scroll tbody tr:nth-child(odd) { background: transparent !important; }
                .ai-nt4-mode .ai-table-scroll tbody tr:nth-child(2n) { background: color-mix(in srgb, #fff 22%, transparent) !important; }

                /* Controls */
                .ai-resizer { width: 15px; height: 15px; background: transparent; position: absolute; right: 0; bottom: 0; cursor: se-resize; z-index: 10; }
                .ai-resizer::after { content: ''; position: absolute; right: 4px; bottom: 4px; width: 6px; height: 6px; border-right: 2px solid #ccc; border-bottom: 2px solid #ccc; }
                .ai-controls { display: flex; align-items: center; gap: 5px; cursor: default; flex-wrap: nowrap; }
                .ai-opacity-control { display: flex; align-items: center; gap: 6px; color: var(--ai-muted); font-size: 12px; white-space: nowrap; }
                .ai-opacity-label { font-weight: 600; }
                .ai-opacity-value { width: 39px; height: 22px; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--ai-border); border-radius: 3px; background: transparent; color: var(--ai-text); font-variant-numeric: tabular-nums; }
                .ai-select {
                    appearance: none; -webkit-appearance: none; height: 30px; padding: 4px 20px 4px 8px; border-radius: 4px;
                    border: 1px solid var(--ai-border); background-color: transparent; color: var(--ai-text); font-size: 12px; outline: none; max-width: 180px;
                    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
                    background-position: calc(100% - 12px) calc(50% - 1px), calc(100% - 7px) calc(50% - 1px);
                    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; color-scheme: inherit;
                }
                .ai-select:focus { border-color: var(--ai-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ai-accent) 18%, transparent); }
                .ai-dark-mode .ai-select { background-color: transparent; color: var(--ai-text); border-color: var(--ai-border); }
                .ai-btn-icon { cursor: pointer; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: inherit; font-size: 16px; transition: background 0.2s; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; }
                .ai-btn-icon:hover { background: rgba(0,0,0,0.1); }
                .ai-dark-mode .ai-btn-icon:hover { background: rgba(255,255,255,0.1); }
                .ai-btn-icon.disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
                .ai-btn-labeled { width: auto; min-width: 28px; padding: 4px 7px; gap: 4px; font-size: 12px; white-space: nowrap; }
                .ai-btn-labeled .ai-btn-symbol { font-size: 15px; line-height: 1; }
                .ai-opacity-range { position: relative; width: 74px; height: 18px; flex: 0 0 74px; display: inline-block; overflow: visible; }
                .ai-opacity-track { position: absolute; left: 7px; right: 7px; top: 50%; height: 4px; transform: translateY(-50%); overflow: hidden; border-radius: 2px; background: var(--ai-border); pointer-events: none; }
                .ai-opacity-fill { display: block; width: 100%; height: 100%; border-radius: inherit; background: var(--ai-accent); }
                .ai-opacity-thumb { position: absolute; left: 100%; top: 50%; z-index: 1; width: 14px; height: 14px; box-sizing: border-box; border: 2px solid var(--ai-bg); border-radius: 50%; background: var(--ai-accent); box-shadow: 0 0 0 1px var(--ai-accent); pointer-events: none; transform: translate(-100%, -50%); }
                .ai-opacity-slider { appearance: none; position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; opacity: 0; background: transparent; cursor: pointer; }
                .ai-opacity-slider::-webkit-slider-runnable-track { width: 100%; height: 18px; border: 0; background: transparent; }
                .ai-opacity-slider::-webkit-slider-thumb { appearance: none; width: 14px; height: 18px; border: 0; background: transparent; }
                .ai-opacity-slider::-moz-range-track { width: 100%; height: 18px; border: 0; background: transparent; }
                .ai-opacity-slider::-moz-range-progress { background: transparent; }
                .ai-opacity-slider::-moz-range-thumb { width: 14px; height: 18px; border: 0; background: transparent; }
                .ai-opacity-range:focus-within { outline: 1px solid var(--ai-accent); outline-offset: 2px; }
                .ai-nt4-mode .ai-opacity-value { height: 21px; border: 0; border-radius: 0; background: transparent; color: #000; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; }
                .ai-nt4-mode .ai-opacity-range { height: 22px; }
                .ai-nt4-mode .ai-opacity-track {
                    left: 6px; right: 6px; height: 6px; overflow: visible; border-radius: 0; background: #fff;
                    box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a;
                }
                .ai-nt4-mode .ai-opacity-fill { display: none; }
                .ai-nt4-mode .ai-opacity-thumb {
                    width: 13px; height: 20px; border: 0; border-radius: 0; background: #c0c0c0;
                    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf,
                        inset 0 3px 0 -2px #808080, inset 0 -3px 0 -2px #808080;
                }
                .ai-nt4-mode .ai-opacity-slider::-webkit-slider-runnable-track { height: 20px; }
                .ai-nt4-mode .ai-opacity-slider::-webkit-slider-thumb { width: 12px; height: 20px; }
                .ai-nt4-mode .ai-opacity-slider::-moz-range-track { height: 20px; background: transparent; box-shadow: none; }
                .ai-nt4-mode .ai-opacity-slider::-moz-range-progress { background: transparent; }
                .ai-nt4-mode .ai-opacity-slider::-moz-range-thumb { width: 12px; height: 20px; }
                .ai-nt4-mode .ai-opacity-range:focus-within { outline: 1px dotted #000; outline-offset: 1px; }

                .ai-float-button, .ai-float-button * {
                    -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important;
                }
                .ai-float-button {
                    appearance: none !important; position: fixed !important; width: 42px !important; height: 42px !important;
                    aspect-ratio: 1 / 1 !important; flex: 0 0 42px !important;
                    min-width: 42px !important; min-height: 42px !important; max-width: 42px !important; max-height: 42px !important;
                    margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 50% !important;
                    overflow: hidden !important; box-sizing: border-box !important; display: grid !important; place-items: center !important;
                    background: #1677a6 !important; color: #fff !important; font: 700 14px/1 Arial, sans-serif !important;
                    letter-spacing: 0 !important; text-align: center !important; line-height: 1 !important; text-indent: 0 !important;
                    cursor: grab !important; touch-action: none !important;
                    box-shadow: 0 4px 12px rgba(20, 28, 36, .18) !important; z-index: 2147483647 !important;
                }
                .ai-float-button.is-pointer-down { cursor: grabbing !important; }
                .ai-float-button:focus-visible { outline: 2px solid #fff !important; outline-offset: 2px !important; }

                /* —————— 左侧章节时间轴：窄轨 + 悬浮标题预览 —————— */
                .ai-toc { flex: 0 0 0; width: 0; position: relative; z-index: 6; overflow: visible; user-select: none; }
                .ai-toc:not([hidden]) { flex: 0 0 22px; width: 22px; }
                .ai-toc-inner {
                    position: absolute; inset: 0; width: 22px; box-sizing: border-box; overflow: visible;
                    background: rgba(var(--ai-toolbar-rgb), var(--ai-panel-opacity));
                    border-right: 1px solid var(--ai-border);
                }
                .ai-toc-track {
                    position: absolute; left: 10px; top: 14px; bottom: 14px; width: 2px;
                    background: color-mix(in srgb, var(--ai-accent) 55%, var(--ai-border));
                    border-radius: 1px; pointer-events: none;
                }
                .ai-toc-item {
                    appearance: none; -webkit-appearance: none; position: absolute; left: 0; width: 22px; height: 18px;
                    margin: 0; padding: 0; border: 0; background: transparent; color: var(--ai-text);
                    cursor: pointer; overflow: visible; z-index: 1; font: inherit; text-shadow: none;
                }
                .ai-toc-item:hover, .ai-toc-item:focus-visible { z-index: 8; }
                .ai-toc-dot {
                    position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; box-sizing: border-box;
                    border: 2px solid var(--ai-accent); border-radius: 50%; background: var(--ai-bg);
                    transform: translate(-50%, -50%); transition: transform .12s ease, background-color .12s ease, box-shadow .12s ease;
                }
                .ai-toc-item.is-h1 .ai-toc-dot { width: 10px; height: 10px; }
                .ai-toc-item.is-h3 .ai-toc-dot { width: 7px; height: 7px; border-width: 1px; }
                .ai-toc-tip {
                    position: absolute; left: 26px; top: 50%; transform: translateY(-50%);
                    visibility: hidden; opacity: 0; pointer-events: none;
                    width: max-content; max-width: min(360px, 46vw); padding: 6px 10px; box-sizing: border-box;
                    overflow: visible; white-space: normal; overflow-wrap: anywhere; word-break: break-word;
                    background: var(--ai-bg); color: var(--ai-text);
                    border: 1px solid var(--ai-border); border-radius: 4px;
                    box-shadow: 0 6px 18px rgba(20, 28, 36, .16);
                    font-size: 12px; font-weight: 600; line-height: 1.45; text-align: left;
                    transition: opacity .12s ease, visibility .12s ease;
                }
                .ai-toc-tip::before {
                    content: ''; position: absolute; right: 100%; top: 50%;
                    border: 5px solid transparent; border-right-color: var(--ai-bg);
                    transform: translateY(-50%);
                }
                .ai-toc-item:hover .ai-toc-tip, .ai-toc-item:focus-visible .ai-toc-tip {
                    visibility: visible; opacity: 1;
                }
                .ai-toc-item:hover .ai-toc-dot, .ai-toc-item:focus-visible .ai-toc-dot {
                    background: var(--ai-accent); transform: translate(-50%, -50%) scale(1.15);
                }
                .ai-toc-item.is-active .ai-toc-dot {
                    background: var(--ai-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ai-accent) 28%, transparent);
                }
                .ai-toc-item:focus-visible { outline: none; }
                .ai-md-heading { scroll-margin-top: 10px; }

                .ai-dark-mode .ai-toc-dot { background: var(--ai-surface); }
                .ai-dark-mode .ai-toc-tip {
                    background: #303134; color: #e8eaed; border-color: #6f7479;
                    box-shadow: 0 8px 20px rgba(0, 0, 0, .45);
                }
                .ai-dark-mode .ai-toc-tip::before { border-right-color: #303134; }

                .ai-nt4-mode .ai-body { background: rgba(192, 192, 192, var(--ai-panel-opacity)); }
                .ai-nt4-mode .ai-toc-inner {
                    background: #c0c0c0; border-right: 0;
                    box-shadow: inset -1px 0 #fff, inset -2px 0 #808080, inset 1px 0 #dfdfdf;
                }
                .ai-nt4-mode .ai-toc-track {
                    left: 10px; width: 1px; background: #000; border-radius: 0;
                    box-shadow: 1px 0 #fff;
                }
                .ai-nt4-mode .ai-toc-item, .ai-nt4-mode .ai-toc-item:hover, .ai-nt4-mode .ai-toc-item:focus-visible {
                    background: transparent; color: #000; box-shadow: none; text-shadow: none;
                }
                .ai-nt4-mode .ai-toc-dot {
                    width: 8px; height: 8px; border: 1px solid #000; border-radius: 0; background: #000080;
                    box-shadow: inset 1px 1px #1084d0;
                }
                .ai-nt4-mode .ai-toc-item.is-h1 .ai-toc-dot { width: 9px; height: 9px; }
                .ai-nt4-mode .ai-toc-item.is-h3 .ai-toc-dot { width: 6px; height: 6px; }
                .ai-nt4-mode .ai-toc-item:hover .ai-toc-dot,
                .ai-nt4-mode .ai-toc-item:focus-visible .ai-toc-dot,
                .ai-nt4-mode .ai-toc-item.is-active .ai-toc-dot {
                    background: #fff; box-shadow: inset 1px 1px #dfdfdf; outline: 1px solid #000080;
                    transform: translate(-50%, -50%);
                }
                .ai-nt4-mode .ai-toc-tip {
                    background: #ffffe1; color: #000; border: 1px solid #000; border-radius: 0;
                    box-shadow: 1px 1px 0 #000; font: 11px/1.35 Tahoma, "MS Sans Serif", sans-serif; font-weight: 400;
                }
                .ai-nt4-mode .ai-toc-tip::before { display: none; }
                .ai-nt4-mode .ai-toc-item:focus-visible { outline: 1px dotted #000; outline-offset: -2px; }

                /* —————— Markdown 内容样式核心修复 —————— */
                .ai-content { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 18px 20px; font-size: 14px; line-height: 1.65; position: relative; background: rgba(var(--ai-bg-rgb), var(--ai-panel-opacity)); scrollbar-color: #aeb7c2 #f2f4f6; scrollbar-width: thin; scrollbar-gutter: stable; }
                .ai-settings-list, .ai-settings-form { scrollbar-color: #aeb7c2 #f2f4f6; scrollbar-width: thin; }
                .ai-content::-webkit-scrollbar, .ai-settings-list::-webkit-scrollbar, .ai-settings-form::-webkit-scrollbar { width: 8px; height: 8px; }
                .ai-content::-webkit-scrollbar-track, .ai-settings-list::-webkit-scrollbar-track, .ai-settings-form::-webkit-scrollbar-track { background: #f2f4f6; }
                .ai-content::-webkit-scrollbar-thumb, .ai-settings-list::-webkit-scrollbar-thumb, .ai-settings-form::-webkit-scrollbar-thumb { background: #aeb7c2; border-radius: 8px; border: 2px solid #f2f4f6; }
                .ai-dark-mode .ai-content, .ai-dark-mode .ai-settings-list, .ai-dark-mode .ai-settings-form { scrollbar-color: #6f7479 var(--ai-bg); }
                .ai-dark-mode .ai-content::-webkit-scrollbar-track, .ai-dark-mode .ai-settings-list::-webkit-scrollbar-track, .ai-dark-mode .ai-settings-form::-webkit-scrollbar-track { background: var(--ai-bg); }
                .ai-dark-mode .ai-content::-webkit-scrollbar-thumb, .ai-dark-mode .ai-settings-list::-webkit-scrollbar-thumb, .ai-dark-mode .ai-settings-form::-webkit-scrollbar-thumb { background: #6f7479; border-color: var(--ai-bg); }
                .ai-nt4-mode .ai-content, .ai-nt4-mode .ai-settings-list, .ai-nt4-mode .ai-settings-form, .ai-nt4-mode .ai-table-scroll {
                    /* 必须设成 auto：Chrome 一旦给 scrollbar-color 指定颜色，就会忽略下面整套 ::-webkit-scrollbar 的 NT4 皮肤 */
                    scrollbar-color: auto; scrollbar-width: auto;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar, .ai-nt4-mode .ai-settings-list::-webkit-scrollbar, .ai-nt4-mode .ai-settings-form::-webkit-scrollbar, .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar {
                    width: 16px; height: 16px;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-track, .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-track, .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-track, .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-track {
                    background-color: #dfdfdf;
                    background-image: linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%), linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);
                    background-position: 0 0, 1px 1px; background-size: 2px 2px;
                    box-shadow: inset 1px 1px #808080, inset -1px -1px #fff;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-thumb, .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-thumb, .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-thumb, .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-thumb {
                    min-width: 16px; min-height: 16px; border: 0; border-radius: 0; background: #c0c0c0;
                    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-button, .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-button, .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-button, .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-button {
                    width: 16px; height: 16px; border: 0; border-radius: 0; background-color: #c0c0c0;
                    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-button:vertical:decrement,
                .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-button:vertical:decrement,
                .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-button:vertical:decrement,
                .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-button:vertical:decrement {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'%3E%3Cpath d='M0,5 L2.5,0 L5,5 Z' fill='%230a0a0a'/%3E%3C/svg%3E");
                    background-repeat: no-repeat; background-position: center;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-button:vertical:increment,
                .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-button:vertical:increment,
                .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-button:vertical:increment,
                .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-button:vertical:increment {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'%3E%3Cpath d='M0,0 L2.5,5 L5,0 Z' fill='%230a0a0a'/%3E%3C/svg%3E");
                    background-repeat: no-repeat; background-position: center;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-button:horizontal:decrement,
                .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-button:horizontal:decrement,
                .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-button:horizontal:decrement,
                .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-button:horizontal:decrement {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'%3E%3Cpath d='M5,0 L0,2.5 L5,5 Z' fill='%230a0a0a'/%3E%3C/svg%3E");
                    background-repeat: no-repeat; background-position: center;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-button:horizontal:increment,
                .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-button:horizontal:increment,
                .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-button:horizontal:increment,
                .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-button:horizontal:increment {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'%3E%3Cpath d='M0,0 L5,2.5 L0,5 Z' fill='%230a0a0a'/%3E%3C/svg%3E");
                    background-repeat: no-repeat; background-position: center;
                }
                .ai-nt4-mode .ai-content::-webkit-scrollbar-corner, .ai-nt4-mode .ai-settings-list::-webkit-scrollbar-corner, .ai-nt4-mode .ai-settings-form::-webkit-scrollbar-corner, .ai-nt4-mode .ai-table-scroll::-webkit-scrollbar-corner { background: #c0c0c0; }

                /* 基础字体 */
                .ai-content .markdown-body { font-family: inherit; color: inherit; text-align: left !important; word-wrap: break-word; }
                .ai-summary-panel:not(.ai-dark-mode):not(.ai-nt4-mode) .ai-content .markdown-body { text-shadow: 0 1px 1px rgba(255, 255, 255, var(--ai-text-protection)); }
                .ai-summary-panel.ai-dark-mode .ai-content .markdown-body { text-shadow: 0 1px 2px rgba(0, 0, 0, var(--ai-text-protection)); }
                .ai-summary-panel.ai-nt4-mode .ai-content .markdown-body { text-shadow: 1px 1px rgba(255, 255, 255, var(--ai-text-protection)); }
                .ai-content .markdown-body > :first-child { margin-top: 0 !important; }
                .ai-content .markdown-body p { margin-top: 0; }
                .ai-content .markdown-body h1 { font-size: 1.65em; }
                .ai-content .markdown-body h2 { font-size: 1.4em; }
                .ai-content .markdown-body h3 { font-size: 1.2em; }

                /* 标题 */
                .ai-content .markdown-body h1, .ai-content .markdown-body h2, .ai-content .markdown-body h3 {
                    margin-top: 18px !important; margin-bottom: 10px !important; font-weight: 650 !important; line-height: 1.4 !important; color: var(--ai-accent); border-bottom: 1px solid var(--ai-border); padding-bottom: 5px;
                }
                .ai-dark-mode .ai-content,
                .ai-dark-mode .ai-content .markdown-body,
                .ai-dark-mode .ai-content .markdown-body p,
                .ai-dark-mode .ai-content .markdown-body li,
                .ai-dark-mode .ai-content .markdown-body td,
                .ai-dark-mode .ai-content .markdown-body th,
                .ai-dark-mode .ai-content .markdown-body code,
                .ai-dark-mode .ai-content .markdown-body pre,
                .ai-dark-mode .ai-content .katex {
                    color: #e8eaed !important;
                }
                .ai-dark-mode .ai-content .markdown-body h1,
                .ai-dark-mode .ai-content .markdown-body h2,
                .ai-dark-mode .ai-content .markdown-body h3 {
                    color: #8ab4f8 !important; border-bottom-color: var(--ai-border);
                }
                .ai-dark-mode .ai-content a, .ai-dark-mode .ai-timestamp { color: #8ab4f8; }
                .ai-dark-mode .ai-header #ai-status { color: #9aa0a6; }

                /* 段落与列表 */
                .ai-content .markdown-body p { margin-bottom: 10px !important; }
                .ai-content .markdown-body ul, .ai-content .markdown-body ol { list-style-type: disc !important; padding-left: 20px !important; margin-bottom: 12px !important; }
                .ai-content .markdown-body ol { list-style-type: decimal !important; }
                .ai-content .markdown-body li { margin-bottom: 4px; }

                /* 强调 */
                .ai-content .markdown-body strong { font-weight: bold !important; color: #fb7299; }
                .ai-dark-mode .ai-content .markdown-body strong { color: #ff8eab; }

                /* 链接 */
                .ai-content a { color: #00a1d6; text-decoration: none; font-weight: bold; cursor: pointer; }
                .ai-content a:hover { text-decoration: underline; }

                /* —————— 表格样式 (修复重点) —————— */
                .ai-content .markdown-body table {
                    border-collapse: collapse; width: max-content; min-width: 100%; margin-bottom: 16px; display: table;
                }
                .ai-content .markdown-body table { max-width: 100%; }
                .ai-table-scroll { max-width: 100%; overflow-x: auto; scrollbar-color: #aeb7c2 #f2f4f6; scrollbar-width: thin; }
                .ai-dark-mode .ai-table-scroll { scrollbar-color: #5f6368 #202124; }
                .ai-content .markdown-body th, .ai-content .markdown-body td { max-width: 360px; overflow-wrap: anywhere; }
                .ai-content .markdown-body th, .ai-content .markdown-body td {
                    border: 1px solid #dfe2e5; padding: 6px 13px; font-size: 13px;
                }
                .ai-content .markdown-body th {
                    background-color: color-mix(in srgb, #1f2328 5.5%, transparent); font-weight: bold; text-align: left;
                }
                /* 表格隔行变色：罩一层微差，不再乘 panel-opacity，避免比正文更实 */
                .ai-content .markdown-body tr:nth-child(2n) { background-color: color-mix(in srgb, #1f2328 3%, transparent); }

                /* 深色模式下的表格 */
                .ai-dark-mode .ai-content .markdown-body th,
                .ai-dark-mode .ai-content .markdown-body td { border-color: var(--ai-border); }
                .ai-dark-mode .ai-content .markdown-body th { background-color: color-mix(in srgb, #fff 7%, transparent); color: var(--ai-text); }
                .ai-dark-mode .ai-content .markdown-body tr:nth-child(2n) { background-color: color-mix(in srgb, #fff 4%, transparent); }

                /* 引用块 */
                .ai-content .markdown-body blockquote {
                    padding: 0 1em; color: #6a737d; border-left: 0.25em solid #dfe2e5; margin: 0 0 16px 0;
                }
                .ai-dark-mode .ai-content .markdown-body blockquote { color: var(--ai-muted); border-left-color: var(--ai-border); }

                /* 分割线 */
                .ai-content .markdown-body hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #e1e4e8; border: 0; }
                .ai-dark-mode .ai-content .markdown-body hr { background-color: var(--ai-border); }

                /* Settings Modal */
                .ai-modal-overlay { --ai-panel-opacity: 1; --ai-text-protection: 0; position: fixed; inset: 0; padding: 12px; box-sizing: border-box; overflow: hidden; overscroll-behavior: contain; background: rgba(16, 20, 24, 0.46); z-index: 2147483648; display: flex; justify-content: center; align-items: center; color-scheme: light; }
                .ai-settings-box { width: min(820px, 100%); height: min(620px, 100%); min-height: 0; box-sizing: border-box; background: var(--ai-bg, #fff); color: var(--ai-text, #20242a); border: 1px solid var(--ai-window-border, #0078d4) !important; border-radius: 4px !important; display: grid; grid-template-rows: 48px minmax(0, 1fr); overflow: hidden; isolation: isolate; position: relative; box-shadow: 0 2px 6px rgba(0, 0, 0, .22) !important; }
                .ai-dark-mode .ai-settings-box { color-scheme: dark; }
                .ai-dark-mode .ai-settings-box { background: var(--ai-bg); color: var(--ai-text); border-color: var(--ai-window-border); }
                .ai-nt4-mode .ai-settings-box { padding: 3px; border: 0 !important; border-radius: 0 !important; background: #c0c0c0; color: #000; box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #dfdfdf, inset -2px -2px #808080, inset 2px 2px #fff, 2px 2px 0 rgba(0, 0, 0, .45) !important; }
                .ai-nt4-mode .ai-settings-header { min-height: 32px; padding: 3px 2px 3px 6px; background: linear-gradient(90deg, navy, #1084d0); color: #fff; border: 0; }
                .ai-nt4-mode .ai-settings-list { margin-top: 3px; background: #c0c0c0; color: #000; border-right: 0; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; }
                .ai-nt4-mode .ai-settings-form { margin-top: 3px; background: #c0c0c0; color: #000; }
                .ai-nt4-mode .ai-config-item { color: #000; border-bottom-color: #808080; }
                .ai-nt4-mode .ai-config-item:hover, .ai-nt4-mode .ai-config-item.active { background: #000080; color: #fff; }
                .ai-nt4-mode .ai-config-section-title { background: #c0c0c0; color: #000; border-bottom: 1px solid #808080; }
                .ai-nt4-mode .ai-toggle-track { width: 32px; height: 18px; padding: 2px; border: 0; border-radius: 0; background: #fff; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; }
                .ai-nt4-mode .ai-toggle-track > span { width: 12px; height: 12px; border-radius: 0; background: #000080; }
                .ai-nt4-mode .ai-migration-note, .ai-nt4-mode .ai-render-error { border-radius: 0; }
                .ai-settings-header { min-width: 0; padding: 0 8px 0 16px; border-bottom: 1px solid var(--ai-border, #dfe3e8); display: flex; align-items: center; justify-content: space-between; background: var(--ai-surface, #f7f8fa); }
                .ai-settings-title { min-width: 0; margin: 0; overflow: hidden; font-size: 15px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
                .ai-settings-body { min-height: 0; display: flex; overflow: hidden; }
                .ai-settings-close { width: 32px; height: 32px; flex: 0 0 auto; background: transparent; border: none; font-size: 21px; cursor: pointer; color: #666; z-index: 1; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
                .ai-settings-close:hover { background: rgba(0,0,0,0.1); color: #333; }
                .ai-dark-mode .ai-settings-close { color: #aaa; }
                .ai-settings-list { width: 220px; flex: 0 0 220px; border-right: 1px solid var(--ai-border, #dfe3e8); overflow-y: auto; scrollbar-gutter: stable; background: var(--ai-surface, #f7f8fa); }
                .ai-dark-mode .ai-settings-list { background: var(--ai-surface); border-right-color: var(--ai-border); }
                .ai-config-item { min-height: 42px; padding: 9px 12px; box-sizing: border-box; cursor: pointer; font-size: 13px; border-bottom: 1px solid var(--ai-border, #e4e7eb); color: var(--ai-text, #333); display: flex; align-items: center; gap: 8px; }
                .ai-dark-mode .ai-config-item { border-bottom-color: var(--ai-border); color: var(--ai-text); }
                .ai-config-item:hover, .ai-config-item.active { background: var(--ai-accent-soft, #eaf5fa); color: var(--ai-accent, #1677a6); }
                .ai-dark-mode .ai-config-item:hover, .ai-dark-mode .ai-config-item.active { background: var(--ai-accent-soft); }
                .ai-drag-handle { cursor: grab; color: #999; padding: 0 2px; font-weight: bold; font-size: 16px; user-select: none; display: flex; align-items: center; }
                .ai-drag-handle:hover { color: #666; }
                .ai-dark-mode .ai-drag-handle { color: #777; }
                .ai-config-item.dragging { opacity: 0.5; background: #e6f7ff; }
                .ai-config-item.drag-over { border-top: 2px solid #00a1d6; }
                .ai-config-section-title { font-size: 12px; font-weight: bold; padding: 8px 12px; color: #999; background: #eee; }
                .ai-dark-mode .ai-config-section-title { background: #303134; color: var(--ai-muted); }
                .ai-settings-form { flex: 1; min-width: 0; min-height: 0; padding: 22px 24px; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 13px; scrollbar-gutter: stable; background: var(--ai-bg, #fff); }
                .ai-migration-note { padding: 10px 12px; border: 1px solid #b9dce9; border-radius: 4px; background: #eef8fc; color: #315d6e; font-size: 12px; line-height: 1.55; }
                .ai-dark-mode .ai-migration-note { border-color: #315766; background: #20343c; color: #b8d8e4; }
                .ai-form-group { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
                .ai-form-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
                .ai-form-actions { margin-top: 10px; display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
                .ai-form-label { font-size: 12px; font-weight: 600; color: var(--ai-muted, #68717d); }
                .ai-form-hint { font-size: 12px; color: var(--ai-muted, #68717d); line-height: 1.55; }
                .ai-dark-mode .ai-form-label { color: var(--ai-muted); }
                .ai-form-input, .ai-form-textarea { min-height: 34px; box-sizing: border-box; padding: 7px 9px; border: 1px solid var(--ai-border, #dfe3e8); border-radius: 4px; background: var(--ai-bg, #fff); color: var(--ai-text, #20242a); font-size: 13px; outline: none; }
                .ai-form-input:focus, .ai-form-textarea:focus { border-color: var(--ai-accent, #1677a6); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ai-accent, #1677a6) 16%, transparent); }
                .ai-form-textarea { height: 100px; resize: vertical; font-family: monospace; }
                .ai-dark-mode .ai-form-input, .ai-dark-mode .ai-form-textarea { background: var(--ai-bg); border-color: var(--ai-border); color: var(--ai-text); }
                .ai-timestamp { appearance: none; border: 0; margin: 0 1px; padding: 1px 4px; border-radius: 3px; background: transparent; color: var(--ai-accent, #1677a6); font: inherit; cursor: pointer; text-decoration: none; transition: background-color .12s ease, color .12s ease; }
                .ai-timestamp { font-weight: 700; }
                .ai-timestamp:hover, .ai-timestamp:focus-visible { background: #0078d4; color: #fff; text-decoration: none; outline: none; }
                .ai-timestamp:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, #0078d4 32%, transparent); }
                .ai-dark-mode .ai-timestamp { color: var(--ai-accent); }
                .ai-dark-mode .ai-timestamp:hover, .ai-dark-mode .ai-timestamp:focus-visible { background: #1a73e8; color: #fff; }

                .ai-cite { position: relative; display: inline; white-space: nowrap; }
                .ai-cite-host { color: var(--ai-muted); font-size: 0.92em; }
                .ai-cite-mark {
                    appearance: none; border: 0; margin: 0; padding: 0 2px; background: transparent;
                    color: var(--ai-accent); font: inherit; font-weight: 700; cursor: pointer; vertical-align: baseline;
                }
                .ai-cite-mark:hover, .ai-cite-mark:focus-visible { text-decoration: underline; outline: none; }
                .ai-cite.is-flash .ai-cite-mark { background: var(--ai-accent); color: #fff; border-radius: 3px; }
                .ai-content .markdown-body ol.ai-source-list,
                .ai-content .markdown-body ul.ai-source-list {
                    list-style: none !important; padding-left: 0 !important;
                }
                .ai-source-item > blockquote { display: none; }
                .ai-source-item {
                    position: relative; margin: 0 0 10px; padding: 8px 10px 8px 40px;
                    border: 1px solid var(--ai-border); border-radius: 4px;
                    background: color-mix(in srgb, var(--ai-text) 3.5%, transparent);
                }
                .ai-source-item.is-flash { box-shadow: 0 0 0 2px color-mix(in srgb, var(--ai-accent) 55%, transparent); }
                .ai-source-back {
                    appearance: none; position: absolute; left: 8px; top: 8px; min-width: 24px; height: 22px;
                    padding: 0 5px; border: 1px solid var(--ai-border); border-radius: 3px;
                    background: transparent; color: var(--ai-accent); font: 700 12px/20px inherit; cursor: pointer;
                }
                .ai-source-back:hover, .ai-source-back:focus-visible { background: var(--ai-accent); color: #fff; outline: none; }
                .ai-source-item blockquote { margin: 8px 0 0; }
                .ai-cite-popover {
                    position: fixed; z-index: 2147483647; box-sizing: border-box;
                    width: max-content; max-width: min(380px, calc(100vw - 24px)); max-height: min(320px, 46vh);
                    overflow: auto; padding: 8px 10px; background: var(--ai-bg); color: var(--ai-text);
                    border: 1px solid var(--ai-border); border-radius: 4px;
                    box-shadow: 0 8px 24px rgba(20, 28, 36, .18);
                }
                .ai-cite-card + .ai-cite-card { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--ai-border); }
                .ai-cite-card-title { font-size: 13px; font-weight: 650; line-height: 1.4; color: var(--ai-text); }
                .ai-cite-card-url { display: block; margin-top: 3px; color: var(--ai-accent); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
                .ai-cite-card-caption { margin-top: 7px; color: var(--ai-muted); font-size: 11px; font-weight: 650; }
                .ai-cite-card-snippet { margin: 4px 0 0; color: var(--ai-muted); font-size: 12px; line-height: 1.5; }
                .ai-cite-card-snippet.is-empty { font-style: italic; }
                .ai-dark-mode .ai-cite-popover { background: #303134; color: #e8eaed; border-color: #6f7479; box-shadow: 0 8px 20px rgba(0, 0, 0, .45); }
                .ai-dark-mode .ai-cite-card-title { color: #e8eaed; }
                .ai-dark-mode .ai-cite-card-url { color: #8ab4f8; }
                .ai-dark-mode .ai-cite-card-snippet { color: #9aa0a6; }
                .ai-dark-mode .ai-source-item { background: color-mix(in srgb, #fff 5%, transparent); }
                .ai-dark-mode .ai-cite-mark, .ai-dark-mode .ai-source-back { color: #8ab4f8; }
                .ai-nt4-mode .ai-cite-mark, .ai-nt4-mode .ai-source-back {
                    color: #000080; background: #c0c0c0; border: 0; border-radius: 0;
                    box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
                }
                .ai-nt4-mode .ai-cite-mark { padding: 0 3px; }
                .ai-nt4-mode .ai-cite-mark:hover, .ai-nt4-mode .ai-source-back:hover,
                .ai-nt4-mode .ai-cite-mark:focus-visible, .ai-nt4-mode .ai-source-back:focus-visible {
                    color: #000; background: #c0c0c0; text-decoration: none;
                    box-shadow: inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080;
                }
                .ai-nt4-mode .ai-cite-host { color: #000; }
                .ai-nt4-mode .ai-source-item {
                    border: 0; border-radius: 0; background: transparent;
                    box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a;
                }
                .ai-nt4-mode .ai-source-item.is-flash { box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a, 0 0 0 1px #000080; }
                .ai-nt4-mode .ai-cite-popover {
                    background: #ffffe1; color: #000; border: 1px solid #000; border-radius: 0;
                    box-shadow: 1px 1px 0 #000;
                }
                .ai-nt4-mode .ai-cite-card-title { color: #000; }
                .ai-nt4-mode .ai-cite-card-url { color: #000080; }
                .ai-nt4-mode .ai-cite-card-snippet { color: #000; }
                .ai-render-error { padding: 10px; margin-bottom: 12px; border-left: 3px solid #ff4d4f; background: #fff1f0; color: #a8071a; font-size: 12px; }
                .ai-plain-fallback { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; color: inherit; }
                .ai-dark-mode .ai-render-error { background: #351b1b; color: #ffaaa5; }
                .ai-btn { min-height: 32px; padding: 6px 12px; border: 1px solid transparent; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 550; }
                .ai-btn-primary { background: var(--ai-accent, #1677a6); color: #fff; }
                .ai-btn-secondary { background: var(--ai-bg, #fff); color: var(--ai-text, #20242a); border-color: var(--ai-border, #dfe3e8); }
                .ai-btn-danger { background: transparent; color: #d14343; border-color: #e5a9a9; }
                .ai-btn:disabled { opacity: .55; cursor: wait; }
                .ai-tool-toggle { display: flex; align-items: center; gap: 10px; padding: 9px 0; font-size: 13px; cursor: pointer; position: relative; }
                .ai-tool-toggle > input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; pointer-events: none; }
                .ai-toggle-track { width: 34px; height: 18px; flex: 0 0 auto; padding: 2px; border-radius: 10px; box-sizing: border-box; background: #a9b0b8; transition: background .15s; }
                .ai-toggle-track > span { display: block; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
                .ai-tool-toggle > input:checked + .ai-toggle-track { background: var(--ai-accent, #1677a6); }
                .ai-tool-toggle > input:checked + .ai-toggle-track > span { transform: translateX(16px); }
                .ai-tool-toggle small { display: block; margin-top: 2px; height: 14px; line-height: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; color: var(--ai-muted, #68717d); font-size: 11px; font-weight: 400; }
                .ai-test-status { flex: 1; min-width: 80px; align-self: center; overflow: hidden; color: var(--ai-muted, #68717d); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
                .ai-test-status.is-success { color: #27845a; } .ai-test-status.is-error { color: #d14343; } .ai-test-status.is-loading { color: var(--ai-accent, #1677a6); }
                .ai-api-url-preview { overflow-wrap: anywhere; font-size: 11px; color: var(--ai-muted, #68717d); }
                .ai-test-report { border: 1px solid var(--ai-border, #dfe3e8); border-radius: 4px; padding: 8px 10px; font-size: 12px; }
                .ai-test-report summary { cursor: pointer; font-weight: 600; }
                .ai-test-report pre { max-height: 240px; margin: 8px 0 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.5 Consolas, monospace; }
                .ai-checkbox-wrapper { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
                .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 2s linear infinite; margin: 0 auto 10px; }
                @media (max-width: 680px) {
                    .ai-settings-list { width: 150px; flex-basis: 150px; }
                    .ai-settings-form { padding: 18px 16px; }
                    .ai-form-row { grid-template-columns: 1fr; }
                    .ai-form-actions { flex-wrap: wrap; }
                    .ai-test-status { flex-basis: 100%; }
                    .ai-controls { gap: 2px; }
                    .ai-btn-labeled { padding-inline: 5px; }
                    .ai-opacity-label { display: none; }
                    .ai-opacity-range { width: 44px; flex-basis: 44px; }
                    .ai-toc-tip { max-width: min(280px, 70vw); }
                }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `;
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        },

        setupKatexStyle() {
            const styleId = 'ai-katex-css';
            if (document.getElementById(styleId)) return;

            const resourceUrl = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
            const install = (cssText, sourceUrl) => {
                if (!cssText || document.getElementById(styleId)) return false;
                const css = cssText.replace(
                    /url\(\s*(['"]?)(?!data:|https?:|\/\/)([^'")]+)\1\s*\)/gi,
                    (_match, _quote, path) => `url("${new URL(path, sourceUrl).href}")`
                );
                const style = document.createElement('style');
                style.id = styleId;
                style.dataset.source = sourceUrl;
                style.textContent = css;
                document.head.appendChild(style);
                return true;
            };

            try {
                if (typeof GM_getResourceText === 'function') {
                    const bundledCss = GM_getResourceText('katexCss');
                    if (install(bundledCss, resourceUrl)) return;
                }
            } catch (error) {
                Logger.error('读取缓存的 KaTeX CSS 失败，将尝试备用 CDN。', error);
            }

            const fallbackUrls = [
                resourceUrl,
                'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css',
                'https://cdn.bootcdn.net/ajax/libs/KaTeX/0.16.9/katex.min.css'
            ];
            const tryLoad = (index) => {
                if (index >= fallbackUrls.length || document.getElementById(styleId)) return;
                const url = fallbackUrls[index];
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    timeout: 10000,
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300 &&
                            install(response.responseText, url)) return;
                        tryLoad(index + 1);
                    },
                    onerror: () => tryLoad(index + 1),
                    ontimeout: () => tryLoad(index + 1)
                });
            };
            tryLoad(0);
        },

        createFloatButton() {
            this.floatBtn = document.createElement('button');
            this.floatBtn.type = 'button';
            this.floatBtn.className = 'ai-float-button';
            this.floatBtn.textContent = 'AI';
            this.floatBtn.setAttribute('aria-label', '打开 AI 字幕总结');
            this.floatBtn.draggable = false;
            this.floatBtn.title = 'AI 字幕总结 (双击重置位置)';
            Object.assign(this.floatBtn.style, {
                position: 'fixed', top: '200px', right: '20px',
                width: '42px', height: '42px', background: '#1677a6', color: '#fff',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 'bold', cursor: 'pointer', zIndex: 2147483647,
                boxShadow: '0 4px 12px rgba(20,28,36,0.18)', userSelect: 'none', WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none', minWidth: '42px', minHeight: '42px', maxWidth: '42px', maxHeight: '42px',
                margin: '0', padding: '0', border: '0', overflow: 'hidden', touchAction: 'none', boxSizing: 'border-box'
            });
            this.floatBtn.onselectstart = (event) => event.preventDefault();
            this.floatBtn.ondragstart = (event) => event.preventDefault();
            this.floatBtn.oncontextmenu = (event) => event.preventDefault();

            let gesture = null;
            let clickTimer = 0;
            const resetPanel = () => {
                if (this.panel) {
                    this.panel.style.top = '50%'; this.panel.style.left = '50%';
                    this.panel.style.transform = 'translate(-50%, -50%)';
                    setTimeout(() => {
                        const rect = this.panel.getBoundingClientRect();
                        this.panel.style.transform = 'none'; this.panel.style.left = rect.left + 'px'; this.panel.style.top = rect.top + 'px';
                        this.panel.style.width = '640px'; this.panel.style.height = '540px';
                        this.panel.style.removeProperty('opacity');
                        this.panel.style.setProperty('--ai-panel-opacity', '1');
                        this.panel.style.setProperty('--ai-text-protection', '0');
                        const opacitySlider = this.panel.querySelector('.ai-opacity-slider');
                        const opacityFill = this.panel.querySelector('.ai-opacity-fill');
                        const opacityThumb = this.panel.querySelector('.ai-opacity-thumb');
                        const opacityValue = this.panel.querySelector('.ai-opacity-value');
                        if (opacitySlider) {
                            opacitySlider.value = '1';
                        }
                        if (opacityFill) opacityFill.style.width = '100%';
                        if (opacityThumb) {
                            opacityThumb.style.left = '100%';
                            opacityThumb.style.transform = 'translate(-100%, -50%)';
                        }
                        if (opacityValue) opacityValue.textContent = '100%';
                    }, 10);
                }
            };

            // 主按钮按下：始终 preventDefault，避免页面文字被选中；同时清理残留手势防止按钮失效。
            this.floatBtn.onpointerdown = (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                if (gesture) {
                    this.floatBtn.classList.remove('is-pointer-down');
                    try { if (this.floatBtn.hasPointerCapture(gesture.pointerId)) this.floatBtn.releasePointerCapture(gesture.pointerId); } catch (e) {}
                    gesture = null;
                }
                const rect = this.floatBtn.getBoundingClientRect();
                this.floatBtn.style.right = 'auto';
                this.floatBtn.style.left = rect.left + 'px';
                this.floatBtn.style.top = rect.top + 'px';
                this.floatBtn.classList.add('is-pointer-down');
                gesture = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    grabX: event.clientX - rect.left,
                    grabY: event.clientY - rect.top,
                    moved: false
                };
                try { this.floatBtn.setPointerCapture(event.pointerId); } catch (e) {}
            };

            const onPointerMove = (event) => {
                if (!gesture || event.pointerId !== gesture.pointerId) return;
                const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
                if (distance > 4) gesture.moved = true;
                if (!gesture.moved) return;

                event.preventDefault();
                const width = this.floatBtn.offsetWidth;
                const height = this.floatBtn.offsetHeight;
                const left = Math.max(0, Math.min(window.innerWidth - width, event.clientX - gesture.grabX));
                const top = Math.max(0, Math.min(window.innerHeight - height, event.clientY - gesture.grabY));
                this.floatBtn.style.left = left + 'px';
                this.floatBtn.style.top = top + 'px';
            };

            const finishPointer = (event, cancelled = false) => {
                if (!gesture || event.pointerId !== gesture.pointerId) return;
                const wasMoved = gesture.moved;
                gesture = null;
                this.floatBtn.classList.remove('is-pointer-down');
                try { if (this.floatBtn.hasPointerCapture(event.pointerId)) this.floatBtn.releasePointerCapture(event.pointerId); } catch (e) {}
                if (cancelled || wasMoved) return;

                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = 0;
                    resetPanel();
                } else {
                    clickTimer = window.setTimeout(() => {
                        clickTimer = 0;
                        this.togglePanel();
                    }, 240);
                }
            };

            // move/up/cancel 挂到文档级：指针移出按钮或异常中断时，拖拽与点击也能正常结束。
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', finishPointer);
            document.addEventListener('pointercancel', (event) => finishPointer(event, true));
            this.floatBtn.onlostpointercapture = (event) => {
                if (!gesture || event.pointerId !== gesture.pointerId) return;
                gesture = null;
                this.floatBtn.classList.remove('is-pointer-down');
            };
            const cancelStuck = () => {
                if (!gesture) return;
                gesture = null;
                this.floatBtn.classList.remove('is-pointer-down');
            };
            window.addEventListener('blur', cancelStuck);
            document.addEventListener('visibilitychange', cancelStuck);
            this.floatBtn.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.detail === 0) this.togglePanel();
            };
            this.floatBtn.ondblclick = (event) => { event.preventDefault(); event.stopPropagation(); };
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
            this.panel.style.removeProperty('opacity');

            const initialWidth = Math.max(280, Math.min(640, window.innerWidth - 24));
            const initialHeight = Math.max(220, Math.min(540, window.innerHeight - 24));
            this.panel.style.width = initialWidth + 'px'; this.panel.style.height = initialHeight + 'px';
            this.panel.style.left = (window.innerWidth / 2 - initialWidth / 2) + 'px';
            this.panel.style.top = (window.innerHeight / 2 - initialHeight / 2) + 'px';

            // Header
            const header = document.createElement('div');
            header.className = 'ai-header';
            header.innerHTML = '<div style="display:flex;align-items:center;"><b>AI 字幕总结</b> <span id="ai-status" style="font-size:12px;color:var(--ai-muted);margin-left:8px"></span></div>';

            let isDragging = false;
            header.onmousedown = (e) => {
                if (e.target.closest('.ai-controls') || e.target.closest('select') || e.target.tagName === 'INPUT') return;
                isDragging = true;
                const startX = e.clientX, startY = e.clientY, startLeft = this.panel.offsetLeft, startTop = this.panel.offsetTop;
                const onMove = rafThrottle((ev) => {
                    if (!isDragging) return; ev.preventDefault();
                    this.panel.style.left = (startLeft + ev.clientX - startX) + 'px';
                    this.panel.style.top = (startTop + ev.clientY - startY) + 'px';
                });
                const onUp = () => { isDragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            };

            const controls = document.createElement('div');
            controls.className = 'ai-controls';

            const opacitySlider = document.createElement('input');
            opacitySlider.type = 'range'; opacitySlider.min = '0.35'; opacitySlider.max = '1'; opacitySlider.step = '0.05'; opacitySlider.value = '1';
            opacitySlider.className = 'ai-opacity-slider'; opacitySlider.title = '调节窗口背景强度，文字和控件保持清晰';
            opacitySlider.setAttribute('aria-label', '窗口背景强度');

            const opacityValue = document.createElement('output');
            opacityValue.className = 'ai-opacity-value';
            opacityValue.textContent = '100%';

            const opacityRange = document.createElement('span');
            opacityRange.className = 'ai-opacity-range';
            const opacityTrack = document.createElement('span');
            opacityTrack.className = 'ai-opacity-track';
            const opacityFill = document.createElement('span');
            opacityFill.className = 'ai-opacity-fill';
            const opacityThumb = document.createElement('span');
            opacityThumb.className = 'ai-opacity-thumb';
            opacityTrack.appendChild(opacityFill);
            opacityRange.append(opacityTrack, opacityThumb, opacitySlider);

            const updateBackgroundOpacity = (value) => {
                const opacity = Math.max(0.35, Math.min(1, Number(value) || 1));
                const percent = Math.round(opacity * 100);
                const trackPercent = ((opacity - 0.35) / 0.65) * 100;
                const protection = Math.min(0.78, (1 - opacity) * 1.2);
                this.panel.style.setProperty('--ai-panel-opacity', String(opacity));
                this.panel.style.setProperty('--ai-text-protection', protection.toFixed(2));
                opacityFill.style.width = `${trackPercent.toFixed(2)}%`;
                opacityThumb.style.left = `${trackPercent.toFixed(2)}%`;
                opacityThumb.style.transform = `translate(-${trackPercent.toFixed(2)}%, -50%)`;
                opacityValue.textContent = `${percent}%`;
            };
            opacitySlider.oninput = (event) => updateBackgroundOpacity(event.target.value);

            const opacityControl = document.createElement('label');
            opacityControl.className = 'ai-opacity-control';
            opacityControl.innerHTML = '<span class="ai-opacity-label">背景</span>';
            opacityControl.append(opacityRange, opacityValue);

            const btnTheme = this.createIconBtn('◐', '明暗', '切换扁平浅色/深色主题', () => this.toggleTheme());
            btnTheme.classList.add('ai-theme-flat');
            const btnNt4 = this.createIconBtn('▣', 'NT4', '进入或退出 Windows NT4 主题', () => this.toggleNt4());
            btnNt4.classList.add('ai-theme-nt4');
            const btnRefresh = this.createIconBtn('↻', '重新生成', '忽略缓存并重新生成总结', () => this.handleContentLoad(true, false));
            btnRefresh.id = 'ai-btn-refresh';
            const btnSettings = this.createIconBtn('⚙', '设置', '打开模型与全局设置', () => this.openSettings());
            const btnClose = this.createIconBtn('×', '', '关闭总结面板', () => this.panel.style.display = 'none');

            controls.append(opacityControl, btnTheme, btnNt4, btnRefresh, btnSettings, btnClose);
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

            const subLabel = document.createElement('span');
            subLabel.className = 'ai-toolbar-label';
            subLabel.textContent = '字幕:';
            const modelLabel = document.createElement('span');
            modelLabel.className = 'ai-toolbar-label';
            modelLabel.textContent = '模型:';
            toolbar.append(subLabel, subSelect, modelLabel, modelSelect);

            const body = document.createElement('div');
            body.className = 'ai-body';

            const toc = document.createElement('nav');
            toc.className = 'ai-toc';
            toc.id = 'ai-toc';
            toc.hidden = true;
            toc.setAttribute('aria-label', '章节时间轴');

            const content = document.createElement('div');
            content.className = 'ai-content'; content.id = 'ai-content-area';
            content.innerHTML = '<div style="text-align:center;color:var(--ai-muted);margin-top:40px">AI 准备就绪...</div>';

            content.addEventListener('click', (e) => {
                const timestamp = e.target.closest('[data-time]');
                if (timestamp && content.contains(timestamp)) {
                    e.preventDefault(); this.seekVideo(timestamp.dataset.time);
                    return;
                }
                const mark = e.target.closest('.ai-cite-mark');
                if (mark && content.contains(mark)) {
                    e.preventDefault();
                    this.jumpToSource(mark.dataset.cite);
                    return;
                }
                const back = e.target.closest('.ai-source-back');
                if (back && content.contains(back)) {
                    e.preventDefault();
                    this.jumpToCitation(back.dataset.cite);
                }
            });
            content.addEventListener('pointerover', (event) => {
                const target = event.target.closest('.ai-cite, .ai-source-item');
                if (target && content.contains(target)) this.showCitePopover(target);
            });
            content.addEventListener('pointerout', (event) => {
                const target = event.target.closest('.ai-cite, .ai-source-item');
                if (!target) return;
                const next = event.relatedTarget;
                if (next && (target.contains(next) || this.citePopover?.contains(next))) return;
                this.scheduleHideCitePopover();
            });
            content.addEventListener('scroll', () => this.hideCitePopover(), { passive: true });

            const resizer = document.createElement('div');
            resizer.className = 'ai-resizer';
            resizer.onmousedown = (e) => {
                e.stopPropagation(); e.preventDefault();
                const startX = e.clientX, startY = e.clientY, startW = this.panel.offsetWidth, startH = this.panel.offsetHeight;
                const onResizeMove = rafThrottle((ev) => {
                    ev.preventDefault();
                    this.panel.style.width = Math.max(320, startW + (ev.clientX - startX)) + 'px';
                    this.panel.style.height = Math.max(200, startH + (ev.clientY - startY)) + 'px';
                });
                const onResizeUp = () => { document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('mouseup', onResizeUp); };
                document.addEventListener('mousemove', onResizeMove); document.addEventListener('mouseup', onResizeUp);
            };

            body.append(toc, content);
            this.panel.append(header, toolbar, body, resizer);
            document.body.appendChild(this.panel);
            this.applyThemeClasses(this.panel);
            this.updateThemeControls();

            this.panel.querySelector('#ai-model-select').onchange = () => this.handleContentLoad(false, true);
            this.panel.querySelector('#ai-subtitle-select').onchange = () => this.handleContentLoad(false, true);
        },

        createIconBtn(symbol, label, title, onClick) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `ai-btn-icon${label ? ' ai-btn-labeled' : ''}`;
            const symbolSpan = document.createElement('span');
            symbolSpan.className = 'ai-btn-symbol';
            symbolSpan.setAttribute('aria-hidden', 'true');
            symbolSpan.textContent = symbol;
            btn.appendChild(symbolSpan);
            if (label) {
                const labelSpan = document.createElement('span');
                labelSpan.textContent = label;
                btn.appendChild(labelSpan);
            }
            btn.title = title;
            btn.setAttribute('aria-label', title);
            btn.onclick = onClick;
            return btn;
        },

        applyThemeClasses(element) {
            if (!element) return;
            element.classList.toggle('ai-dark-mode', !this.isNt4Mode && this.flatTheme === 'dark');
            element.classList.toggle('ai-nt4-mode', this.isNt4Mode);
        },

        updateThemeControls() {
            if (!this.panel) return;
            const flatButton = this.panel.querySelector('.ai-theme-flat');
            const nt4Button = this.panel.querySelector('.ai-theme-nt4');
            if (flatButton) {
                flatButton.classList.toggle('is-active', !this.isNt4Mode);
                flatButton.setAttribute('aria-pressed', String(!this.isNt4Mode));
            }
            if (nt4Button) {
                nt4Button.classList.toggle('is-active', this.isNt4Mode);
                nt4Button.setAttribute('aria-pressed', String(this.isNt4Mode));
            }
        },

        saveTheme() {
            GM_setValue('setting_ui_flat_theme', this.flatTheme);
            GM_setValue('setting_ui_theme', this.isNt4Mode ? 'nt4' : this.flatTheme);
        },

        refreshTheme() {
            this.isDarkMode = !this.isNt4Mode && this.flatTheme === 'dark';
            this.applyThemeClasses(this.panel);
            this.applyThemeClasses(this.settingsModal);
            this.updateThemeControls();
            this.saveTheme();
        },

        toggleTheme() {
            if (this.isNt4Mode) this.isNt4Mode = false;
            else this.flatTheme = this.flatTheme === 'dark' ? 'light' : 'dark';
            this.refreshTheme();
        },

        toggleNt4() {
            this.isNt4Mode = !this.isNt4Mode;
            this.refreshTheme();
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
            if (!subLan) {
                contentDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--ai-muted)">该视频无字幕，无法生成总结。</div>';
                this.refreshToc();
                return;
            }

            const config = ConfigManager.getById(configId);
            if (!config) return;

            try {
                statusSpan.textContent = '检查缓存...';

                if (!forceRefresh) {
                    const cached = await DBHelper.getSummary(this.currentCid, config.id, subLan);
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
                        <div style="text-align:center;padding:40px;color:var(--ai-muted);">
                            <p>当前字幕/模型暂无缓存。</p>
                            <br>
                            <button id="ai-start-btn" class="ai-btn ai-btn-primary" style="font-size:14px;padding:8px 20px;">
                                点击开始生成摘要
                            </button>
                            <p style="font-size:12px;color:var(--ai-muted);margin-top:10px">生成将消耗 API Token</p>
                        </div>
                    `;
                    document.getElementById('ai-start-btn').onclick = () => this.handleContentLoad(true, false);
                    this.refreshToc();
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
                contentDiv.innerHTML = '<div style="text-align:center;padding:20px;color:var(--ai-text)"><div class="loader"></div><p>AI 正在思考中...</p><p style="font-size:12px;color:var(--ai-muted)">长视频可能需要1-2分钟</p></div>';
                this.refreshToc();

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
                    subtitleLan: subLan,
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
                if (err.name === 'AbortError') return;
                Logger.error(err);
                statusSpan.textContent = '错误';
                const errorBox = document.createElement('div');
                errorBox.className = 'ai-render-error';
                errorBox.textContent = `错误: ${err.message}\n\n请检查控制台 (F12) 日志或配置。`;
                errorBox.style.whiteSpace = 'pre-wrap';
                contentDiv.replaceChildren(errorBox);
                this.refreshToc();
            } finally {
                this.isLoading = false;
                if (refreshBtn) refreshBtn.classList.remove('disabled');
            }
        },

        renderMarkdown(text) {
            const contentDiv = document.getElementById('ai-content-area');
            if (!contentDiv) return;
            try {
                this.citationCatalog = MarkdownRenderer.render(contentDiv, text);
                if (typeof renderMathInElement !== 'undefined') {
                    renderMathInElement(contentDiv, {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false}
                        ],
                        throwOnError: false
                    });
                }
            } catch (error) {
                Logger.error('Markdown Render Failed', error);
                const warning = document.createElement('div');
                warning.className = 'ai-render-error';
                warning.textContent = error.message;
                const fallback = document.createElement('pre');
                fallback.className = 'ai-plain-fallback';
                fallback.textContent = String(text ?? '');
                contentDiv.replaceChildren(warning, fallback);
                this.citationCatalog = new Map();
            }
            contentDiv.scrollTop = 0;
            this.hideCitePopover();
            this.refreshToc();
        },

        ensureCitePopover() {
            if (this.citePopover) return this.citePopover;
            const pop = document.createElement('div');
            pop.className = 'ai-cite-popover';
            pop.hidden = true;
            pop.setAttribute('role', 'tooltip');
            pop.addEventListener('pointerenter', () => window.clearTimeout(this.citePopoverTimer));
            pop.addEventListener('pointerleave', () => this.hideCitePopover());
            (this.panel || document.body).appendChild(pop);
            this.citePopover = pop;
            return pop;
        },
        collectCiteCards(anchor) {
            const catalog = this.citationCatalog;
            if (!catalog || !catalog.size) return [];
            const citeNum = Number(anchor.dataset.cite);
            const cards = [];
            const seen = new Set();
            const push = (item) => {
                if (!item || seen.has(item.index)) return;
                seen.add(item.index);
                cards.push(item);
            };
            if (Number.isFinite(citeNum)) push(catalog.get(citeNum));
            const hostText = (anchor.querySelector?.('.ai-cite-host')?.textContent || '').replace(/^[（(]/, '').replace(/[）)]$/, '').trim().toLowerCase();
            if (hostText) {
                catalog.forEach((item) => {
                    const haystack = `${item.url} ${item.title}`.toLowerCase();
                    if (haystack.includes(hostText)) push(item);
                });
            }
            return cards;
        },
        showCitePopover(anchor) {
            const cards = this.collectCiteCards(anchor);
            if (!cards.length) return;
            const pop = this.ensureCitePopover();
            window.clearTimeout(this.citePopoverTimer);
            pop.replaceChildren();
            cards.forEach((item) => {
                const card = document.createElement('div');
                card.className = 'ai-cite-card';
                const title = document.createElement('div');
                title.className = 'ai-cite-card-title';
                title.textContent = `${item.index}. ${item.title}`;
                card.appendChild(title);
                if (item.url) {
                    const link = document.createElement('a');
                    link.className = 'ai-cite-card-url';
                    link.href = item.url;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = item.url;
                    card.appendChild(link);
                }
                if (item.snippets.length) {
                    const caption = document.createElement('div');
                    caption.className = 'ai-cite-card-caption';
                    caption.textContent = '总结中的引用';
                    card.appendChild(caption);
                    item.snippets.forEach((snippet) => {
                        const quote = document.createElement('p');
                        quote.className = 'ai-cite-card-snippet';
                        quote.textContent = snippet;
                        card.appendChild(quote);
                    });
                } else {
                    const empty = document.createElement('p');
                    empty.className = 'ai-cite-card-snippet is-empty';
                    empty.textContent = '正文里没有找到对应的引用句。';
                    card.appendChild(empty);
                }
                pop.appendChild(card);
            });
            pop.hidden = false;
            this.positionCitePopover(anchor, pop);
        },
        positionCitePopover(anchor, pop) {
            const rect = anchor.getBoundingClientRect();
            const panelRect = this.panel ? this.panel.getBoundingClientRect() : { top: 8, left: 8, right: window.innerWidth - 8 };
            const popRect = pop.getBoundingClientRect();
            let top = rect.top - popRect.height - 8;
            if (top < panelRect.top + 8) top = rect.bottom + 8;
            let left = rect.left;
            if (left + popRect.width > panelRect.right - 8) left = panelRect.right - popRect.width - 8;
            if (left < panelRect.left + 8) left = panelRect.left + 8;
            pop.style.top = `${Math.round(top)}px`;
            pop.style.left = `${Math.round(left)}px`;
        },
        scheduleHideCitePopover() {
            window.clearTimeout(this.citePopoverTimer);
            this.citePopoverTimer = window.setTimeout(() => this.hideCitePopover(), 160);
        },
        hideCitePopover() {
            window.clearTimeout(this.citePopoverTimer);
            if (this.citePopover) this.citePopover.hidden = true;
        },
        flashCitation(element) {
            if (!element) return;
            element.classList.remove('is-flash');
            void element.offsetWidth;
            element.classList.add('is-flash');
            window.setTimeout(() => element.classList.remove('is-flash'), 1200);
        },
        jumpToSource(index) {
            const target = document.getElementById(`ai-source-${index}`);
            if (!target) return;
            this.hideCitePopover();
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.flashCitation(target);
        },
        jumpToCitation(index) {
            const target = document.querySelector(`#ai-content-area .ai-cite[data-cite="${index}"]`);
            if (!target) return;
            this.hideCitePopover();
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            this.flashCitation(target);
        },

        disconnectTocScroll() {
            const content = document.getElementById('ai-content-area');
            if (content && this.tocOnScroll) content.removeEventListener('scroll', this.tocOnScroll);
            this.tocOnScroll = null;
        },

        setActiveToc(headingId) {
            const toc = document.getElementById('ai-toc');
            if (!toc) return;
            toc.querySelectorAll('.ai-toc-item').forEach((item) => {
                item.classList.toggle('is-active', item.dataset.target === headingId);
            });
        },

        refreshToc() {
            const toc = document.getElementById('ai-toc');
            const content = document.getElementById('ai-content-area');
            if (!toc || !content) return;

            this.disconnectTocScroll();
            toc.replaceChildren();

            const depth = GlobalSettings.headingDepth;
            const headingSelector = Array.from({ length: depth }, (_, index) => `.markdown-body h${index + 1}`).join(', ');
            const headings = headingSelector ? [...content.querySelectorAll(headingSelector)] : [];
            if (!headings.length) {
                toc.hidden = true;
                return;
            }

            const inner = document.createElement('div');
            inner.className = 'ai-toc-inner';
            const track = document.createElement('div');
            track.className = 'ai-toc-track';
            inner.appendChild(track);

            const contentTop = content.getBoundingClientRect().top;
            const docSpan = Math.max(content.scrollHeight, 1);
            const headingOffsets = headings.map((heading) => (
                heading.getBoundingClientRect().top - contentTop + content.scrollTop
            ));

            toc.hidden = false;
            toc.appendChild(inner);

            const railHeight = Math.max(inner.clientHeight, content.clientHeight, 1);
            const usable = Math.max(railHeight - 28, 1);
            const minGap = headings.length > 1 ? Math.min(18, usable / headings.length) : 18;
            const tops = headingOffsets.map((offset) => 10 + (offset / docSpan) * usable);
            for (let i = 1; i < tops.length; i++) {
                if (tops[i] < tops[i - 1] + minGap) tops[i] = tops[i - 1] + minGap;
            }
            const overflow = tops.length ? tops[tops.length - 1] - (railHeight - 18) : 0;
            if (overflow > 0) {
                const first = tops[0];
                const span = Math.max(tops[tops.length - 1] - first, 1);
                const target = Math.max(usable - 4, minGap);
                for (let i = 0; i < tops.length; i++) {
                    tops[i] = 10 + ((tops[i] - first) / span) * target;
                }
            }

            headings.forEach((heading, index) => {
                heading.id = heading.id || `ai-md-heading-${index}`;
                heading.classList.add('ai-md-heading');
                const level = heading.tagName === 'H1' ? 1 : heading.tagName === 'H2' ? 2 : 3;
                const label = (heading.textContent || '').replace(/\s+/g, ' ').trim() || `章节 ${index + 1}`;

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `ai-toc-item is-h${level}`;
                btn.dataset.target = heading.id;
                btn.style.top = `${tops[index]}px`;
                btn.setAttribute('aria-label', `跳转到 ${label}`);

                const dot = document.createElement('span');
                dot.className = 'ai-toc-dot';
                dot.setAttribute('aria-hidden', 'true');
                const tip = document.createElement('span');
                tip.className = 'ai-toc-tip';
                tip.textContent = label;
                btn.append(dot, tip);
                btn.onclick = () => {
                    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    this.setActiveToc(heading.id);
                };
                inner.appendChild(btn);
            });

            const updateActive = () => {
                const marker = content.getBoundingClientRect().top + 28;
                let active = headings[0];
                for (const heading of headings) {
                    if (heading.getBoundingClientRect().top <= marker) active = heading;
                    else break;
                }
                if (active) this.setActiveToc(active.id);
            };
            this.tocOnScroll = updateActive;
            content.addEventListener('scroll', updateActive, { passive: true });
            updateActive();
        },

        seekVideo(seconds) {
            const video = document.querySelector('video');
            if (video) { video.currentTime = parseFloat(seconds); video.play(); }
        },

        openSettings() {
            if (this.settingsModal) {
                this.settingsModal.style.display = 'flex';
                this.renderSettingsList();
                return;
            }

            const overlay = document.createElement('div');
            overlay.className = 'ai-modal-overlay';
            this.applyThemeClasses(overlay);

            const box = document.createElement('div');
            box.className = 'ai-settings-box';

            const settingsHeader = document.createElement('div');
            settingsHeader.className = 'ai-settings-header';

            const settingsTitle = document.createElement('h2');
            settingsTitle.className = 'ai-settings-title';
            settingsTitle.textContent = 'AI 字幕总结设置';

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'ai-settings-close';
            closeBtn.textContent = '×';
            closeBtn.title = '关闭设置';
            closeBtn.setAttribute('aria-label', '关闭设置');
            closeBtn.onclick = () => { overlay.style.display = 'none'; };
            settingsHeader.append(settingsTitle, closeBtn);

            const settingsBody = document.createElement('div');
            settingsBody.className = 'ai-settings-body';

            const listCol = document.createElement('div');
            listCol.className = 'ai-settings-list';

            const listContainer = document.createElement('div');
            listContainer.id = 'ai-settings-list-container';
            listCol.appendChild(listContainer);

            const formCol = document.createElement('div');
            formCol.className = 'ai-settings-form';
            formCol.id = 'ai-settings-form';
            formCol.innerHTML = '';

            settingsBody.append(listCol, formCol);
            box.append(settingsHeader, settingsBody);
            overlay.append(box);
            this.settingsModal = overlay;
            document.body.appendChild(overlay);

            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) overlay.style.display = 'none';
            });
            overlay.addEventListener('wheel', (event) => {
                if (!event.target.closest('.ai-settings-list, .ai-settings-form')) event.preventDefault();
            }, { passive: false });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && overlay.style.display !== 'none') {
                    overlay.style.display = 'none';
                }
            });

            this.renderSettingsList();
            this.loadGlobalSettings();
        },

        renderSettingsList() {
            const container = document.getElementById('ai-settings-list-container');
            if (!container) return;
            const listCol = container.closest('.ai-settings-list');
            const prevListScroll = listCol ? listCol.scrollTop : 0;
            container.innerHTML = '';

            // 全局设置
            const globalItem = document.createElement('div');
            globalItem.className = 'ai-config-item';
            globalItem.textContent = '全局设置';
            globalItem.onclick = (e) => {
                this.setActiveItem(globalItem);
                this.loadGlobalSettings();
            };
            container.appendChild(globalItem);

            // 分割线
            const sectionTitle = document.createElement('div');
            sectionTitle.className = 'ai-config-section-title';
            sectionTitle.textContent = '模型配置 (拖拽排序)';
            container.appendChild(sectionTitle);

            // 新建
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

            // 列表
            const configs = ConfigManager.getAll();
            configs.forEach((cfg, index) => {
                const div = document.createElement('div');
                div.className = 'ai-config-item';
                div.setAttribute('data-id', cfg.id);
                div.setAttribute('data-index', index);

                const handle = document.createElement('span');
                handle.className = 'ai-drag-handle';
                handle.textContent = '≡';
                handle.title = '拖拽排序';

                const nameSpan = document.createElement('span');
                nameSpan.textContent = cfg.name;
                nameSpan.style.flex = '1';

                div.append(handle, nameSpan);
                div.onclick = (e) => {
                    if (e.target.classList.contains('ai-drag-handle')) return;
                    this.setActiveItem(div);
                    this.loadModelForm(cfg.id);
                };

                // 拖拽逻辑
                div.draggable = true;
                div.ondragstart = (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index);
                    div.classList.add('dragging');
                };
                div.ondragover = (e) => {
                    e.preventDefault();
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
                    document.querySelectorAll('.ai-config-item').forEach(el => {
                        el.classList.remove('dragging');
                        el.classList.remove('drag-over');
                    });
                    if (targetDiv) {
                        const toIndex = parseInt(targetDiv.getAttribute('data-index'));
                        if (fromIndex !== toIndex && !isNaN(fromIndex) && !isNaN(toIndex)) {
                            const list = ConfigManager.getAll();
                            const [movedItem] = list.splice(fromIndex, 1);
                            list.splice(toIndex, 0, movedItem);
                            ConfigManager.save(list);
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
            if (listCol) this.restoreScroll(listCol, prevListScroll);
        },

        setActiveItem(el) {
            const items = document.querySelectorAll('.ai-config-item');
            items.forEach(i => i.classList.remove('active'));
            el.classList.add('active');
        },

        // 设置页重渲染后恢复滚动位置，避免点击按钮时界面突然跳回顶部。
        restoreScroll(el, prev) {
            requestAnimationFrame(() => {
                el.scrollTop = Math.max(0, Math.min(prev, el.scrollHeight - el.clientHeight));
            });
        },

        loadGlobalSettings() {
            const formContainer = document.getElementById('ai-settings-form');
            const prevScroll = formContainer.scrollTop;
            formContainer.innerHTML = `
                <h3 style="margin-top:0; border-bottom:1px solid var(--ai-border, #eee); padding-bottom:10px;">全局设置</h3>
                <div class="ai-form-group">
                    <label class="ai-form-label" for="ai-heading-depth">时间轴标题深度</label>
                    <select class="ai-form-input" id="ai-heading-depth">
                        <option value="1">1 级（仅大标题）</option>
                        <option value="2">2 级（大标题 + 二级）</option>
                        <option value="3">3 级（到三级标题）</option>
                    </select>
                    <p class="ai-form-hint">控制左侧时间轴收录到哪一级 Markdown 标题。默认 2 级。</p>
                </div>
                <div style="margin-bottom: 20px;">
                    <label class="ai-checkbox-wrapper">
                        <input type="checkbox" id="ai-debug-toggle" ${GlobalSettings.debug ? 'checked' : ''}>
                        <span>开启调试日志 (Debug Log)</span>
                    </label>
                    <p class="ai-form-hint" style="margin-left:24px; margin-top:4px;">
                        开启后，脚本运行日志将输出到浏览器控制台 (F12 -> Console)。
                    </p>
                </div>
                <div style="border-top:1px solid var(--ai-border, #eee); padding-top:20px;">
                    <h4 style="margin-top:0;">缓存管理</h4>
                    <p class="ai-form-hint">
                        所有总结内容存储在本地 IndexedDB (Database: <b>${DB_NAME}</b>)。<br>
                        如果遇到数据显示错误或占用空间过大，可以清除缓存。
                    </p>
                    <button id="ai-clear-cache-btn" class="ai-btn ai-btn-danger" style="margin-top:10px;">
                        清除所有缓存数据
                    </button>
                </div>
            `;
            const depthSelect = document.getElementById('ai-heading-depth');
            depthSelect.value = String(GlobalSettings.headingDepth);
            depthSelect.onchange = (e) => {
                GlobalSettings.headingDepth = e.target.value;
                this.refreshToc();
            };
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
            this.restoreScroll(formContainer, prevScroll);
        },

        loadModelForm(id) {
            const formContainer = document.getElementById('ai-settings-form');
            const prevScroll = formContainer.scrollTop;
            const isNew = !id;
            const data = isNew ? {
                id: crypto.randomUUID(), name: '新模型配置', apiUrl: 'https://', apiKey: '', modelName: '',
                apiFormat: API_FORMATS.OPENAI_CHAT, systemPrompt: VIDEO_SUMMARY_PROMPT, temperature: '', top_p: '',
                reasoningEffort: '', maxCompletionTokens: 12000, extraParams: '', proxy: '',
                webSearch: true, webSearchSupported: 'unknown'
            } : ConfigManager.getById(id);

            const migrationNote = !isNew &&
                ['gemini-2.5-flash-总结版', 'gemini-2.5-flash-preview-09-2025'].includes(data.id) &&
                data.modelName === 'gemini-3.5-flash'
                ? `<div class="ai-migration-note"><b>配置迁移说明</b><br>这是原有 Gemini 2.5 Flash 配置。脚本已将模型名称更新为 gemini-3.5-flash；如果原先使用 Google 官方兼容接口，也已切换到 Gemini 原生 generateContent 接口。API Key 保持不变，建议点击“测试当前配置”确认接口可用。</div>`
                : '';

            formContainer.innerHTML = `
                <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">${isNew ? '新建模型配置' : '编辑配置'}</h3>
                ${migrationNote}
                <div class="ai-form-group"><label class="ai-form-label">配置名称</label><input class="ai-form-input" id="cfg-name"></div>
                <div class="ai-form-group">
                    <label class="ai-form-label">API 格式</label>
                    <select class="ai-form-input" id="cfg-format">
                        <option value="${API_FORMATS.OPENAI_CHAT}">OpenAI / NewAPI Chat Completions</option>
                        <option value="${API_FORMATS.OPENAI_RESPONSES}">OpenAI Responses / OpenResponses</option>
                        <option value="${API_FORMATS.GEMINI_NATIVE}">Gemini 原生 generateContent</option>
                    </select>
                </div>
                <div class="ai-form-group">
                    <label class="ai-form-label">API URL</label><input class="ai-form-input" id="cfg-url">
                    <span class="ai-api-url-preview" id="cfg-url-preview"></span>
                </div>
                <div class="ai-form-group"><label class="ai-form-label">API Key</label><input class="ai-form-input" type="password" id="cfg-key"></div>
                <div class="ai-form-group"><label class="ai-form-label">模型名称 (Model Name)</label><input class="ai-form-input" id="cfg-model"></div>
                <div class="ai-form-group"><label class="ai-form-label">System Prompt</label><textarea class="ai-form-textarea" id="cfg-prompt"></textarea></div>
                <div class="ai-form-row">
                    <div class="ai-form-group" style="flex:1"><label class="ai-form-label">Temperature（留空则不发送）</label><input class="ai-form-input" type="number" min="0" max="2" step="0.1" id="cfg-temp" placeholder="不发送"></div>
                    <div class="ai-form-group" style="flex:1"><label class="ai-form-label">Top P（留空则不发送）</label><input class="ai-form-input" type="number" min="0" max="1" step="0.1" id="cfg-topp" placeholder="不发送"></div>
                </div>
                <div class="ai-form-row">
                    <div class="ai-form-group" style="flex:1">
                        <label class="ai-form-label">思考强度 (reasoning_effort)</label>
                        <select class="ai-form-input" id="cfg-reasoning">
                            <option value="">不发送</option><option value="none">none</option><option value="minimal">minimal</option>
                            <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="xhigh">xhigh</option>
                        </select>
                    </div>
                    <div class="ai-form-group" style="flex:1"><label class="ai-form-label">最大输出 Token</label><input class="ai-form-input" type="number" min="1" step="1" id="cfg-max-tokens" placeholder="不发送"></div>
                </div>
                <label class="ai-tool-toggle">
                    <input type="checkbox" id="cfg-web-search">
                    <span class="ai-toggle-track"><span></span></span>
                    <span><b>联网搜索</b><small id="cfg-web-hint"></small></span>
                </label>
                <div class="ai-form-group">
                    <label class="ai-form-label">附加请求参数 (JSON，可选)</label>
                    <textarea class="ai-form-textarea" style="height:70px" id="cfg-extra" placeholder='例如 {"frequency_penalty": 0.2}'></textarea>
                    <span class="ai-form-hint">不同接口支持的参数不同；模型输入、系统提示词和流式开关由脚本管理。</span>
                </div>
                <div class="ai-form-group"><label class="ai-form-label">Proxy (可选，需脚本管理器支持)</label><input class="ai-form-input" id="cfg-proxy" placeholder="例如 http://127.0.0.1:7897"></div>
                <div class="ai-form-actions">
                    <span class="ai-test-status" id="cfg-test-status"></span>
                    ${!isNew ? `<button class="ai-btn ai-btn-danger" id="btn-del">删除</button>` : ''}
                    <button class="ai-btn ai-btn-secondary" id="btn-test">测试当前配置</button>
                    <button class="ai-btn ai-btn-primary" id="btn-save">保存</button>
                </div>
                <details class="ai-test-report" id="cfg-test-report" hidden>
                    <summary>测试报告</summary>
                    <pre id="cfg-test-report-content"></pre>
                </details>
            `;

            const formValues = {
                'cfg-name': data.name || '', 'cfg-format': data.apiFormat || ConfigManager.inferApiFormat(data),
                'cfg-url': data.apiUrl || '', 'cfg-key': data.apiKey || '',
                'cfg-model': data.modelName || '', 'cfg-prompt': data.systemPrompt || '',
                'cfg-temp': data.temperature ?? '', 'cfg-topp': data.top_p ?? '',
                'cfg-reasoning': data.reasoningEffort || '', 'cfg-max-tokens': data.maxCompletionTokens ?? '',
                'cfg-extra': data.extraParams || '', 'cfg-proxy': data.proxy || ''
            };
            Object.entries(formValues).forEach(([elementId, value]) => {
                document.getElementById(elementId).value = value;
            });
            document.getElementById('cfg-web-search').checked = data.webSearch === true;

            const formatSelect = document.getElementById('cfg-format');
            const urlInput = document.getElementById('cfg-url');
            const modelInput = document.getElementById('cfg-model');
            const urlPreview = document.getElementById('cfg-url-preview');
            const webSearchInput = document.getElementById('cfg-web-search');
            const webHint = document.getElementById('cfg-web-hint');
            const updateWebHint = () => {
                const format = formatSelect.value;
                if (!webSearchInput.checked) {
                    webHint.textContent = ' 当前关闭';
                } else if (format === API_FORMATS.OPENAI_RESPONSES) {
                    webHint.textContent = ' 发送 web_search';
                } else if (format === API_FORMATS.GEMINI_NATIVE) {
                    webHint.textContent = ' 发送 google_search';
                } else {
                    webHint.textContent = ' 发送 web_search_options，取决于代理站';
                }
            };
            const updateUrlPreview = () => {
                const resolvedUrl = LLMHelper.resolveApiUrl(formatSelect.value, urlInput.value, modelInput.value);
                urlPreview.textContent = `实际请求 URL：${resolvedUrl || '（未填写）'}`;
            };
            formatSelect.onchange = () => { updateWebHint(); updateUrlPreview(); };
            urlInput.oninput = updateUrlPreview;
            modelInput.oninput = updateUrlPreview;
            webSearchInput.onchange = updateWebHint;
            updateWebHint();
            updateUrlPreview();

            const readFormConfig = () => {
                const temperatureRaw = document.getElementById('cfg-temp').value.trim();
                const topPRaw = document.getElementById('cfg-topp').value.trim();
                const maxTokensRaw = document.getElementById('cfg-max-tokens').value.trim();
                const extraParams = document.getElementById('cfg-extra').value.trim();
                const temperature = temperatureRaw === '' ? '' : Number(temperatureRaw);
                const topP = topPRaw === '' ? '' : Number(topPRaw);
                const maxCompletionTokens = maxTokensRaw === '' ? '' : Number(maxTokensRaw);

                if (temperature !== '' && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
                    throw new Error('Temperature 必须在 0 到 2 之间，或留空。');
                }
                if (topP !== '' && (!Number.isFinite(topP) || topP < 0 || topP > 1)) {
                    throw new Error('Top P 必须在 0 到 1 之间，或留空。');
                }
                if (maxCompletionTokens !== '' && (!Number.isInteger(maxCompletionTokens) || maxCompletionTokens <= 0)) {
                    throw new Error('最大输出 Token 必须是正整数，或留空。');
                }
                const reasoningEffort = document.getElementById('cfg-reasoning').value;
                const modelName = document.getElementById('cfg-model').value;
                if (formatSelect.value === API_FORMATS.GEMINI_NATIVE && !/^gemini-3(?:\.|-)/i.test(modelName) && maxCompletionTokens !== '' && reasoningEffort) {
                    const budgets = { none: 0, minimal: 512, low: 2048, medium: 8192, high: 16384, xhigh: 24576 };
                    if (maxCompletionTokens < (budgets[reasoningEffort] || 0)) {
                        throw new Error('Gemini 最大输出 Token 不能小于当前思考强度对应的预算。');
                    }
                }
                if (extraParams) {
                    try {
                        const parsed = JSON.parse(extraParams);
                        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('必须是 JSON 对象');
                    } catch (error) {
                        throw new Error('附加请求参数格式错误: ' + error.message);
                    }
                }

                return {
                    id: data.id,
                    name: document.getElementById('cfg-name').value,
                    apiUrl: document.getElementById('cfg-url').value,
                    apiKey: document.getElementById('cfg-key').value,
                    modelName: modelName,
                    apiFormat: formatSelect.value,
                    systemPrompt: document.getElementById('cfg-prompt').value,
                    temperature: temperature,
                    top_p: topP,
                    reasoningEffort: reasoningEffort,
                    maxCompletionTokens: maxCompletionTokens,
                    extraParams: extraParams,
                    proxy: document.getElementById('cfg-proxy').value,
                    webSearch: webSearchInput.checked,
                    webSearchSupported: data.webSearchSupported || 'unknown'
                };
            };

            document.getElementById('btn-test').onclick = async (event) => {
                const status = document.getElementById('cfg-test-status');
                const report = document.getElementById('cfg-test-report');
                const reportContent = document.getElementById('cfg-test-report-content');
                const button = event.currentTarget;
                const showReport = () => {
                    const data = LLMHelper.lastReport;
                    if (!data) return;
                    reportContent.textContent = [
                        `请求：${data.method} ${data.url}`,
                        `状态：${data.status}`,
                        `Content-Type：${data.contentType || '未提供'}`,
                        '',
                        '原始响应（最多 4000 字符）：',
                        data.responseText || '（无响应正文）'
                    ].join('\n');
                    report.hidden = false;
                    report.open = true;
                };
                try {
                    if (this.isLoading) throw new Error('摘要正在生成，请完成后再测试。');
                    button.disabled = true;
                    const config = readFormConfig();
                    status.textContent = '测试中...';
                    status.className = 'ai-test-status is-loading';
                    const testConfig = {
                        ...config,
                        systemPrompt: '你是连接测试助手。请只回复 OK。'
                    };
                    const response = await LLMHelper.sendRequest(testConfig, '请回复 OK。');
                    status.textContent = `成功：${String(response).trim().slice(0, 24)}`;
                    status.className = 'ai-test-status is-success';
                    showReport();
                } catch (error) {
                    status.textContent = `失败：${error.message}`;
                    status.className = 'ai-test-status is-error';
                    showReport();
                } finally {
                    button.disabled = false;
                }
            };

            document.getElementById('btn-save').onclick = () => {
                let newConfig;
                try {
                    newConfig = readFormConfig();
                } catch (error) {
                    alert(error.message);
                    return;
                }
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
            this.restoreScroll(formContainer, prevScroll);
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
