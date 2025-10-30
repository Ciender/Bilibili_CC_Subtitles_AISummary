// ==UserScript==
// @name         Bilibili_CC_Subtitles_AISummary
// @version      2.0 (Refactored)
// @description  B站CC字幕AI总结工具。支持DeepSeek，可生成常规总结与深度分析，并可点击总结中的时间戳跳转视频。
// @author
// @supportURL
// @match        http*://www.bilibili.com/video/*
// @match        http*://www.bilibili.com/bangumi/play/ss*
// @match        http*://www.bilibili.com/bangumi/play/ep*
// @match        https://www.bilibili.com/cheese/play/ss*
// @match        https://www.bilibili.com/cheese/play/ep*
// @match        http*://www.bilibili.com/list/watchlater*
// @match        https://www.bilibili.com/medialist/play/watchlater/*
// @match        http*://www.bilibili.com/medialist/play/ml*
// @match        http*://www.bilibili.com/blackboard/html5player.html*
// @license      MIT
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // —————————————— 用户配置区 START ——————————————

    // --- AI 接口 1 (常规总结) ---
    // 请在此处填入您的 DeepSeek API Key。
    // 获取地址: https://platform.deepseek.com/api_keys
    // 您的 Key 应该是 "sk-" 开头的字符串。
    const DEEPSEEK_API_KEY = "sk-"; // <--- 在这里替换成你的 KEY
    const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
    const DEEPSEEK_MODEL = "deepseek-chat";

    // --- AI 接口 2 (深度分析) ---
    // 在这里配置第二个AI接口，用于“深度分析”功能。
    // 如果您没有第二个接口，可以将其留空或使用与第一个相同的配置。
    const AI2_API_KEY = "sk-"; // <--- 在这里替换成你的第二个 KEY
    const AI2_URL = "https://api.deepseek.com/chat/completions"; // <--- 替换成第二个接口的链接
    const AI2_MODEL = "deepseek-reasoner"; // <--- 替换成第二个接口的模型 (例如，更强的模型)

    // —————————————— 用户配置区 END ——————————————


    /**
     * @description XMLHttpRequest的Promise封装，用于GM_xmlhttpRequest。
     * @param {string} url - 请求的URL。
     * @param {object} option - 请求选项，如 credentials。
     * @returns {Promise<object>} - 返回一个包含响应信息的Promise。
     */
    function fetch(url, option = {}) {
        return new Promise((resolve, reject) => {
            const req = new XMLHttpRequest();
            req.onreadystatechange = ()=> {
                if (req.readyState === 4) {
                    resolve({
                        ok: req.status>=200&&req.status<=299,
                        status: req.status,
                        statusText: req.statusText,
                        body: req.response,
                        json: ()=>Promise.resolve(JSON.parse(req.responseText)),
                        text: ()=>Promise.resolve(req.responseText)
                    });
                }
            };
            if (option.credentials == 'include') req.withCredentials = true;
            req.onerror = reject;
            req.open('GET', url);
            req.send();
        });
    }

    /**
     * @description 字幕格式编码器
     * 仅包含将B站字幕JSON对象转换为SRT格式的功能，供AI模型使用。
     */
    const subtitleEncoder = {
        /**
         * 将B站字幕JSON对象转换为SRT字符串。
         * @param {Array<object>} data - B站字幕的body部分，包含from, to, content。
         * @returns {string} - SRT格式的字幕内容。
         */
        encodeToSRT(data){
            return data.map(({from,to,content},index)=>{
                return `${index+1}\r\n${this.encodeTime(from)} --> ${this.encodeTime(to)}\r\n${content}`;
            }).join('\r\n\r\n');
        },

        /**
         * 将秒数时间戳格式化为SRT或ASS的时间格式。
         * @param {number} input - 秒数。
         * @param {string} [format='SRT'] - 目标格式 ('SRT', 'ASS', 'LRC')。
         * @returns {string} - 格式化后的时间字符串。
         */
        encodeTime(input,format='SRT'){
            let time = new Date(input*1000),
                ms = time.getMilliseconds(),
                second = time.getSeconds(),
                minute = time.getMinutes(),
                hour = Math.floor(input/60/60);
            if (format=='SRT'||format=='VTT'){
                if (hour<10) hour = '0'+hour;
                if (minute<10) minute = '0'+minute;
                if (second<10) second = '0'+second;
                if (ms<10) ms = '00'+ms;
                else if (ms<100) ms = '0'+ms;
                return `${hour}:${minute}:${second}${format=='SRT'?',':'.'}${ms}`;
            }
            else if(format=='ASS'){
                ms = (ms/10).toFixed(0);
                if (minute<10) minute = '0'+minute;
                if (second<10) second = '0'+second;
                if (ms<10) ms = '0'+ms;
                return `${hour}:${minute}:${second}.${ms}`;
            }
            else{
                ms = (ms/10).toFixed(0);
                minute += hour*60;
                if (minute<10) minute = '0'+minute;
                if (second<10) second = '0'+second;
                if (ms<10) ms = '0'+ms;
                return `[${minute}:${second}.${ms}]`;
            }
        }
    };


    /**
     * @description Bilibili API 数据获取模块
     * 负责从B站API获取视频信息和字幕数据，为AI总结功能提供原始数据。
     */
    const bilibiliCCHelper = {
        window: "undefined"==typeof(unsafeWindow)?window:unsafeWindow,
        cid: undefined, // 当前视频的CID
        subtitle: undefined, // 当前视频的字幕列表信息
        datas: undefined, // 缓存已获取的字幕内容
        pcid: undefined, // 上次获取信息时的CID，用于判断是否需要刷新

        /**
         * 获取指定语言的字幕内容。
         * @param {string} lan - 语言代码 (例如 'zh-CN')。
         * @param {string} [name] - 语言的显示名称 (例如 '中文（中国）')。
         * @returns {Promise<object>} 字幕内容的JSON对象。
         */
        async getSubtitle(lan, name){
            if(this.datas[lan]) return this.datas[lan];
            const item = this.getSubtitleInfo(lan, name);
            if(!item) throw('找不到所选语言字幕'+lan);
            if(this.datas[item.lan]) return this.datas[item.lan];
            return fetch(item.subtitle_url)
                .then(res=>res.json())
                .then(data=>(this.datas[item.lan] = data));
        },

        /**
         * 从字幕列表中查找指定语言的信息。
         * @param {string} lan - 语言代码。
         * @param {string} [name] - 语言显示名称。
         * @returns {object|undefined} 匹配的字幕信息对象。
         */
        getSubtitleInfo(lan, name){
            return this.subtitle.subtitles.find(item=>item.lan==lan || item.lan_doc==name);
        },

        /**
         * 从window对象中获取视频信息 (如aid, bvid, h1Title等)。
         * @param {string} name - 要获取的属性名。
         * @returns {*} 属性值。
         */
        getInfo(name) {
            return this.window[name]
            || this.window.__INITIAL_STATE__ && this.window.__INITIAL_STATE__[name]
            || this.window.__INITIAL_STATE__ && this.window.__INITIAL_STATE__.epInfo && this.window.__INITIAL_STATE__.epInfo[name]
            || this.window.__INITIAL_STATE__ && this.window.__INITIAL_STATE__.videoData && this.window.__INITIAL_STATE__.videoData[name];
        },

        /**
         * 从页面信息中解析epid。
         * @returns {number|boolean|undefined} epid。
         */
        getEpid(){
            return this.getInfo('id')
            || /ep(\d+)/.test(location.pathname) && +RegExp.$1
            || /ss\d+/.test(location.pathname);
        },

        /**
         * 综合多种方式获取当前视频的aid, bvid, cid, epid等关键信息。
         * @returns {number|undefined} 当前视频的CID。
         */
        getEpInfo(){
            const bvid = this.getInfo('bvid'),
                  epid = this.getEpid(),
                  cidMap = this.getInfo('cidMap'),
                  page = this?.window?.__INITIAL_STATE__?.p;
            let ep = cidMap?.[bvid];
            if (ep) {
                this.aid = ep.aid;
                this.bvid = ep.bvid;
                this.cid = ep.cids[page];
                return this.cid;
            }
            ep = this.window.__NEXT_DATA__?.props?.pageProps?.dehydratedState?.queries
            ?.find(query=>query?.queryKey?.[0] == "pgc/view/web/season")
            ?.state?.data;
            ep = (ep?.seasonInfo??ep)?.mediaInfo?.episodes
            ?.find(ep=>epid == true || ep.ep_id == epid);
            if (ep) {
                this.epid = ep.ep_id;
                this.cid = ep.cid;
                this.aid = ep.aid;
                this.bvid = ep.bvid;
                return this.cid;
            }
            ep = this.window.__INITIAL_STATE__?.epInfo;
            if (ep){
                this.epid = ep.id;
                this.cid = ep.cid;
                this.aid = ep.aid;
                this.bvid = ep.bvid;
                return this.cid;
            }
            ep = this.window.playerRaw?.getManifest();
            if (ep){
                this.epid = ep.episodeId;
                this.cid = ep.cid;
                this.aid = ep.aid;
                this.bvid = ep.bvid;
                return this.cid;
            }
        },

        /**
         * 设置和获取视频的字幕信息。如果视频切换，则会重新请求API。
         * @param {boolean} [force=false] - 是否强制刷新字幕信息。
         * @returns {Promise<object>} 包含字幕列表的Promise。
         */
        async setupData(force){
            if(this.subtitle && (this.pcid == this.getEpInfo()) && !force) return this.subtitle;
            if(location.pathname=='/blackboard/html5player.html') {
                let match = location.search.match(/cid=(\d+)/i);
                if(!match) return;
                this.window.cid = match[1];
                match = location.search.match(/aid=(\d+)/i);
                if(match) this.window.aid = match[1];
                match = location.search.match(/bvid=(\d+)/i);
                if(match) this.window.bvid = match[1];
            }
            this.pcid = this.getEpInfo();
            if((!this.cid&&!this.epid)||(!this.aid&&!this.bvid)) return;
            this.subtitle = {count:0,subtitles:[{lan:'close',lan_doc:'关闭'},{lan:'local',lan_doc:'本地字幕'}]};
            if (!force) this.datas = {close:{body:[]},local:{body:[]}};

            return fetch(`https://api.bilibili.com/x/player${this.cid?'/wbi':''}/v2?${this.cid?`cid=${this.cid}`:`&ep_id=${this.epid}`}${this.aid?`&aid=${this.aid}`:`&bvid=${this.bvid}`}`, {credentials: 'include'}).then(res=>{
                if (res.status==200) {
                    return res.json().then(ret=>{
                        if (ret.code == -404) {
                            return fetch(`//api.bilibili.com/x/v2/dm/view?${this.aid?`aid=${this.aid}`:`bvid=${this.bvid}`}&oid=${this.cid}&type=1`, {credentials: 'include'}).then(res=>{
                                return res.json()
                            }).then(ret=>{
                                if (ret.code!=0) throw('无法读取本视频APP字幕配置'+ret.message);
                                this.subtitle = ret.data && ret.data.subtitle || {subtitles:[]};
                                this.subtitle.count = this.subtitle.subtitles.length;
                                this.subtitle.subtitles.forEach(item=>(item.subtitle_url = item.subtitle_url.replace(/https?:\/\//,'//')))
                                this.subtitle.subtitles.push({lan:'close',lan_doc:'关闭'},{lan:'local',lan_doc:'本地字幕'});
                                this.subtitle.allow_submit = false;
                                return this.subtitle;
                            });
                        }
                        if(ret.code!=0||!ret.data||!ret.data.subtitle) throw('读取视频字幕配置错误:'+ret.code+ret.message);
                        this.subtitle = ret.data.subtitle;
                        this.subtitle.count = this.subtitle.subtitles.length;
                        this.subtitle.subtitles.push({lan:'close',lan_doc:'关闭'},{lan:'local',lan_doc:'本地字幕'});
                        return this.subtitle;
                    });
                }
                else {
                    throw('请求字幕配置失败:'+res.statusText);
                }
            })
        }
    };


    /**
     * @description LLM (Large Language Model) API 交互模块
     * 负责将字幕内容发送给AI模型并获取总结。
     */
    const llmHelper = {
        /**
         * 从AI接口1（常规总结）获取总结。
         * @param {string} srtText - SRT格式的字幕内容。
         * @returns {Promise<string>} AI生成的总结文本。
         */
        getSummaryFromLLM: function(srtText) {
            return new Promise((resolve, reject) => {
                if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.includes("xxxxxxxx")) {
                    return reject(new Error("请先在脚本中配置你的 DEEPSEEK_API_KEY。"));
                }

                const requestBody = {
                    model: DEEPSEEK_MODEL,
                    messages: [
                        { role: "system", content: "你是一个视频内容总结助手。用户会提供一个SRT格式的字幕文件内容，请你从中提取核心要点，用详细并且分点完善，先分析场景，然后对于视频核心内容细分总结。分析场景的部分不要发出来。中文进行总结。" },
                        { role: "user", content: "请总结以下字幕内容，并以无序列表（markdown格式的'-'）的形式返回给我。重要：有些观点对于时间戳不一定完全参照我发你的字幕文件，你可以提前或者延后数秒，以确保准确性。对于每个总结要点，请在其开头附上对应的起始时间戳，格式为 [HH:MM:SS]。例如：[00:01:23] 这是一个总结点。每生成一个总结点空一行。请重点关注相关数字、引用等各方方面事实内容，多注重细节:\n\n" + srtText }
                    ],
                    stream: false
                };

                console.log('%c[LLM Log] 准备发送API请求(常规总结)...', 'color: blue; font-weight: bold;');
                GM_xmlhttpRequest({
                    method: "POST",
                    url: DEEPSEEK_URL,
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
                    data: JSON.stringify(requestBody),
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                resolve(JSON.parse(response.responseText).choices[0].message.content);
                            } catch (e) {
                                reject(new Error("解析API返回的JSON失败: " + e.message));
                            }
                        } else {
                            let errorMessage = `API 请求失败: ${response.status} - ${response.statusText} - ${response.responseText}`;
                            reject(new Error(errorMessage));
                        }
                    },
                    onerror: function(response) {
                        reject(new Error("网络请求错误: " + response.statusText));
                    }
                });
            });
        },

        /**
         * 从AI接口2（深度分析）获取总结。
         * @param {string} srtText - SRT格式的字幕内容。
         * @returns {Promise<string>} AI生成的深度分析文本。
         */
        getSummaryFromLLM_AI2: function(srtText) {
            return new Promise((resolve, reject) => {
                if (!AI2_API_KEY || AI2_API_KEY.includes("xxxxxxxx")) {
                    return reject(new Error("请先在脚本中配置你的 AI2_API_KEY。"));
                }

                const requestBody = {
                    model: AI2_MODEL,
                    messages: [{
                        role: "system",
                        content: "你是一个深度思考和分析的视频内容总结助手。用户会提供SRT格式的字幕，请你深入分析其内在逻辑、潜在观点和关键信息，并提供一个结构化、有深度的分析报告。请你先分析字幕场景，结合场景分析，不要输出分析场景的内容。着重字幕中提到有数字、论证材料的地方输出。中文输出。"
                    }, {
                        role: "user",
                        content: "请基于以下字幕内容，进行深度分析和总结，并以无序列表（markdown格式的'-'）的形式返回。对于每个要点，请在其开头附上对应的起始时间戳，格式为 [HH:MM:SS]。\n\n" + srtText
                    }],
                    stream: false
                };

                console.log('%c[LLM Log] 准备发送API请求(深度分析)...', 'color: purple; font-weight: bold;');
                GM_xmlhttpRequest({
                    method: "POST",
                    url: AI2_URL,
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI2_API_KEY}` },
                    data: JSON.stringify(requestBody),
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                resolve(JSON.parse(response.responseText).choices[0].message.content);
                            } catch (e) {
                                reject(new Error("解析AI2 API返回的JSON失败: " + e.message));
                            }
                        } else {
                            let errorMessage = `AI2 API 请求失败: ${response.status} - ${response.statusText} - ${response.responseText}`;
                            reject(new Error(errorMessage));
                        }
                    },
                    onerror: function(response) {
                        reject(new Error("AI2 API 网络请求错误: " + response.statusText));
                    }
                });
            });
        }
    };


    /**
     * @description AI总结UI管理器
     * 负责创建和管理悬浮按钮、总结面板等所有用户界面元素及其交互逻辑。
     */
    const summaryButtonManager = {
        // --- UI Elements ---
        button: null,
        panel: null,
        header: null,
        subtitleDisplay: null,
        contentArea: null,
        resizeHandle: null,
        toggleViewButton: null,

        // --- State Management ---
        cache: {}, // 缓存: { 'cid_lan': { standard: "...", deep: "..." } }
        loadingStates: {}, // 加载状态: { 'cid_lan': { standard: boolean, deep: boolean } }
        currentCid: null,
        currentLan: null,
        currentView: 'standard', // 'standard' 或 'deep'
        isPanelVisible: false,

        // --- Interaction State ---
        isDragging: false,
        isResizing: false,
        isButtonDragging: false,
        dragOffsetX: 0,
        dragOffsetY: 0,
        subtitleChangeDebounce: null,

        /**
         * 初始化管理器，创建按钮并设置观察者。
         */
        init: function() {
            window.addEventListener('load', () => {
                this.createButton();
                this.setupSubtitleObserver();
                setTimeout(() => this.setupThemeObserver(), 500);
            });
        },

        /**
         * 创建并显示可拖动的悬浮按钮。
         */
        createButton: function() {
            if (this.button) return;

            this.button = document.createElement('div');
            this.button.id = 'llm-summary-float-button';
            this.button.innerHTML = 'AI Σ';
            this.button.title = 'AI 总结当前视频字幕 (可拖动)';

            const savedPosition = JSON.parse(GM_getValue('summaryButtonPosition', '{"top": "200px", "left": null, "right": "15px"}'));
            this.button.style.cssText = `
                position: fixed;
                top: ${savedPosition.top};
                left: ${savedPosition.left || 'auto'};
                right: ${savedPosition.right || 'auto'};
                width: 30px; height: 30px; background-color: #00a1d6; color: white;
                border-radius: 50%; display: flex; align-items: center; justify-content: center;
                font-size: 12px; font-weight: bold; cursor: move; z-index: 2147483647;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); transition: transform 0.2s ease, background-color 0.2s ease;
                user-select: none;
            `;

            this.button.onmouseover = () => { if (!this.isButtonDragging) this.button.style.transform = 'scale(1.1)'; };
            this.button.onmouseout = () => { this.button.style.transform = 'scale(1)'; };

            this.button.addEventListener('mousedown', this.startButtonDrag.bind(this));
            this.button.addEventListener('click', (e) => {
                if (e.target.dataset.dragged === 'true') {
                    e.target.dataset.dragged = 'false';
                    return;
                }
                this.handleButtonClick();
            });

            document.body.appendChild(this.button);
        },

        /**
         * 获取页面中的视频播放器元素。
         * @returns {HTMLVideoElement|null}
         */
        _getVideoPlayerElement: function() {
            const selectors = [
                'bwp-video', '#bilibili-player video', '.bpx-player-video-wrap video',
                '.squirtle-video-wrapper video', 'video[class*="bilibili-player-video"]'
            ];
            for (const selector of selectors) {
                const player = document.querySelector(selector);
                if (player) return player;
            }
            return null;
        },

        /**
         * 创建总结面板的DOM结构，但不显示。
         */
        createPanel: function() {
            if (this.panel) return;
            this.panel = document.createElement('div');
            this.panel.id = 'llm-summary-panel';
            const savedOpacity = GM_getValue('summaryPanelOpacity', 1.0);
            this.panel.style.cssText = `
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 550px; height: 400px; min-width: 300px; min-height: 200px;
                border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.3);
                display: none; flex-direction: column; z-index: 2147483646;
                overflow: hidden; opacity: ${savedOpacity}; transition: opacity 0.2s;
            `;

            this.header = document.createElement('div');
            this.header.style.cssText = `
                padding: 10px 15px; cursor: move; border-bottom: 1px solid #e0e0e0;
                display: flex; justify-content: space-between; align-items: center; user-select: none;
            `;

            const titleContainer = document.createElement('div');
            const titleSpan = document.createElement('div');
            titleSpan.textContent = '视频字幕 AI 总结';
            titleSpan.style.cssText = 'font-size: 16px; font-weight: 500;';

            this.subtitleDisplay = document.createElement('div');
            this.subtitleDisplay.style.cssText = 'font-size: 12px; color: #666; margin-top: 2px; height: 14px;';
            titleContainer.append(titleSpan, this.subtitleDisplay);

            const controlsContainer = document.createElement('div');
            controlsContainer.className = 'header-controls';
            controlsContainer.style.cssText = 'display: flex; align-items: center; gap: 15px;';

            const opacitySlider = document.createElement('input');
            opacitySlider.type = 'range';
            opacitySlider.min = '0.2';
            opacitySlider.max = '1';
            opacitySlider.step = '0.05';
            opacitySlider.value = savedOpacity;
            opacitySlider.title = `透明度: ${Math.round(savedOpacity * 100)}%`;
            opacitySlider.style.cssText = 'width: 80px; cursor: pointer;';
            opacitySlider.oninput = (e) => {
                this.panel.style.opacity = e.target.value;
                opacitySlider.title = `透明度: ${Math.round(e.target.value * 100)}%`;
                GM_setValue('summaryPanelOpacity', e.target.value);
            };

            this.toggleViewButton = document.createElement('button');
            this.toggleViewButton.style.cssText = `
                padding: 2px 8px; font-size: 12px; border-radius: 4px; border: 1px solid #00a1d6;
                background-color: transparent; color: #00a1d6; cursor: pointer;
                transition: background-color 0.2s, color 0.2s; min-width: 60px;
            `;
            this.toggleViewButton.onmouseover = () => { this.toggleViewButton.style.backgroundColor = '#00a1d6'; this.toggleViewButton.style.color = '#fff'; };
            this.toggleViewButton.onmouseout = () => { this.toggleViewButton.style.backgroundColor = 'transparent'; this.toggleViewButton.style.color = '#00a1d6'; };
            this.toggleViewButton.onclick = () => this.handleToggleView();

            const closeButton = document.createElement('span');
            closeButton.innerHTML = '✕';
            closeButton.style.cssText = `cursor: pointer; font-size: 20px; padding: 0 5px; margin-left: 10px;`;
            closeButton.onclick = () => this.hidePanel();

            controlsContainer.append(opacitySlider, this.toggleViewButton, closeButton);
            this.header.append(titleContainer, controlsContainer);

            this.contentArea = document.createElement('div');
            this.contentArea.style.cssText = `
                flex-grow: 1; padding: 15px; overflow-y: auto; white-space: pre-wrap;
                line-height: 1.6; font-size: 14px;
            `;
            this.resizeHandle = document.createElement('div');
            this.resizeHandle.style.cssText = `
                position: absolute; bottom: 0; right: 0;
                width: 12px; height: 12px; cursor: se-resize;
            `;
            this.panel.append(this.header, this.contentArea, this.resizeHandle);
            document.body.appendChild(this.panel);

            this.header.addEventListener('mousedown', this.startDrag.bind(this));
            this.resizeHandle.addEventListener('mousedown', this.startResize.bind(this));
            this.panel.addEventListener('click', (event) => {
                if (event.target.matches('.ai-summary-timestamp')) {
                    event.preventDefault();
                    const videoPlayer = this._getVideoPlayerElement();
                    if (videoPlayer) {
                        videoPlayer.currentTime = parseFloat(event.target.dataset.seekTime);
                        if (videoPlayer.paused) videoPlayer.play();
                    }
                }
            });
            this.updateTheme();
        },

        /**
         * 将带时间戳的纯文本总结转换为可点击的HTML。
         * @param {string} rawText - AI返回的原始文本。
         * @returns {string} - 转换后的HTML字符串。
         */
        renderSummaryWithClickableTimestamps: function(rawText) {
            // 添加样式
            if (!document.getElementById('ai-summary-styles')) {
                const style = document.createElement('style');
                style.id = 'ai-summary-styles';
                style.innerHTML = `
                    .ai-summary-timestamp {
                        color: #00a1d6; cursor: pointer; font-weight: bold; text-decoration: none;
                        padding: 1px 4px; border-radius: 3px; transition: background-color 0.2s ease, color 0.2s ease;
                    }
                    .ai-summary-timestamp:hover {
                        background-color: #00a1d6; color: #fff; text-decoration: none;
                    }
                `;
                document.head.appendChild(style);
            }
            const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\]/g;
            const renderedHTML = rawText.replace(timestampRegex, (match, h, m, s) => {
                const totalSeconds = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10);
                return `<a href="#" class="ai-summary-timestamp" data-seek-time="${totalSeconds}">${match}</a>`;
            });
            return renderedHTML.replace(/\n/g, '<br>');
        },

        /** 显示总结面板 */
        showPanel: function() {
            if (!this.panel) this.createPanel();
            this.panel.style.display = 'flex';
            this.isPanelVisible = true;
        },

        /** 隐藏总结面板 */
        hidePanel: function() {
            if (this.panel) this.panel.style.display = 'none';
            this.isPanelVisible = false;
        },

        /**
         * 处理悬浮按钮点击事件。
         */
        handleButtonClick: function() {
            if (this.isPanelVisible) {
                this.hidePanel();
                return;
            }

            this.showPanel();
            bilibiliCCHelper.setupData().then(() => { // 确保字幕信息已加载
                const targetSubtitleInfo = this._getTargetSubtitleInfo();
                this.currentCid = bilibiliCCHelper.cid;
                this.currentLan = targetSubtitleInfo ? targetSubtitleInfo.lan : null;
                this.currentView = 'standard';
                this.updatePanelContent();
            }).catch(err => {
                console.error("[AI Summary] Failed to setup subtitle data:", err);
                this.contentArea.innerHTML = `获取字幕信息失败: <br>${err.message}`;
            });
        },

        /**
         * 处理“常规/深度”视图切换。
         */
        handleToggleView: function() {
            this.currentView = (this.currentView === 'standard') ? 'deep' : 'standard';
            this.updatePanelContent();
        },

        /**
         * 根据当前状态（语言、视图、缓存、加载状态）更新面板内容。
         */
        updatePanelContent: function() {
            if (!this.isPanelVisible) return;

            this.toggleViewButton.textContent = this.currentView === 'standard' ? '深度分析' : '常规总结';

            const subtitleInfo = this.currentLan ? bilibiliCCHelper.getSubtitleInfo(this.currentLan) : null;
            this.subtitleDisplay.textContent = subtitleInfo ? `当前字幕: ${subtitleInfo.lan_doc}` : '请选择一个有效字幕';

            if (!this.currentLan) {
                this.contentArea.innerHTML = '本视频似乎没有可供总结的CC字幕。';
                return;
            }

            const cacheKey = `${this.currentCid}_${this.currentLan}`;
            const isLoading = this.loadingStates[cacheKey]?.[this.currentView];
            const cachedSummary = this.cache[cacheKey]?.[this.currentView];

            if (isLoading) {
                const loadingText = this.currentView === 'standard' ? '正在生成总结...' : '正在深度分析...';
                this.contentArea.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">${loadingText}</div>`;
            } else if (cachedSummary) {
                this.contentArea.innerHTML = this.renderSummaryWithClickableTimestamps(cachedSummary);
            } else {
                this.startSummaryProcess(this.currentView, this.currentLan);
            }
        },

        /**
         * 探测当前B站播放器选中的字幕语言。
         * @returns {object|null} 字幕信息对象或null。
         */
        _getTargetSubtitleInfo: function() {
            let selectedLanguageIdentifier, identifierType = 'lan_doc';
            const activeBpxItem = document.querySelector('.bpx-player-ctrl-subtitle-language-item.bpx-state-active');
            const activeBuiItem = document.querySelector('.bui-select-item.bui-select-item-active');

            if (activeBpxItem) {
                selectedLanguageIdentifier = activeBpxItem.textContent.trim();
            } else if (activeBuiItem && activeBuiItem.dataset.value) {
                selectedLanguageIdentifier = activeBuiItem.dataset.value;
                identifierType = 'lan';
            }

            if (selectedLanguageIdentifier && selectedLanguageIdentifier !== 'close' && selectedLanguageIdentifier !== 'local') {
                const info = bilibiliCCHelper.getSubtitleInfo(
                    identifierType === 'lan' ? selectedLanguageIdentifier : undefined,
                    identifierType === 'lan_doc' ? selectedLanguageIdentifier : undefined
                );
                if (info) return info;
            }

            if (bilibiliCCHelper.subtitle && bilibiliCCHelper.subtitle.subtitles) {
                return bilibiliCCHelper.subtitle.subtitles.find(sub => sub.lan !== 'close' && sub.lan !== 'local');
            }
            return null;
        },

        /**
         * 启动获取和生成AI总结的全流程。
         * @param {string} viewType - 'standard' 或 'deep'。
         * @param {string} lan - 目标语言代码。
         */
        startSummaryProcess: async function(viewType, lan) {
            const cacheKey = `${this.currentCid}_${lan}`;
            this.loadingStates[cacheKey] = this.loadingStates[cacheKey] || {};

            if (this.loadingStates[cacheKey][viewType]) return;

            this.loadingStates[cacheKey][viewType] = true;
            if (this.isPanelVisible && this.currentLan === lan && this.currentView === viewType) {
                 this.updatePanelContent();
            }

            const processName = viewType === 'standard' ? '常规总结' : '深度分析';
            console.log(`%c[AI Summary] --- 开始执行 [${processName}] 流程 for [${lan}] ---`, 'background: #222; color: #bada55');

            try {
                if (!lan) throw new Error("本视频没有可用的CC字幕。");

                const bccData = await bilibiliCCHelper.getSubtitle(lan);
                if (!bccData || !bccData.body || bccData.body.length === 0) throw new Error('未能获取到有效的字幕内容。');

                const srtContent = subtitleEncoder.encodeToSRT(bccData.body);
                const summary = viewType === 'standard'
                    ? await llmHelper.getSummaryFromLLM(srtContent)
                    : await llmHelper.getSummaryFromLLM_AI2(srtContent);

                this.cache[cacheKey] = this.cache[cacheKey] || {};
                this.cache[cacheKey][viewType] = summary;
            } catch (error) {
                console.error(`[AI Summary] ${processName} Error for [${lan}]:`, error);
                const errorMessage = `${processName}失败：<br><br>${error.message}`;
                this.cache[cacheKey] = this.cache[cacheKey] || {};
                this.cache[cacheKey][viewType] = errorMessage;
            } finally {
                this.loadingStates[cacheKey][viewType] = false;
                if (this.isPanelVisible && this.currentLan === lan && this.currentView === viewType) {
                    this.updatePanelContent();
                }
            }
        },

        /**
         * 设置一个MutationObserver来监听播放器字幕的切换，并自动刷新总结。
         */
        setupSubtitleObserver: function() {
            const observer = new MutationObserver((mutationsList) => {
                const isSubtitleChange = mutationsList.some(m =>
                    m.type === 'attributes' && m.attributeName === 'class' &&
                    m.target.matches('.bpx-player-ctrl-subtitle-language-item, .bui-select-item, .squirtle-select-item')
                );

                if (isSubtitleChange && this.isPanelVisible) {
                    clearTimeout(this.subtitleChangeDebounce);
                    this.subtitleChangeDebounce = setTimeout(() => {
                        const newTargetInfo = this._getTargetSubtitleInfo();
                        if (newTargetInfo && newTargetInfo.lan !== this.currentLan) {
                            console.log(`[AI Summary] Subtitle changed to ${newTargetInfo.lan}, auto-refreshing.`);
                            this.currentLan = newTargetInfo.lan;
                            this.currentView = 'standard';
                            this.updatePanelContent();
                        }
                    }, 500);
                }
            });
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
        },

        /**
         * 设置一个MutationObserver来监听页面主题（深色/浅色模式）变化。
         */
        setupThemeObserver: function() {
            const themeObserver = new MutationObserver(() => this.updateTheme());
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        },

        /**
         * 根据页面的深色/浅色模式更新总结面板的样式。
         */
        updateTheme: function() {
            if (!this.panel) return;
            const isDarkMode = document.documentElement.classList.contains('dark');
            if (isDarkMode) {
                this.panel.style.backgroundColor = '#242424';
                this.header.style.backgroundColor = '#303030';
                this.header.style.color = '#e3e3e3';
                this.header.style.borderBottom = '1px solid #404040';
                if(this.subtitleDisplay) this.subtitleDisplay.style.color = '#aaa';
                this.contentArea.style.color = '#c7c7c7';
                this.resizeHandle.style.background = 'linear-gradient(135deg, transparent 50%, #555 50%)';
            } else {
                this.panel.style.backgroundColor = '#fff';
                this.header.style.backgroundColor = '#f1f2f3';
                this.header.style.color = '#333';
                this.header.style.borderBottom = '1px solid #e0e0e0';
                if(this.subtitleDisplay) this.subtitleDisplay.style.color = '#666';
                this.contentArea.style.color = '#212121';
                this.resizeHandle.style.background = 'linear-gradient(135deg, transparent 50%, #ccc 50%)';
            }
        },

        // --- Dragging & Resizing Logic ---
        startButtonDrag: function(e) { e.preventDefault(); this.isButtonDragging = true; this.button.dataset.dragged = 'false'; const r = this.button.getBoundingClientRect(); this.dragOffsetX = e.clientX - r.left; this.dragOffsetY = e.clientY - r.top; document.addEventListener('mousemove', this._doButtonDrag); document.addEventListener('mouseup', this._stopButtonDrag); },
        _doButtonDrag: (e) => { if (!summaryButtonManager.isButtonDragging) return; summaryButtonManager.button.dataset.dragged = 'true'; let newLeft = e.clientX - summaryButtonManager.dragOffsetX; let newTop = e.clientY - summaryButtonManager.dragOffsetY; summaryButtonManager.button.style.left = `${newLeft}px`; summaryButtonManager.button.style.top = `${newTop}px`; summaryButtonManager.button.style.right = 'auto'; },
        _stopButtonDrag: () => { if (!summaryButtonManager.isButtonDragging) return; summaryButtonManager.isButtonDragging = false; document.removeEventListener('mousemove', summaryButtonManager._doButtonDrag); document.removeEventListener('mouseup', summaryButtonManager._stopButtonDrag); GM_setValue('summaryButtonPosition', JSON.stringify({ top: summaryButtonManager.button.style.top, left: summaryButtonManager.button.style.left, right: null })); },
        startDrag: function(e) { if (e.target.closest('.header-controls')) return; e.preventDefault(); this.isDragging = true; this.dragOffsetX = e.clientX - this.panel.offsetLeft; this.dragOffsetY = e.clientY - this.panel.offsetTop; document.addEventListener('mousemove', this._doDrag); document.addEventListener('mouseup', this._stopDrag); },
        _doDrag: (e) => { if (!summaryButtonManager.isDragging) return; summaryButtonManager.panel.style.left = `${e.clientX - summaryButtonManager.dragOffsetX}px`; summaryButtonManager.panel.style.top = `${e.clientY - summaryButtonManager.dragOffsetY}px`; summaryButtonManager.panel.style.transform = 'none'; },
        _stopDrag: () => { summaryButtonManager.isDragging = false; document.removeEventListener('mousemove', summaryButtonManager._doDrag); document.removeEventListener('mouseup', summaryButtonManager._stopDrag); },
        startResize: function(e) { e.preventDefault(); this.isResizing = true; this.resizeStartX = e.clientX; this.resizeStartY = e.clientY; this.resizeStartWidth = this.panel.offsetWidth; this.resizeStartHeight = this.panel.offsetHeight; document.addEventListener('mousemove', this._doResize); document.addEventListener('mouseup', this._stopResize); },
        _doResize: (e) => { if (!summaryButtonManager.isResizing) return; summaryButtonManager.panel.style.width = `${summaryButtonManager.resizeStartWidth + (e.clientX - summaryButtonManager.resizeStartX)}px`; summaryButtonManager.panel.style.height = `${summaryButtonManager.resizeStartHeight + (e.clientY - summaryButtonManager.resizeStartY)}px`; },
        _stopResize: () => { summaryButtonManager.isResizing = false; document.removeEventListener('mousemove', summaryButtonManager._doResize); document.removeEventListener('mouseup', summaryButtonManager._stopResize); }
    };

    // 绑定 `this` 上下文以在事件监听器中正确工作
    summaryButtonManager._doButtonDrag = summaryButtonManager._doButtonDrag.bind(summaryButtonManager);
    summaryButtonManager._stopButtonDrag = summaryButtonManager._stopButtonDrag.bind(summaryButtonManager);
    summaryButtonManager._doDrag = summaryButtonManager._doDrag.bind(summaryButtonManager);
    summaryButtonManager._stopDrag = summaryButtonManager._stopDrag.bind(summaryButtonManager);
    summaryButtonManager._doResize = summaryButtonManager._doResize.bind(summaryButtonManager);
    summaryButtonManager._stopResize = summaryButtonManager._stopResize.bind(summaryButtonManager);


    /**
     * 脚本入口点
     * 初始化UI管理器，启动整个AI总结功能。
     */
    summaryButtonManager.init();

    // 暴露一个全局函数，方便从控制台调试
    unsafeWindow.runBiliSummary = function() {
        console.log('[AI Summary] runBiliSummary() called from console. Triggering UI...');
        summaryButtonManager.handleButtonClick();
    };

})();