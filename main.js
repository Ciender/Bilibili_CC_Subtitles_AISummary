// ==UserScript==
// @name         Bilibili_CC_Subtitles_Download_AISummary
// @version      1.4
// @description  可下载B站的CC字幕，旧版B站播放器可启用CC字幕。添加了字幕AI总结，支持DeepSeek，并可点击总结中的时间戳跳转视频。
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
    const DEEPSEEK_API_KEY = ""; // <--- 在这里替换成你的 KEY
    const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
    const DEEPSEEK_MODEL = "deepseek-chat";

    // --- AI 接口 2 (深度分析) ---
    // 在这里配置第二个AI接口，用于“深度分析”功能。
    // 如果您没有第二个接口，可以将其留空或使用与第一个相同的配置。
    const AI2_API_KEY = ""; // <--- 在这里替换成你的第二个 KEY
    const AI2_URL = "https://api.deepseek.com/chat/completions"; // <--- 替换成第二个接口的链接
    const AI2_MODEL = "deepseek-reasoner"; // <--- 替换成第二个接口的模型 (例如，更强的模型)


    // —————————————— 用户配置区 END ——————————————



    const elements = {
        subtitleStyle:`
<style type="text/css">
/*对齐，悬停按钮显示菜单*/
#subtitle-setting-panel>div>* {margin-right: 5px;}
#bilibili-player-subtitle-btn:hover>#subtitle-setting-panel {display: block!important;}
/*滑动选择样式*/
#subtitle-setting-panel input[type="range"] {
  background-color: #ebeff4;
  -webkit-appearance: none;
  height:4px;
  transform: translateY(-4px);
}
#subtitle-setting-panel input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 15px;
  width: 15px;
  background: #fff;
  border-radius: 15px;
  border: 1px solid;
}
/*复选框和其对应标签样式*/
#subtitle-setting-panel input[type="checkbox"]{display:none;}
#subtitle-setting-panel input ~ label {cursor:pointer;}
#subtitle-setting-panel input:checked ~ label:before {content: '\\2714';}
#subtitle-setting-panel input ~ label:before{
  width: 12px;
  height:12px;
  line-height: 14px;
  vertical-align: text-bottom;
  border-radius: 3px;
  border:1px solid #d3d3d3;
  display: inline-block;
  text-align: center;
  content: ' ';
}
/*悬停显示下拉框样式*/
#subtitle-setting-panel .bpui-selectmenu:hover .bpui-selectmenu-list{display:block;}
/*滚动条样式*/
#subtitle-setting-panel ::-webkit-scrollbar{width: 7px;}
#subtitle-setting-panel ::-webkit-scrollbar-track{border-radius: 4px;background-color: #EEE;}
#subtitle-setting-panel ::-webkit-scrollbar-thumb{border-radius: 4px;background-color: #999;}
/* --- NEW: Style for clickable timestamps --- */
.ai-summary-timestamp {
    color: #00a1d6;
    cursor: pointer;
    font-weight: bold;
    text-decoration: none;
    padding: 1px 4px;
    border-radius: 3px;
    transition: background-color 0.2s ease, color 0.2s ease;
}
.ai-summary-timestamp:hover {
    background-color: #00a1d6;
    color: #fff;
    text-decoration: none;
}
</style>`,
        oldEnableIcon:`
<svg width="22" height="28" viewbox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
  <path id="svg_1" fill-rule="evenodd" fill="#99a2aa" d="m4.07787,6.88102l14,0a2,2 0 0 1 2,2l0,10a2,2 0 0 \
1 -2,2l-14,0a2,2 0 0 1 -2,-2l0,-10a2,2 0 0 1 2,-2zm5,5.5a1,1 0 1 0 0,-2l-3,0a2,2 0 0 0 -2,2l0,3a2,2 0 0 0 \
2,2l3,0a1,1 0 0 0 0,-2l-2,0a1,1 0 0 1 -1,-1l0,-1a1,1 0 0 1 1,-1l2,0zm8,0a1,1 0 0 0 0,-2l-3,0a2,2 0 0 0 -2,2l0\
,3a2,2 0 0 0 2,2l3,0a1,1 0 0 0 0,-2l-2,0a1,1 0 0 1 -1,-1l0,-1a1,1 0 0 1 1,-1l2,0z"/></svg>`,
        oldDisableIcon:`
<svg width="22" height="28" viewBox="0 0 22 32" xmlns="http://www.w3.org/2000/svg">
  <path id="svg_1" fill-rule="evenodd" fill="#99a2aa" d="m15.172,21.87103l-11.172,0a2,2 0 0 1 -2,-2l0,-10c0,\
-0.34 0.084,-0.658 0.233,-0.938l-0.425,-0.426a1,1 0 1 1 1.414,-1.414l15.556,15.556a1,1 0 0 1 -1.414,1.414l-2.192,\
-2.192zm-10.21,-10.21c-0.577,0.351 -0.962,0.986 -0.962,1.71l0,3a2,2 0 0 0 2,2l3,0a1,1 0 0 0 0,-2l-2,0a1,1 0 0 1 -1,\
-1l0,-1a1,1 0 0 1 0.713,-0.958l-1.751,-1.752zm1.866,-3.79l11.172,0a2,2 0 0 1 2,2l0,10c0,0.34 -0.084,0.658 -0.233,\
0.938l-2.48,-2.48a1,1 0 0 0 -0.287,-1.958l-1.672,0l-1.328,-1.328l0,-0.672a1,1 0 0 1 1,-1l2,0a1,1 0 0 0 0,-2l-3,\
0a2,2 0 0 0 -1.977,1.695l-5.195,-5.195z"/></svg>`,
        newDisableIcon:`
        <svg class="squirtle-svg-icon" viewBox="0 0 28 22" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
              <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                  <path d="M6.998,4 L10.118,7.123 L9.5605,7.1235 C9.4135,6.777 9.151,6.3465 8.8885,6 L7.933,6.3045 C8.101,6.546 8.269,6.8505 8.4055,7.1235 L4.3945,7.1235 L4.3945,9.3705 L5.35,9.3705 L5.35,8.0475 L11.042,8.047 L12.206,9.212 L12.2065,9.3705 L12.364,9.37 L14.494,11.502 L14.389,11.502 L14.389,12.2685 L15.259,12.268 L15.7076026,12.7152226 C15.273892,12.9780418 14.772314,13.2154154 14.2,13.413 C14.3785,13.5705 14.641,13.9275 14.746,14.148 C15.2185,13.959 15.6385,13.7595 16.027,13.5285 L16.027,15.5025 L16.9615,15.5025 L16.961,13.971 L18.536,15.547 L18.5365,15.7125 L18.701,15.712 L20.987,18 L4,18 C2.8954305,18 2,17.1045695 2,16 L2,6 C2,4.8954305 2.8954305,4 4,4 L6.998,4 Z M24,4 C25.1045695,4 26,4.8954305 26,6 L26,16 C26,17.1045695 25.1045695,18 24,18 L23.814,18 L21.2866753,15.470484 C21.499408,15.4571242 21.672579,15.4281871 21.8125,15.366 C22.096,15.24 22.1695,15.0405 22.1695,14.631 L22.1695,13.5915 C22.5475,13.812 22.957,13.98 23.3665,14.106 C23.482,13.8855 23.7445,13.539 23.944,13.3815 C23.0725,13.161 22.201,12.762 21.5605,12.2685 L23.7025,12.2685 L23.7025,11.502 L18.2635,11.502 C18.3685,11.3445 18.4735,11.187 18.568,11.019 L22.6,11.019 L22.6,8.079 L15.565,8.079 L15.564,9.743 L13.204,7.381 L13.204,7.1235 L12.946,7.123 L9.825,4 L24,4 Z M11.0725,9.045 L10.852,9.0975 L6.043,9.0975 L6.043,10.0005 L9.865,10.0005 C9.3925,10.3995 8.815,10.809 8.2795,11.0715 L8.2795,11.6805 L4.3,11.6805 L4.3,12.615 L8.2795,12.615 L8.2795,14.547 C8.2795,14.673 8.23321429,14.7295714 8.10096939,14.7431633 L7.788625,14.7522422 C7.4696875,14.7556875 6.938125,14.75175 6.442,14.736 C6.5995,14.988 6.799,15.429 6.862,15.7125 L7.348864,15.710148 C7.95904,15.70242 8.416,15.6705 8.752,15.5445 C9.1825,15.3975 9.319,15.1245 9.319,14.5785 L9.319,12.615 L13.2985,12.615 L13.2985,11.6805 L9.319,11.6805 L9.319,11.397 C10.2115,10.8825 11.0935,10.2 11.734,9.549 L11.0725,9.045 Z M21.235,13.77 L21.235,14.6205 C21.235,14.7255 21.193,14.757 21.0775,14.757 L20.574025,14.7533985 L20.569,14.753 L19.587,13.77 L21.235,13.77 Z M20.5105,12.2685 C20.731,12.531 20.9935,12.7725 21.2875,13.0035 L19.4815,13.0035 L19.4815,12.4575 L18.5365,12.4575 L18.536,12.718 L18.087,12.268 L20.5105,12.2685 Z M16.839,11.019 L17.497,11.019 C17.4212405,11.1536835 17.3319842,11.2816187 17.2292312,11.4082156 L16.839,11.019 Z M21.6235,9.822 L21.6235,10.4205 L16.4995,10.4205 L16.4995,9.822 L21.6235,9.822 Z M21.6235,8.6775 L21.6235,9.255 L16.4995,9.255 L16.4995,8.6775 L21.6235,8.6775 Z M17.791,6.084 L16.8355,6.084 L16.8355,6.7035 L14.452,6.7035 L14.452,7.491 L16.8355,7.491 L16.8355,7.89 L17.791,7.89 L17.791,7.491 L20.269,7.491 L20.269,7.89 L21.2245,7.89 L21.2245,7.491 L23.6605,7.491 L23.6605,6.7035 L21.2245,6.7035 L21.2245,6.084 L20.269,6.084 L20.269,6.7035 L17.791,6.7035 L17.791,6.084 Z" id="形状结合" fill="#FFFFFF"></path>
                  <path d="M4.08046105,2.26754606 L4.08516738,2.26283972 C4.4730925,1.8749146 5.10204339,1.8749146 5.48996851,2.26283972 C5.49153201,2.26440322 5.49309028,2.26597193 5.4946433,2.26754583 L21.6870833,18.6777025 C22.0731601,19.0689703 22.0710589,19.6984951 21.6823787,20.0871769 L21.6776695,20.0918861 C21.2897453,20.479812 20.6607945,20.4798133 20.2728686,20.091889 C20.2713046,20.090325 20.2697458,20.0887558 20.2681922,20.0871813 L4.07575482,3.67702186 C3.68967757,3.28575345 3.69177955,2.65622755 4.08046105,2.26754606 Z" id="Path" fill="#FFFFFF"></path>
              </g>
            </svg>`,
        newEnableIcon:`
        <svg class="squirtle-svg-icon" viewBox="0 0 28 22" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
              <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                  <g transform="translate(2.000000, 0.000000)" fill="#FFFFFF">
                      <path d="M22,3.5 C23.1045695,3.5 24,4.3954305 24,5.5 L24,16.5 C24,17.6045695 23.1045695,18.5 22,18.5 L2,18.5 C0.8954305,18.5 1.3527075e-16,17.6045695 0,16.5 L0,5.5 C-1.3527075e-16,4.3954305 0.8954305,3.5 2,3.5 L22,3.5 Z M9.018,9.1515 L8.7975,9.204 L3.9885,9.204 L3.9885,10.107 L7.8105,10.107 C7.338,10.506 6.7605,10.9155 6.225,11.178 L6.225,11.787 L2.2455,11.787 L2.2455,12.7215 L6.225,12.7215 L6.225,14.6535 C6.225,14.8005 6.162,14.853 5.973,14.853 C5.9065,14.8565 5.78166667,14.8588333 5.62027778,14.8596111 L5.3535,14.8595625 C5.06475,14.85825 4.71825,14.853 4.3875,14.8425 C4.545,15.0945 4.7445,15.5355 4.8075,15.819 C5.6685,15.819 6.2775,15.8085 6.6975,15.651 C7.128,15.504 7.2645,15.231 7.2645,14.685 L7.2645,12.7215 L11.244,12.7215 L11.244,11.787 L7.2645,11.787 L7.2645,11.5035 C8.157,10.989 9.039,10.3065 9.6795,9.6555 L9.018,9.1515 Z M20.799,8.1855 L13.764,8.1855 L13.764,11.1255 L15.696,11.1255 C15.6015,11.2935 15.486,11.451 15.3495,11.6085 L12.588,11.6085 L12.588,12.375 L14.5515,12.375 C13.995,12.816 13.281,13.215 12.399,13.5195 C12.5775,13.677 12.84,14.034 12.945,14.2545 C13.4175,14.0655 13.8375,13.866 14.226,13.635 L14.226,15.609 L15.1605,15.609 L15.1605,13.8765 L16.7355,13.8765 L16.7355,15.819 L17.6805,15.819 L17.6805,13.8765 L19.434,13.8765 L19.434,14.727 C19.434,14.832 19.392,14.8635 19.2765,14.8635 L19.15575,14.8633359 C18.9962813,14.8628437 18.7305,14.860875 18.447,14.853 C18.552,15.0735 18.657,15.357 18.699,15.588 C19.308,15.588 19.728,15.5985 20.0115,15.4725 C20.295,15.3465 20.3685,15.147 20.3685,14.7375 L20.3685,13.698 C20.7465,13.9185 21.156,14.0865 21.5655,14.2125 C21.681,13.992 21.9435,13.6455 22.143,13.488 C21.2715,13.2675 20.4,12.8685 19.7595,12.375 L21.9015,12.375 L21.9015,11.6085 L16.4625,11.6085 C16.5675,11.451 16.6725,11.2935 16.767,11.1255 L20.799,11.1255 L20.799,8.1855 Z M18.7095,12.375 C18.93,12.6375 19.1925,12.879 19.4865,13.11 L17.6805,13.11 L17.6805,12.564 L16.7355,12.564 L16.7355,13.11 L15.0135,13.11 C15.318,12.879 15.591,12.6375 15.8325,12.375 L18.7095,12.375 Z M19.8225,9.9285 L19.8225,10.527 L14.6985,10.527 L14.6985,9.9285 L19.8225,9.9285 Z M6.834,6.1065 L5.8785,6.411 C6.0465,6.6525 6.2145,6.957 6.351,7.23 L2.34,7.23 L2.34,9.477 L3.2955,9.477 L3.2955,8.154 L10.152,8.154 L10.152,9.477 L11.1495,9.477 L11.1495,7.23 L7.506,7.23 C7.359,6.8835 7.0965,6.453 6.834,6.1065 Z M19.8225,8.784 L19.8225,9.3615 L14.6985,9.3615 L14.6985,8.784 L19.8225,8.784 Z M15.99,6.1905 L15.0345,6.1905 L15.0345,6.81 L12.651,6.81 L12.651,7.5975 L15.0345,7.5975 L15.0345,7.9965 L15.99,7.9965 L15.99,7.5975 L18.468,7.5975 L18.468,7.9965 L19.4235,7.9965 L19.4235,7.5975 L21.8595,7.5975 L21.8595,6.81 L19.4235,6.81 L19.4235,6.1905 L18.468,6.1905 L18.468,6.81 L15.99,6.81 L15.99,6.1905 Z" id="形状结合"></path>
                  </g>
              </g>
            </svg>`,
        // ... (el resto del objeto elements permanece igual) ...
        createAs(nodeType,config,appendTo){
            const element = document.createElement(nodeType);
            config&&this.setAs(element,config);
            appendTo&&appendTo.appendChild(element);
            return element;
        },
        setAs(element,config,appendTo){
            config&&Object.entries(config).forEach(([key, value])=>{
                element[key] = value;
            });
            appendTo&&appendTo.appendChild(element);
            return element;
        },
        getAs(selector,config,appendTo){
            if(selector instanceof Array) {
                return selector.map(item=>this.getAs(item));
            }
            const element = document.body.querySelector(selector);
            element&&config&&this.setAs(element,config);
            element&&appendTo&&appendTo.appendChild(element);
            return element;
        },
        createSelector(config,appendTo){
            const selector = this.createAs('div',{
                className:"bilibili-player-block-string-type bpui-component bpui-selectmenu selectmenu-mode-absolute",
                style:"width:"+config.width
            },appendTo),
                  selected = config.datas.find(item=>item.value==config.initValue),
                  label = this.createAs('div',{
                      className:'bpui-selectmenu-txt',
                      innerHTML: selected?selected.content:config.initValue
                  },selector),
                  arraw = this.createAs('div',{
                      className:'bpui-selectmenu-arrow bpui-icon bpui-icon-arrow-down'
                  },selector),
                  list = this.createAs('ul',{
                      className:'bpui-selectmenu-list bpui-selectmenu-list-left',
                      style:`max-height:${config.height||'100px'};overflow:hidden auto;white-space:nowrap;`,
                      onclick:e=>{
                          label.dataset.value = e.target.dataset.value;
                          label.innerHTML = e.target.innerHTML;
                          config.handler(e.target.dataset.value);
                      }
                  },selector);
            config.datas.forEach(item=>{
                this.createAs('li',{
                    className:'bpui-selectmenu-list-row',
                    innerHTML:item.content
                },list).dataset.value = item.value;
            });
            return selector;
        },
        createRadio(config,appendTo){
            this.createAs('input',{
                ...config,type: "radio",style:"cursor:pointer;5px;vertical-align: middle;"
            },appendTo);
            this.createAs('label',{
                style:"margin-right: 5px;cursor:pointer;vertical-align: middle;",
                innerText:config.value
            },appendTo).setAttribute('for',config.id);
        }
    };
    // ... (el resto del script hasta el objeto llmHelper permanece sin cambios) ...
    // ... (omitiendo el gran bloque de código original por brevedad, se mantiene igual) ...
    function fetch(url, option = {}) {
        return new Promise((resolve, reject) => {
            const req = new XMLHttpRequest();
            req.onreadystatechange = ()=> {
                if (req.readyState === 4) {
                    resolve({
                        ok: req.status>=200&&req.status<=299,
                        status: req.status,
                        statusText: req.statusText,
                        body: req.response, // 与原fetch定义的ReadableStream类型不同，无用
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

    const encoder = {
        assHead : [
            '[Script Info]',
            `Title: ${document.title}`,
            'ScriptType: v4.00+',
            'Collisions: Reverse',
            'PlayResX: 1280',
            'PlayResY: 720',
            'WrapStyle: 3',
            'ScaledBorderAndShadow: yes',
            '; ----------------------',
            '; 本字幕由CC字幕助手自动转换',
            `; 字幕来源${document.location}`,
            '; 脚本地址https://greasyfork.org/scripts/378513',
            '; 设置了字幕过长自动换行，但若字幕中没有空格换行将无效',
            '; 字体大小依据720p 48号字体等比缩放',
            '; 如显示不正常请尝试使用SRT格式',
            '','[V4+ Styles]',
            'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, '
            +'BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, '
            +'BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
            'Style: Default,Segoe UI,48,&H00FFFFFF,&HF0000000,&H00000000,&HF0000000,1,0,0,0,100,100,0,0.00,1,1,3,2,30,30,20,1',
            '','[Events]',
            'Format: Layer, Start, End, Style, Actor, MarginL, MarginR, MarginV, Effect, Text'
        ],
        showDialog(data, download){
            if(!data||!(data.body instanceof Array)){
                throw '数据错误';
            }
            this.data = data;
            const settingDiv = elements.createAs('div',{
                style :'position: fixed;top: 0;bottom: 0;left: 0;right: 0;background: rgba(0,0,0,0.4);z-index: 1048576;'+(download?'display:none':'')
            },document.body),
                  panel = elements.createAs('div',{
                      style:'left: 50%;top: 50%;position: absolute;padding: 15px;background:white;'
                      + 'border-radius: 8px;margin: auto;transform: translate(-50%,-50%);',
                      innerHTML: '<h2 style="font-size: 20px;color: #4fc1e9;font-weight: 400;margin-bottom: 10px;">字幕下载</h2>'
                      + '<a href="https://greasyfork.org/scripts/378513" target="_blank" style="position:absolute;right:20px;top:30px">'
                      + `当前版本：${typeof(GM_info)!="undefined"&&GM_info.script.version||'unknow'}</a>`
                  },settingDiv),
                  textArea = this.textArea = elements.createAs('textarea',{
                      style: 'width: 400px;min-width: 300px;height: 400px;resize: both;padding: 5px;line-height: normal;border: 1px solid #e5e9ef;margin: 0px;'
                  },panel),
                  bottomPanel = elements.createAs('div',{style:'font-size:14px; padding-top: 10px;'},panel);
            textArea.setAttribute('readonly',true);
            const type = localStorage.defaultSubtitleType || 'SRT';
            elements.createAs('select', {
                style: 'height: 24px; margin-right: 5px;',
                innerHTML:['ASS', 'SRT', 'LRC', 'VTT', 'TXT', 'BCC'].map(type=>`<option value="${type}">${type}</option>`).join(''),
                value: type,
                onchange:(ev)=>this.updateDownload(ev.target.value)
            },bottomPanel);
            this.actionButton = elements.createAs('a',{
                title: '按住Ctrl键点击字幕列表的下载可不打开预览直接下载当前格式',
                innerText: "下载",style: 'height: 24px;margin-right: 5px;background: #00a1d6;color: #fff;padding: 7px;',
                onclick: function(){event.stopPropagation();},
                oncontextmenu: function(){event.stopPropagation();},
            },bottomPanel);
            this.openTabButton = elements.createAs('a',{
                innerText: "在新标签页中打开",style: 'height: 24px;margin-right: 5px;background: #00a1d6;color: #fff;padding: 7px;',
                target: '_blank',onclick: function(){event.stopPropagation();},
                oncontextmenu: function(){event.stopPropagation();},
            },bottomPanel);
            this.closeButton = elements.createAs('a',{
                innerText: "关闭",style:'height: 24px;margin-right: 5px;background: #00a1d6;color: #fff;padding: 7px;cursor: pointer;',
                onclick: ()=>document.body.removeChild(settingDiv)
            },bottomPanel);
            this.updateDownload(type, download);
        },
        updateDownload(type='LRC', download){
            let result;
            let blobResult
            switch(type) {
                case 'LRC':
                    result = this.encodeToLRC(this.data.body);
                    break;
                case 'SRT':
                    result = this.encodeToSRT(this.data.body);
                    break;
                case 'ASS':
                    result = this.encodeToASS(this.data.body);
                    break;
                case 'VTT':
                    result = this.encodeToVTT(this.data.body);
                    break;
                case 'TXT':
                    result = this.data.body.map(item=>item.content).join('\r\n');
                    break;
                case 'BCC':
                    result = JSON.stringify(this.data,undefined,2);
                    break;
                default:
                    result = '错误：无法识别的格式 ' + type;
                    break;
            }
            this.textArea.value = result;
            localStorage.defaultSubtitleType = type;
            type = type.toLowerCase();
            URL.revokeObjectURL(this.actionButton.href);
            this.actionButton.classList.remove('bpui-state-disabled','bui-button-disabled');
            blobResult = new Blob([result],{type:'text/'+type+';charset=utf-8'})
            this.actionButton.href = URL.createObjectURL(blobResult);
            this.openTabButton.href = URL.createObjectURL(blobResult);
            this.actionButton.download = `${bilibiliCCHelper.getInfo('h1Title') || document.title}.${type}`;
            if (download) {
                this.actionButton.click();
                this.closeButton.click();
            }
        },
        encodeToLRC(data){
            return data.map(({from,to,content})=>{
                return `${this.encodeTime(from,'LRC')} ${content.replace(/\n/g,' ')}`;
            }).join('\r\n');
        },
        encodeToSRT(data){
            return data.map(({from,to,content},index)=>{
                return `${index+1}\r\n${this.encodeTime(from)} --> ${this.encodeTime(to)}\r\n${content}`;
            }).join('\r\n\r\n');
        },
        encodeToVTT(data){
            return 'WEBVTT \r\n\r\n' + data.map(({from,to,content},index)=>{
                return `${index+1}\r\n${this.encodeTime(from, 'VTT')} --> ${this.encodeTime(to, 'VTT')}\r\n${content}`;
            }).join('\r\n\r\n');
        },
        encodeToASS(data){
            this.assHead[1] = `Title: ${document.title}`;
            this.assHead[10] = `; 字幕来源${document.location}`;
            return this.assHead.concat(data.map(({from,to,content})=>{
                return `Dialogue: 0,${this.encodeTime(from,'ASS')},${this.encodeTime(to,'ASS')},*Default,NTP,0000,0000,0000,,${content.replace(/\n/g,'\\N')}`;
            })).join('\r\n');
        },
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

    const decoder = {
        srtReg:/(?:(\d+):)?(\d{1,2}):(\d{1,2})[,\.](\d{1,3})\s*(?:-->|,)\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,\.](\d{1,3})\r?\n([.\s\S]+)/,
        assReg:/Dialogue:.*,(\d+):(\d{1,2}):(\d{1,2}\.?\d*),\s*?(\d+):(\d{1,2}):(\d{1,2}\.?\d*)(?:.*?,){7}(.+)/,
        encodings:['UTF-8','GB18030','BIG5','UNICODE','JIS','EUC-KR'],
        encoding:'UTF-8',
        dialog:undefined,
        reader:undefined,
        file:undefined,
        data:undefined,
        statusHandler:undefined,
        show(handler){
            this.statusHandler = handler;
            if(!this.dialog){
                this.moveAction = ev=>this.dialogMove(ev);
                this.dialog = elements.createAs('div',{
                    id :'subtitle-local-selector',
                    style :'position:fixed;z-index:1048576;padding:10px;top:50%;left:calc(50% - 185px);'
                    +'box-shadow: 0 0 4px #e5e9ef;border: 1px solid #e5e9ef;background:white;border-radius:5px;color:#99a2aa',
                    innerHTML:'<style type="text/css">'
                    +'.bpui-selectmenu-arrow:hover + ul.bpui-selectmenu-list.bpui-selectmenu-list-left,'
                    +'ul.bpui-selectmenu-list.bpui-selectmenu-list-left:hover {display: block;}</style>'
                },elements.getAs('#bilibiliPlayer'));
                elements.createAs('div',{
                    style:"margin-bottom: 5px;cursor:move;user-select:none;line-height:1;",
                    innerText:'本地字幕选择',
                    onmousedown:this.moveAction
                },this.dialog);
                elements.createAs('input',{
                    style: "margin-bottom: 5px;width: 370px;",
                    innerText: '选择字幕',
                    type: 'file',accept:'.lrc,.ass,.ssa,.srt,.bcc,.sbv,.vtt',
                    oninput:  ({target})=> this.readFile(this.file = target.files&&target.files[0])
                },this.dialog);
                elements.createAs('br',{},this.dialog);
                elements.createAs('label',{style: "margin-right: 10px;",innerText: '字幕编码'},this.dialog);
                elements.createAs('select',{
                    style: "width: 80px;height: 20px;border-radius: 4px;line-height: 20px;border:1px solid #ccd0d7;",
                    title:'如果字幕乱码可尝试更改编码',
                    innerHTML:this.encodings.reduce((result,item)=>`${result}<option value="${item}">${item}</option>`,''),
                    oninput:  ({target})=> this.readFile(this.encoding = target.value)
                },this.dialog);
                elements.createAs('label',{
                    style: "margin-left: 10px;",innerText: '时间偏移(s)',title:'字幕相对于视频的时间偏移，双击此标签复位时间偏移',
                    ondblclick:()=> +this.offset.value&&this.handleSubtitle(this.offset.value=0)
                },this.dialog);
                this.offset = elements.createAs('input',{
                    style: "margin-left: 10px;width: 50px;border: 1px solid #ccd0d7;border-radius: 4px;line-height: 20px;",
                    type:'number', step:0.5, value:0,
                    title:'负值表示将字幕延后，正值将字幕提前',
                    oninput:  ()=> this.handleSubtitle()
                },this.dialog);
                elements.createAs('button',{
                    style: "margin-left: 10px;border:none;width:max-content;",innerText: '关闭面板',
                    className:'bpui-button bui bui-button bui-button-blue',
                    onclick:  ()=> elements.getAs('#bilibiliPlayer').removeChild(this.dialog)
                },this.dialog);
                this.reader = new FileReader();
                this.reader.onloadend = ()=> this.decodeFile()
                this.reader.onerror = e=> bilibiliCCHelper.toast('载入字幕失败',e);
            }
            else{
                elements.getAs('#bilibiliPlayer').appendChild(this.dialog);
                this.handleSubtitle();
            }
        },
        dialogMove(ev){
            if (ev.type=='mousedown'){
                this.offsetT = ev.pageY-this.dialog.offsetTop;
                this.offsetL = ev.pageX-this.dialog.offsetLeft;
                document.body.addEventListener('mouseup',this.moveAction);
                document.body.addEventListener('mousemove',this.moveAction);
            }
            else if (ev.type=='mouseup'){
                document.body.removeEventListener('mouseup',this.moveAction);
                document.body.removeEventListener('mousemove',this.moveAction);
            }
            else{
                this.dialog.style.top = ev.pageY - this.offsetT + 'px';
                this.dialog.style.left = ev.pageX - this.offsetL +'px';
            }
        },
        readFile(){
            if(!this.file) {
                this.data = undefined;
                return bilibiliCCHelper.toast('没有文件');
            }
            this.reader.readAsText(this.file,this.encoding)
        },
        handleSubtitle(){
            if(!this.data) return;
            const offset = +this.offset.value;
            bilibiliCCHelper.updateLocal(!offset?this.data:{
                body:this.data.body.map(({from,to,content})=>({
                    from:from - offset,
                    to:to - offset,
                    content
                }))
            }).then(()=>{
                if('function'==typeof(this.statusHandler)) this.statusHandler(true);
                bilibiliCCHelper.toast(`载入本地字幕:${this.file.name},共${this.data.body.length}行,偏移:${offset}s`);
            }).catch(e=>{
                bilibiliCCHelper.toast('载入字幕失败',e);
            });
        },
        decodeFile(){
            try{
                const type = this.file.name.split('.').pop().toLowerCase();
                switch(type){
                    case 'lrc':this.data = this.decodeFromLRC(this.reader.result);break;
                    case 'ass':case 'ssa': this.data = this.decodeFromASS(this.reader.result);break;
                    case 'srt':case 'sbv':case 'vtt': this.data = this.decodeFromSRT(this.reader.result);break;
                    case 'bcc':this.data = JSON.parse(this.reader.result);break;
                    default:throw('未知文件类型'+type);break;
                }
                console.log(this.data);
                this.handleSubtitle();
            }
            catch(e){
                bilibiliCCHelper.toast('解码字幕文件失败',e);
            };
        },
        decodeFromLRC(input){
            if(!input) return;
            const data = [];
            input.split('\n').forEach(line=>{
                let match = line.match(/((\[\d+:\d+\.?\d*\])+)(.*)/);
                if (!match) {
                    if(match=line.match(/\[offset:(\d+)\]/i)) {
                        this.offset.value = +match[1]/1000;
                    }
                    return;
                }
                const times = match[1].match(/\d+:\d+\.?\d*/g);
                times.forEach(time=>{
                    const t = time.split(':');
                    data.push({
                        time:t[0]*60 + (+t[1]),
                        content:match[3].trim().replace('\r','')
                    });
                });
            });
            return {
                body:data.sort((a,b)=>a.time-b.time).map((item,index)=>(
                    item.content!=''&&{
                        from:item.time,
                        to:index==data.length-1?item.time+20:data[index+1].time,
                        content:item.content
                    }
                )).filter(item=>item)
            };
        },
        decodeFromSRT(input){
            if(!input) return;
            const data = [];
            let split = input.split('\n\n');
            if(split.length==1) split = input.split('\r\n\r\n');
            split.forEach(item=>{
                const match = item.match(this.srtReg);
                if (!match){
                    return;
                }
                data.push({
                    from:(match[1]*60*60||0) + match[2]*60 + (+match[3]) + (match[4]/1000),
                    to:(match[5]*60*60||0) + match[6]*60 + (+match[7]) + (match[8]/1000),
                    content:match[9].trim().replace(/{\\.+?}/g,'').replace(/\\N/gi,'\n').replace(/\\h/g,' ')
                });
            });
            return {body:data.sort((a,b)=>a.from-b.from)};
        },
        decodeFromASS(input){
            if(!input) return;
            const data = [];
            let split = input.split('\n');
            split.forEach(line=>{
                const match = line.match(this.assReg);
                if (!match){
                    return;
                }
                data.push({
                    from:match[1]*60*60 + match[2]*60 + (+match[3]),
                    to:match[4]*60*60 + match[5]*60 + (+match[6]),
                    content:match[7].trim().replace(/{\\.+?}/g,'').replace(/\\N/gi,'\n').replace(/\\h/g,' ')
                });
            });
            return {body:data.sort((a,b)=>a.from-b.from)};
        }
    };

    const oldPlayerHelper = {
        setting:undefined,
        subtitle:undefined,
        selectedLan:undefined,
        isclosed:true,
        resizeRate: 100,
        configs:{
            color:[
                {value:'16777215',content:'<span style="color:#FFF;text-shadow: #000 0px 0px 1px">白色</span>'},
                {value:'16007990',content:'<b style="color:#F44336;text-shadow: #000 0px 0px 1px">红色</b>'},
                {value:'10233776',content:'<b style="color:#9C27B0;text-shadow: #000 0px 0px 1px">紫色</b>'},
                {value:'6765239',content:'<b style="color:#673AB7;text-shadow: #000 0px 0px 1px">深紫色</b>'},
                {value:'4149685',content:'<b style="color:#3F51B5;text-shadow: #000 0px 0px 1px">靛青色</b>'},
                {value:'2201331',content:'<b style="color:#2196F3;text-shadow: #000 0px 0px 1px">蓝色</b>'},
                {value:'240116',content:'<b style="color:#03A9F4;text-shadow: #000 0px 0px 1px">亮蓝色</b>'}
            ],
            position:[
                {value:'bl',content:'左下角'},
                {value:'bc',content:'底部居中'},
                {value:'br',content:'右下角'},
                {value:'tl',content:'左上角'},
                {value:'tc',content:'顶部居中'},
                {value:'tr',content:'右上角'}
            ],
            shadow:[
                {value:'0',content:'无描边',style:''},
                {value:'1',content:'重墨',style:`text-shadow: #000 1px 0px 1px, #000 0px 1px 1px, #000 0px -1px 1px,#000 -1px 0px 1px;`},
                {value:'2',content:'描边',style:`text-shadow: #000 0px 0px 1px, #000 0px 0px 1px, #000 0px 0px 1px;`},
                {value:'3',content:'45°投影',style:`text-shadow: #000 1px 1px 2px, #000 0px 0px 1px;`}
            ]
        },
        saveSetting(){
            try{
                const playerSetting = localStorage.bilibili_player_settings?JSON.parse(localStorage.bilibili_player_settings):{};
                playerSetting.subtitle = this.setting;
                localStorage.bilibili_player_settings = JSON.stringify(playerSetting);
            }catch(e){
                bilibiliCCHelper.toast('保存字幕设置错误',e);
            }
        },
        changeStyle(){
            this.fontStyle.innerHTML = `span.subtitle-item-background{opacity: ${this.setting.backgroundopacity};}`
                + `span.subtitle-item-text {color:#${("000000"+this.setting.color.toString(16)).slice(-6)};}`
                + `span.subtitle-item {font-size: ${this.setting.fontsize*this.resizeRate}%;line-height: 110%;}`
                + `span.subtitle-item {${this.configs.shadow[this.setting.shadow].style}}`;
        },
        changePosition(){
            this.subtitleContainer.className = 'subtitle-position subtitle-position-'
                 +(this.setting.position||'bc');
            this.subtitleContainer.style = '';
        },
        changeResize(){
            this.resizeRate = this.setting.scale?bilibiliCCHelper.window.player.getWidth()/1280*100:100;
            this.changeStyle();
        },
        changeSubtitle(value=this.subtitle.subtitles[0].lan){
            this.selectedLanguage.innerText = bilibiliCCHelper.getSubtitleInfo(value).lan_doc;
            if(value=='close'){
                if(!this.isclosed) {
                    this.isclosed = true;
                    bilibiliCCHelper.loadSubtitle(value);
                    if(this.selectedLan!='local') this.setting.isclosed = true;
                }
                this.downloadBtn.classList.add('bpui-state-disabled','bpui-button-icon');
                this.icon.innerHTML = elements.oldDisableIcon;
            }
            else if(value=='local') {
                decoder.show((status)=>{
                    if(status==true){
                        this.downloadBtn.classList.remove('bpui-state-disabled','bpui-button-icon');
                        this.isclosed = false;
                        this.selectedLan = value;
                        this.icon.innerHTML = elements.oldEnableIcon;
                    }
                });
            }
            else{
                this.isclosed = false;
                this.selectedLan = value;
                this.icon.innerHTML = elements.oldEnableIcon;
                this.setting.lan = value;
                this.setting.isclosed = false;
                bilibiliCCHelper.loadSubtitle(value);
                this.downloadBtn.classList.remove('bpui-state-disabled','bpui-button-icon');
            }
        },
        toggleSubtitle(){
            if(this.isclosed) {
                this.changeSubtitle(this.selectedLan);
            }
            else{
                this.changeSubtitle('close');
            }
        },
        initSubtitle(){
            if(this.setting.isclosed) {
                this.changeSubtitle('close');
            }
            else{
                const lan = bilibiliCCHelper.getSubtitleInfo(this.setting.lan)&&this.setting.lan
                this.changeSubtitle(lan);
            }
            if(!this.subtitle.count) this.selectedLan = 'local';
            this.changeResize();
        },
        initUI(){
            const preBtn = elements.getAs('.bilibili-player-video-btn-quality');
            if(!preBtn) throw('没有找到视频清晰度按钮');
            this.subtitleContainer = elements.getAs('.bilibili-player-video-subtitle>div');
            const btn = preBtn.insertAdjacentElement('afterEnd',elements.createAs('div',{
                className:"bilibili-player-video-btn",
                id:'bilibili-player-subtitle-btn',
                style:"display: block;",
                innerHTML:elements.subtitleStyle,
                onclick:(e)=>{
                    if(!this.panel.contains(e.target)) this.toggleSubtitle();
                }
            }));
            this.icon = elements.createAs('span',{
                innerHTML: this.setting.isclosed?elements.oldDisableIcon:elements.oldEnableIcon
            },btn);
            this.fontStyle = elements.createAs('style',{type:"text/css"},btn);
            const panel = this.panel = elements.createAs('div',{
                id:'subtitle-setting-panel',
                style:'position: absolute;bottom: 28px;right: 30px;background: white;border-radius: 4px;'
                +'text-align: left;padding: 13px;display: none;cursor:default;'
            },btn),
                  languageDiv = elements.createAs('div',{innerHTML:'<div>字幕</div>'},panel),
                  sizeDiv = elements.createAs('div',{innerHTML:'<div>字体大小</div>'},panel),
                  colorDiv = elements.createAs('div',{innerHTML:'<span>字幕颜色</span>'},panel),
                  shadowDiv = elements.createAs('div',{innerHTML:'<span>字幕描边</span>'},panel),
                  positionDiv = elements.createAs('div',{innerHTML:'<span>字幕位置</span>'},panel),
                  opacityDiv = elements.createAs('div',{innerHTML:'<div>背景不透明度</div>'},panel);
            this.selectedLanguage = elements.createSelector({
                width:'100px',height:'180px',initValue:'close',
                handler:(value)=>this.changeSubtitle(value),
                datas:this.subtitle.subtitles.map(({lan,lan_doc})=>({content:lan_doc,value:lan}))
            },languageDiv).firstElementChild;
            this.downloadBtn = elements.createAs('button',{
                className: "bpui-button",style: 'padding:0 8px;',
                innerText: "下载",
                onclick: (ev)=>{
                    if(this.selectedLan=='close') return;
                    bilibiliCCHelper.downloadSubtitle(this.selectedLan, undefined, ev.ctrlKey);
                }
            },languageDiv);
            elements.createAs('a',{
                className: this.subtitle.allow_submit?'bpui-button':'bpui-button bpui-state-disabled',
                innerText: '添加字幕',
                href: !this.subtitle.allow_submit?'javascript:'
                :`https://member.bilibili.com/v2#/zimu/my-zimu/zimu-editor?cid=${window.cid}&${window.aid?`aid=${window.aid}`:`bvid=${window.bvid}`}`,
                target: '_blank',
                style: 'margin-right: 0px;height: 24px;padding:0 6px;',
                title: this.subtitle.allow_submit?'':'本视频无法添加字幕，可能原因是:\r\n·UP主未允许观众投稿字幕\r\n·您未达到UP主设置的投稿字幕条件',
            },languageDiv);
            elements.createAs('input',{
                style:"width: 70%;",type:"range",step:"25",
                value: (this.setting.fontsize==0.6?0
                        :this.setting.fontsize==0.8?25
                        :this.setting.fontsize==1.3?75
                        :this.setting.fontsize==1.6?100:50),
                oninput:(e)=>{
                    const v = e.target.value/25;
                    this.setting.fontsize = v>2?(v-2)*0.3+1:v*0.2+0.6;
                    this.changeStyle();
                }
            },sizeDiv);
            elements.createAs('input',{
                id:'subtitle-auto-resize',
                type:"checkbox",
                checked:this.setting.scale,
                onchange:(e)=>this.changeResize(this.setting.scale = e.target.checked)
            },sizeDiv);
            elements.createAs('label',{
                style:"cursor:pointer",
                innerText:'自动缩放'
            },sizeDiv).setAttribute('for','subtitle-auto-resize');
            elements.createSelector({
                width:'74%',height:'120px',
                initValue:this.setting.color,
                handler:(value)=>this.changeStyle(this.setting.color=parseInt(value)),
                datas:this.configs.color
            },colorDiv);
            elements.createSelector({
                width:'74%',height:'120px',
                initValue:this.setting.shadow,
                handler:(value)=>this.changeStyle(this.setting.shadow=value),
                datas:this.configs.shadow
            },shadowDiv);
            elements.createSelector({
                width:'74%',initValue:this.setting.position,
                handler:(value)=>this.changePosition(this.setting.position=value),
                datas:this.configs.position
            },positionDiv);
            elements.createAs('input',{
                style:"width: 100%;",
                type:"range",
                value: this.setting.backgroundopacity*100,
                oninput:(e)=>{
                    this.changeStyle(this.setting.backgroundopacity = e.target.value/100);
                }
            },opacityDiv);
            bilibiliCCHelper.window.player.addEventListener('video_resize', (event) => {
                this.changeResize(event);
            });
            bilibiliCCHelper.window.addEventListener("beforeunload", (event) => {
                this.saveSetting();
            });
            this.initSubtitle();
            console.log('init cc helper button done');
        },
        init(subtitle){
            this.subtitle = subtitle;
            this.selectedLan = undefined;
            try {
                if (!localStorage.bilibili_player_settings) throw '当前播放器没有设置信息';
                this.setting = JSON.parse(localStorage.bilibili_player_settings).subtitle;
                if (!this.setting) throw '当前播放器没有字幕设置';
            }catch (e) {
                bilibiliCCHelper.toast('bilibili CC字幕助手读取设置出错,将使用默认设置:', e);
                this.setting = {backgroundopacity: 0.5,color: 16777215,fontsize: 1,isclosed: false,scale: true,shadow: "0", position: 'bc'};
            }
            this.initUI();
        }
    };

    const player2x = {
        iconBtn:undefined,
        icon:undefined,
        panel:undefined,
        downloadBtn:undefined,
        selectedLan:undefined,
        selectedLocal:false,
        hasSubtitles:false,
        updateDownloadBtn(value='close'){
            this.selectedLan = value;
            if(value=='close'){
                this.downloadBtn.classList.add('bui-button-disabled','bpui-button-icon');
            }
            else{
                this.selectedLocal = false;
                this.downloadBtn.classList.remove('bui-button-disabled','bpui-button-icon');
            }
        },
        initUI(){
            const downloadBtn = this.downloadBtn = this.panel.nextElementSibling.cloneNode(),
                  selector = this.panel.querySelector('ul'),
                  selectedItem = selector.querySelector('li.bui-select-item.bui-select-item-active'),
                  closeItem = selector.querySelector('li.bui-select-item[data-value="close"]'),
                  localItem = closeItem.cloneNode();
            elements.setAs(downloadBtn,{
                style: 'min-width:unset!important',innerText: '下载',
                onclick: (ev)=>{
                    if(this.selectedLan=='close') return;
                    bilibiliCCHelper.downloadSubtitle(this.selectedLan, undefined, ev.ctrlKey);
                }
            });
            this.panel.insertAdjacentElement('afterend',downloadBtn);
            this.updateDownloadBtn(selectedItem&&selectedItem.dataset.value);
            elements.setAs(localItem,{
                innerText: '本地字幕',
                onclick: ()=> {
                    decoder.show((status)=>{
                        if(status==true){
                            this.selectedLocal = true;
                            this.updateDownloadBtn('local');
                            this.icon.innerHTML = elements.newEnableIcon;
                        }
                    });
                }
            },selector);
            closeItem.addEventListener('click',()=>{
                if(!this.selectedLocal) return;
                this.selectedLocal = false;
                bilibiliCCHelper.loadSubtitle('close');
                this.icon.innerHTML = elements.newDisableIcon;
            });
            if(!this.hasSubtitles && this.icon){
                this.icon.innerHTML = elements.newDisableIcon;
                this.icon.addEventListener('click',({target})=>{
                    if(!this.selectedLocal) localItem.click();
                    else closeItem.click();
                });
            }
            new MutationObserver((mutations,observer)=>{
                mutations.forEach(mutation=>{
                    if(!mutation.target||mutation.type!='attributes') return;
                    if(mutation.target.classList.contains('bui-select-item-active')&&mutation.target.dataset.value){
                        this.updateDownloadBtn(mutation.target.dataset.value);
                    }
                });
            }).observe(selector,{
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
            console.log('Bilibili CC Helper init new UI success.');
        },
        initUI275(){
            if (this.localPanel = this.panel.querySelector('.bilibili-player-video-subtitle-setting-item-body')) {
                if (!(this.localButton = this.localPanel.querySelector('.bilibili-player-video-subtitle-setting-title'))) {
                    this.localPanel.insertAdjacentElement('afterbegin', elements.createAs('div', {
                        innerText: '字幕',
                        className: 'bilibili-player-video-subtitle-setting-title',
                        onclick:()=> decoder.show(status=>(status && (this.icon.innerHTML = elements.newEnableIcon)))
                    }));
                }
                else {
                    this.localButton.onclick = ()=> decoder.show(status=>{
                        if (status) {
                            this.selectedLocal = true;
                            this.icon.innerHTML = elements.newEnableIcon;
                        }
                    })
                }
            }
            if (this.lngPanel = this.panel.querySelector('.bilibili-player-video-subtitle-setting-lan-majorlist')) {
                this.lngPanel.addEventListener('click', function(ev) {
                    if (!(ev.target instanceof HTMLLIElement) || ev.target.lastChild.data=='本地字幕') return;
                    const rect = ev.target.getBoundingClientRect().right;
                    if (rect ==0 || rect -ev.x > 30) return;
                    bilibiliCCHelper.downloadSubtitle(undefined, ev.target.lastChild.data, ev.ctrlKey);
                    return false;
                });
            }
            elements.createAs('style', {
                innerHTML:'.bilibili-player-video-subtitle-setting-lan-majorlist>li.bilibili-player-video-subtitle-setting-lan-majorlist-item:after {content: "下载";right: 12px;position: absolute;}'
                +'.bilibili-player-video-subtitle-setting-title {cursor:pointer}.bilibili-player-video-subtitle-setting-title:before {content: "本地"}'
            }, this.panel);
            if(!this.hasSubtitles) {
                this.icon.onclick = ()=>{
                    if (this.selectedLocal) {
                        this.selectedLocal = false;
                        bilibiliCCHelper.loadSubtitle('close');
                        this.icon.innerHTML = elements.newDisableIcon;
                    }
                    else {
                        this.localButton.click();
                    }
                };
                this.icon.innerHTML = elements.newDisableIcon;
            }
            console.log('Bilibili CC Helper init new 2.75 UI success.');
        },
        init(subtitle){
            this.hasSubtitles = subtitle.count;
            this.selectedLan = undefined;
            this.selectedLocal = false;
            this.iconBtn = elements.getAs('.bilibili-player-video-btn-subtitle');
            this.panel = elements.getAs('.bilibili-player-video-subtitle-setting-lan');
            this.icon = this.iconBtn.querySelector('.bilibili-player-iconfont-subtitle span');
            elements.createAs('style', {innerHTML:'.bilibili-player-video-subtitle {z-index: 20;}'}, document.head);
            if(this.panel){
                this.initUI();
                this.iconBtn.id = 'bilibili-player-subtitle-btn';
            }
            else if(this.iconBtn){
                this.iconBtn.style = 'display:block';
                if(!this.hasSubtitles&&this.icon) this.icon.innerHTML = elements.newDisableIcon;
                this.iconBtn.id = 'bilibili-player-subtitle-btn';
                new MutationObserver((mutations,observer)=>{
                    for (const mutation of mutations){
                        if(!mutation.target) continue;
                        if (mutation.target.classList.contains('bilibili-player-video-subtitle-setting-left')){
                            observer.disconnect();
                            if (this.panel = mutation.target.querySelector('.bilibili-player-video-subtitle-setting-lan')) {
                                this.initUI();
                            }
                            else {
                                this.panel = mutation.target;
                                this.initUI275();
                            }
                            return;
                        }
                    }
                }).observe(this.iconBtn,{
                    childList: true,
                    subtree: true
                });
            }
            else{
                throw('找不到新播放器按钮');
            }
        },
    };

    const player315 = {
        panel:undefined,
        initUI(){
            elements.createAs('style',{
                innerHTML:'.bpx-player-ctrl-subtitle-major-inner>.bpx-player-ctrl-subtitle-language-item:after {content: "下载";position:absolute;right:12px; margin-top:12px;}'
            }, this.panel);
            this.panel.addEventListener('click', function(ev) {
                if ((!ev.target || !ev.target.classList.contains('bpx-player-ctrl-subtitle-language-item'))) return;
                const rect = ev.target.getBoundingClientRect().right;
                if (rect ==0 || rect -ev.x > 30) return;
                ev.preventDefault();
                ev.stopPropagation();
                bilibiliCCHelper.downloadSubtitle(ev.target.dataset.lan, ev.target.lastChild.data, ev.ctrlKey);
                return false;
            }, true);
            this.panel.id = 'bilibili-player-subtitle-btn';
            console.log('3.15 Bilibili CC Helper init new Bangumi UI success.');
        },
        init(subtitle){
            this.panel = elements.getAs('.bpx-player-ctrl-subtitle-major-content');
            if (!this.panel) {
                throw('无字幕');
            }
            this.initUI();
        },
    };

    const player314 = {
        iconBtn:undefined,
        icon:undefined,
        panel:undefined,
        selectedLan:undefined,
        selectedLocal:false,
        hasSubtitles:false,
        updateBtnIcon(value) {
            if (value) {
                this.icon.classList.add('squirtle-subtitle-show-state');
                this.icon.classList.remove('squirtle-subtitle-hide-state');
            } else {
                this.icon.classList.add('squirtle-subtitle-hide-state');
                this.icon.classList.remove('squirtle-subtitle-show-state');
            }
        },
        initUI(){
            elements.createAs('style', {innerHTML:'.squirtle-subtitle-select-list>li.squirtle-select-item:after {content: "下载";}'}, document.head);
            this.panel.addEventListener('click', function(ev) {
                if (!(ev.target instanceof HTMLLIElement)) return;
                const rect = ev.target.getBoundingClientRect().right;
                if (rect ==0 || rect -ev.x > 30) return;
                bilibiliCCHelper.getSubtitle(undefined, ev.target.lastChild.data).then(data=>{
                    encoder.showDialog(data,ev.ctrlKey);
                }).catch(e=>{
                    bilibiliCCHelper.toast('获取字幕失败',e);
                });
                return false;
            });
            this.panel.id = 'bilibili-player-subtitle-btn';
            console.log('Bilibili CC Helper init new Bangumi UI success.');
        },
        init(subtitle){
            this.hasSubtitles = subtitle.count;
            this.selectedLan = undefined;
            this.selectedLocal = false;
            this.iconBtn = elements.getAs('.squirtle-subtitle-wrap');
            this.panel = elements.getAs('.squirtle-subtitle-select-list');
            this.icon = this.iconBtn.querySelector('.squirtle-subtitle-icon');
            if (!this.iconBtn) {
                throw('找不到新播放器按钮');
            }
            if(this.panel) this.initUI();
        },
    };

    const bilibiliCCHelper = {
        window:"undefined"==typeof(unsafeWindow)?window:unsafeWindow,
        player:undefined,
        cid:undefined,
        subtitle:undefined,
        datas:undefined,
        toast(msg,error){
            if(error) console.error(msg,error);
            if(!this.toastDiv){
                this.toastDiv = document.createElement('div');
                this.toastDiv.className = 'bilibili-player-video-toast-item';
            }
            const panel = elements.getAs('.bilibili-player-video-toast-top');
            if(!panel) return;
            clearTimeout(this.removeTimmer);
            this.toastDiv.innerText = msg + (error?`:${error}`:'');
            panel.appendChild(this.toastDiv);
            this.removeTimmer = setTimeout(()=>{
                panel.contains(this.toastDiv)&&panel.removeChild(this.toastDiv)
            },3000);
        },
        async updateLocal(data){
            this.datas.local = data;
            return this.updateSubtitle(data);
        },
        async updateSubtitle(data){
            this.window.player.updateSubtitle(data);
        },
        loadSubtitle(lan){
            this.getSubtitle(lan)
                .catch(()=>this.setupData(true)).then(()=>this.getSubtitle(lan))
                .then(data=>this.updateSubtitle(data))
                .then(()=>this.toast(lan=='close'?'字幕已关闭':`载入字幕:${this.getSubtitleInfo(lan).lan_doc}`))
                .catch(e=>this.toast('载入字幕失败',e));
        },
        downloadSubtitle(lan, name, direct){
            this.getSubtitle(lan,name)
                .catch(()=>this.setupData(true)).then(()=>this.getSubtitle(lan, name))
                .then(data=>encoder.showDialog(data,direct)).catch(e=>bilibiliCCHelper.toast('获取字幕失败',e));
        },
        async getSubtitle(lan, name){
            if(this.datas[lan]) return this.datas[lan];
            const item = this.getSubtitleInfo(lan, name);
            if(!item) throw('找不到所选语言字幕'+lan);
            if(this.datas[item.lan]) return this.datas[item.lan];
            return fetch(item.subtitle_url)
                .then(res=>res.json())
                .then(data=>(this.datas[item.lan] = data));
        },
        getSubtitleInfo(lan, name){
            return this.subtitle.subtitles.find(item=>item.lan==lan || item.lan_doc==name);
        },
        getInfo(name) {
            return this.window[name]
            || this.window.__INITIAL_STATE__ && this.window.__INITIAL_STATE__[name]
            || this.window.__INITIAL_STATE__ && this.window.__INITIAL_STATE__.epInfo && this.window.__INITIAL_STATE__.epInfo[name]
            || this.window.__INITIAL_STATE__ && this.window.__INITIAL_STATE__.videoData && this.window.__INITIAL_STATE__.videoData[name];
        },
        getEpid(){
            return this.getInfo('id')
            || /ep(\d+)/.test(location.pathname) && +RegExp.$1
            || /ss\d+/.test(location.pathname);
        },
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
            this.player = this.window.player;
            this.subtitle = {count:0,subtitles:[{lan:'close',lan_doc:'关闭'},{lan:'local',lan_doc:'本地字幕'}]};
            if (!force) this.datas = {close:{body:[]},local:{body:[]}};
            decoder.data = undefined;
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
        },
        tryInit(){
            this.setupData().then(subtitle=>{
                if(!subtitle) return;
                if(elements.getAs('#bilibili-player-subtitle-btn')) {
                    console.log('CC助手已初始化');
                }
                else if(elements.getAs('.bilibili-player-video-btn-color')){
                    oldPlayerHelper.init(subtitle);
                }
                else if(elements.getAs('.bilibili-player-video-danmaku-setting')){
                    player2x.init(subtitle);
                }
                else if (elements.getAs('.bpx-player-ctrl-subtitle-major-content')){
                    player315.init(subtitle);
                }
                else if(elements.getAs('.squirtle-subtitle-wrap')){
                    player314.init(subtitle);
                }
                else {
                    console.log('bilibili cc未发现可识别版本播放器')
                }
            }).catch(e=>{
                this.toast('CC字幕助手配置失败',e);
            });
        },
        init(){
            this.tryInit();
            new MutationObserver((mutations, observer)=>{
                for (const mutation of mutations){
                    if(!mutation.target) return;
                    if(mutation.target.getAttribute('stage')==1
                       || mutation.target.classList.contains('bpx-player-subtitle-wrap') || mutation.target.classList.contains('tit')
                       || mutation.target.classList.contains('bpx-player-ctrl-subtitle-bilingual')
                       || mutation.target.classList.contains('squirtle-quality-wrap')){
                        this.tryInit();
                        break;
                    }
                }
            }).observe(document.body,{
                childList: true,
                subtree: true,
            });
        }
    };




    const llmHelper = {
        // --- 用户配置区 ---
        config: {
            apiUrl:DEEPSEEK_URL,
            apiKey:DEEPSEEK_API_KEY, // 重要：在这里填入你的 API Key
        },

        // --- 功能实现区 ---
        summaryBox: null,
        contentElement: null,

        createSummaryBox: function() {
            if (this.summaryBox) return;

            const overlay = elements.createAs('div', {
                style: `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background-color: rgba(0, 0, 0, 0.5); z-index: 999999;
                display: flex; align-items: center; justify-content: center;
            `
            }, document.body);

            const box = elements.createAs('div', {
                style: `
                width: 600px; max-width: 90%; max-height: 80%;
                background-color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex; flex-direction: column;
            `
            }, overlay);

            const header = elements.createAs('div', {
                innerHTML: '<h3 style="margin:0; font-size: 16px;">字幕总结</h3>',
                style: `
                padding: 12px 16px; border-bottom: 1px solid #e0e0e0;
                display: flex; justify-content: space-between; align-items: center;
            `
            }, box);

            const closeButton = elements.createAs('button', {
                innerText: '✕',
                style: `border: none; background: transparent; font-size: 20px; cursor: pointer; color: #888; padding: 0; line-height: 1;`,
                onclick: () => this.hideSummaryBox()
            }, header);

            this.contentElement = elements.createAs('div', {
                style: `padding: 16px; overflow-y: auto; white-space: pre-wrap; line-height: 1.6; color: #333;`
            }, box);

            this.summaryBox = overlay;
            this.hideSummaryBox();
        },

        showSummaryBox: function(message) {
            if (!this.summaryBox) this.createSummaryBox();
            this.contentElement.innerHTML = message.replace(/\n/g, '<br>');
            this.summaryBox.style.display = 'flex';
        },

        hideSummaryBox: function() {
            if (this.summaryBox) {
                this.summaryBox.style.display = 'none';
            }
        },

        getSummaryFromLLM: function(srtText) {
            return new Promise((resolve, reject) => {
                if (!this.config.apiKey || this.config.apiKey.includes("xxxxxxxx")) {
                    return reject(new Error("请先在脚本中配置你的 DEEPSEEK_API_KEY。"));
                }

                const requestBody = {
                    model:DEEPSEEK_MODEL,
                    messages: [
                        {
                            role: "system",
                            content: "你是一个视频内容总结助手。用户会提供一个SRT格式的字幕文件内容，请你从中提取核心要点，用详细并且分点完善，先分析场景，然后对于视频核心内容细分总结。分析场景的部分不要发出来。中文进行总结。"
                        },
                        {
                            role: "user",
                            // --- MODIFIED: Updated prompt to request timestamps ---
                            content: "请总结以下字幕内容，并以无序列表（markdown格式的'-'）的形式返回给我。重要：有些观点对于时间戳不一定完全参照我发你的字幕文件，你可以提前或者延后数秒，以确保准确性。对于每个总结要点，请在其开头附上对应的起始时间戳，格式为 [HH:MM:SS]。例如：[00:01:23] 这是一个总结点。每生成一个总结点空一行。请重点关注相关数字、引用等各方方面事实内容，多注重细节:\n\n" + srtText
                        }
                    ],
                    stream: false
                };

                console.log('%c[LLM Log] 准备发送API请求(常规总结)...', 'color: blue; font-weight: bold;');
                console.log('[LLM Log] 请求目标URL:', this.config.apiUrl);
                console.log('[LLM Log] 请求体 (RequestBody):', requestBody);

                console.time("API Request Duration"); // 开始计时

                GM_xmlhttpRequest({
                    method: "POST",
                    url: this.config.apiUrl,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.config.apiKey}`
                    },
                    data: JSON.stringify(requestBody),
                    onload: function(response) {
                        console.timeEnd("API Request Duration"); // 结束计时并打印耗时
                        console.log('%c[LLM Log] 收到API响应(常规总结)。', 'color: green; font-weight: bold;');
                        console.log('[LLM Log] 响应状态码:', response.status);
                        console.log('[LLM Log] 原始响应文本:', response.responseText);

                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const data = JSON.parse(response.responseText);
                                console.log('[LLM Log] 解析后的JSON数据:', data);
                                resolve(data.choices[0].message.content);
                            } catch (e) {
                                reject(new Error("解析API返回的JSON失败: " + e.message));
                            }
                        } else {
                            let errorMessage = `API 请求失败: ${response.status} - ${response.statusText}`;
                            try {
                                const errorData = JSON.parse(response.responseText);
                                errorMessage += ` - ${errorData.error ? errorData.error.message : response.responseText}`;
                            } catch (e) {
                                errorMessage += ` - ${response.responseText}`;
                            }
                            reject(new Error(errorMessage));
                        }
                    },
                    onerror: function(response) {
                        console.timeEnd("API Request Duration");
                        console.error('[LLM Log] 网络请求错误:', response);
                        reject(new Error("网络请求错误: " + response.statusText));
                    }
                });
            });
        },

        handleSummarizeClick: async function(selectedLan) {
            console.log(`%c[LLM Log] --- 开始执行字幕总结流程 [${new Date().toLocaleTimeString()}] ---`, 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

            if (!selectedLan || selectedLan === 'close') {
                const errorMsg = '请先选择一个有效的CC字幕';
                console.error('[LLM Log] 错误:', errorMsg);
                bilibiliCCHelper.toast(errorMsg);
                return;
            }

            this.showSummaryBox('正在获取字幕内容并请求总结，请稍候...');
            console.log(`[LLM Log] 目标字幕语言代码: ${selectedLan}`);

            try {
                console.log('%c[LLM Log] 步骤 1: 获取BCC字幕数据...', 'color: blue;');
                console.time("Get BCC Subtitle");
                const bccData = await bilibiliCCHelper.getSubtitle(selectedLan);
                console.timeEnd("Get BCC Subtitle");

                if (!bccData || !bccData.body || bccData.body.length === 0) {
                    throw new Error('未能获取到有效的字幕内容。');
                }
                console.log('[LLM Log] 步骤 1 完成: 成功获取BCC字幕数据。');
                console.log('[LLM Log] BCC字幕原始数据:', bccData);

                console.log('%c[LLM Log] 步驟 2: 转换为SRT格式...', 'color: blue;');
                console.time("Encode to SRT");
                const srtContent = encoder.encodeToSRT(bccData.body);
                console.timeEnd("Encode to SRT");
                console.log('[LLM Log] 步骤 2 完成: SRT内容已生成。');
                console.log('[LLM Log] SRT字幕内容预览 (前50000字符):', srtContent.substring(0, 50000) + '...');

                console.log('%c[LLM Log] 步骤 3: 调用 DeepSeek API...', 'color: blue;');
                const summary = await this.getSummaryFromLLM(srtContent);
                console.log('[LLM Log] 步骤 3 完成: 成功获取总结。');
                console.log('[LLM Log] LLM返回的总结内容:', summary);

                console.log('%c[LLM Log] 步骤 4: 显示总结结果...', 'color: blue;');
                this.showSummaryBox(summary);

                console.log(`%c[LLM Log] --- 字幕总结流程全部完成 ---`, 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

            } catch (error) {
                console.error('%c[LLM Log] 字幕总结流程失败!', 'color: red; font-weight: bold;', error);
                this.showSummaryBox(`处理失败：\n${error.message}`);
                console.log(`%c[LLM Log] --- 字幕总结流程因错误而终止 ---`, 'background: #a52a2a; color: #fff; padding: 2px 5px; border-radius: 3px;');
            }
        }
    };

    bilibiliCCHelper.init();

    // —————————————— 新增功能区 START (已重构) ——————————————

    /**
     * 新增: 第二个AI接口的请求函数
     */
    llmHelper.getSummaryFromLLM_AI2 = function(srtText) {
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
            console.log('[LLM Log] 请求目标URL (AI2):', AI2_URL);
            console.log('[LLM Log] 请求体 (RequestBody):', requestBody);
            console.time("AI2 API Request Duration");

            GM_xmlhttpRequest({
                method: "POST",
                url: AI2_URL,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${AI2_API_KEY}`
                },
                data: JSON.stringify(requestBody),
                onload: function(response) {
                    console.timeEnd("AI2 API Request Duration");
                    console.log('%c[LLM Log] 收到API响应(深度分析)。', 'color: green; font-weight: bold;');
                    console.log('[LLM Log] 响应状态码 (AI2):', response.status);

                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            console.log('[LLM Log] 解析后的JSON数据 (AI2):', data);
                            resolve(data.choices[0].message.content);
                        } catch (e) {
                            reject(new Error("解析AI2 API返回的JSON失败: " + e.message));
                        }
                    } else {
                        let errorMessage = `AI2 API 请求失败: ${response.status} - ${response.statusText} - ${response.responseText}`;
                        reject(new Error(errorMessage));
                    }
                },
                onerror: function(response) {
                    console.timeEnd("AI2 API Request Duration");
                    console.error('[LLM Log] AI2 API 网络请求错误:', response);
                    reject(new Error("AI2 API 网络请求错误: " + response.statusText));
                }
            });
        });
    };


    const summaryButtonManager = {
        // --- UI Elements ---
        button: null,
        panel: null,
        header: null,
        subtitleDisplay: null, // 新增：用于显示当前字幕名称的元素
        contentArea: null,
        resizeHandle: null,
        toggleViewButton: null,

        // --- State Management ---
        // 缓存结构: { 'cid_lan': { standard: "...", deep: "..." } }
        cache: {},
        // 加载状态结构, 与cache对应: { 'cid_lan': { standard: boolean, deep: boolean } }
        loadingStates: {},
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

        // --- For auto-refresh on subtitle change ---
        subtitleChangeDebounce: null,

        init: function() {
            window.addEventListener('load', () => {
                this.createButton();
                this.setupSubtitleObserver();
                // 使用小延迟确保body元素准备好
                setTimeout(() => this.setupThemeObserver(), 500);
            });
        },

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
                width: 30px;
                height: 30px;
                background-color: #00a1d6;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                cursor: move;
                z-index: 2147483647;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                transition: transform 0.2s ease, background-color 0.2s ease;
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

        _getVideoPlayerElement: function() {
            const selectors = [
                'bwp-video',
                '#bilibili-player video',
                '.bpx-player-video-wrap video',
                '.squirtle-video-wrapper video',
                'video[class*="bilibili-player-video"]'
            ];
            for (const selector of selectors) {
                const player = document.querySelector(selector);
                if (player) return player;
            }
            return null;
        },

        createPanel: function() {
            if (this.panel) return;
            this.panel = document.createElement('div');
            this.panel.id = 'llm-summary-panel';
            const savedOpacity = GM_getValue('summaryPanelOpacity', 1.0);
            this.panel.style.cssText = `
                position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 550px; height: 400px;
                min-width: 300px; min-height: 200px;
                border-radius: 8px; box-shadow: 0 5px 20px rgba(0,0,0,0.3);
                display: none; flex-direction: column; z-index: 2147483646;
                overflow: hidden; opacity: ${savedOpacity}; transition: opacity 0.2s;
            `;

            this.header = document.createElement('div');
            this.header.style.cssText = `
                padding: 10px 15px; cursor: move;
                border-bottom: 1px solid #e0e0e0; display: flex;
                justify-content: space-between; align-items: center; user-select: none;
            `;

            // --- 标题和副标题容器 ---
            const titleContainer = document.createElement('div');
            const titleSpan = document.createElement('div');
            titleSpan.textContent = '视频字幕 AI 总结';
            titleSpan.style.cssText = 'font-size: 16px; font-weight: 500;';

            this.subtitleDisplay = document.createElement('div');
            this.subtitleDisplay.style.cssText = 'font-size: 12px; color: #666; margin-top: 2px; height: 14px;';
            titleContainer.appendChild(titleSpan);
            titleContainer.appendChild(this.subtitleDisplay);


            const controlsContainer = document.createElement('div');
            controlsContainer.className = 'header-controls';
            controlsContainer.style.cssText = 'display: flex; align-items: center; gap: 15px;';

            // --- 透明度滑块 ---
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

            // --- 视图切换按钮 ---
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

            controlsContainer.appendChild(opacitySlider);
            controlsContainer.appendChild(this.toggleViewButton);
            controlsContainer.appendChild(closeButton);
            this.header.appendChild(titleContainer);
            this.header.appendChild(controlsContainer);

            this.contentArea = document.createElement('div');
            this.contentArea.style.cssText = `
                flex-grow: 1; padding: 15px; overflow-y: auto;
                white-space: pre-wrap; line-height: 1.6; font-size: 14px;
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
            this.updateTheme(); // 应用初始主题
        },

        renderSummaryWithClickableTimestamps: function(rawText) {
            const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\]/g;
            const renderedHTML = rawText.replace(timestampRegex, (match, h, m, s) => {
                const totalSeconds = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10);
                return `<a href="#" class="ai-summary-timestamp" data-seek-time="${totalSeconds}">${match}</a>`;
            });
            return renderedHTML.replace(/\n/g, '<br>');
        },

        showPanel: function() {
            if (!this.panel) this.createPanel();
            this.panel.style.display = 'flex';
            this.isPanelVisible = true;
        },

        hidePanel: function() {
            if (this.panel) this.panel.style.display = 'none';
            this.isPanelVisible = false;
        },

        handleButtonClick: function() {
            if (this.isPanelVisible) {
                this.hidePanel();
                return;
            }

            this.showPanel();
            const targetSubtitleInfo = this._getTargetSubtitleInfo();
            this.currentCid = bilibiliCCHelper.cid;
            this.currentLan = targetSubtitleInfo ? targetSubtitleInfo.lan : null;
            this.currentView = 'standard';
            this.updatePanelContent();
        },

        handleToggleView: function() {
            // 移除全局加载状态检查，允许自由切换视图
            // 新的逻辑将在 updatePanelContent 中处理
            this.currentView = (this.currentView === 'standard') ? 'deep' : 'standard';
            this.updatePanelContent();
        },

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
                // 如果既没在加载也没缓存，则启动新进程
                this.startSummaryProcess(this.currentView, this.currentLan);
            }
        },

        _getTargetSubtitleInfo: function() {
            let selectedLanguageIdentifier, identifierType = 'lan_doc';
            const activeBpxItem = document.querySelector('.bpx-player-ctrl-subtitle-language-item.bpx-state-active');
            const activeBuiItem = document.querySelector('.bui-select-item.bui-select-item-active');

            if (activeBpxItem) {
                selectedLanguageIdentifier = activeBpxItem.textContent.trim();
            } else if (activeBuiItem && activeBuiItem.dataset.value) {
                selectedLanguageIdentifier = activeBuiItem.dataset.value;
                identifierType = 'lan';
            } else if (typeof oldPlayerHelper !== 'undefined' && oldPlayerHelper.selectedLan) {
                selectedLanguageIdentifier = oldPlayerHelper.selectedLan;
                identifierType = 'lan';
            }

            if (selectedLanguageIdentifier && selectedLanguageIdentifier !== 'close') {
                const info = bilibiliCCHelper.getSubtitleInfo(
                    identifierType === 'lan' ? selectedLanguageIdentifier : undefined,
                    identifierType === 'lan_doc' ? selectedLanguageIdentifier : undefined
                );
                if (info) return info;
            }

            if (bilibiliCCHelper.subtitle && bilibiliCCHelper.subtitle.subtitles) {
                const firstAvailable = bilibiliCCHelper.subtitle.subtitles.find(sub => sub.lan !== 'close' && sub.lan !== 'local');
                if (firstAvailable) {
                    console.log(`[AI Summary] No active subtitle found, auto-selecting first available: "${firstAvailable.lan_doc}"`);
                    return firstAvailable;
                }
            }
            return null;
        },

        startSummaryProcess: async function(viewType, lan) {
            const cacheKey = `${this.currentCid}_${lan}`;
            // 初始化状态对象（如果不存在）
            this.loadingStates[cacheKey] = this.loadingStates[cacheKey] || {};

            // 防止重复请求
            if (this.loadingStates[cacheKey][viewType]) {
                console.log(`[AI Summary] A "${viewType}" summary for "${lan}" is already in progress.`);
                return;
            }

            this.loadingStates[cacheKey][viewType] = true;
            // 仅当当前视图匹配时才更新UI为加载状态
            if (this.isPanelVisible && this.currentLan === lan && this.currentView === viewType) {
                 this.updatePanelContent();
            }

            const processName = viewType === 'standard' ? '常规总结' : '深度分析';
            console.log(`%c[AI Summary] --- 开始执行 [${processName}] 流程 for [${lan}] ---`, 'background: #222; color: #bada55');

            try {
                if (!lan) throw new Error("本视频没有可用的CC字幕。");

                const bccData = await bilibiliCCHelper.getSubtitle(lan);
                if (!bccData || !bccData.body || bccData.body.length === 0) throw new Error('未能获取到有效的字幕内容。');

                const srtContent = encoder.encodeToSRT(bccData.body);

                const summary = viewType === 'standard'
                    ? await llmHelper.getSummaryFromLLM(srtContent)
                    : await llmHelper.getSummaryFromLLM_AI2(srtContent);

                this.cache[cacheKey] = this.cache[cacheKey] || {};
                this.cache[cacheKey][viewType] = summary;

                console.log(`%c[AI Summary] --- [${processName}] 流程 for [${lan}] 全部完成 ---`, 'background: #222; color: #bada55');

            } catch (error) {
                console.error(`[AI Summary] ${processName} Error for [${lan}]:`, error);
                const errorMessage = `${processName}失败：<br><br>${error.message}`;
                // 同样将错误信息存入缓存，避免重复请求失败的任务
                this.cache[cacheKey] = this.cache[cacheKey] || {};
                this.cache[cacheKey][viewType] = errorMessage;

                console.log(`%c[AI Summary] --- [${processName}] 流程 for [${lan}] 因错误而终止 ---`, 'background: #a52a2a; color: #fff;');
            } finally {
                this.loadingStates[cacheKey][viewType] = false;
                // 任务结束后（无论成功失败），如果用户仍在看这个字幕和视图，刷新面板显示结果
                if (this.isPanelVisible && this.currentLan === lan && this.currentView === viewType) {
                    this.updatePanelContent();
                }
            }
        },

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
                            console.log(`[AI Summary] Subtitle changed from ${this.currentLan} to ${newTargetInfo.lan}, auto-refreshing.`);
                            this.currentLan = newTargetInfo.lan;
                            this.currentView = 'standard';
                            this.updatePanelContent();
                        } else {
                            console.log('[AI Summary] Subtitle change detected, but target is the same or invalid. No refresh.');
                        }
                    }, 500);
                }
            });
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
            console.log('[AI Summary] Subtitle change observer is now active.');
        },

        setupThemeObserver: function() {
            const themeObserver = new MutationObserver(() => this.updateTheme());
            const htmlElement = document.documentElement;
            if (htmlElement) {
                themeObserver.observe(htmlElement, { attributes: true, attributeFilter: ['class'] });
                console.log('[AI Summary] Theme observer is now active.');
            }
        },

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
    // 绑定 `this` 上下文
    summaryButtonManager._doButtonDrag = summaryButtonManager._doButtonDrag.bind(summaryButtonManager);
    summaryButtonManager._stopButtonDrag = summaryButtonManager._stopButtonDrag.bind(summaryButtonManager);
    summaryButtonManager._doDrag = summaryButtonManager._doDrag.bind(summaryButtonManager);
    summaryButtonManager._stopDrag = summaryButtonManager._stopDrag.bind(summaryButtonManager);
    summaryButtonManager._doResize = summaryButtonManager._doResize.bind(summaryButtonManager);
    summaryButtonManager._stopResize = summaryButtonManager._stopResize.bind(summaryButtonManager);


    summaryButtonManager.init();

    unsafeWindow.runSummary = function() {
        console.log('[AI Summary] runSummary() called from console. Triggering UI...');
        summaryButtonManager.handleButtonClick();
    };

    // —————————————— 新增功能区 END ——————————————


})();
