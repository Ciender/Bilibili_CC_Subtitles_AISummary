// ==UserScript==
// @name         Bilibili_CC_Subtitles_AISummary
// @version      2.4 (Enhanced Logging & Console Control)
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

    // --- 调试设置 ---
    // 设置为 true 以在浏览器控制台打印详细的调试日志，方便排查问题。
    const ENABLE_DEBUG_LOGGING = false;

    // —————————————— 用户配置区 END ——————————————


    /**
     * @description 调试日志记录器
     * @param {...any} args - 要打印到控制台的参数
     */
    const logDebug = (...args) => {
        if (ENABLE_DEBUG_LOGGING) {
            console.log('%c[AI Summary Debug]', 'color: #4CAF50; font-weight: bold;', ...args);
        }
    };


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
            logDebug(`尝试获取字幕内容: 语言=${lan}, 名称=${name}`);
            if(this.datas[lan]) {
                logDebug(`字幕内容已在缓存中找到: ${lan}`);
                return this.datas[lan];
            }
            const item = this.getSubtitleInfo(lan, name);
            if(!item) {
                logDebug(`找不到所选语言字幕信息: ${lan}`);
                throw('找不到所选语言字幕'+lan);
            }
            if(this.datas[item.lan]) {
                logDebug(`字幕内容已在缓存中找到(通过item.lan): ${item.lan}`);
                return this.datas[item.lan];
            }
            logDebug(`正在通过URL请求字幕内容: ${item.subtitle_url}`);
            return fetch(item.subtitle_url)
                .then(res=>{
                    logDebug(`字幕内容请求响应状态: ${res.status}, ${res.statusText}`);
                    return res.json();
                })
                .then(data=>{
                    logDebug('字幕内容原始数据:', data);
                    this.datas[item.lan] = data;
                    return data;
                })
                .catch(error => {
                    logDebug(`获取字幕内容失败: ${error}`);
                    throw error;
                });
        },

        /**
         * 从字幕列表中查找指定语言的信息。
         * @param {string} lan - 语言代码。
         * @param {string} [name] - 语言显示名称。
         * @returns {object|undefined} 匹配的字幕信息对象。
         */
        getSubtitleInfo(lan, name){
            if (!this.subtitle || !this.subtitle.subtitles) return undefined;
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
            // Existing logic, no change needed for logging here unless detailed tracing of each attempt is desired.
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
            logDebug('开始设置字幕数据...');
            const currentVideoCid = this.getEpInfo();
            if(this.subtitle && (this.pcid == currentVideoCid) && !force) {
                logDebug('字幕数据已缓存且CID未改变，无需重新请求API。当前CID:', currentVideoCid);
                return this.subtitle;
            }
            logDebug('检测到视频或字幕可能已切换，或强制刷新。当前CID:', currentVideoCid, '上次CID:', this.pcid);

            if(location.pathname=='/blackboard/html5player.html') {
                let match = location.search.match(/cid=(\d+)/i);
                if(!match) {
                    logDebug('在html5player.html页面未找到cid参数。');
                    return;
                }
                this.window.cid = match[1];
                match = location.search.match(/aid=(\d+)/i);
                if(match) this.window.aid = match[1];
                match = location.search.match(/bvid=(\d+)/i);
                if(match) this.window.bvid = match[1];
                logDebug('从html5player.html的URL中解析出CID/AID/BVID。');
            }

            this.pcid = currentVideoCid; // 更新上次记录的CID
            if((!this.cid&&!this.epid)||(!this.aid&&!this.bvid)) {
                logDebug('无法获取CID/EPID/AID/BVID，无法请求字幕API。');
                return; // 无法获取关键信息，提前退出
            }

            this.subtitle = {count:0,subtitles:[{lan:'close',lan_doc:'关闭'},{lan:'local',lan_doc:'本地字幕'}]};
            if (!force) this.datas = {close:{body:[]},local:{body:[]}};

            const apiUrl = `https://api.bilibili.com/x/player${this.cid?'/wbi':''}/v2?${this.cid?`cid=${this.cid}`:`&ep_id=${this.epid}`}${this.aid?`&aid=${this.aid}`:`&bvid=${this.bvid}`}`;
            logDebug('请求字幕配置API URL:', apiUrl);

            return fetch(apiUrl, {credentials: 'include'}).then(res=>{
                logDebug(`字幕配置API响应状态: ${res.status}, ${res.statusText}`);
                if (res.status==200) {
                    return res.json().then(ret=>{
                        logDebug('字幕配置API返回数据:', ret);
                        if (ret.code == -404) {
                            logDebug('字幕配置API返回404，尝试旧版APP字幕API...');
                            return fetch(`//api.bilibili.com/x/v2/dm/view?${this.aid?`aid=${this.aid}`:`bvid=${this.bvid}`}&oid=${this.cid}&type=1`, {credentials: 'include'}).then(res=>{
                                logDebug(`旧版APP字幕API响应状态: ${res.status}, ${res.statusText}`);
                                return res.json();
                            }).then(ret=>{
                                logDebug('旧版APP字幕API返回数据:', ret);
                                if (ret.code!=0) throw(new Error('无法读取本视频APP字幕配置'+ret.message));
                                this.subtitle = ret.data && ret.data.subtitle || {subtitles:[]};
                                this.subtitle.count = this.subtitle.subtitles.length;
                                this.subtitle.subtitles.forEach(item=>(item.subtitle_url = item.subtitle_url.replace(/https?:\/\//,'//')))
                                this.subtitle.subtitles.push({lan:'close',lan_doc:'关闭'},{lan:'local',lan_doc:'本地字幕'});
                                this.subtitle.allow_submit = false;
                                logDebug('成功通过旧版APP字幕API获取字幕列表:', this.subtitle);
                                return this.subtitle;
                            });
                        }
                        if(ret.code!=0||!ret.data||!ret.data.subtitle) throw(new Error('读取视频字幕配置错误:'+ret.code+ret.message));
                        this.subtitle = ret.data.subtitle;
                        this.subtitle.count = this.subtitle.subtitles.length;
                        this.subtitle.subtitles.push({lan:'close',lan_doc:'关闭'},{lan:'local',lan_doc:'本地字幕'});
                        logDebug('成功获取字幕列表:', this.subtitle);
                        return this.subtitle;
                    });
                }
                else {
                    throw(new Error('请求字幕配置失败:'+res.statusText));
                }
            })
            .catch(error => {
                logDebug('请求字幕配置过程中发生错误:', error);
                throw error; // 重新抛出错误，以便上层调用者捕获
            });
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
                    logDebug("DEEPSEEK_API_KEY 未配置或为默认值，请先设置。");
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

                logDebug('准备发送常规总结API请求...');
                logDebug('请求URL:', DEEPSEEK_URL);
                logDebug('请求模型:', DEEPSEEK_MODEL);
                // 掩盖部分API Key进行日志记录，保护隐私
                const requestHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY.substring(0, 8)}...${DEEPSEEK_API_KEY.substring(DEEPSEEK_API_KEY.length - 4)}` };
                logDebug('请求Headers:', requestHeaders);
                logDebug('请求Body:', JSON.stringify(requestBody, null, 2)); // 打印格式化的请求体

                GM_xmlhttpRequest({
                    method: "POST",
                    url: DEEPSEEK_URL,
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
                    data: JSON.stringify(requestBody),
                    onload: function(response) {
                        logDebug('常规总结API响应状态:', response.status, response.statusText);
                        logDebug('常规总结API原始响应文本:', response.responseText); // 总是打印原始响应文本
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const responseJson = JSON.parse(response.responseText);
                                if (!responseJson.choices || responseJson.choices.length === 0) {
                                    throw new Error("API返回了空的choices数组。");
                                }
                                const summaryContent = responseJson.choices[0].message.content;
                                logDebug('常规总结API返回的总结内容:', summaryContent);
                                resolve(summaryContent);
                            } catch (e) {
                                logDebug('解析常规总结API返回的JSON失败。', e);
                                reject(new Error("解析API返回的JSON失败: " + e.message));
                            }
                        } else {
                            const errorMessage = `常规总结API 请求失败: ${response.status} - ${response.statusText}`;
                            logDebug('常规总结API请求失败。详细信息:', { status: response.status, statusText: response.statusText, responseBody: response.responseText });
                            reject(new Error(`${errorMessage}<br>服务器响应: ${response.responseText}`));
                        }
                    },
                    onerror: function(response) {
                        logDebug('常规总结API网络请求错误。详细信息:', response);
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
                    logDebug("AI2_API_KEY 未配置或为默认值，请先设置。");
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

                logDebug('准备发送深度分析API请求...');
                logDebug('请求URL:', AI2_URL);
                logDebug('请求模型:', AI2_MODEL);
                // 掩盖部分API Key进行日志记录，保护隐私
                const requestHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${AI2_API_KEY.substring(0, 8)}...${AI2_API_KEY.substring(AI2_API_KEY.length - 4)}` };
                logDebug('请求Headers:', requestHeaders);
                logDebug('请求Body:', JSON.stringify(requestBody, null, 2)); // 打印格式化的请求体

                GM_xmlhttpRequest({
                    method: "POST",
                    url: AI2_URL,
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI2_API_KEY}` },
                    data: JSON.stringify(requestBody),
                    onload: function(response) {
                        logDebug('深度分析API响应状态:', response.status, response.statusText);
                        logDebug('深度分析API原始响应文本:', response.responseText); // 总是打印原始响应文本
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const responseJson = JSON.parse(response.responseText);
                                if (!responseJson.choices || responseJson.choices.length === 0) {
                                    throw new Error("API返回了空的choices数组。");
                                }
                                const summaryContent = responseJson.choices[0].message.content;
                                logDebug('深度分析API返回的总结内容:', summaryContent);
                                resolve(summaryContent);
                            } catch (e) {
                                logDebug('解析深度分析API返回的JSON失败。', e);
                                reject(new Error("解析AI2 API返回的JSON失败: " + e.message));
                            }
                        } else {
                            const errorMessage = `深度分析API 请求失败: ${response.status} - ${response.statusText}`;
                            logDebug('深度分析API请求失败。详细信息:', { status: response.status, statusText: response.statusText, responseBody: response.responseText });
                            reject(new Error(`${errorMessage}<br>服务器响应: ${response.responseText}`));
                        }
                    },
                    onerror: function(response) {
                        logDebug('深度分析API网络请求错误。详细信息:', response);
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
        cache: {}, // 缓存: { 'cid_lan': { standard: "..." or {error:true, message:"..."}, deep: "..." or {error:true, message:"..."} } }
        loadingStates: {}, // 加载状态: { 'cid_lan': { standard: boolean, deep: boolean } }
        currentCid: null,
        currentLan: null,
        currentView: 'standard', // 'standard' 或 'deep'
        isPanelVisible: false,
        isInitialized: false,

        // --- Interaction State ---
        isDragging: false,
        isResizing: false,
        isButtonDragging: false,
        dragOffsetX: 0,
        dragOffsetY: 0,
        subtitleChangeDebounce: null,

        /**
         * 初始化管理器，创建按钮并设置观察者。
         * 这是脚本的主入口，由 waitForElement 调用。
         */
        main: function() {
            if (this.isInitialized) {
                logDebug("脚本已初始化，跳过重复初始化。");
                return;
            }
            logDebug("正在初始化脚本核心功能...");
            this.createButton();
            this.setupSubtitleObserver();
            const themeObserver = new MutationObserver(() => this.updateTheme());
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

            this.isInitialized = true;
            logDebug("脚本核心功能初始化完成。");
        },

        /**
         * 脚本的启动逻辑
         * 使用 MutationObserver 等待关键的播放器元素出现，以适应B站的动态加载。
         */
        init: function() {
            logDebug("脚本开始启动流程，等待Bilibili播放器元素。");
            const playerSelectors = [
                '#bilibili-player', // 主站播放器
                '#bpx-player-container', // 新版播放器
                '.player-container', // 番剧页播放器
                '#player_module' // 课程页播放器
            ];

            const waitForElement = (selector, callback) => {
                const element = document.querySelector(selector);
                if (element) {
                    logDebug(`播放器元素 "${selector}" 已找到。`);
                    callback();
                    return;
                }

                logDebug(`播放器元素 "${selector}" 未立即找到，启动MutationObserver监听。`);
                const observer = new MutationObserver((mutations, obs) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        obs.disconnect(); // 找到元素后停止观察
                        logDebug(`MutationObserver 找到播放器元素 "${selector}"。`);
                        callback();
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            };

            waitForElement(playerSelectors.join(', '), this.main.bind(this));
        },

        /**
         * 创建并显示可拖动的悬浮按钮。
         */
        createButton: function() {
            if (this.button && document.body.contains(this.button)) {
                logDebug("AI总结悬浮按钮已存在，跳过创建。");
                return;
            }

            this.button = document.createElement('div');
            this.button.id = 'llm-summary-float-button';
            this.button.innerHTML = 'AI Σ';
            this.button.title = 'AI 总结 (单击)\n重置面板位置 (双击)\n可拖动';

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
                user-select: none; white-space: pre;
            `;

            this.button.onmouseover = () => { if (!this.isButtonDragging) this.button.style.transform = 'scale(1.1)'; };
            this.button.onmouseout = () => { this.button.style.transform = 'scale(1)'; };

            this.button.addEventListener('mousedown', this.startButtonDrag.bind(this));
            this.button.addEventListener('click', (e) => {
                // 阻止拖动后的点击事件触发面板开关
                if (e.target.dataset.dragged === 'true') {
                    e.target.dataset.dragged = 'false';
                    return;
                }
                this.handleButtonClick();
            });

            // --- 新增功能：双击重置面板位置 ---
            this.button.addEventListener('dblclick', () => {
                if (this.panel) {
                    logDebug("双击悬浮球，重置总结面板位置到网页中心。");
                    this.panel.style.top = '50%';
                    this.panel.style.left = '50%';
                    this.panel.style.transform = 'translate(-50%, -50%)';
                    // 清除可能因拖动而保存的位置，使其下次打开仍居中（可选，但通常用户希望居中是临时的）
                    // 或者，如果不希望双击后保存位置，则不需要额外操作，因为拖动时才会GM_setValue
                } else {
                    logDebug("总结面板未创建，无法重置位置。");
                }
            });

            document.body.appendChild(this.button);
            logDebug("AI总结悬浮按钮创建成功。");
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
                if (player) {
                    // logDebug(`找到视频播放器元素: ${selector}`); // 过于频繁，酌情注释
                    return player;
                }
            }
            logDebug("未找到视频播放器元素。");
            return null;
        },

        /**
         * 创建总结面板的DOM结构，但不显示。
         */
        createPanel: function() {
            if (this.panel) {
                logDebug("AI总结面板已存在，跳过创建。");
                return;
            }
            logDebug("正在创建AI总结面板DOM结构...");
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
                        logDebug(`点击时间戳跳转至: ${event.target.dataset.seekTime}秒`);
                        videoPlayer.currentTime = parseFloat(event.target.dataset.seekTime);
                        if (videoPlayer.paused) videoPlayer.play();
                    } else {
                        logDebug("未找到视频播放器，无法跳转时间戳。");
                    }
                }
            });
            this.updateTheme();
            logDebug("AI总结面板DOM结构创建成功。");
        },

        /**
         * 将带时间戳的纯文本总结转换为可点击的HTML。
         * @param {string} rawText - AI返回的原始文本。
         * @returns {string} - 转换后的HTML字符串。
         */
        renderSummaryWithClickableTimestamps: function(rawText) {
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
                logDebug("已注入AI总结时间戳样式。");
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
            logDebug("总结面板已显示。");
        },

        /** 隐藏总结面板 */
        hidePanel: function() {
            if (this.panel) this.panel.style.display = 'none';
            this.isPanelVisible = false;
            logDebug("总结面板已隐藏。");
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
            logDebug("悬浮按钮点击，尝试加载字幕信息并更新面板。");
            bilibiliCCHelper.setupData().then(() => { // 确保字幕信息已加载
                const targetSubtitleInfo = this._getTargetSubtitleInfo();
                this.currentCid = bilibiliCCHelper.cid;
                this.currentLan = targetSubtitleInfo ? targetSubtitleInfo.lan : null;
                this.currentView = 'standard'; // 默认显示常规总结
                this.updatePanelContent();
            }).catch(err => {
                console.error("[AI Summary] 获取字幕信息失败:", err);
                this.contentArea.innerHTML = `获取字幕信息失败: <br>${err.message}`;
            });
        },

        /**
         * 处理“常规/深度”视图切换。
         */
        handleToggleView: function() {
            this.currentView = (this.currentView === 'standard') ? 'deep' : 'standard';
            logDebug(`视图已切换至: ${this.currentView}`);
            this.updatePanelContent();
        },

        /**
         * 根据当前状态（语言、视图、缓存、加载状态）更新面板内容。
         */
        updatePanelContent: function() {
            if (!this.isPanelVisible) {
                logDebug("面板不可见，跳过更新内容。");
                return;
            }

            this.toggleViewButton.textContent = this.currentView === 'standard' ? '深度分析' : '常规总结';

            const subtitleInfo = this.currentLan ? bilibiliCCHelper.getSubtitleInfo(this.currentLan) : null;
            this.subtitleDisplay.textContent = subtitleInfo ? `当前字幕: ${subtitleInfo.lan_doc}` : '请选择一个有效字幕';
            logDebug(`更新面板内容：当前视图=${this.currentView}, 当前字幕=${this.currentLan}`);

            if (!this.currentLan) {
                this.contentArea.innerHTML = '本视频似乎没有可供总结的CC字幕。';
                logDebug("未找到当前字幕语言，显示无字幕提示。");
                return;
            }

            const cacheKey = `${this.currentCid}_${this.currentLan}`;
            const isLoading = this.loadingStates[cacheKey]?.[this.currentView];
            const cachedData = this.cache[cacheKey]?.[this.currentView];

            if (isLoading) {
                const loadingText = this.currentView === 'standard' ? '正在生成总结...' : '正在深度分析...';
                this.contentArea.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">${loadingText}</div>`;
                logDebug(`正在加载 "${this.currentView}" 总结，显示加载动画。`);
            } else if (cachedData) {
                if (cachedData.error) {
                    logDebug(`加载 "${this.currentView}" 总结失败，显示错误信息和重试按钮。`);
                    this.contentArea.innerHTML = `
                        <div style="color: #ff6e6e; margin-bottom: 15px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto;">${cachedData.message}</div>
                        <button id="ai-summary-retry-button">点击重试</button>
                    `;
                    const retryBtn = this.contentArea.querySelector('#ai-summary-retry-button');
                    if (retryBtn) { // 确保按钮存在
                        retryBtn.style.cssText = `
                            padding: 5px 15px; border: 1px solid #00a1d6; color: #00a1d6; background-color: transparent;
                            border-radius: 4px; cursor: pointer; transition: all 0.2s;
                        `;
                        retryBtn.onmouseover = () => { retryBtn.style.backgroundColor = '#00a1d6'; retryBtn.style.color = '#fff'; };
                        retryBtn.onmouseout = () => { retryBtn.style.backgroundColor = 'transparent'; retryBtn.style.color = '#00a1d6'; };
                        retryBtn.onclick = () => {
                            logDebug(`用户点击重试按钮，重试 "${this.currentView}" 总结。`);
                            // 清除失败的缓存并重新开始流程
                            delete this.cache[cacheKey][this.currentView];
                            this.startSummaryProcess(this.currentView, this.currentLan);
                        };
                    }
                } else {
                    logDebug(`从缓存加载 "${this.currentView}" 总结，并渲染。`);
                    this.contentArea.innerHTML = this.renderSummaryWithClickableTimestamps(cachedData);
                }
            } else {
                logDebug(`缓存中没有 "${this.currentView}" 总结，开始新的总结流程。`);
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
                logDebug(`检测到Bpx播放器选中字幕: ${selectedLanguageIdentifier}`);
            } else if (activeBuiItem && activeBuiItem.dataset.value) {
                selectedLanguageIdentifier = activeBuiItem.dataset.value;
                identifierType = 'lan';
                logDebug(`检测到Bui播放器选中字幕: ${selectedLanguageIdentifier} (类型: ${identifierType})`);
            } else {
                logDebug("未检测到明确选中的字幕。");
            }

            if (selectedLanguageIdentifier && selectedLanguageIdentifier !== 'close' && selectedLanguageIdentifier !== 'local') {
                const info = bilibiliCCHelper.getSubtitleInfo(
                    identifierType === 'lan' ? selectedLanguageIdentifier : undefined,
                    identifierType === 'lan_doc' ? selectedLanguageIdentifier : undefined
                );
                if (info) {
                    logDebug(`成功匹配到字幕信息: ${info.lan_doc} (${info.lan})`);
                    return info;
                } else {
                    logDebug(`通过选中项 "${selectedLanguageIdentifier}" 未能匹配到有效字幕信息。`);
                }
            }

            if (bilibiliCCHelper.subtitle && bilibiliCCHelper.subtitle.subtitles) {
                // 尝试获取第一个非"关闭"非"本地"的字幕作为默认
                const defaultSub = bilibiliCCHelper.subtitle.subtitles.find(sub => sub.lan !== 'close' && sub.lan !== 'local');
                if (defaultSub) {
                    logDebug(`作为备用，使用第一个可用字幕: ${defaultSub.lan_doc} (${defaultSub.lan})`);
                    return defaultSub;
                }
            }
            logDebug("未能找到任何可用字幕信息。");
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

            if (this.loadingStates[cacheKey][viewType]) {
                logDebug(`"${viewType}" 总结已在进行中，跳过重复请求。`);
                return;
            }

            this.loadingStates[cacheKey][viewType] = true;
            // 立即更新UI为加载状态，即便面板当前不可见，以便下次打开时状态正确
            if (this.isPanelVisible && this.currentLan === lan && this.currentView === viewType) {
                 this.updatePanelContent();
            }

            const processName = viewType === 'standard' ? '常规总结' : '深度分析';
            console.log(`%c[AI Summary] --- 开始执行 [${processName}] 流程 for [CID:${this.currentCid}, Lang:${lan}] ---`, 'background: #222; color: #bada55');

            try {
                if (!lan) {
                    logDebug("没有字幕语言，无法生成总结。");
                    throw new Error("本视频没有可用的CC字幕。");
                }

                logDebug(`正在获取字幕数据 for 语言: ${lan}`);
                const bccData = await bilibiliCCHelper.getSubtitle(lan);
                if (!bccData || !bccData.body || bccData.body.length === 0) {
                    logDebug(`获取到的字幕内容为空或无效 for 语言: ${lan}`);
                    throw new Error('未能获取到有效的字幕内容。');
                }
                logDebug(`成功获取到字幕数据，共 ${bccData.body.length} 条。`);

                const srtContent = subtitleEncoder.encodeToSRT(bccData.body);
                // logDebug('生成的SRT内容(部分):', srtContent.substring(0, 500) + '...'); // 打印部分SRT内容
                logDebug(`正在将SRT内容发送给LLM进行 "${processName}" 处理。`);
                const summary = viewType === 'standard'
                    ? await llmHelper.getSummaryFromLLM(srtContent)
                    : await llmHelper.getSummaryFromLLM_AI2(srtContent);

                this.cache[cacheKey] = this.cache[cacheKey] || {};
                this.cache[cacheKey][viewType] = summary; // 成功时缓存字符串
                logDebug(`"${processName}" 生成成功并已缓存。`);

            } catch (error) {
                console.error(`%c[AI Summary] ${processName} Error for [CID:${this.currentCid}, Lang:${lan}]:`, 'background: #f00; color: #fff', error);
                this.cache[cacheKey] = this.cache[cacheKey] || {};
                // 失败时缓存一个带标记的错误对象
                this.cache[cacheKey][viewType] = { error: true, message: `${processName}失败：<br><br>${error.message}` };
            } finally {
                this.loadingStates[cacheKey][viewType] = false;
                // 仅当当前面板显示的是这个视频和这种类型的总结时才更新UI
                if (this.isPanelVisible && this.currentCid === bilibiliCCHelper.cid && this.currentLan === lan && this.currentView === viewType) {
                    this.updatePanelContent();
                }
                console.log(`%c[AI Summary] --- [${processName}] 流程结束 for [CID:${this.currentCid}, Lang:${lan}] ---`, 'background: #222; color: #bada55');
            }
        },

        /**
         * 设置一个MutationObserver来监听播放器字幕的切换，并自动刷新总结。
         */
        setupSubtitleObserver: function() {
            logDebug("设置字幕切换MutationObserver。");
            const observer = new MutationObserver((mutationsList) => {
                const isSubtitleChange = mutationsList.some(m =>
                    m.type === 'attributes' && m.attributeName === 'class' &&
                    m.target.matches('.bpx-player-ctrl-subtitle-language-item, .bui-select-item, .squirtle-select-item')
                );

                if (isSubtitleChange) {
                    logDebug("检测到字幕UI元素类属性变化，可能发生了字幕切换。");
                    clearTimeout(this.subtitleChangeDebounce);
                    this.subtitleChangeDebounce = setTimeout(() => {
                        const newTargetInfo = this._getTargetSubtitleInfo();
                        if (newTargetInfo && newTargetInfo.lan !== this.currentLan) {
                            logDebug(`字幕已从 "${this.currentLan}" 切换到 "${newTargetInfo.lan}"，自动刷新总结。`);
                            this.currentLan = newTargetInfo.lan;
                            this.currentView = 'standard'; // 切换字幕后默认显示常规总结
                            if (this.isPanelVisible) {
                                this.updatePanelContent();
                            }
                        } else if (newTargetInfo) {
                            logDebug("字幕UI元素变化，但字幕语言未改变，或无有效字幕。");
                        }
                    }, 500); // 增加少量延迟以避免快速切换的抖动
                }
            });
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
        },

        /**
         * 根据页面的深色/浅色模式更新总结面板的样式。
         */
        updateTheme: function() {
            if (!this.panel) return;
            const isDarkMode = document.documentElement.classList.contains('dark');
            // logDebug(`更新主题样式，当前模式: ${isDarkMode ? '深色' : '浅色'}`); // 过于频繁，酌情注释
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
    // 重新设计为更结构化的API
    unsafeWindow.biliAISummary = {
        /**
         * 切换AI总结面板的显示/隐藏状态。
         * 如果面板隐藏，则显示并尝试获取常规总结。
         */
        togglePanel: function() {
            console.log('[AI Summary Console] 调用 togglePanel()。');
            summaryButtonManager.handleButtonClick();
        },

        /**
         * 强制刷新并获取当前视频的常规总结。
         * 会打开面板并显示结果。
         */
        getStandardSummary: async function() {
            console.log('[AI Summary Console] 调用 getStandardSummary()，强制刷新常规总结。');
            summaryButtonManager.showPanel(); // 确保面板可见
            // 确保字幕数据最新
            try {
                await bilibiliCCHelper.setupData(true);
            } catch (err) {
                console.error('[AI Summary Console] 强制刷新字幕数据失败:', err);
                summaryButtonManager.contentArea.innerHTML = `手动获取常规总结失败: 字幕数据加载失败。<br>${err.message}`;
                return;
            }

            const targetSubtitleInfo = summaryButtonManager._getTargetSubtitleInfo();
            if (!targetSubtitleInfo) {
                console.error('[AI Summary Console] 没有找到有效的字幕可供常规总结。');
                summaryButtonManager.contentArea.innerHTML = '手动获取常规总结失败: 本视频没有可用的CC字幕。';
                return;
            }
            summaryButtonManager.currentCid = bilibiliCCHelper.cid;
            summaryButtonManager.currentLan = targetSubtitleInfo.lan;
            summaryButtonManager.currentView = 'standard';
            // 清除此视图的缓存，强制重新请求
            if (summaryButtonManager.cache[`${summaryButtonManager.currentCid}_${summaryButtonManager.currentLan}`]) {
                delete summaryButtonManager.cache[`${summaryButtonManager.currentCid}_${summaryButtonManager.currentLan}`]['standard'];
            }
            summaryButtonManager.updatePanelContent(); // 这将触发 startSummaryProcess
        },

        /**
         * 强制刷新并获取当前视频的深度分析。
         * 会打开面板并显示结果。
         */
        getDeepSummary: async function() {
            console.log('[AI Summary Console] 调用 getDeepSummary()，强制刷新深度分析。');
            summaryButtonManager.showPanel(); // 确保面板可见
            // 确保字幕数据最新
            try {
                await bilibiliCCHelper.setupData(true);
            } catch (err) {
                console.error('[AI Summary Console] 强制刷新字幕数据失败:', err);
                summaryButtonManager.contentArea.innerHTML = `手动获取深度分析失败: 字幕数据加载失败。<br>${err.message}`;
                return;
            }

            const targetSubtitleInfo = summaryButtonManager._getTargetSubtitleInfo();
            if (!targetSubtitleInfo) {
                console.error('[AI Summary Console] 没有找到有效的字幕可供深度分析。');
                summaryButtonManager.contentArea.innerHTML = '手动获取深度分析失败: 本视频没有可用的CC字幕。';
                return;
            }
            summaryButtonManager.currentCid = bilibiliCCHelper.cid;
            summaryButtonManager.currentLan = targetSubtitleInfo.lan;
            summaryButtonManager.currentView = 'deep';
            // 清除此视图的缓存，强制重新请求
            if (summaryButtonManager.cache[`${summaryButtonManager.currentCid}_${summaryButtonManager.currentLan}`]) {
                delete summaryButtonManager.cache[`${summaryButtonManager.currentCid}_${summaryButtonManager.currentLan}`]['deep'];
            }
            summaryButtonManager.updatePanelContent(); // 这将触发 startSummaryProcess
        },

        /**
         * 重试当前面板正在显示的总结类型（常规或深度）。
         * 如果当前有错误信息显示，会清除缓存并重新请求。
         */
        retryCurrentSummary: function() {
            console.log(`[AI Summary Console] 调用 retryCurrentSummary()，重试当前 "${summaryButtonManager.currentView}" 总结。`);
            if (!summaryButtonManager.currentLan || !summaryButtonManager.currentCid) {
                console.error('[AI Summary Console] 无法重试: 没有当前视频或字幕上下文。');
                summaryButtonManager.contentArea.innerHTML = '无法重试: 没有当前视频或字幕上下文。';
                return;
            }
            const cacheKey = `${summaryButtonManager.currentCid}_${summaryButtonManager.currentLan}`;
            // 仅在缓存中存在对应类型时才清除，防止清除无关缓存
            if (summaryButtonManager.cache[cacheKey] && summaryButtonManager.cache[cacheKey][summaryButtonManager.currentView]) {
                delete summaryButtonManager.cache[cacheKey][summaryButtonManager.currentView]; // 清除之前可能失败的缓存
                console.log(`[AI Summary Console] 已清除当前 "${summaryButtonManager.currentView}" 总结的缓存。`);
            }
            summaryButtonManager.startSummaryProcess(summaryButtonManager.currentView, summaryButtonManager.currentLan);
        },

        // 暴露内部管理器对象，供高级调试使用 (不推荐普通用户直接操作)
        _manager: summaryButtonManager
    };

    // 保留 runBiliSummary 作为 togglePanel 的简写，以兼容旧习惯
    unsafeWindow.runBiliSummary = unsafeWindow.biliAISummary.togglePanel;

})();
