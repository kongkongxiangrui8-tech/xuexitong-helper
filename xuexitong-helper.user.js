// ==UserScript==
// @name         学习通辅助填选－人工核对修复版
// @namespace    github.aajddjkfkfke.xuexitong
// @version      1.3.8
// @description  ⚠ 仅限技术研究，禁止用于网课刷课，后果自负｜视频与测验自动处理；右侧目录出现对号（✓）即直接进入下一节，视频播完也先等对号；空小节自动跳过；跳节卡住会自愈解锁；只往前走不会跳回旧节；核对答案自动提交；最高 10x（kongxiangrui 修订署名版）
// @author       kongxiangrui,ciallo(∠・ω)⌒☆
// @match        *://*.chaoxing.com/mycourse/studentstudy*
// @match        *://*.chaoxing.com/mooc2-ans/mycourse/studentstudy*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// @connect      api.deepseek.com
// @connect      cdn.jsdelivr.net
// @connect      fastly.jsdelivr.net
// @connect      raw.githubusercontent.com
// @noframes
// ==/UserScript==

// ===========================================================================
// ⚠️ 使用警示 / DISCLAIMER
// ---------------------------------------------------------------------------
// 本脚本仅供前端技术研究与个人学习交流，禁止用于网课刷课、代刷、代考等
// 违反学校规定、学术规范或平台服务条款的用途。
//
// 作者不对任何人使用本脚本所产生的一切后果负责，包括但不限于：
//   · 课程成绩无效、学分取消、学术不端处理
//   · 学习通账号被封禁、功能受限
//   · 因使用本脚本产生的任何直接或间接损失及法律责任
//
// 以上后果均由使用者自行承担。若不同意上述条款，请立即停止使用并删除本脚本。
// ===========================================================================

// ---------------------------------------------------------------------------
// 1.3.8 完成通知：整门课跑完时，①面板变绿并写“全部小节已完成”；②发一条系统通知
//   （Tampermonkey 的 GM_notification，会出现在 Windows 右下角）；③标签页标题前加“✅ 全部完成”；
//   ④响一声短提示音。人不在电脑前也能知道已经跑完。
// ---------------------------------------------------------------------------
// 1.3.7 顺着“下一节在可视区外”的线索再收紧：页脚“下一节”常常要滚到页面底部才露出来，
//   之前点它用的是裸 click()，滚动后立刻点，前端可能收不到。现在先 scrollIntoView 等 260ms，
//   再用完整的 pointerover→pointerdown→mousedown→focus→pointerup→mouseup→click 序列点。
// ---------------------------------------------------------------------------
// 1.3.6 不再依赖“点得动”：点“下一节”两次仍不换节时，直接从目录行里取出章节 ID，
//   按 studentstudy 地址整页跳过去（跟手动在目录里点一下等价），因此不会再出现
//   “自动点了 6 次都没切过去，请手动点”的死路。取不到 ID 时才继续用点击重试。
// ---------------------------------------------------------------------------
// 1.3.5 面板位置自愈：浏览器窗口变窄后，面板按旧坐标会被挤出可视区（只剩一条、看不到日志）。
//   现在按面板实际宽度重新夹进可视区、窗口缩放时也重新夹，并且刷新后不再沿用“最小化”。
// ---------------------------------------------------------------------------
// 1.3.4 修“卡在某一节、必须重新点开始才能继续”：
//   1) “对号→下一节”的重试次数从 2 次放宽到 6 次；次数用完会明确提示“请手动点页脚的下一节”，
//      不再悄悄放弃、表现成永久卡住；
//   2) 健康检查新增 45 秒停滞自愈：右侧已经有对号、却一直没换节时，自动重置重试计数再点一次，
//      不必再手动“停止/开始”。
// ---------------------------------------------------------------------------
// 1.3.3 修“切换下一节未完成 / 1.5.2 这类节卡住不动”：
//   实测目录里的父行和页脚“下一节”对合成点击没反应（只发 mousedown+mouseup+click 时页面不动），
//   手动用真鼠标点一下就正常切换。现在合成点击会先滚到可视区，再按 pointerover/pointerdown→
//   mousedown→focus→pointerup→mouseup→click 的完整顺序带坐标发出，尽量贴合真实点击。
// ---------------------------------------------------------------------------
// 1.3.2 融合版：把 ChatGPT 的 1.3.1 字体修补合进来，并按实测结果改三处。
//   1) 字体还原照单全收：①当前字体 SHA-256 命中时用已逐字核对的 147 字映射（离线、瞬时）；
//      ②否则下载思源黑体把字逐个画出来比对反推；③再不行才让模型按上下文还原。
//   2) 长课件自动翻页已按用户要求下线：不再自动翻、也不假装在翻，只在日志里提示“请手动翻完”。
//   3) 修“提交成功却被判失败”：实测平台提交后只切成“我的答案 / 正确答案”对照视图、
//      不显示“本次成绩 N 分”，旧判据因此误报。现在两种视图都算提交成功，等待放宽到 30 秒。
// ---------------------------------------------------------------------------
// 1.3.1 字体修补：基于用户提供的 DeepSeek 1.3.0；新增当前诊断字体的 SHA-256 限定映射。
// 仅该 31,944 字节字体可直接解码，不代表其他字体或整套平台流程已经验证。
// 原脚本的跳节、播放、API 和提交流程保留。
// ---------------------------------------------------------------------------
// 修订备注 · 署名：kongxiangrui,ciallo(∠・ω)⌒☆ · 2026-11-05
// 本版在原作者 aajddjkfkfke 的脚本基础上修改，改动如下：
//   1) 新增“字形还原”：读取页面 font-cxsecret 子集字体，把每个可疑字用该字体渲染出来，
//      再和思源黑体 SourceHanSansCN-Normal 逐字比对，反推被替换的真字（如 乱→坚、叁→持）；
//   2) “识别题目”和作答日志改为显示还原后的题干，并打印还原示例与替换数量；
//   3) 字形还原不可用时自动退回：由模型按上下文还原，并显示“还原（与原文重合 xx%）”；
//   4) 答案核对增加还原重合度检查，偏差过大时在日志里点名提醒。
//   5) v1.2.0 起把“跳节”改为对号驱动：只认右侧目录的完成标记（✓），对号一出现就直接
//      点目录里的下一小节；不再“识别到 PPT/课件就抢先点下一节”——上一版正因抢跳而卡在
//      “30 秒内未检测到下一节可识别的正文”。对号没出现就原地等待，不再整机报错。
//   6) v1.2.1：页面明确显示“暂无内容”的空小节永远等不到对号，改为 10 秒后自动点“下一节”
//      继续（最多连跳 5 节）；等待时在日志里打印“目录自检”，显示当前行、是否读到对号、下一节。
//   7) v1.2.2：修“卡在‘正在进入下一节…’一动不动”——跳节锁偶尔没有被释放，整个自动化停摆。
//      现在有 5 秒看门狗（没有任何实际切换就自动解锁）、2 秒健康检查（定时器丢了会重启），
//      并且跳节锁被占用时会写日志，方便看出是哪一步卡住。
//   8) v1.2.3：视频播完不再 0.4 秒就跳，先等右侧对号（最多 12 秒）；等到就按对号跳，
//      等不到才按“下一节”继续并提示（多半是倍速播放没被平台计入观看时长）。
//   9) v1.2.4：修“从正在加载的视频跳回旧小节、来回打转”——平台目录的高亮行有时会滞后到
//      已经走过的小节，脚本误以为那节刚完成就跳走。现在记一个“当前位置”，只允许往目录后面跳；
//      高亮回退到旧节时忽略这次对号（日志会写“忽略这次对号”）；用户手动点目录会把位置更新回去。
//  10) v1.2.5：父目录页（“暂无内容”的自录行）不再傻等 10 秒，3 秒就往下走；视频加载重试的
//      等待从 8 秒缩到 3 秒，慢网下视频能更快开始播放。
//  11) v1.2.6：修“漏掉 5.1”——这套目录把 5.2 挂在 5.1 下面，按“下一个叶子”算会把 5.1 当父
//      目录跳过（5.1 其实是视频）。现在跳节改用平台自己的“下一节”按钮，平台怎么排就怎么走；
//      父目录页由“暂无内容 3 秒跳过”带过，不会再漏小节。
//  12) v1.2.7：小节里有“教学视频 / 课件 / 教材内容”多个页签时，课件页本身不会自动打勾。
//      现在课件页 8 秒没等到对号，就自动切到“教学视频”页签把视频播了，不再干等 60 秒。
//  15) v1.3.0：长课件改成“按页翻”——读右下角“1 /260”判断进度，自动点 ›/→ 或发方向键，
//      每 0.9 秒一页；页码连续 8 次不动就停，翻到最后一页也停；你动鼠标仍会让开 20 秒。
//  14) v1.2.9：课件自动翻页会让开用户操作——滚轮/拖动后暂停 20 秒再继续，不再和手工阅读打架。
//  13) v1.2.8：长课件（几十上百页的 PDF/PPT）要翻到底平台才打勾，之前脚本只会干等。现在会
//      自动把课件一屏一屏往下翻，翻到底就停，对号一出现也立刻停；按“页数”算进度的阅读器
//      会再提示手动点翻页。
// 说明：字形还原首次需联网下载约 8MB 参考字体（之后走 Cache Storage 缓存），
//       只在页面出现 font-cxsecret 时触发；任一环节失败都会退回旧逻辑，不影响其它功能。
// 本版内容与 v1.1.6 相同，只改为对号触发跳节并去掉抢跳，署名备注保留。
// ---------------------------------------------------------------------------

/*
 * 安装：用全部代码替换现有脚本，保存后刷新课程页，确认 v1.3.8-merged。
 * 使用：勾选“辅助填选”后点击开始；默认开启“自动提交”，核对通过后自动点击提交和确认。
 * 手动：取消“自动提交”可保留人工交卷；停止按钮会取消尚未执行的提交或确认。
 * 课件：支持 PPT/PDF/文档与正文阅读页；识别后等右侧对号再切换，不再按固定延时抢跳。
 * 完成：以右侧目录的对号（✓）为准——当前小节一旦出现完成标记，立刻点目录里的下一小节；
 *       不再“识别到 PPT 就抢先点下一节”，对号没出现就原地等待（面板“下一节”可手动切）。
 *       例外：页面明确显示“暂无内容”的空小节永远不会有对号，10 秒后自动跳过。
 * 倍速：支持 5x、10x；本次升级将目标设为 10x，以面板底部“实际”速度为准。
 * 校验：检查题数、真实选择状态和本地答案字段。看不到保存字段时停止，不按已保存处理。
 * 结果：自动提交后检查平台返回的作答记录；结果不明、记录为空或平台报错时停止，禁止自动重试。
 * 文字：超星用字体替换防复制（屏幕显示正常，复制/读取出来却是别的字，如“坚持”变“乱叁”）。
 *       先找页面的 font-cxsecret 子集字体，把每个字按页面字体画出来，再和思源黑体逐字比对反推真字；
 *       字体或参考字形不可用时，退回让模型按上下文还原，并回显“还原”和重合度。
 * 限制：本地校验不保证 AI 正确率或服务器保存；播放器或平台可能不接受 10x；字形还原可能出错，提交前请看日志。
 * API：low/32000，每组最多5题、每组一次请求，所有组返回完整答案后才填选。
 */

(function () {
    'use strict';

    const VERSION = '1.3.8-merged';
    const AI_CONFIG = Object.freeze({ model: 'deepseek-flash', effort: 'low', maxTokens: 32000 });
    const BOOT_KEY = '__xuexitongDeepSeekPanelBooted';
    const API_URL = 'https://api.deepseek.com/chat/completions';
    const MODELS_URL = 'https://api.deepseek.com/models';
    const LOG_LIMIT = 300;

    if (window[BOOT_KEY]) return;
    window[BOOT_KEY] = true;

    /* ---------------------------------------------------------------- 设置 */

    const storage = {
        get(key, fallback) {
            try {
                if (typeof GM_getValue === 'function') {
                    const value = GM_getValue(key, fallback);
                    return value === undefined ? fallback : value;
                }
                const raw = localStorage.getItem('xt_ds_' + key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch (error) {
                return fallback;
            }
        },
        set(key, value) {
            try {
                if (typeof GM_setValue === 'function') GM_setValue(key, value);
                else localStorage.setItem('xt_ds_' + key, JSON.stringify(value));
            } catch (error) {
                /* 存储不可用时静默降级为本次会话有效 */
            }
        },
    };

    const settings = {
        apiKey: String(storage.get('apiKey', '') || ''),
        autoQuiz: false, // 每次打开都需明确开启辅助填选
        autoNext: storage.get('autoNext', false) === true,
        skipCourseware: storage.get('skipCourseware', true) !== false,
        autoSubmit: storage.get('autoSubmit', true) !== false,
        rate: storage.get('rateModeVersion', '') === '10x-v1' ? Math.min(10, Math.max(0, Number(storage.get('rate', 10)) || 0)) : 10,
        lockRate: storage.get('lockRate', true) !== false,
        position: storage.get('position', null),
        minimized: storage.get('minimized', false) === true,
    };

    storage.set('rateModeVersion', '10x-v1');
    storage.set('rate', settings.rate);

    const state = {
        app: null,
        mode: 'idle', // idle | waiting | running | error
        activity: '',
    };

    // 页面 jQuery 可能位于沙箱之外（Firefox + Tampermonkey 的 Xray 环境），优先取页面 window。
    const pageWindow = (() => {
        try {
            return typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
        } catch (error) {
            return window;
        }
    })();

    function getJQuery() {
        return (pageWindow && pageWindow.jQuery) || window.jQuery || null;
    }

    /* ------------------------------------------------------------ 基础工具 */

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function waitFor(check, timeout, interval = 50) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            if (check()) return true;
            await sleep(interval);
        }
        return Boolean(check());
    }

    function truncate(text, max) {
        const value = String(text || '');
        return value.length > max ? value.slice(0, max) + '…' : value;
    }

    function fmt(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    let rateBlocked = false;

    function installRateLock(video) {
        if (!video || video.__xtRateLockInstalled) return;
        try {
            let proto = Object.getPrototypeOf(video);
            let descriptor = null;
            while (proto && !descriptor) {
                descriptor = Object.getOwnPropertyDescriptor(proto, 'playbackRate');
                proto = Object.getPrototypeOf(proto);
            }
            if (!descriptor || typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function') return;
            const setter = function (value) {
                const target = Number(video.__xtRateTarget) || 0;
                const next = Number(value);
                if (!Number.isFinite(next) || next <= 0) return;
                if (target > 0 && Math.abs(next - target) > 0.01) return;
                descriptor.set.call(this, next);
            };
            Object.defineProperty(video, 'playbackRate', {
                configurable: true,
                enumerable: true,
                get() {
                    return descriptor.get.call(this);
                },
                set: setter,
            });
            video.__xtRateLockInstalled = true;
            video.__xtRateLockSetter = setter;
        } catch (error) {
            log('warn', `倍速锁定未生效，改用定时校正：${error.message || error}`);
        }
    }

    function unlockRateLock(video) {
        if (!video || !video.__xtRateLockInstalled) return;
        try {
            delete video.playbackRate;
        } catch (error) {
            /* 忽略 */
        }
        video.__xtRateLockInstalled = false;
    }

    function applyPlaybackRate(video) {
        const rate = Number(settings.rate) || 0;
        if (!video || rate <= 0) return false;
        if (video.__xtRateRequested !== rate) {
            video.__xtRateRequested = rate;
            video.__xtRateRejected = false;
            rateBlocked = false;
        }
        if (rateBlocked || video.__xtRateRejected) return false;
        video.__xtRateTarget = rate;
        if (settings.lockRate) installRateLock(video);
        try { if (Math.abs(Number(video.defaultPlaybackRate || 1) - rate) > 0.01) video.defaultPlaybackRate = rate; }
        catch (_) { /* 部分播放器只允许设置当前倍速，以 playbackRate 的实际值为准。 */ }
        let problem = '';
        try { if (Math.abs(Number(video.playbackRate || 1) - rate) > 0.01) video.playbackRate = rate; }
        catch (error) { problem = error.message || String(error); }
        const actual = Number(video.playbackRate) || 1;
        if (problem || Math.abs(actual - rate) > 0.01) {
            video.__xtRateTarget = 0;
            video.__xtRateRejected = true;
            rateBlocked = true;
            unlockRateLock(video);
            log('warn', `播放器未接受 ${rate}x，实际 ${actual}x；已停止本次强制设置${problem ? '：' + problem : ''}`);
            return false;
        }
        return true;
    }

    function isTransientPlayError(error) {
        const name = String(error?.name || '');
        const message = String(error?.message || '');
        return name === 'AbortError' ||
            (name === 'NotSupportedError' && /no supported sources|no source/i.test(message)) ||
            /aborted by the user agent|interrupted by a new load request|The play\(\) request was interrupted/i.test(message);
    }

    function waitForMediaReady(video, timeout = 10000) {
        return new Promise((resolve) => {
            if (!video) {
                resolve(false);
                return;
            }
            if (video.readyState >= 2) {
                resolve(true);
                return;
            }
            let settled = false;
            let timer = null;
            let poll = null;
            const events = ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough', 'playing'];
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                if (poll) clearInterval(poll);
                events.forEach((name) => video.removeEventListener(name, onReady));
                video.removeEventListener('error', onError);
                resolve(ok);
            };
            const onReady = () => {
                if (video.readyState >= 2) finish(true);
            };
            const onError = () => finish(false);
            events.forEach((name) => video.addEventListener(name, onReady));
            video.addEventListener('error', onError, { once: true });
            poll = setInterval(() => {
                if (video.readyState >= 2) finish(true);
            }, 200);
            timer = setTimeout(() => finish(video.readyState >= 2), timeout);
        });
    }

    function describeHttpError(response) {
        let detail = '';
        try {
            const data = JSON.parse(response.responseText || 'null');
            detail = data?.error?.message || data?.error || data?.message || '';
        } catch (error) {
            detail = truncate(response.responseText || '', 120);
        }
        if (response.status === 401) return 'DeepSeek 拒绝了 API Key（401），请重新填写';
        if (response.status === 402) return 'DeepSeek 账户余额不足（402）';
        if (response.status === 429) return 'DeepSeek 请求过于频繁（429），请稍后再试';
        return `DeepSeek API 返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`;
    }

    /* -------------------------------------------------------- 纯逻辑（可测） */

    /* __XT_PURE_BEGIN__ */
    function clean(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function commonOptionSuffix(options) {
        if (!Array.isArray(options) || options.length < 2) return '';
        const texts = options.map((option) => clean(option.text).replace(/^[A-H][.、．:：]\s*/, ''));
        if (texts.some((text) => !text)) return '';
        const shortest = Math.min(...texts.map((text) => text.length));
        let suffix = '';
        for (let length = 1; length <= Math.min(shortest, 8); length++) {
            const candidate = texts[0].slice(-length);
            if (texts.every((text) => text.endsWith(candidate))) suffix = candidate;
            else break;
        }
        if (suffix.length < 2) return '';
        if (/^[一二三四五六七八九十0-9]+$/.test(suffix)) return '';
        if (['的是', '一项', '以下', '正确', '错误'].includes(suffix)) return '';
        return suffix;
    }

    const TRUSTED_THEMES = new Set([
        '铁路', '公路', '道路', '航线', '主义', '思想', '理论', '制度', '会议', '政策',
        '方针', '路线', '革命', '建设', '发展', '社会', '资本', '市场', '经济', '政治',
        '文化', '历史', '人民', '国家', '政府', '法律', '权利', '义务', '关系', '问题',
        '方法', '原则', '目标', '任务', '阶段', '时期', '过程', '结果', '原因', '条件',
        '特点', '性质', '作用', '意义', '影响', '地位', '标准', '形式', '内容', '结构',
        '功能', '系统', '模式', '方向', '基础', '核心', '关键', '重点', '难点', '科学',
        '技术', '教育', '管理', '组织', '机构', '产品', '质量', '成本', '价格', '货币',
        '银行', '企业', '工厂', '农村', '城市', '地区', '世界', '中国', '美国', '英国',
        '法国', '德国', '日本', '俄罗斯', '欧洲', '亚洲', '非洲', '美洲', '大学', '中学',
        '小学', '学生', '教师', '课程', '考试', '成绩', '学习', '研究', '实验', '数据',
        '网络', '信息', '软件', '硬件', '程序', '算法', '模型', '材料', '能源', '环境',
        '生态', '资源', '人口', '家庭', '婚姻', '道德', '哲学', '宗教', '艺术', '文学',
        '语言', '文字', '新闻', '媒体', '传播', '广告', '消费', '生产', '分配', '交换',
        '劳动', '工作', '职业', '收入', '税收', '财政', '金融', '投资', '贸易', '物流',
        '交通', '运输', '航空', '航天', '军事', '战争', '和平', '安全', '改革', '开放',
        '创新', '合作', '竞争', '效率', '公平', '正义', '自由', '平等', '民主', '法治',
        '文明', '和谐', '诚信', '友善', '爱国', '敬业', '奉献', '责任',
    ]);

    function themeIsTrusted(theme) {
        if (TRUSTED_THEMES.has(theme)) return true;
        for (const word of TRUSTED_THEMES) {
            if (theme.length > word.length && theme.endsWith(word)) return true;
        }
        return false;
    }

    // 还原后的题干与原文的重合度：只应改动被字体替换的那几个字，改多了说明模型在编。
    function restorationScore(raw, restored) {
        const origin = Array.from(String(raw || ''));
        const guess = Array.from(String(restored || ''));
        if (!origin.length || !guess.length) return 0;
        const counts = new Map();
        for (const char of origin) counts.set(char, (counts.get(char) || 0) + 1);
        let hit = 0;
        for (const char of guess) {
            const left = counts.get(char) || 0;
            if (left > 0) {
                counts.set(char, left - 1);
                hit++;
            }
        }
        return hit / Math.max(origin.length, guess.length);
    }

    const SYSTEM_PROMPT = [
        '按原题题意作答，选项字母以提供的显示字母为准；单选题、判断题只选一个，多选题列出全部正确项，不得重复，不得输出不存在的选项。',
        '超星会对题目做字体替换：页面显示的是真字，但复制或读取出来的字会被换成别的字（例如「坚持」变成「乱叁」、「以」变成「厶」），通常只替换一部分字。',
        '请先按上下文把被替换的字还原成通顺的原文，再按还原后的题目作答；restored 写还原后的完整题干，长度与原文接近，只改明显不通的字，不要缩写，也不要补充原文没有的内容。',
        '只要选项还能读出含义，就按最合理的还原结果给出 letters；只有整道题的选项都完全无法辨认时，才返回空 letters，并在 restored 里写明哪几个选项看不清。',
        'theme 只是参考，不得推翻原文。只输出 JSON：{"answers":[{"id":1,"letters":["A"],"restored":"还原后的题干"}]}。',
    ].join('');

    function buildRequestBody(questions, hint = '') {
        const payload = questions.map((question, index) => {
            const item = {
                id: index + 1,
                type: question.kind,
                question: question.title,
                options: question.options.map((option) => ({ letter: option.letter, text: option.text })),
            };
            const theme = commonOptionSuffix(question.options);
            if (theme && themeIsTrusted(theme)) item.theme = theme;
            return item;
        });
        return {
            model: AI_CONFIG.model,
            stream: false,
            response_format: { type: 'json_object' },
            thinking: { type: 'enabled' },
            reasoning_effort: AI_CONFIG.effort,
            max_tokens: AI_CONFIG.maxTokens,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT + (hint ? `\n${hint}` : '') },
                { role: 'user', content: JSON.stringify(payload) },
            ],
        };
    }

    function findThemeMismatches(questions, answers) {
        const byId = new Map();
        for (const item of Array.isArray(answers) ? answers : []) {
            if (item && Number.isInteger(item.id)) byId.set(item.id, item);
        }
        const result = [];
        for (let index = 0; index < questions.length; index++) {
            const theme = commonOptionSuffix(questions[index].options);
            if (!theme || !themeIsTrusted(theme)) continue;
            const restored = String(byId.get(index + 1)?.restored || '');
            if (!restored.includes(theme)) result.push({ id: index + 1, theme, restored });
        }
        return result;
    }

    function parseAnswerPayload(content, expectedCount) {
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (error) {
            throw new Error('DeepSeek 返回内容不是有效 JSON');
        }
        if (!parsed || !Array.isArray(parsed.answers)) throw new Error('DeepSeek 返回缺少 answers 数组');
        if (parsed.answers.length !== expectedCount) {
            throw new Error(`DeepSeek 返回 ${parsed.answers.length} 个答案，题目数量为 ${expectedCount}`);
        }
        return parsed.answers;
    }

    function validateAnswers(questions, answers) {
        if (!Array.isArray(answers) || answers.length !== questions.length) throw new Error('AI 返回的题目数量不匹配');
        const result = new Map();
        for (const item of answers) {
            if (!Number.isInteger(item.id) || result.has(item.id) || !Array.isArray(item.letters)) {
                throw new Error('AI 答案格式错误');
            }
            const question = questions[item.id - 1];
            if (!question) throw new Error('AI 返回未知题号');
            const letters = item.letters.map((letter) => clean(letter).toUpperCase());
            if (!letters.length) {
                const why = String(item.restored || '').trim();
                throw new Error(`第 ${item.id} 题 AI 未给出选项${why ? `（模型说明：${truncate(why, 40)}）` : ''}，已停止提交`);
            }
            if (new Set(letters).size !== letters.length) throw new Error(`第 ${item.id} 题答案包含重复选项，已停止提交`);
            if (question.kind !== '多选题' && letters.length !== 1) {
                throw new Error(`第 ${item.id} 题是${question.kind}，但 AI 返回了 ${letters.length} 个选项，已停止提交`);
            }
            const invalid = letters.filter((letter) => !question.options.some((option) => option.letter === letter));
            if (invalid.length) {
                throw new Error(`第 ${item.id} 题 AI 返回了页面中不存在的选项：${invalid.join('、')}，已停止提交`);
            }
            result.set(item.id, letters);
        }
        return result;
    }
    /* __XT_PURE_END__ */

    /* __XT_FONT_BEGIN__ */
    function fontTag(bytes, offset) {
        return String.fromCharCode(bytes[offset] || 0, bytes[offset + 1] || 0, bytes[offset + 2] || 0, bytes[offset + 3] || 0);
    }

    function fontU16(bytes, offset) {
        return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
    }

    function fontU32(bytes, offset) {
        return (((bytes[offset] || 0) << 24) | ((bytes[offset + 1] || 0) << 16) | ((bytes[offset + 2] || 0) << 8) | (bytes[offset + 3] || 0)) >>> 0;
    }

    function readSfntTables(bytes, base = 0) {
        const numTables = fontU16(bytes, base + 4);
        const tables = new Map();
        for (let index = 0; index < numTables; index++) {
            const entry = base + 12 + index * 16;
            if (entry + 16 > bytes.length) break;
            const tag = fontTag(bytes, entry);
            const offset = fontU32(bytes, entry + 8);
            const length = fontU32(bytes, entry + 12);
            if (offset + length <= bytes.length) tables.set(tag, bytes.subarray(offset, offset + length));
        }
        return tables;
    }

    async function inflateZlib(bytes) {
        if (typeof DecompressionStream !== 'function') return null;
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async function readWoffTables(bytes) {
        const numTables = fontU16(bytes, 12);
        const tables = new Map();
        for (let index = 0; index < numTables; index++) {
            const entry = 44 + index * 20;
            if (entry + 20 > bytes.length) break;
            const tag = fontTag(bytes, entry);
            const offset = fontU32(bytes, entry + 4);
            const compLength = fontU32(bytes, entry + 8);
            const origLength = fontU32(bytes, entry + 12);
            if (offset + compLength > bytes.length) continue;
            let data = bytes.subarray(offset, offset + compLength);
            if (compLength < origLength) {
                const inflated = await inflateZlib(data);
                if (!inflated) return null;
                data = inflated.subarray(0, origLength);
            }
            tables.set(tag, data);
        }
        return tables;
    }

    function parseCmapTable(bytes) {
        if (!bytes || bytes.length < 4) return null;
        const numTables = fontU16(bytes, 2);
        let best = null;
        for (let index = 0; index < numTables; index++) {
            const record = 4 + index * 8;
            if (record + 8 > bytes.length) break;
            const platform = fontU16(bytes, record);
            const encoding = fontU16(bytes, record + 2);
            const offset = fontU32(bytes, record + 4);
            if (offset + 2 > bytes.length) continue;
            const format = fontU16(bytes, offset);
            if (format !== 4 && format !== 12) continue;
            if (platform === 3 && (encoding === 1 || encoding === 10)) {
                best = offset;
                break;
            }
            if (best === null) best = offset;
        }
        if (best === null) return null;
        const format = fontU16(bytes, best);
        const map = new Map();
        if (format === 4) {
            const segCount = fontU16(bytes, best + 6) / 2;
            const endOffset = best + 14;
            const startOffset = endOffset + segCount * 2 + 2;
            const deltaOffset = startOffset + segCount * 2;
            const rangeOffset = deltaOffset + segCount * 2;
            for (let index = 0; index < segCount; index++) {
                const end = fontU16(bytes, endOffset + index * 2);
                const start = fontU16(bytes, startOffset + index * 2);
                const delta = fontU16(bytes, deltaOffset + index * 2);
                const range = fontU16(bytes, rangeOffset + index * 2);
                if (start === 0xFFFF && end === 0xFFFF) continue;
                for (let code = start; code <= end && code !== 0xFFFF; code++) {
                    let gid;
                    if (range === 0) {
                        gid = (code + delta) & 0xFFFF;
                    } else {
                        const glyphOffset = rangeOffset + index * 2 + range + (code - start) * 2;
                        if (glyphOffset + 1 >= bytes.length) continue;
                        gid = fontU16(bytes, glyphOffset);
                        if (gid !== 0) gid = (gid + delta) & 0xFFFF;
                    }
                    if (gid) map.set(code, gid);
                }
            }
        } else {
            const groupCount = fontU32(bytes, best + 12);
            for (let index = 0; index < groupCount; index++) {
                const group = best + 16 + index * 12;
                if (group + 12 > bytes.length) break;
                const start = fontU32(bytes, group);
                const end = fontU32(bytes, group + 4);
                const startGid = fontU32(bytes, group + 8);
                if (end - start > 200000) continue;
                for (let code = start; code <= end; code++) map.set(code, startGid + (code - start));
            }
        }
        return map;
    }

    function parsePostTable(bytes) {
        const names = [];
        if (!bytes || bytes.length < 34) return names;
        const version = fontU32(bytes, 0);
        if (version !== 0x00020000) return names;
        const count = fontU16(bytes, 32);
        if (count === 0) return names;
        const indices = [];
        for (let index = 0; index < count; index++) indices.push(fontU16(bytes, 34 + index * 2));
        let offset = 34 + count * 2;
        const custom = [];
        while (offset < bytes.length) {
            const length = bytes[offset];
            offset++;
            if (!length) {
                custom.push('');
                continue;
            }
            if (offset + length > bytes.length) break;
            let name = '';
            for (let index = 0; index < length; index++) name += String.fromCharCode(bytes[offset + index]);
            custom.push(name);
            offset += length;
        }
        for (let gid = 0; gid < count; gid++) {
            const index = indices[gid];
            if (index >= 258) names[gid] = custom[index - 258] || '';
        }
        return names;
    }

    function nameCode(name) {
        if (!name) return 0;
        let match = /^uni([0-9A-F]{4,6})$/i.exec(name);
        if (match) return parseInt(match[1], 16);
        match = /^u([0-9A-F]{4,6})$/i.exec(name);
        if (match) return parseInt(match[1], 16);
        return 0;
    }

    function isUsefulCode(code) {
        return (code >= 0x4E00 && code <= 0x9FFF) ||
            (code >= 0x3400 && code <= 0x4DBF) ||
            (code >= 0x20 && code <= 0x7E) ||
            (code >= 0x3000 && code <= 0x303F) ||
            (code >= 0xFF00 && code <= 0xFFEF);
    }

    async function buildFontDecoder(buffer) {
        const bytes = new Uint8Array(buffer);
        if (bytes.length < 12) return null;
        const signature = fontTag(bytes, 0);
        let tables = null;
        if (signature === 'wOFF') tables = await readWoffTables(bytes);
        else if (signature === 'wOF2') return null;
        else if (signature === 'ttcf') tables = readSfntTables(bytes, fontU32(bytes, 12));
        else tables = readSfntTables(bytes);
        if (!tables) return null;
        const cmap = parseCmapTable(tables.get('cmap'));
        if (!cmap || !cmap.size) return null;
        const names = parsePostTable(tables.get('post'));
        const gidToCodes = new Map();
        for (const [code, gid] of cmap) {
            if (!gidToCodes.has(gid)) gidToCodes.set(gid, []);
            gidToCodes.get(gid).push(code);
        }
        const mapping = new Map();
        let namedCount = 0;
        let reverseCount = 0;
        for (const [code, gid] of cmap) {
            const named = names[gid] ? nameCode(names[gid]) : 0;
            if (named && named !== code) {
                mapping.set(code, named);
                namedCount++;
                continue;
            }
            const alternatives = gidToCodes.get(gid) || [];
            const other = alternatives.find((candidate) => candidate !== code && isUsefulCode(candidate));
            if (other) {
                mapping.set(code, other);
                reverseCount++;
            }
        }
        if (!mapping.size) return null;
        return {
            size: mapping.size,
            mode: namedCount ? 'name' : reverseCount ? 'reverse' : 'none',
            decode(text) {
                let result = '';
                for (const char of String(text || '')) {
                    const code = char.codePointAt(0);
                    result += String.fromCodePoint(mapping.get(code) || code);
                }
                return result;
            },
        };
    }
    /* __XT_FONT_END__ */

    let fontDecoderCache = { tried: false, decoder: null };

    function fontResourceUrls(card) {
        const urls = [];
        const add = (url) => {
            const value = String(url || '').trim().replace(/^['"]|['"]$/g, '');
            if (value && !urls.includes(value)) urls.push(value);
        };
        const preferred = [];
        try {
            const family = card ? getComputedStyle(card).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase() : '';
            for (const sheet of Array.from(document.styleSheets)) {
                let rules = null;
                try {
                    rules = sheet.cssRules;
                } catch (error) {
                    continue;
                }
                for (const rule of Array.from(rules || [])) {
                    if (rule.type !== 5) continue;
                    const ruleFamily = String(rule.style.fontFamily || '').replace(/["']/g, '').trim().toLowerCase();
                    const src = String(rule.style.src || '');
                    const found = src.match(/url\(([^)]+)\)/g) || [];
                    for (const item of found) {
                        const url = item.replace(/^url\(/, '').replace(/\)$/, '');
                        if (/cxsecret/i.test(ruleFamily)) preferred.unshift(url);
                        else if (family && ruleFamily === family) preferred.push(url);
                        else add(url);
                    }
                }
            }
        } catch (error) {
            /* 跨域样式表忽略 */
        }
        try {
            for (const entry of performance.getEntriesByType('resource')) {
                if (/\.(woff2?|ttf|otf)(\?|#|$)/i.test(entry.name)) add(entry.name);
            }
        } catch (error) {
            /* 忽略 */
        }
        preferred.forEach(add);
        const combined = [];
        [...preferred, ...urls].forEach((value) => {
            const url = String(value || '').trim().replace(/^['"]|['"]$/g, '');
            if (url && !combined.includes(url)) combined.push(url);
        });
        return combined.slice(0, 8);
    }

    async function fetchFontBuffer(url) {
        if (String(url).startsWith('data:')) {
            const match = /^data:[^,]*;base64,(.*)$/s.exec(url);
            if (!match) return null;
            const binary = atob(match[1]);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            return bytes.buffer;
        }
        const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
        if (!response.ok) return null;
        return response.arrayBuffer();
    }

    async function ensureFontDecoder(sample, card) {
        if (fontDecoderCache.tried) return fontDecoderCache.decoder;
        fontDecoderCache.tried = true;
        try {
            await Promise.race([document.fonts.ready, sleep(1500)]);
        } catch (error) {
            /* 继续尝试已加载的字体 */
        }
        const urls = fontResourceUrls(card).slice(0, 3);
        for (const url of urls) {
            try {
                const buffer = await fetchFontBuffer(url);
                if (!buffer) continue;
                const decoder = await buildFontDecoder(buffer);
                if (!decoder) continue;
                const decoded = decoder.decode(sample || '');
                const original = Array.from(sample || '');
                const result = Array.from(decoded);
                let changed = 0;
                const pairs = [];
                for (let index = 0; index < Math.min(original.length, result.length); index++) {
                    if (original[index] !== result[index]) {
                        changed++;
                        if (pairs.length < 6) pairs.push(`${original[index]}→${result[index]}`);
                    }
                }
                // 超星只替换一部分字，映射数量可能很少；只要真的改到了字，就比不还原强。
                const enough = changed >= 1 && changed >= Math.max(1, original.length) * 0.02;
                if (enough && /[\u4e00-\u9fff]/.test(decoded)) {
                    fontDecoderCache.decoder = decoder;
                    log('info', `字体解码已启用：${decoder.size} 个映射，模式 ${decoder.mode}（${truncate(String(url).split('/').pop(), 36)}）`);
                    if (pairs.length) log('info', `映射示例：${pairs.join('、')}`);
                    return decoder;
                }
            } catch (error) {
                /* 尝试下一个字体 */
            }
        }
        log('warn', '未找到可用的字体映射（超星的字形替换字体本身不带映射表），改为让模型按上下文还原');
        return null;
    }

    /* -------------------------------------------------- 字形还原（字体替换） */
    /*
     * 超星把题干字体换成子集字体：编码 A 的字形被画成 B 的样子，页面看着正常，复制出来的却是 A。
     * 字体里没有 A→B 的映射表，只能把 A 用这个子集字体画出来，再和思源黑体逐字比对，反推出 B。
     */

    const GLYPH = Object.freeze({
        refUrls: [
            'https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-sans@release/SubsetOTF/CN/SourceHanSansCN-Normal.otf',
            'https://fastly.jsdelivr.net/gh/adobe-fonts/source-han-sans@release/SubsetOTF/CN/SourceHanSansCN-Normal.otf',
            'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/SubsetOTF/CN/SourceHanSansCN-Normal.otf',
        ],
        bucket: 'xt-glyph-ref-v1',
        refFamily: 'XTRefHanCN',
        secretFamily: 'XTSecretSubset',
        cell: 52,
        grid: 42,
        coarseFont: 40,
        fineFont: 120,
        coarse: 20,
        fine: 64,
        topK: 6,
        ink: 200,
        mapKey: 'glyphMap',
    });

    const glyphState = {
        decoder: null,
        tried: false,
        missingLogged: false,
        index: null,
        building: null,
        refBuffer: null,
        surfaces: new Map(),
        map: null,
        refLoading: null,
    };

    function glyphSurface(size) {
        if (glyphState.surfaces.has(size)) return glyphState.surfaces.get(size);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const surface = { canvas, ctx };
        glyphState.surfaces.set(size, surface);
        return surface;
    }

    function inkBox(data, width, x0, y0, w, h) {
        let minX = w;
        let minY = h;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < h; y++) {
            const row = (y0 + y) * width;
            for (let x = 0; x < w; x++) {
                const index = (row + x0 + x) * 4;
                const luma = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
                if (luma > GLYPH.ink) continue;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0 || maxY < 0) return null;
        return { x: x0 + minX, y: y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    function sampleGray(target, offset, data, width, box, n) {
        for (let j = 0; j < n; j++) {
            const yFrom = box.y + Math.min(box.h - 1, Math.floor((j * box.h) / n));
            const yTo = box.y + Math.min(box.h, Math.max(Math.floor((j * box.h) / n) + 1, Math.ceil(((j + 1) * box.h) / n)));
            for (let i = 0; i < n; i++) {
                const xFrom = box.x + Math.min(box.w - 1, Math.floor((i * box.w) / n));
                const xTo = box.x + Math.min(box.w, Math.max(Math.floor((i * box.w) / n) + 1, Math.ceil(((i + 1) * box.w) / n)));
                let sum = 0;
                let count = 0;
                for (let y = yFrom; y < yTo; y++) {
                    for (let x = xFrom; x < xTo; x++) {
                        const index = (y * width + x) * 4;
                        sum += data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
                        count++;
                    }
                }
                target[offset + j * n + i] = count ? Math.round(sum / count) : 255;
            }
        }
    }

    function renderGlyph(char, family, fontPx, boxPx) {
        const surface = glyphSurface(boxPx);
        const ctx = surface.ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, boxPx, boxPx);
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${fontPx}px "${family}"`;
        ctx.fillText(char, boxPx / 2, boxPx * 0.76);
        const image = ctx.getImageData(0, 0, boxPx, boxPx);
        const box = inkBox(image.data, boxPx, 0, 0, boxPx, boxPx);
        if (!box) return null;
        const n = fontPx >= GLYPH.fineFont ? GLYPH.fine : GLYPH.coarse;
        const gray = new Uint8Array(n * n);
        sampleGray(gray, 0, image.data, boxPx, box, n);
        return { gray, n, aspect: box.w / box.h };
    }

    function glyphDistance(a, b) {
        const length = Math.min(a.length, b.length);
        let sum = 0;
        for (let i = 0; i < length; i++) {
            const delta = a[i] - b[i];
            sum += delta * delta;
        }
        return sum / (Math.max(1, length) * 65025);
    }

    function collectFontFaces() {
        const faces = [];
        const seen = new Set();
        const push = (family, src) => {
            const name = String(family || '').replace(/["']/g, '').trim();
            const urls = (String(src || '').match(/url\(([^)]+)\)/g) || [])
                .map((item) => item.replace(/^url\(/, '').replace(/\)$/, '').replace(/^["']|["']$/g, '').trim())
                .filter(Boolean);
            for (const url of urls.slice(0, 1)) {
                const key = `${name}|${url.slice(0, 96)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                faces.push({ family: name, url, secret: /cxsecret/i.test(name) || /cxsecret/i.test(url) });
            }
        };
        for (const doc of courseDocuments()) {
            try {
                for (const sheet of Array.from(doc.styleSheets || [])) {
                    let rules = null;
                    try { rules = sheet.cssRules; } catch (error) { rules = null; }
                    for (const rule of Array.from(rules || [])) {
                        const text = String(rule.cssText || '');
                        if (!/@font-face/i.test(text)) continue;
                        push(/font-family\s*:\s*([^;}]+)/i.exec(text)?.[1], /src\s*:\s*([^;}]+)/i.exec(text)?.[1]);
                    }
                }
            } catch (error) { /* 跨域样式表忽略 */ }
            try {
                for (const style of Array.from(doc.querySelectorAll('style'))) {
                    const text = style.textContent || '';
                    if (!/@font-face/i.test(text)) continue;
                    for (const block of text.match(/@font-face\s*{[^}]*}/g) || []) {
                        push(/font-family\s*:\s*([^;}]+)/i.exec(block)?.[1], /src\s*:\s*([^;}]+)/i.exec(block)?.[1]);
                    }
                }
            } catch (error) { /* 忽略 */ }
        }
        return faces;
    }

    function gmBinary(url, timeout = 30000) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error('缺少 GM_xmlhttpRequest')); return; }
            let settled = false;
            const done = (error, value) => {
                if (settled) return;
                settled = true;
                if (error) reject(error); else resolve(value);
            };
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'arraybuffer',
                    timeout,
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300 && response.response) done(null, response.response);
                        else done(new Error(`HTTP ${response.status}`));
                    },
                    onerror: () => done(new Error('网络请求失败')),
                    ontimeout: () => done(new Error('下载超时')),
                });
            } catch (error) { done(error); }
        });
    }

    async function fetchBinary(url) {
        const value = String(url || '');
        if (value.startsWith('data:')) {
            const match = /^data:[^,]*;base64,(.*)$/s.exec(value);
            if (!match) throw new Error('字体数据不是 base64');
            const binary = atob(match[1]);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
            return bytes.buffer;
        }
        try {
            return await gmBinary(value);
        } catch (error) { /* 退回 fetch */ }
        const response = await fetch(value, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.arrayBuffer();
    }

    async function registerFontFace(family, buffer) {
        if (typeof FontFace !== 'function') throw new Error('浏览器不支持 FontFace');
        const face = new FontFace(family, buffer.slice(0));
        await face.load();
        document.fonts.add(face);
        try { await document.fonts.load(`40px "${family}"`); } catch (error) { /* 忽略 */ }
        return face;
    }

    async function loadReferenceBuffer() {
        if (glyphState.refBuffer) return glyphState.refBuffer;
        if (glyphState.refLoading) return glyphState.refLoading;
        glyphState.refLoading = (async () => {
            let cache = null;
            try { cache = await caches.open(GLYPH.bucket); } catch (error) { cache = null; }
            if (cache) {
                try {
                    const hit = await cache.match(GLYPH.refUrls[0]);
                    if (hit) {
                        const buffer = await hit.arrayBuffer();
                        if (buffer && buffer.byteLength > 1000000) {
                            log('info', '参考字体已从本机缓存读取');
                            glyphState.refBuffer = buffer;
                            return buffer;
                        }
                    }
                } catch (error) { /* 忽略 */ }
            }
            for (const url of GLYPH.refUrls) {
                try {
                    log('info', `正在下载参考字体（约 8MB，只需一次）：${String(url).split('/')[2]}`);
                    setActivity('正在下载参考字体…');
                    const buffer = await fetchBinary(url);
                    if (!buffer || buffer.byteLength < 1000000) continue;
                    if (cache) cache.put(GLYPH.refUrls[0], new Response(buffer.slice(0))).catch(() => {});
                    glyphState.refBuffer = buffer;
                    return buffer;
                } catch (error) {
                    log('warn', `参考字体下载失败：${error.message || error}`);
                }
            }
            return null;
        })();
        try {
            return await glyphState.refLoading;
        } finally {
            glyphState.refLoading = null;
        }
    }

    async function buildGlyphIndex() {
        if (glyphState.index) return glyphState.index;
        if (glyphState.building) return glyphState.building;
        glyphState.building = (async () => {
            const buffer = glyphState.refBuffer;
            if (!buffer) throw new Error('参考字体未就绪');
            const bytes = new Uint8Array(buffer);
            const signature = fontTag(bytes, 0);
            let tables = null;
            if (signature === 'wOFF') tables = await readWoffTables(bytes);
            else if (signature === 'wOF2') throw new Error('参考字体是 WOFF2');
            else tables = readSfntTables(bytes);
            const cmap = parseCmapTable(tables && tables.get('cmap'));
            if (!cmap || !cmap.size) throw new Error('参考字体没有 cmap');
            const codes = [];
            for (const code of cmap.keys()) {
                if (code >= 0x4e00 && code <= 0x9fff) codes.push(code);
            }
            codes.sort((a, b) => a - b);
            if (codes.length < 500) throw new Error(`参考字形太少（${codes.length}）`);
            const total = codes.length;
            const dim = GLYPH.coarse * GLYPH.coarse;
            const index = {
                total,
                codes: Uint32Array.from(codes),
                chars: codes.map((code) => String.fromCodePoint(code)),
                gray: new Uint8Array(total * dim),
                aspect: new Float32Array(total),
                usable: new Uint8Array(total),
                position: new Map(),
            };
            for (let i = 0; i < total; i++) index.position.set(codes[i], i);
            const perAtlas = GLYPH.grid * GLYPH.grid;
            const board = GLYPH.grid * GLYPH.cell;
            const canvas = document.createElement('canvas');
            canvas.width = board;
            canvas.height = board;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            for (let start = 0; start < total; start += perAtlas) {
                const end = Math.min(total, start + perAtlas);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, board, board);
                ctx.fillStyle = '#000000';
                ctx.font = `${GLYPH.coarseFont}px "${GLYPH.refFamily}"`;
                for (let i = start; i < end; i++) {
                    const slot = i - start;
                    const col = slot % GLYPH.grid;
                    const row = Math.floor(slot / GLYPH.grid);
                    ctx.fillText(index.chars[i], col * GLYPH.cell + GLYPH.cell / 2, row * GLYPH.cell + GLYPH.cell * 0.78);
                }
                const image = ctx.getImageData(0, 0, board, board);
                for (let i = start; i < end; i++) {
                    const slot = i - start;
                    const col = slot % GLYPH.grid;
                    const row = Math.floor(slot / GLYPH.grid);
                    const box = inkBox(image.data, board, col * GLYPH.cell, row * GLYPH.cell, GLYPH.cell, GLYPH.cell);
                    if (!box) continue;
                    index.usable[i] = 1;
                    index.aspect[i] = box.w / box.h;
                    sampleGray(index.gray, i * dim, image.data, board, box, GLYPH.coarse);
                }
                setActivity(`正在建立字形索引 ${end} / ${total}`);
                await sleep(0);
            }
            glyphState.index = index;
            log('success', `字形索引就绪：${total} 个参考字形`);
            return index;
        })();
        try {
            return await glyphState.building;
        } finally {
            glyphState.building = null;
        }
    }

    function matchGlyph(char) {
        const index = glyphState.index;
        if (!index) return null;
        const query = renderGlyph(char, GLYPH.secretFamily, GLYPH.coarseFont, 120);
        if (!query) return null;
        const dim = GLYPH.coarse * GLYPH.coarse;
        const tolerance = Math.max(0.35, query.aspect * 0.35);
        const shortlist = [];
        for (let i = 0; i < index.total; i++) {
            if (!index.usable[i]) continue;
            if (Math.abs(index.aspect[i] - query.aspect) > tolerance) continue;
            const base = i * dim;
            let sum = 0;
            for (let k = 0; k < dim; k++) {
                const delta = query.gray[k] - index.gray[base + k];
                sum += delta * delta;
            }
            if (shortlist.length < GLYPH.topK || sum < shortlist[shortlist.length - 1].score) {
                shortlist.push({ i, score: sum });
                shortlist.sort((a, b) => a.score - b.score);
                if (shortlist.length > GLYPH.topK) shortlist.pop();
            }
        }
        if (!shortlist.length) return null;
        const shortList = shortlist;
        const fine = renderGlyph(char, GLYPH.secretFamily, GLYPH.fineFont, 240);
        if (!fine) return null;
        let best = null;
        let second = null;
        for (const item of shortList) {
            const ref = renderGlyph(index.chars[item.i], GLYPH.refFamily, GLYPH.fineFont, 240);
            if (!ref) continue;
            const score = glyphDistance(fine.gray, ref.gray);
            if (!best || score < best.score) {
                second = best;
                best = { index: item.i, score };
            } else if (!second || score < second.score) {
                second = { index: item.i, score };
            }
        }
        if (!best) return null;
        let selfScore = Infinity;
        const selfPosition = index.position.get(char.codePointAt(0));
        if (selfPosition !== undefined) {
            const ref = renderGlyph(char, GLYPH.refFamily, GLYPH.fineFont, 240);
            if (ref) selfScore = glyphDistance(fine.gray, ref.gray);
        }
        const improved = best.score < selfScore * 0.72;
        const margin = !second || second.score > best.score * 1.15;
        return {
            char: index.chars[best.index],
            score: best.score,
            selfScore,
            confident: improved && margin && best.score < 0.02,
        };
    }

    function hashBuffer(bytes) {
        let hash = 5381;
        for (let index = 0; index < bytes.length; index++) hash = ((hash << 5) + hash + bytes[index]) >>> 0;
        return hash.toString(16);
    }

    function loadGlyphMap(key) {
        const map = new Map();
        const saved = storage.get(key, null);
        if (saved && typeof saved === 'object') {
            for (const [from, to] of Object.entries(saved)) {
                if (typeof from === 'string' && from.length === 1 && typeof to === 'string' && to.length === 1) map.set(from, to);
            }
        }
        return map;
    }

    function saveGlyphMap(key, map) {
        try {
            const plain = {};
            for (const [from, to] of map) plain[from] = to;
            storage.set(key, plain);
        } catch (error) { /* 忽略 */ }
    }

    async function ensureGlyphDecoder(sampleText) {
        if (glyphState.decoder) return glyphState.decoder;
        if (glyphState.tried) return null;
        if (typeof document.fonts === 'undefined' || typeof FontFace !== 'function') return null;
        const faces = collectFontFaces();
        const secret = faces.find((face) => face.secret);
        if (!secret) {
            if (!glyphState.missingLogged) {
                glyphState.missingLogged = true;
                log('info', '页面没有发现替换字体（font-cxsecret），跳过字形还原');
            }
            return null;
        }
        glyphState.tried = true;
        log('info', `发现替换字体${secret.family ? `：${secret.family}` : ''}，开始字形还原（首次需下载参考字体）`);
        const secretBuffer = await fetchBinary(secret.url);
        if (!secretBuffer) throw new Error('替换字体读取失败');
        const secretBytes = new Uint8Array(secretBuffer);
        const secretTag = fontTag(secretBytes, 0);
        let secretTables = null;
        if (secretTag === 'wOFF') secretTables = await readWoffTables(secretBytes);
        else if (secretTag === 'wOF2') throw new Error('替换字体是 WOFF2，浏览器内解析不了');
        else secretTables = readSfntTables(secretBytes);
        const secretCmap = parseCmapTable(secretTables && secretTables.get('cmap'));
        if (!secretCmap || !secretCmap.size) throw new Error('替换字体没有 cmap');
        const chars = Array.from(new Set(Array.from(String(sampleText || '')).filter((char) => {
            const code = char.codePointAt(0);
            return secretCmap.has(code) && code >= 0x3400 && code <= 0x9fff;
        })));
        if (!chars.length) throw new Error('页面文字里没有替换字');
        const mapKey = `${GLYPH.mapKey}:${hashBuffer(secretBytes)}`;
        const cached = loadGlyphMap(mapKey);
        const map = new Map();
        let replaced = 0;
        let uncertain = 0;
        const pending = [];
        for (const char of chars) {
            if (cached.has(char)) {
                map.set(char, cached.get(char));
                if (cached.get(char) !== char) replaced++;
            } else {
                pending.push(char);
            }
        }
        const scores = [];
        if (pending.length) {
            await registerFontFace(GLYPH.secretFamily, secretBuffer);
            const refBuffer = await loadReferenceBuffer();
            if (!refBuffer) throw new Error('参考字体不可用（需要联网下载一次）');
            await registerFontFace(GLYPH.refFamily, refBuffer);
            await buildGlyphIndex();
            for (let position = 0; position < pending.length; position++) {
                const char = pending[position];
                let result = null;
                try {
                    result = matchGlyph(char);
                } catch (error) {
                    result = null;
                }
                if (result && result.confident) {
                    scores.push(result.score);
                    map.set(char, result.char);
                    if (result.char !== char) {
                        cached.set(char, result.char);
                        replaced++;
                    }
                } else {
                    map.set(char, char);
                    uncertain++;
                }
                if (position % 20 === 0) {
                    setActivity(`正在还原字形 ${position} / ${pending.length}`);
                    await sleep(0);
                }
            }
            scores.sort((a, b) => a - b);
            const median = scores.length ? scores[Math.floor(scores.length / 2)] : 0;
            if (median > 0.008) {
                throw new Error(`参考字形和页面字形对不上（中位差 ${median.toFixed(4)}）`);
            }
            saveGlyphMap(mapKey, cached);
        } else {
            log('info', '这张卷子的替换字体和上次一致，直接用缓存映射');
        }
        const decoder = {
            mode: 'glyph',
            size: map.size,
            replaced,
            decode(text) {
                let out = '';
                for (const char of String(text || '')) {
                    const next = map.get(char);
                    out += next === undefined ? char : next;
                }
                return out;
            },
        };
        glyphState.decoder = decoder;
        const pairs = [];
        for (const [from, to] of map) {
            if (from !== to && pairs.length < 8) pairs.push(`${from}→${to}`);
        }
        log('success', `字形还原：待查 ${map.size} 个字，替换 ${replaced} 个${uncertain ? `，${uncertain} 个没把握保留原文` : ''}`);
        if (pairs.length) log('info', `还原示例：${pairs.join('、')}`);
        return decoder;
    }

    // Verified against the supplied 31,944-byte font and all 147 rendered glyphs.
    // Exact SHA-256 binding: this mapping is never reused for another font.
    const VERIFIED_FONT_SHA256 = '332aca9de4681e089f03f07e715a5324be05ddd6f6be0c8317036af24551fa49';
    const VERIFIED_FONT_MAP = Object.freeze({"坲":"解","坳":"靠","坴":"展","坶":"健","坸":"要","坹":"方","坺":"破","坻":"小","坼":"全","坽":"面","坾":"建","坿":"成","垀":"康","垁":"会","垇":"治","垈":"法","垉":"依","垊":"严","垌":"从","垍":"更","垎":"加","垏":"现","垐":"代","垑":"理","垓":"系","垔":"家","垕":"华","垖":"有","垗":"度","垘":"根","垙":"主","垚":"社","垛":"义","垜":"中","垝":"国","垞":"特","垟":"色","垤":"马","垥":"克","垨":"思","垪":"泽","垫":"东","垬":"制","垮":"立","垯":"完","垰":"体","垱":"和","垳":"与","垵":"创","垶":"增","垷":"速","垸":"发","垹":"经","垺":"能","垻":"行","垼":"执","垽":"力","垾":"出","垿":"正","埀":"祉","埁":"福","埂":"平","埃":"公","埄":"产","埅":"步","埆":"进","埇":"放","埈":"强","埉":"一","埊":"善","埋":"之","埌":"是","埍":"大","埏":"得","埐":"取","埑":"把","埒":"济","埓":"作","埕":"基","埖":"的","埗":"命","埛":"目","埞":"荣","域":"着","埠":"带","埡":"提","埣":"重","埤":"点","埥":"设","埦":"去","埧":"坚","埨":"持","埩":"走","埪":"为","埫":"来","埬":"外","埭":"陆","埮":"互","埰":"西","埱":"双","埲":"内","埳":"联","埴":"球","埵":"前","埶":"反","埸":"护","埻":"实","埼":"合","埽":"赢","埾":"边","埿":"单","堀":"其","堁":"倡","堃":"导","堄":"商","堅":"享","堇":"十","堈":"政","堉":"府","堊":"毛","堋":"用","堌":"源","堍":"配","堎":"市","堏":"机","堐":"高","堑":"科","堒":"水","堓":"领","堔":"当","堖":"谐","堗":"位","堝":"革","塏":"民","塒":"本","塤":"党","墊":"开","壚":"深","壟":"化","峸":"所","憜":"排","掊":"保","柆":"改","樭":"共","碓":"在","秇":"对","逋":"线"});

    async function verifiedDiagnosticFontDecoder(questions) {
        const docs = [...new Set(questions.map(q => q.doc || q.card?.ownerDocument).filter(Boolean))];
        if (docs.length !== 1) return null;
        const doc = docs[0];
        const sources = new Set();
        const collect = (family, src) => {
            if (!/cxsecret/i.test(String(family || ''))) return;
            for (const match of String(src || '').matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
                const url = (match[1] ?? match[2] ?? match[3] ?? '').trim();
                if (url.startsWith('data:')) sources.add(url);
            }
        };
        for (const sheet of Array.from(doc.styleSheets || [])) {
            let rules;
            try { rules = sheet.cssRules; } catch (_) { continue; }
            for (const rule of Array.from(rules || [])) {
                if (rule.type === 5) collect(rule.style.getPropertyValue('font-family'), rule.style.getPropertyValue('src'));
            }
        }
        // Preserve semicolons inside Base64 data URLs when CSSOM is unavailable.
        for (const style of doc.querySelectorAll('style')) {
            for (const block of (style.textContent || '').match(/@font-face\s*{[^}]*}/gi) || []) {
                collect(/font-family\s*:\s*([^;}]+)/i.exec(block)?.[1], block);
            }
        }
        if (sources.size !== 1) return null;
        const dataUrl = [...sources][0];
        const comma = dataUrl.indexOf(',');
        if (comma < 0 || !/;base64\s*$/i.test(dataUrl.slice(0, comma))) return null;
        const binary = atob(dataUrl.slice(comma + 1).replace(/\s/g, ''));
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        if (bytes.length !== 31944 || !globalThis.crypto?.subtle) return null;
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
        if (hash !== VERIFIED_FONT_SHA256) return null;
        log('success', '当前字体指纹吻合：启用已逐字核对的 147 字映射，无需下载参考字体');
        return {
            mode: 'verified-font', size: Object.keys(VERIFIED_FONT_MAP).length,
            decode(text) { return Array.from(String(text || ''), c => VERIFIED_FONT_MAP[c] ?? c).join(''); },
        };
    }

    async function buildTextDecoder(questions) {
        try {
            const verified = await verifiedDiagnosticFontDecoder(questions);
            if (verified) return verified;
        } catch (error) { log('warn', `已核对字体映射检查失败：${error.message || error}`); }

        const sample = questions
            .map((question) => [question.title, ...question.options.map((option) => option.text)].join(' '))
            .join(' ');
        try {
            const glyph = await ensureGlyphDecoder(sample);
            if (glyph) return glyph;
        } catch (error) {
            log('warn', `字形还原未完成：${error.message || error}`);
        }
        try {
            const first = questions[0];
            return await ensureFontDecoder(sample, first && first.card);
        } catch (error) {
            log('warn', `字体解码失败：${error.message || error}`);
            return null;
        }
    }

    /* ------------------------------------------------------------ 网络请求 */

    function gmRequest(options) {
        return new Promise((resolve, reject) => {
            let request;
            let timer;
            let settled = false;
            const controller = new AbortController();
            const finish = (error, response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                options.signal?.removeEventListener('abort', abort);
                if (error) reject(error); else resolve(response);
            };
            const abort = () => {
                finish(new Error('脚本已停止，请求已取消'));
                try { request?.abort(); } catch (_) { /* 部分油猴版本不提供 abort */ }
                controller.abort();
            };
            if (options.signal?.aborted) { abort(); return; }
            options.signal?.addEventListener('abort', abort, { once: true });
            const timeout = options.timeout || 180000;
            timer = setTimeout(() => {
                finish(new Error('请求超时，已停止；不会自动重复请求'));
                try { request?.abort(); } catch (_) { /* 忽略 */ }
                controller.abort();
            }, timeout);
            const details = {
                method: options.method || 'GET', url: options.url,
                headers: options.headers || {}, data: options.data, timeout,
                onload: response => finish(null, { status: response.status, responseText: response.responseText || '' }),
                onerror: () => finish(new Error('网络请求失败，请检查网络或代理设置')),
                ontimeout: () => finish(new Error('请求超时，已停止；不会自动重复请求')),
                onabort: () => finish(new Error('请求已取消')),
            };
            try {
                if (typeof GM_xmlhttpRequest === 'function') request = GM_xmlhttpRequest(details);
                else fetch(details.url, { method: details.method, headers: details.headers, body: details.data, signal: controller.signal })
                    .then(async response => finish(null, { status: response.status, responseText: await response.text() }))
                    .catch(error => finish(new Error(error.name === 'AbortError' ? '请求已取消' : '网络请求失败')));
            } catch (error) { finish(error); }
        });
    }

    async function requestAnswers(questions, hint = '', signal) {
        if (signal?.aborted) throw new Error('脚本已停止');
        const apiKey = currentApiKey();
        if (!apiKey) throw new Error('未填写 DeepSeek API Key，请在面板顶部保存后再开始答题');
        const body = buildRequestBody(questions, hint);
        let lastProblem = '';
        for (let attempt = 1; attempt <= 1; attempt++) {
            setActivity(attempt === 1 ? '正在请求 DeepSeek…' : '正在重试 DeepSeek…');
            const response = await gmRequest({
                method: 'POST',
                url: API_URL,
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                data: JSON.stringify(body),
                timeout: 180000,
                signal,
            });
            if (signal?.aborted) throw new Error('脚本已停止');
            if (response.status < 200 || response.status >= 300) throw new Error(describeHttpError(response));

            let data;
            try {
                data = JSON.parse(response.responseText || 'null');
            } catch (error) {
                lastProblem = 'DeepSeek 返回内容无法解析';
                data = null;
            }
            const choice = data?.choices?.[0];
            const reason = choice?.finish_reason;
            if (data && reason === 'length') {
                lastProblem = `输出达到长度上限（已生成 ${data.usage?.completion_tokens ?? '未知'} tokens）`;
            } else if (data && reason !== 'stop') {
                throw new Error(`DeepSeek 未正常结束（finish_reason=${reason ?? '缺失'}）`);
            } else if (data) {
                try {
                    return parseAnswerPayload(choice.message?.content || '', questions.length);
                } catch (error) {
                    lastProblem = error.message;
                }
            }
            log('warn', `${lastProblem}，已停止自动付费重试`);
        }
        throw new Error(`${lastProblem}；未获得完整答案，未选择或提交题目；请检查后手动决定是否重试`);
    }

    async function askAnswers(questions, signal) {
        const rawAnswers = [];
        const batchSize = 5;
        for (let offset = 0; offset < questions.length; offset += batchSize) {
            if (signal?.aborted) throw new Error('脚本已停止');
            const batch = questions.slice(offset, offset + batchSize);
            log('info', `请求第 ${offset + 1}–${offset + batch.length} 题 / 共 ${questions.length} 题；每组只请求一次`);
            const part = await requestAnswers(batch, '', signal);
            validateAnswers(batch, part);
            rawAnswers.push(...part.map(item => ({ ...item, id: item.id + offset })));
        }
        return { answers: validateAnswers(questions, rawAnswers), rawAnswers };
    }

    /* ---------------------------------------------------------- 页面自动化 */

    const $ = (...args) => {
        const jquery = getJQuery();
        if (!jquery) throw new Error('页面尚未加载 jQuery');
        return jquery(...args);
    };
    const kindPattern = /[\[【〖（(](单选题|多选题|判断题)[\]】〗）)]/;

    function visible(element) {
        return Boolean(
            element &&
            element.isConnected &&
            element.getClientRects().length &&
            element.ownerDocument.defaultView.getComputedStyle(element).visibility !== 'hidden'
        );
    }

    function pseudoText(element, pseudo) {
        try {
            const content = getComputedStyle(element, pseudo).content;
            if (!content || content === 'none' || content === 'normal') return '';
            const match = /^(["'])([\s\S]*)\1$/.exec(content);
            return clean(match ? match[2] : content);
        } catch (error) {
            return '';
        }
    }

    function courseDocuments() {
        const result = [];
        const visit = (doc, depth) => {
            if (!doc || depth > 3 || result.includes(doc)) return;
            result.push(doc);
            for (const frame of doc.querySelectorAll('iframe')) {
                if (!visible(frame)) continue;
                try {
                    visit(frame.contentDocument, depth + 1);
                } catch (error) {
                    /* 跨域框架忽略 */
                }
            }
        };
        visit(document, 0);
        return result;
    }

    function deepDocuments() {
        const result = [];
        const visit = (root, depth) => {
            if (!root || depth > 6 || result.includes(root)) return;
            if (root.host && root.host.id === 'xt-ds-host') return;
            result.push(root);
            let elements = [];
            try {
                elements = Array.from(root.querySelectorAll('*'));
            } catch (error) {
                return;
            }
            for (const element of elements) {
                if (element.id === 'xt-ds-host') continue;
                if (element.shadowRoot) visit(element.shadowRoot, depth + 1);
            }
            for (const frame of root.querySelectorAll('iframe')) {
                try {
                    visit(frame.contentDocument, depth + 1);
                } catch (error) {
                    /* 跨域框架忽略 */
                }
            }
        };
        visit(document, 0);
        return result;
    }

    function quizCompleted() {
        const scoreShown = courseDocuments().some((doc) => {
            const text = clean(doc.body?.innerText);
            const hasGrade = /本次成绩\s*\d+(?:\.\d+)?\s*分/.test(text);
            return hasGrade && (/章节测验\s*已完成/.test(text) || /我的答案\s*[:：]/.test(text));
        });
        if (scoreShown) return true;
        return false;
    }

    function optionElements(card) {
        const labels = Array.from(card.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
            .filter((element) => /^[A-H]$/.test(clean(element.textContent)) &&
                !Array.from(element.children).some((child) => /^[A-H]$/.test(clean(child.textContent))));
        const found = new Map();
        for (const label of labels) {
            const letter = clean(label.textContent);
            if (found.has(letter)) continue;
            let target = label;
            for (let step = 0; step < 5; step++) {
                const parent = target.parentElement;
                if (!parent || parent === card) break;
                const otherLetters = Array.from(parent.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
                    .filter((element) => /^[A-H]$/.test(clean(element.textContent)) && element !== label);
                if (otherLetters.some((element) => !element.contains(label) && !label.contains(element))) break;
                target = parent;
                if (clean(target.innerText).length > 1) break;
            }
            const action = label.closest(OPTION_ACTION_SELECTOR);
            if (action && card.contains(action) && optionLettersUnder(action).size === 1 && clean(action.innerText).replace(new RegExp(`^${letter}[.、．]?\\s*`), '')) target = action;
            const text = clean(target.innerText).replace(new RegExp(`^${letter}[.、．]?\\s*`), '');
            if (text) found.set(letter, { letter, text, element: target });
        }
        return Array.from(found.values()).sort((a, b) => a.letter.localeCompare(b.letter));
    }

    function extractQuestions(deep = false) {
        const questions = [];
        for (const doc of (deep ? deepDocuments() : courseDocuments())) {
            const body = doc.body || doc;
            if (!body) continue;
            const walker = typeof doc.createTreeWalker === 'function'
                ? doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
                : document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
            const seenCards = new Set();
            let node;
            while ((node = walker.nextNode())) {
                const nodeText = clean(node.textContent);
                const kind = nodeText.match(kindPattern)?.[1] ||
                    (/^(单选题|多选题|判断题)(?:\s*[（(].*)?$/.test(nodeText) ? nodeText.match(/^(单选题|多选题|判断题)/)[1] : '');
                if (!kind || !visible(node.parentElement)) continue;
                let card = node.parentElement;
                let options = [];
                for (let depth = 0; card && depth < 9; depth++, card = card.parentElement) {
                    const cardText = clean(card.innerText);
                    const kinds = cardText.match(new RegExp(kindPattern.source, 'g')) || [];
                    if (kinds.length > 1) break;
                    options = optionElements(card);
                    if (options.length >= 2 && options.length <= 8) break;
                }
                if (!card || options.length < 2 || options.length > 8 || seenCards.has(card)) continue;
                seenCards.add(card);
                const full = card.innerText || '';
                const firstOption = full.search(/(?:^|\n)\s*A\s*(?:[.、．]|\S)/);
                const title = clean(firstOption >= 0 ? full.slice(0, firstOption) :
                    (node.parentElement.innerText || full))
                    .replace(/^\d+\s*/, '')
                    .replace(/^(单选题|多选题|判断题)\s*/, '')
                    .replace(kindPattern, '').trim();
                if (!title || title.length > 500 || options.some((option) => !option.text || option.text.length > 500)) continue;
                let finalTitle = title;
                const theme = commonOptionSuffix(options);
                if (theme && !title.includes(theme)) {
                    const alternatives = [
                        pseudoText(card, '::before'),
                        pseudoText(card, '::after'),
                        card.getAttribute('title'),
                        card.getAttribute('aria-label'),
                        card.getAttribute('data-title'),
                    ].map(clean).filter((value) => value && value.includes(theme));
                    if (alternatives.length) finalTitle = alternatives.sort((a, b) => b.length - a.length)[0];
                }
                questions.push({ kind, title: finalTitle, options, card, doc });
            }
        }
        return questions;
    }

    function findButton(doc, label) {
        const candidates = Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"],div,span'))
            .filter((element) => visible(element) && clean(element.value || element.innerText) === label);
        return candidates.find((element) => /^(BUTTON|A|INPUT)$/.test(element.tagName)) ||
            candidates.find((element) => !Array.from(element.children).some((child) => clean(child.innerText) === label)) || null;
    }

    function findButtonContaining(doc, label) {
        const match = (element) => visible(element) && clean(element.value || element.innerText).includes(label);
        const primary = Array.from(doc.querySelectorAll('button,a,input[type="button"],input[type="submit"],[role="button"]')).filter(match);
        if (primary.length) return primary.find((element) => /^(BUTTON|A|INPUT)$/.test(element.tagName)) || primary[0];
        const styled = Array.from(doc.querySelectorAll('[class*="btn"],[class*="button"],[class*="submit"]')).filter(match);
        if (styled.length) return styled[0];
        const clickable = Array.from(doc.querySelectorAll('div,span'))
            .filter((element) => match(element) && (element.onclick || getComputedStyle(element).cursor === 'pointer'));
        return clickable[0] || null;
    }

    // v1.3.3：把“合成点击”做全——先滚到可视区、再按真实鼠标顺序发 pointer/mouse 事件。
    // 实测超星有些节点（目录里的父行、页脚“下一节”）只认带坐标的 pointerdown/pointerup，
    // 只发 mousedown+mouseup+click 时页面毫无反应，于是出现“切换下一节未完成”。
    function clickElement(element) {
        if (!element) return;
        let point = { x: 0, y: 0 };
        try {
            element.scrollIntoView({ block: 'center', inline: 'center' });
            const rect = element.getBoundingClientRect();
            point = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        } catch (error) { /* 忽略 */ }
        const base = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: point.x,
            clientY: point.y,
            screenX: point.x,
            screenY: point.y,
            button: 0,
            buttons: 1,
        };
        const fire = (Ctor, type, extra) => {
            try { element.dispatchEvent(new Ctor(type, Object.assign({}, base, extra || {}))); } catch (error) { /* 忽略 */ }
        };
        try {
            fire(MouseEvent, 'mouseover');
            fire(MouseEvent, 'mousemove');
            if (typeof PointerEvent === 'function') {
                fire(PointerEvent, 'pointerover', { pointerType: 'mouse', isPrimary: true, pointerId: 1 });
                fire(PointerEvent, 'pointerenter', { pointerType: 'mouse', isPrimary: true, pointerId: 1, bubbles: false });
                fire(PointerEvent, 'pointerdown', { pointerType: 'mouse', isPrimary: true, pointerId: 1 });
            }
            fire(MouseEvent, 'mousedown');
            try { element.focus({ preventScroll: true }); } catch (error) { /* 忽略 */ }
            if (typeof PointerEvent === 'function') {
                fire(PointerEvent, 'pointerup', { pointerType: 'mouse', isPrimary: true, pointerId: 1, buttons: 0 });
            }
            fire(MouseEvent, 'mouseup', { buttons: 0 });
        } catch (error) { /* 忽略 */ }
        try {
            element.click();
        } catch (error) {
            /* 忽略 */
        }
    }

    const CATALOGUE_ROW_SELECTOR = '.posCatalog_select:not(.firstLayer)';
    const COMPLETED_MARK_SELECTOR = '.icon_Completed,[data-status="completed"],[data-status="finished"],[aria-label="已完成"],[title="已完成"]';

    function catalogueEntries() {
        const tree = document.querySelector('#coursetree');
        if (!tree) return [];
        const rows = Array.from(tree.querySelectorAll(CATALOGUE_ROW_SELECTOR));
        return rows.map((row, index) => {
            const label = row.querySelector('.posCatalog_name');
            const title = clean(label?.getAttribute('title') || label?.textContent || row.getAttribute('title'));
            const code = clean(row.textContent).match(/^(\d+(?:\.\d+)+)(?=\s|[、.．]|$)/)?.[1] || '';
            const nextCode = clean(rows[index + 1]?.textContent).match(/^(\d+(?:\.\d+)+)(?=\s|[、.．]|$)/)?.[1] || '';
            const isLeaf = !row.querySelector(CATALOGUE_ROW_SELECTOR) && !(code && nextCode.startsWith(code + '.'));
            const id = ['id', 'data-id', 'knowledgeid', 'data-knowledgeid', 'data-chapterid'].map(name => row.getAttribute(name) || '').join(':');
            const key = `${index}:${id}:${title}`;
            const markers = [row, ...row.querySelectorAll(COMPLETED_MARK_SELECTOR)];
            const completed = markers.some(marker => marker.matches(COMPLETED_MARK_SELECTOR) &&
                marker.closest(CATALOGUE_ROW_SELECTOR) === row && safeVisible(marker));
            return { row, label, title, key, isLeaf, completed };
        });
    }

    function activeCatalogueEntry(entries = catalogueEntries()) {
        const activeRows = new Set(Array.from(document.querySelectorAll('#coursetree .posCatalog_active'))
            .map(active => active.closest(CATALOGUE_ROW_SELECTOR)).filter(Boolean));
        const selected = entries.filter(entry => activeRows.has(entry.row));
        // 嵌套目录允许祖先和子节点同时标为 active；不同分支同时 active 时不猜测。
        const deepest = selected.filter(entry => !selected.some(other => other !== entry && entry.row.contains(other.row)));
        return deepest.length === 1 ? deepest[0] : null;
    }

    function currentActiveCell() {
        return activeCatalogueEntry()?.key || '';
    }

    function completedCatalogueCourseware(type = currentLearningStep()) {
        // 章节测验仍由提交流程负责跳节；其余（视频/音频/课件/文档/阅读）一律以右侧对号为准。
        if (type === '章节测验') return null;
        const entries = catalogueEntries();
        const current = activeCatalogueEntry(entries);
        if (!current?.isLeaf || !current.completed || !safeVisible(current.row)) return null;
        if (/测验|测试|考试/.test(current.title)) return null;
        if (!type && !current.title) return null;
        // 下一节取目录里的“下一行”，不再猜“下一个叶子”：这套课程的目录会把 5.2 挂在 5.1 下面，
        // 按叶子猜会把 5.1（其实是视频）当成父目录跳过去，造成漏课。
        const next = entries[entries.indexOf(current) + 1] || null;
        return { ...current, next };
    }

    // 日志用：把目录的当前行、对号状态、下一节打出来，方便判断是“真没对号”还是“读不到目录”。
    // v1.3.6：从目录行里挖“知识 ID”。有的小节对合成点击完全不买账，
    // 但只要拿到 ID 就能直接按 studentstudy 地址跳过去，比点按钮可靠得多。
    function catalogueKnowledgeId(entry) {
        const row = entry && entry.row;
        if (!row) return '';
        const names = ['knowledgeid', 'knowledgeId', 'data-knowledgeid', 'data-knowledgeId', 'chapterid', 'chapterId', 'data-chapterid', 'data-chapterId'];
        for (const name of names) {
            const value = row.getAttribute(name);
            if (value && /^\d{3,}$/.test(String(value).trim())) return String(value).trim();
        }
        const sources = [row.id || '', row.getAttribute('data-url') || '', row.getAttribute('onclick') || '', row.getAttribute('href') || ''];
        if (entry.label) sources.push(entry.label.getAttribute('href') || '', entry.label.getAttribute('onclick') || '');
        for (const text of sources) {
            if (!text) continue;
            const direct = /(?:chapterid|knowledgeid|chapterId|knowledgeId)["'=:\s]+(\d{3,})/i.exec(text);
            if (direct) return direct[1];
            const call = /(?:toOld|toNew|openChapter|toChapter)\s*\(([^)]*)\)/i.exec(text);
            if (call) {
                const ids = String(call[1] || '').match(/\d{3,}/g);
                if (ids && ids.length) return ids[0];
            }
        }
        return '';
    }

    function navigateToCatalogueEntry(entry) {
        const knowledgeId = catalogueKnowledgeId(entry);
        if (!knowledgeId) return false;
        const params = new URLSearchParams(location.search);
        const courseId = params.get('courseId') || params.get('courseid') || '';
        const clazzId = params.get('clazzid') || params.get('clazzId') || '';
        if (!courseId || !clazzId) return false;
        const cpi = params.get('cpi') || '';
        const enc = params.get('enc') || '';
        const url = `${location.origin}/mycourse/studentstudy?chapterId=${encodeURIComponent(knowledgeId)}` +
            `&courseId=${encodeURIComponent(courseId)}&clazzid=${encodeURIComponent(clazzId)}` +
            (cpi ? `&cpi=${encodeURIComponent(cpi)}` : '') + (enc ? `&enc=${encodeURIComponent(enc)}` : '');
        log('info', `“下一节”点不动，改为按章节地址直接跳转：${truncate(entry.title, 24)}`);
        setActivity('按章节地址跳转中…');
        location.href = url;
        return true;
    }

    function catalogueSelfCheck() {
        const tree = document.querySelector('#coursetree');
        if (!tree) return '目录自检：页面没有 #coursetree，读不到右侧对号';
        const entries = catalogueEntries();
        if (!entries.length) return '目录自检：#coursetree 里没有可读的小节行';
        const current = activeCatalogueEntry(entries);
        if (!current) return `目录自检：共 ${entries.length} 行，但没有高亮的“当前小节”行`;
        const index = entries.indexOf(current);
        const next = entries.slice(index + 1).find((entry) => entry.isLeaf) || null;
        const flags = (!settings.autoNext ? '；自动跳节未开启' : '') + (!settings.skipCourseware ? '；对号跳节未开启' : '');
        return `目录自检：当前第 ${index + 1}/${entries.length} 行“${truncate(current.title, 22)}”，完成标记${current.completed ? '有 ✓' : '无 ✓'}` +
            `${current.isLeaf ? '' : '（非叶子行）'}${next ? `，下一小节“${truncate(next.title, 18)}”` : '，后面没有小节'}${flags}`;
    }

    // 空小节：页面直接写“暂无内容”时，这一节永远不会产生对号，等多久都没有。
    function emptySectionHint() {
        const pattern = /暂无内容|暂无数据|没有内容|无内容可/;
        for (const doc of courseDocuments()) {
            const text = clean(doc.body?.innerText);
            if (text && text.length <= 60 && pattern.test(text)) return truncate(text, 24);
        }
        try {
            for (const element of Array.from(document.querySelectorAll('div,span,p,section'))) {
                if (element.children.length) continue;
                const text = clean(element.textContent);
                if (text.length > 12 || !pattern.test(text)) continue;
                if (safeVisible(element)) return truncate(text, 24);
            }
        } catch (error) {
            /* 忽略 */
        }
        return '';
    }

    // 找到课件页里真正能滚动的容器（PDF/PPT 阅读器），用于自动翻到底。
    function coursewareScroller() {
        let best = null;
        let bestScore = 0;
        for (const doc of courseDocuments()) {
            let candidates = [];
            try {
                candidates = [doc.scrollingElement, doc.body, doc.documentElement, ...doc.querySelectorAll('div,section,main')];
            } catch (error) {
                continue;
            }
            for (const element of candidates) {
                if (!element || !safeVisible(element)) continue;
                const scrollable = element.scrollHeight - element.clientHeight;
                if (scrollable < 200) continue;
                let style = null;
                try { style = element.ownerDocument.defaultView.getComputedStyle(element); } catch (error) { continue; }
                if (!/(auto|scroll)/.test(style.overflowY)) continue;
                if (scrollable > bestScore) { bestScore = scrollable; best = element; }
            }
        }
        return best;
    }

    function extractQuestionNearSubmit(submit) {
        let container = submit?.parentElement;
        for (let depth = 0; depth < 6 && container; depth++, container = container.parentElement) {
            if (!container || container === document.body) break;
            const text = clean(container.innerText);
            if (text.length < 6 || text.length > 1000) continue;
            let options = optionElements(container);
            if (options.length < 2) {
                const inputs = Array.from(container.querySelectorAll('input[type="radio"],input[type="checkbox"]'))
                    .filter((input) => visible(input));
                if (inputs.length >= 2) {
                    options = inputs.map((input, index) => {
                        const label = input.closest('label') ||
                            (input.id ? container.querySelector(`label[for="${String(input.id).replace(/"/g, '\\"')}"]`) : null) ||
                            input.nextElementSibling || input.parentElement;
                        const letter = String.fromCharCode(65 + index);
                        const value = clean(label?.innerText || input.value || '');
                        return value ? { letter, text: value.replace(new RegExp(`^${letter}[.、．]?\\s*`), ''), element: label || input } : null;
                    }).filter(Boolean);
                }
            }
            if (options.length < 2 || options.length > 8) continue;
            const kindText = clean(container.innerText);
            const judge = options.length === 2 &&
                options.some((option) => /^对$/.test(option.text)) &&
                options.some((option) => /^错$/.test(option.text));
            const kind = /多选/.test(kindText) ? '多选题' : (/判断/.test(kindText) || judge) ? '判断题' : '单选题';
            const title = kindText
                .replace(/^(单选题|多选题|判断题)\s*/, '')
                .replace(/\s*A\s*[、.．]?\s*[\u4e00-\u9fff][\s\S]*$/, '')
                .replace(/(?:^|\n)\s*(提交|交卷)[\s\S]*$/, '')
                .trim();
            if (title.length < 2) continue;
            return { kind, title: title.slice(0, 500), options, card: container, doc: container.ownerDocument };
        }
        return null;
    }

    // v1.3.8：整门课跑完时，除了面板变绿，再发一条系统通知（Tampermonkey 支持时走 Windows 通知）、
    // 把标签页标题改成“✅ 全部完成”，并响一声——这样人不在电脑前也能知道跑完了。
    let completionNotified = false;
    function notifyCompletion(message) {
        if (completionNotified) return;
        completionNotified = true;
        const text = message || '本课程所有小节都已完成（右侧目录全部打勾）';
        try {
            if (!/✅/.test(document.title)) document.title = '✅ 全部完成 · ' + document.title;
        } catch (error) { /* 忽略 */ }
        try {
            if (typeof GM_notification === 'function') {
                GM_notification({ title: '学习通：本课程已全部完成', text, timeout: 20000, silent: false });
            } else if (typeof Notification === 'function') {
                if (Notification.permission === 'granted') {
                    new Notification('学习通：本课程已全部完成', { body: text });
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then((permission) => {
                        if (permission === 'granted') new Notification('学习通：本课程已全部完成', { body: text });
                    }).catch(() => { /* 忽略 */ });
                }
            }
        } catch (error) { /* 通知不可用时忽略 */ }
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) {
                const ctx = new Ctx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 880;
                gain.gain.value = 0.08;
                osc.connect(gain).connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
                setTimeout(() => { try { ctx.close(); } catch (error) { /* 忽略 */ } }, 900);
            }
        } catch (error) { /* 忽略 */ }
    }

    function findNextButton() {
        for (const doc of courseDocuments()) {
            const known = doc.querySelector('#prevNextFocusNext, #right1, .nextChapter');
            if (visible(known) && clean(known.innerText || known.title).includes('下一节')) return known;
            const generic = findButton(doc, '下一节');
            if (generic) return generic;
        }
        return null;
    }

    function confirmInlineSubmit() { return false; }

    function confirmNextStepDialog() { return false; }

    async function revealQuizQuestions() {
        const docs = courseDocuments();
        const submit = docs.map((doc) => findButton(doc, '提交')).find(Boolean);
        if (!submit) return;
        let scroller = submit.parentElement;
        while (scroller && scroller !== submit.ownerDocument.body) {
            const style = scroller.ownerDocument.defaultView.getComputedStyle(scroller);
            if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight + 100) break;
            scroller = scroller.parentElement;
        }
        if (!scroller || scroller === submit.ownerDocument.body) {
            scroller = submit.ownerDocument.scrollingElement;
        }
        if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 100) return;
        scroller.scrollTop = 0;
        await sleep(80);
        for (let step = 0; step < 50; step++) {
            const bottom = scroller.scrollHeight - scroller.clientHeight;
            if (scroller.scrollTop >= bottom - 2) break;
            scroller.scrollTop = Math.min(bottom, scroller.scrollTop + Math.max(300, scroller.clientHeight * 0.75));
            await sleep(80);
        }
    }


    const DIALOG_SELECTOR = '[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.layui-layer-page,.el-message-box,.modal,.ans-dialog,.ant-modal';
    const OPTION_ACTION_SELECTOR = '[onclick*="addChoice"],[onclick*="addMultipleChoice"],[onclick*="saveSingleSelect"],[onclick*="saveMultipleSelect"],[onclick*="saveJudgeSelect"]';

    const stepDocumentIds = new WeakMap();
    let nextStepDocumentId = 1;

    function taskMetadata(element) {
        let data = {};
        try { data = JSON.parse(element.getAttribute('data') || '{}') || {}; } catch (_) { /* 非 JSON */ }
        const property = data.property && typeof data.property === 'object' ? data.property : {};
        return {
            src: element.getAttribute('src') || element.getAttribute('data-src') || element.getAttribute('data') && element.tagName === 'OBJECT' && element.getAttribute('data') || '',
            module: clean(data.module || property.module || data.type || element.getAttribute('data-module')).toLowerCase(),
            name: clean(data.filename || data.name || property.name || element.getAttribute('title')),
            id: String(data.objectid || property.objectid || data.jobid || property._jobid || ''),
        };
    }

    function taskFrameKind(element) {
        const meta = taskMetadata(element);
        const cls = String(element.className || '');
        if (/insertwork|ans-work-module/i.test(cls) || /^(insertwork|work|quiz|exam)$/.test(meta.module) || /\/(?:work|exam)\/(?:dowork|doHomeWork|view|work|index|test|start)/i.test(meta.src)) return '章节测验';
        if (/insertvideo/i.test(cls) || /^(insertvideo|video)$/.test(meta.module) || /\/ananas\/modules\/video\//i.test(meta.src) || /\.mp4(?:[?#]|$)/i.test(meta.src)) return '视频';
        if (/insertaudio/i.test(cls) || /^(insertaudio|audio)$/.test(meta.module) || /\/ananas\/modules\/audio\//i.test(meta.src)) return '音频';
        if (/insertdoc-online|ans-insertdoc/i.test(cls) || /^(insertdoc|document|doc|ppt|pdf|office)$/.test(meta.module) ||
            /\/ananas\/modules\/(?:pdf|ppt|doc|document|office)\//i.test(meta.src) || /\.(?:pptx?|pdf|docx?|xlsx?)(?:[?#]|$)/i.test(meta.src) ||
            /\.(?:pptx?|pdf|docx?|xlsx?)$/i.test(meta.name) || /^application\/(?:pdf|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.)/i.test(element.getAttribute('type') || '')) return '课件';
        return '';
    }

    function taskFrames(docs = courseDocuments()) {
        return docs.flatMap(doc => Array.from(doc.querySelectorAll('iframe,object,embed,[data-module]')).filter(safeVisible));
    }

    function isLearningContentFrame(frame) {
        return frame && (frame.id === 'iframe' || /\/knowledge\/cards(?:[?#]|$)/.test(frame.getAttribute('src') || ''));
    }

    function readingContentKey(docs) {
        const parts = [];
        for (const doc of docs) {
            let frame = null;
            try { frame = doc.defaultView?.frameElement; } catch (_) { /* 跨域内容不猜测 */ }
            const roots = isLearningContentFrame(frame) ? [doc.body] : Array.from(doc.querySelectorAll('.ans-cc,.ans-editor'));
            for (const root of roots) {
                if (!root || !safeVisible(root)) continue;
                // 未知嵌入组件可能是尚未加载的视频/测验，不能凭周围文字直接跳过。
                if (Array.from(root.querySelectorAll('iframe,object,embed,video,audio,input[type="radio"],input[type="checkbox"],[data-module]')).some(safeVisible)) continue;
                const copy = root.cloneNode(true);
                copy.querySelectorAll('script,style,noscript,button,input,select,textarea,nav,#coursetree,#xt-ds-host,[hidden],[style*="display:none"],[style*="display: none"],' + DIALOG_SELECTOR).forEach(el => el.remove());
                const text = clean(copy.textContent);
                if (text.length < 80 || (text.match(/[\u3400-\u9fffA-Za-z]/g) || []).length < 40) continue;
                // 正文在同一个 document 中更新，也应识别为新内容；面板、目录和加载状态不参与。
                let hash = 2166136261;
                for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
                parts.push(`${text.length}:${hash >>> 0}`);
            }
        }
        return parts.join('|');
    }

    function currentLearningStep() {
        const docs = courseDocuments();
        const questions = extractQuestions();
        const hasSheet = docs.some(doc => {
            const text = clean(doc.body?.innerText);
            return /题量\s*[:：]?\s*\d+/.test(text) && /满分\s*[:：]?\s*\d+/.test(text);
        });
        if (hasSheet || quizCompleted()) return '章节测验';
        const kinds = taskFrames(docs).map(taskFrameKind);
        const hasVideo = docs.some(doc => Array.from(doc.querySelectorAll('video')).some(safeVisible));
        if (kinds.includes('章节测验') || (!hasVideo && questions.some(q => !q.card.closest(DIALOG_SELECTOR)))) return '章节测验';
        if (hasVideo || kinds.includes('视频')) return '视频';
        // 音频占位不按课件跳过，避免加载中的媒体被跳走。
        if (kinds.includes('音频')) return '';
        if (kinds.includes('课件')) return '课件';
        const title = document.querySelector('.prev_title');
        const text = title && safeVisible(title) ? clean(title.title || title.textContent).replace(/^\d+\s*/, '') : '';
        if (/^(章节测验|测验|章节测试)$/.test(text)) return '章节测验';
        if (/^(PPT|PDF|课件|文档|演示文稿|幻灯片|阅读资料)(?:\s*[:：].*)?$/i.test(text)) return '课件';
        if (text === '视频') return '视频';
        if (readingContentKey(docs)) return '课件';
        return '';
    }

    function learningStepSnapshot() {
        const allDocs = courseDocuments();
        const questions = extractQuestions().filter(q => !q.card.closest(DIALOG_SELECTOR));
        const docs = allDocs.filter(doc => {
            if (doc === document || questions.some(q => q.doc === doc)) return true;
            try {
                const frame = doc.defaultView?.frameElement;
                return frame && (isLearningContentFrame(frame) || taskFrameKind(frame));
            } catch (_) { return false; }
        });
        const docIds = docs.map(doc => {
            if (!stepDocumentIds.has(doc)) stepDocumentIds.set(doc, nextStepDocumentId++);
            return stepDocumentIds.get(doc);
        });
        const resources = taskFrames(docs).filter(element => taskFrameKind(element)).map(element => {
            const m = taskMetadata(element);
            return [taskFrameKind(element), m.src, m.module, m.name, m.id].join(':');
        });
        const questionKeys = questions.map(q => `${q.kind}:${q.title}:${q.options.map(o => o.letter + o.text).join('|')}`);
        const type = currentLearningStep();
        const cardsUrls = Array.from(document.querySelectorAll('iframe[src*="/knowledge/cards"],iframe#iframe')).filter(safeVisible).map(f => f.getAttribute('src') || '');
        const readingKey = type === '课件' ? readingContentKey(allDocs) : '';
        const contentKey = [type, docIds.join(','), resources.join('|'), questionKeys.join('|'), readingKey].join('||');
        const routeKey = [location.href, currentActiveCell(), cardsUrls.join('|')].join('||');
        return { type, contentKey, routeKey, identity: [routeKey, contentKey].join('||') };
    }

    function navigationConfirmButton(previous, options = {}) {
        // 只处理“下一节/继续学习”导航窗口，测验提交窗口仍由提交校验器负责。
        for (const doc of courseDocuments()) {
            const pop = doc.getElementById('popok');
            const content = doc.getElementById('popcontent');
            const pairs = [];
            if (safeVisible(pop) && safeVisible(content)) pairs.push({ root: null, button: pop, text: clean(content.innerText) });
            for (const dialog of doc.querySelectorAll(DIALOG_SELECTOR)) {
                if (safeVisible(dialog)) pairs.push({ root: dialog, text: clean(dialog.innerText) });
            }
            const goStudy = findButton(doc, '去学习');
            if (goStudy) {
                let container = goStudy.parentElement;
                for (let depth = 0; depth < 5 && container && container !== doc.body; depth++, container = container.parentElement) {
                    const text = clean(container.innerText);
                    if (text.length <= 400 && /下一节/.test(text)) pairs.push({ root: container, text });
                }
            }
            for (const pair of pairs) {
                const text = pair.text;
                if (!/下一节|下一章节|下一学习|继续学习|继续进入/.test(text) || /提交|交卷|未作答|答题|测验未完成/.test(text) || text.length > 400) continue;
                if (/未完成|任务点/.test(text) && !options.allowTaskPrompt && previous.type !== '课件') continue;
                if (currentLearningStep() === '章节测验' && !quizCompleted()) continue;
                if (pair.button) return pair.button;
                for (const label of ['下一节', '继续学习', '确定', '确认', '继续']) {
                    const button = findButton(pair.root, label);
                    if (button) return button;
                }
            }
        }
        return null;
    }

    function optionLettersUnder(element) {
        return new Set(Array.from(element.querySelectorAll('span,div,label,li,p,b,i,strong,a'))
            .map(node => clean(node.textContent)).filter(text => /^[A-H]$/.test(text)));
    }

    function optionControl(question, option) {
        const root = option.element;
        if (!root?.isConnected || !question.card?.contains(root)) throw new Error('选项或题目已被替换，请重新识别');
        const selector = 'input[type="radio"],input[type="checkbox"],[role="radio"][aria-checked],[role="checkbox"][aria-checked]';
        const controls = new Set();
        if (root.matches(selector)) controls.add(root);
        root.querySelectorAll(selector).forEach(el => controls.add(el));
        const label = root.matches('label') ? root : root.closest('label');
        if (label?.control && label.control.matches(selector) && question.card.contains(label.control)) controls.add(label.control);
        if (!controls.size) {
            let parent = root.parentElement;
            while (parent && parent !== question.card) {
                const list = parent.querySelectorAll(selector);
                if (list.length === 1) { controls.add(list[0]); break; }
                if (list.length > 1) break;
                parent = parent.parentElement;
            }
        }
        if (controls.size === 1) return [...controls][0];
        // 超星自定义选项没有原生 input：只认可已知的选项标记和页面事件。
        const action = root.matches(OPTION_ACTION_SELECTOR) ? root : root.closest(OPTION_ACTION_SELECTOR);
        if (!controls.size && action && question.card.contains(action)) {
            const markers = root.matches('.num_option,.num_option_dx') ? [root] : root.querySelectorAll('.num_option,.num_option_dx');
            if (markers.length === 1) return markers[0];
        }
        throw new Error('选项没有唯一、可读取的选择状态，已停止填选');
    }

    function controlSelected(control) {
        if (control.matches('input')) return control.checked === true;
        if (control.hasAttribute('aria-checked')) return control.getAttribute('aria-checked') === 'true';
        if (control.matches('.num_option,.num_option_dx')) {
            return ['check_answer','check_answer_dx','check_answer_dx_'].some(name => control.classList.contains(name));
        }
        throw new Error('无法读取选项状态');
    }

    function questionControls(question) {
        const pairs = question.options.map(option => {
            const control = optionControl(question, option);
            const root = option.element;
            const children = root.querySelectorAll(OPTION_ACTION_SELECTOR);
            const action = root.matches(OPTION_ACTION_SELECTOR) ? root : root.closest(OPTION_ACTION_SELECTOR) || (children.length === 1 ? children[0] : null);
            // 点击页面绑定了处理函数的整行，避免只改 input 而漏掉答案同步。
            const ownedAction = action && question.card.contains(action) &&
                !question.options.some(other => other !== option && action.contains(other.element));
            const target = ownedAction ? action : action && !root.matches('label,input') ? root : control;
            const marker = root.matches('.num_option,.num_option_dx') ? root : root.querySelector('.num_option,.num_option_dx');
            const value = marker?.getAttribute('data') || (control.matches('input') ? control.value : '') || option.letter;
            return { option, control, target, value: String(value) };
        });
        if (new Set(pairs.map(p => p.control)).size !== pairs.length || new Set(pairs.map(p => p.target)).size !== pairs.length) {
            throw new Error('多个选项映射到了同一个控件，已停止填选');
        }
        if (pairs.some(p => p.control.disabled || p.control.getAttribute('aria-disabled') === 'true' || p.target.getAttribute('aria-disabled') === 'true')) {
            throw new Error('选项已禁用或当前是成绩页，已停止填选');
        }
        return pairs;
    }

    function questionAnswerFields(question) {
        const doc = question.doc || question.card.ownerDocument;
        const container = question.card.closest('.TiMu,.questionLi,.singleQuesId,.mark_item') || question.card;
        const ids = new Set();
        for (const node of [container, question.card]) {
            for (const name of ['data','data-questionid','data-question-id','questionid']) {
                const value = node.getAttribute(name);
                if (value && /^[\w-]+$/.test(value)) ids.add(value);
            }
        }
        for (const node of container.querySelectorAll('input[name^="questionId"],input[name^="questionid"]')) {
            if (/^[\w-]+$/.test(node.value || '')) ids.add(node.value);
        }
        const candidates = new Set();
        const isAnswer = node => /^(?:answer|answerValue|answerContent)(?:\d+|_\d+|\[\d*\])?$/i.test(node.name || node.id || '');
        container.querySelectorAll('input[type="hidden"],textarea[hidden]').forEach(node => {
            if (isAnswer(node)) candidates.add(node);
        });
        for (const id of ids) {
            for (const key of ['answer' + id, 'answer_' + id, 'answer[' + id + ']']) {
                const byId = doc.getElementById(key);
                if (byId && byId.matches('input[type="hidden"],textarea[hidden]')) candidates.add(byId);
                for (const node of doc.getElementsByName(key)) {
                    if (node.matches('input[type="hidden"],textarea[hidden]')) candidates.add(node);
                }
            }
        }
        return [...candidates];
    }

    function answerBinding(question, pairs) {
        const fields = questionAnswerFields(question);
        if (fields.length) {
            if (fields.some(f => f.disabled || f.matches(':disabled') || !f.isConnected)) throw new Error('页面答案字段已失效');
            return { kind: 'hidden', fields };
        }
        const controls = pairs.map(p => p.control);
        const form = controls[0]?.form;
        if (form && controls.every(c => c.matches('input[type="radio"],input[type="checkbox"]') && c.form === form && c.name && !c.disabled)) {
            const pairControls = new Set(controls);
            const names = new Set(controls.map(c => c.name));
            if (Array.from(form.elements).some(c => names.has(c.name) && !pairControls.has(c))) {
                throw new Error('同名表单字段跨题或重复，无法核对答案');
            }
            return { kind: 'native', form };
        }
        throw new Error('能读取选中状态，但找不到对应的答案字段；不会按已保存处理，请用“核对写入”查看');
    }

    function sameValues(actual, expected) {
        const a = actual.map(String).sort();
        const b = expected.map(String).sort();
        return a.length === b.length && a.every((v, i) => v === b[i]);
    }

    function storedMatches(value, expected) {
        const text = String(value ?? '').trim();
        if (!text || !expected.length) return false;
        if (expected.length === 1 && text === expected[0]) return true;
        if (text.startsWith('[')) {
            try { const data = JSON.parse(text); if (Array.isArray(data)) return sameValues(data, expected); } catch (_) { /* 非 JSON */ }
        }
        if (/[\s,;|，、]/.test(text)) return sameValues(text.split(/[\s,;|，、]+/).filter(Boolean), expected);
        if (expected.every(v => /^[A-H]$/.test(v))) return sameValues([...text], expected);
        return false;
    }

    function verifyAnswerWrite(question, pairs, binding, wanted) {
        if (!question.card.isConnected || pairs.some(p => !p.control.isConnected || !p.target.isConnected)) throw new Error('题目页面已经切换或重新渲染');
        const selected = pairs.filter(p => controlSelected(p.control));
        const letters = selected.map(p => p.option.letter);
        if (!letters.length) throw new Error('尚未选中答案');
        if (question.kind !== '多选题' && letters.length !== 1) throw new Error('单选或判断题选中了多个选项');
        if (wanted && !sameValues(letters, wanted)) throw new Error('选项状态与目标答案不一致');
        if (binding.kind === 'hidden') {
            const expected = selected.map(p => p.value);
            if (new Set(pairs.map(p => p.value)).size !== pairs.length) throw new Error('选项的提交值重复，无法核对');
            for (const field of binding.fields) {
                if (!field.isConnected || field.disabled || field.matches(':disabled') || !storedMatches(field.value, expected)) {
                    throw new Error('界面已选中，但答案字段为空或不一致');
                }
                if (field.form && field.name) {
                    const data = new field.ownerDocument.defaultView.FormData(field.form);
                    if (!data.getAll(field.name).includes(field.value)) throw new Error('答案字段没有进入表单数据');
                }
            }
        } else {
            const view = question.card.ownerDocument.defaultView;
            const data = new view.FormData(binding.form);
            for (const name of new Set(pairs.map(p => p.control.name))) {
                const expected = selected.filter(p => p.control.name === name).map(p => p.control.value);
                if (!sameValues(data.getAll(name), expected)) throw new Error('选项未进入表单提交数据');
            }
        }
        return letters;
    }

    let reviewSession = null;
    const guardedDocuments = new WeakSet();

    function auditReviewSession() {
        if (!reviewSession) return { ok: false, message: '尚未开始填选' };
        if (reviewSession.busy) return { ok: false, message: '仍在请求或填选答案，请等待完成' };
        try {
            const current = extractQuestions();
            const sameDoc = current.filter(q => reviewSession.questions.some(old => old.doc === q.doc));
            if (sameDoc.length && sameDoc.length !== reviewSession.questions.length) throw new Error('题目数量发生变化，请重新识别');
            for (const doc of new Set(reviewSession.questions.map(q => q.doc))) {
                const expected = clean(doc.body?.innerText).match(/题量\s*[:：]?\s*(\d+)/);
                if (expected && Number(expected[1]) !== reviewSession.questions.filter(q => q.doc === doc).length) {
                    throw new Error('识别题数与页面题量不一致，请重新识别');
                }
            }
            for (let i = 0; i < reviewSession.questions.length; i++) {
                const q = reviewSession.questions[i];
                const pairs = questionControls(q);
                try { verifyAnswerWrite(q, pairs, answerBinding(q, pairs)); }
                catch (error) { throw new Error(`第 ${i + 1} 题：${error.message}`); }
            }
            return { ok: true, message: `${reviewSession.questions.length} 题本地答案字段已核对；尚未确认服务器接收` };
        } catch (error) { return { ok: false, message: error.message }; }
    }

    function beginReviewSession(questions) {
        reviewSession = { questions, busy: true, submitKey: submitKey(questions), submitState: 'idle' };
        for (const doc of new Set([...courseDocuments(), ...questions.map(q => q.doc)])) {
            if (guardedDocuments.has(doc)) continue;
            guardedDocuments.add(doc);
            const guard = event => {
                if (!reviewSession || !reviewSession.questions.some(q => q.card.isConnected)) return;
                let isSubmit = event.type === 'submit' && reviewSession.questions.some(q => q.doc === doc);
                if (event.type === 'click') {
                    let target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
                    while (target && target !== doc.body && target.getRootNode() === doc) {
                        const text = clean(target.value || target.innerText);
                        const dialog = target.closest(DIALOG_SELECTOR + ',#popDiv');
                        isSubmit = /^(提交|提交作业|提交答案|确认提交|确定提交|交卷|确认交卷)$/.test(text) ||
                            ((target.id === 'popok' || /^(确定|确认)$/.test(text)) && /提交|交卷/.test(clean(dialog?.innerText || doc.querySelector('#popcontent')?.innerText)));
                        if (isSubmit) break;
                        target = target.parentElement;
                    }
                }
                if (!isSubmit) return;
                const result = auditReviewSession();
                if (result.ok) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                setMode('error');
                setActivity('已拦截本次提交：' + result.message);
                log('error', '已拦截本次提交：' + result.message);
            };
            doc.addEventListener('click', guard, true);
            doc.addEventListener('submit', guard, true);
        }
    }

    async function fillVerifiedAnswers(questions, answers, assertActive) {
        beginReviewSession(questions);
        try {
            const plans = questions.map((question, index) => {
                const wanted = answers.get(index + 1);
                if (!wanted?.length) throw new Error(`第 ${index + 1} 题没有完整答案`);
                if (question.kind !== '多选题' && wanted.length !== 1) throw new Error(`第 ${index + 1} 题不是多选题`);
                const pairs = questionControls(question);
                if (new Set(wanted).size !== wanted.length || wanted.some(letter => !pairs.some(p => p.option.letter === letter))) throw new Error('答案包含不存在或重复的选项');
                return { question, wanted, pairs, binding: answerBinding(question, pairs) };
            });
            for (let i = 0; i < plans.length; i++) {
                const plan = plans[i];
                for (const pair of plan.pairs) {
                    assertActive();
                    const desired = plan.wanted.includes(pair.option.letter);
                    if (controlSelected(pair.control) === desired) continue;
                    if (!desired && plan.question.kind !== '多选题') continue;
                    if (!pair.target.isConnected || !plan.question.card.isConnected) throw new Error('选择过程中页面已切换');
                    pair.target.scrollIntoView({ block: 'center' });
                    pair.target.click();
                    if (!await waitFor(() => {
                        assertActive();
                        return pair.control.isConnected && controlSelected(pair.control) === desired;
                    }, 1500, 50)) throw new Error(`第 ${i + 1} 题 ${pair.option.letter} 未确认选中`);
                    await sleep(100);
                }
                let problem = '';
                const written = await waitFor(() => {
                    assertActive();
                    try { verifyAnswerWrite(plan.question, plan.pairs, plan.binding, plan.wanted); return true; }
                    catch (error) { problem = error.message; return false; }
                }, 2500, 100);
                if (!written) throw new Error(`第 ${i + 1} 题：${problem}，已停止填选`);
            }
            await sleep(300);
            assertActive();
            for (const plan of plans) verifyAnswerWrite(plan.question, plan.pairs, plan.binding, plan.wanted);
        } finally {
            if (reviewSession?.questions === questions) reviewSession.busy = false;
        }
    }

    const usedSubmitKeys = new Set();
    const SUBMIT_LABELS = ['提交', '提交作业', '提交答案', '交卷', '确认交卷'];

    function submitKey(questions) {
        return location.href + '|' + questions.map(q => {
            const id = q.card.getAttribute('data') || q.card.id || '';
            return `${q.doc.URL}:${id}:${q.kind}:${q.title}:${q.options.map(o => o.letter + o.text).join('|')}`;
        }).join('||');
    }

    function safeVisible(element) {
        try { return visible(element); } catch (_) { return false; }
    }

    function pickSubmitButton(root, preferred) {
        if (preferred && safeVisible(preferred) && root.contains(preferred) && SUBMIT_LABELS.includes(clean(preferred.value || preferred.innerText))) return preferred;
        for (const label of SUBMIT_LABELS) {
            const button = findButton(root, label);
            if (button) return button;
        }
        return null;
    }

    function confirmSubmissionButton(documents, questions) {
        for (const doc of documents) {
            const popok = doc.getElementById('popok');
            const content = doc.getElementById('popcontent');
            if (safeVisible(popok) && safeVisible(content) && !questions.some(q => content.contains(q.card))) {
                const text = clean(content.innerText);
                const label = clean(popok.value || popok.innerText);
                if (/提交|交卷/.test(text) && ['确定', '确认', '提交', '确认提交', '确定提交', '确认交卷', '交卷'].includes(label)) {
                    if (/未作答|未答题|尚未作答|空白|空题|请选择答案|请完成.*答|请先.*答/.test(text)) {
                        throw new Error('平台提示仍有未作答内容，已停止自动确认：' + truncate(text, 80));
                    }
                    if (text.length > 600) throw new Error('提交确认窗口内容异常，已停止自动确认');
                    return popok;
                }
            }
            const containers = Array.from(doc.querySelectorAll(DIALOG_SELECTOR));
            if (safeVisible(popok) && content) containers.unshift(content.closest(DIALOG_SELECTOR) || content.parentElement);
            for (const dialog of new Set(containers)) {
                if (!safeVisible(dialog) || questions.some(q => dialog.contains(q.card))) continue;
                const text = clean(dialog.innerText);
                if (!/提交|交卷/.test(text)) continue;
                if (/未作答|未答题|尚未作答|空白|空题|请选择答案|请完成.*答|请先.*答/.test(text)) {
                    throw new Error('平台提示仍有未作答内容，已停止自动确认：' + truncate(text, 80));
                }
                if (text.length > 600) throw new Error('提交确认窗口内容异常，已停止自动确认');
                for (const label of ['确定', '确认', '确认提交', '确定提交', '确认交卷', '提交', '交卷']) {
                    const button = findButton(dialog, label);
                    if (button && button.id !== 'cancel') return button;
                }
            }
        }
        return null;
    }

    function submissionRecords(questions) {
        const docs = new Set([...courseDocuments(), ...questions.map(q => q.doc)]);
        for (const doc of docs) {
            const text = clean(doc.body?.innerText);
            // 有的测验提交后不显示“本次成绩”，只把页面切成“我的答案 / 正确答案”对照视图；
            // 这种视图同样说明平台已经收下答卷，不能当成“提交失败”。
            const graded = /本次成绩\s*\d+(?:\.\d+)?\s*分/.test(text);
            const reviewView = /我的答案\s*[:：]/.test(text) && /(正确答案|参考答案|答案解析)\s*[:：]/.test(text);
            if (!graded && !reviewView) continue;
            const records = text.split(/我的答案\s*[:：]/).slice(1);
            const answered = records.map((part, index) => {
                const value = part.trim();
                if (/^(正确答案|参考答案|答案解析)/.test(value)) return false;
                if (/^[A-H]+(?=$|[^A-Za-z])/.test(value)) return true;
                if (questions[index]?.kind !== '判断题') return false;
                return /^(对|错|正确|错误)(?!答案)/.test(value) || /^[√×](?=\s*(?:正确答案|参考答案|答案解析|$))/.test(value);
            });
            const empty = answered.indexOf(false);
            if (empty >= 0) throw new Error(`平台结果中第 ${empty + 1} 条作答记录为空，已停止后续自动操作`);
            if (answered.length >= questions.length) {
                return {
                    status: 'completed',
                    message: graded ? `已显示成绩，${answered.length} 条作答记录非空` : `已显示作答对照，${answered.length} 条作答记录非空`,
                };
            }
            return {
                status: 'reported',
                message: graded ? '成绩已显示，但未展示完整作答记录；已停止自动跳节，请核对结果' : '已显示作答对照，但未展示完整作答记录；已停止自动跳节，请核对结果',
            };
        }
        return null;
    }

    // 仅在已核对的提交点击调用栈内接管 native confirm，离开点击立即恢复。
    function clickSubmissionButton(button, session, assertActive) {
        const restored = [];
        let problem = '';
        const views = new Set([button.ownerDocument.defaultView]);
        if (button.ownerDocument === document) views.add(pageWindow);
        for (const view of views) {
            if (!view) continue;
            try {
                const original = view.confirm;
                const guarded = message => {
                    try {
                        assertActive();
                        const result = auditReviewSession();
                        if (reviewSession !== session || !result.ok) throw new Error(result.message || '题目会话已改变');
                        const text = String(message || '');
                        if (!/提交|交卷/.test(text) || /未作答|未答题|空白|空题/.test(text)) throw new Error('原生确认窗口内容未通过校验');
                        session.nativeConfirmed = true;
                        return true;
                    } catch (error) { problem = error.message; return false; }
                };
                view.confirm = guarded;
                if (view.confirm === guarded) restored.push({ view, original, guarded });
            } catch (_) { /* 无法接管原生窗口时保留原行为，不绕过权限。 */ }
        }
        try { button.click(); }
        finally {
            for (const { view, original, guarded } of restored) {
                try { if (view.confirm === guarded) view.confirm = original; } catch (_) { /* 页面可能已经导航 */ }
            }
        }
        if (problem) throw new Error(problem);
    }

    function submitVerifiedQuiz(questions, options = {}) {
        const session = reviewSession;
        if (!session || session.questions !== questions) return Promise.reject(new Error('待提交题目与已核对会话不一致'));
        if (session.submitPromise) return session.submitPromise;
        const assertActive = () => {
            if (options.signal?.aborted) throw new Error('脚本已停止，自动提交已取消');
            if (!settings.autoQuiz || !settings.autoSubmit) throw new Error('自动提交已关闭');
            if (reviewSession !== session) throw new Error('页面会话已改变，自动提交已取消');
            options.assertActive?.();
        };
        const audit = () => {
            assertActive();
            const result = auditReviewSession();
            if (!result.ok) throw new Error('提交前校验失败：' + result.message);
        };
        const promise = (async () => {
            try {
                audit();
                if (usedSubmitKeys.has(session.submitKey)) throw new Error('本测验已发起过提交；为避免重复提交，已停止自动重试');
                const root = options.submitRoot || questions[0].doc;
                const button = pickSubmitButton(root, options.submit);
                if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error('未找到可用的测验提交按钮');
                session.submitState = 'pending';
                setMode('waiting');
                setActivity('本地答案已核对，稍后自动提交；可点击停止取消');
                await sleep(options.settleMs ?? 1500);
                audit();
                if (!safeVisible(button) || !root.contains(button) || button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error('提交按钮已经改变或被禁用');
                usedSubmitKeys.add(session.submitKey);
                session.submitState = 'clicked';
                button.scrollIntoView({ block: 'center' });
                clickSubmissionButton(button, session, assertActive);
                log('info', '已点击提交，等待确认窗口或平台结果；不会重复点击提交');
                let confirmed = session.nativeConfirmed === true;
                let lastClick = Date.now();
                let report = null;
                const deadline = Date.now() + (options.resultTimeoutMs ?? 30000);
                while (Date.now() < deadline) {
                    assertActive();
                    const docs = new Set([...courseDocuments(), ...questions.map(q => q.doc)]);
                    for (const doc of docs) {
                        for (const alert of doc.querySelectorAll('[role="alert"],.alert-danger,.layui-layer-content,.el-message--error')) {
                            if (safeVisible(alert) && /提交失败|保存失败|交卷失败|网络错误|请求失败/.test(clean(alert.innerText))) throw new Error('平台提示：' + truncate(clean(alert.innerText), 100));
                        }
                    }
                    const outcome = submissionRecords(questions);
                    if (outcome?.status === 'completed') { session.submitState = 'completed'; return outcome; }
                    if (outcome) report = outcome;
                    const confirm = confirmSubmissionButton(docs, questions);
                    if (confirm && !confirmed) {
                        audit();
                        if (confirm.disabled || confirm.getAttribute('aria-disabled') === 'true') throw new Error('提交确认按钮被禁用');
                        confirmed = true;
                        session.submitState = 'confirmed';
                        clickSubmissionButton(confirm, session, assertActive);
                        lastClick = Date.now();
                        log('info', '已核对答案字段并确认提交，等待平台返回作答记录');
                        continue;
                    }
                    if (options.kind === 'inline' && !confirm && Date.now() - lastClick >= (options.closeGraceMs ?? 1200) &&
                        (!safeVisible(button) || questions.every(q => !safeVisible(q.card)))) {
                        session.submitState = 'closed';
                        return { status: 'closed', message: '弹题窗口已关闭；未读取到独立成绩页' };
                    }
                    if (report) { session.submitState = 'reported'; return report; }
                    await sleep(options.pollMs ?? 100);
                }
                session.submitState = 'unknown';
                throw new Error('已发起提交，但 30 秒内没等到平台的成绩或作答对照；提交可能已经成功，请先看页面再决定是否重试（不会自动重复提交）');
            } catch (error) {
                if (session.submitState !== 'completed' && session.submitState !== 'closed') session.submitState = 'stopped';
                throw error;
            }
        })();
        session.submitPromise = promise;
        return promise;
    }


    function inspectAnswerWrites() {
        const questions = extractQuestions();
        if (!questions.length) { log('warn', '没有识别到题目，请进入未提交的测验页'); return; }
        log('info', `写入核对：识别 ${questions.length} 题；以下仅检查本地字段，不会提交或请求 AI`);
        let ok = 0;
        for (let i = 0; i < questions.length; i++) {
            try {
                const q = questions[i];
                const pairs = questionControls(q);
                const binding = answerBinding(q, pairs);
                const letters = verifyAnswerWrite(q, pairs, binding);
                ok++;
                log('success', `${i + 1}. ${letters.join('')}：本地${binding.kind === 'hidden' ? '答案字段' : '表单数据'}一致`);
            } catch (error) { log('warn', `${i + 1}. ${error.message}`); }
        }
        setActivity(`本地写入核对 ${ok}/${questions.length}；服务器接收状态未知`);
    }

    function inlineContext(questions) {
        const selector = '[role="dialog"],[role="alertdialog"],.layui-layer-dialog,.layui-layer-page,.el-message-box,.modal,.ans-dialog,.ant-modal';
        for (const root of deepDocuments()) {
            for (const dialog of root.querySelectorAll(selector)) {
                if (!visible(dialog)) continue;
                const local = questions.filter(q => dialog.contains(q.card));
                if (!local.length || local.some(q => /本次成绩|我的答案/.test(q.card.innerText || ''))) continue;
                const submit = findButtonContaining(dialog, '提交') || findButtonContaining(dialog, '交卷');
                if (submit) return { questions: local, submitRoot: dialog, submit };
            }
        }
        return null;
    }

    function attachQuizAutomation(app) {
        const attemptedQuizzes = new Set();
        let quizBusy = false;
        let stopped = false;
        const originalDestroy = app.destroy.bind(app);
        app.destroy = function () {
            stopped = true;
            app._requestController.abort();
            if (reviewSession) reviewSession.busy = false;
            originalDestroy();
        };

        async function waitForQuizQuestions() {
            await revealQuizQuestions();
            let previousSignature = '';
            let stableCount = 0;
            for (let attempt = 0; attempt < 120; attempt++) {
                if (stopped) throw new Error('脚本已停止');
                if (quizCompleted()) return null;
                const questions = extractQuestions();
                const docs = [...new Set(questions.map(q => q.doc))];
                const expectedCounts = docs.map(doc => clean(doc.body?.innerText).match(/题量\s*[:：]?\s*(\d+)/)).filter(Boolean);
                const expected = expectedCounts.length === 1 ? Number(expectedCounts[0][1]) : null;
                if (questions.length && (!expected || questions.length === expected)) {
                    const signature = questions.map(q => `${q.kind}:${q.title}:${q.options.map(o => o.letter + o.text).join('|')}`).join('||');
                    stableCount = signature === previousSignature ? stableCount + 1 : 0;
                    previousSignature = signature;
                    if (stableCount >= 3) return questions;
                } else { stableCount = 0; previousSignature = ''; }
                if (attempt > 0 && attempt % 20 === 0) log('info', `等待完整题目：已识别 ${questions.length}${expected ? '/' + expected : ''} 道`);
                await sleep(500);
            }
            throw new Error('60 秒内未能识别完整测验，已停止；不会填选或提交不完整试卷');
        }

        async function selectAnswers(questions, answers) {
            return fillVerifiedAnswers(questions, answers, () => {
                if (stopped || app._destroyed || !settings.autoQuiz) throw new Error('辅助填选已停止');
            });
        }
        app._selectAnswers = selectAnswers;

        async function goToNextStep(options = {}) {
            if (stopped) throw new Error('脚本已停止');
            if (!settings.autoNext) {
                app._nextUnitPending = false;
                app._nextUnitSince = 0;
                setActivity('自动跳节已关闭，等待手动切换');
                return;
            }
            if (app._emptySectionTimer) {
                clearTimeout(app._emptySectionTimer);
                app._emptySectionTimer = null;
            }
            if (app._videoWaitTimer) {
                clearTimeout(app._videoWaitTimer);
                app._videoWaitTimer = null;
            }
            const completed = options.completedKey ? completedCatalogueCourseware() : null;
            if (options.completedKey && completed?.key !== options.completedKey) throw new Error('当前已完成小节已改变，取消目录跳节');
            const directoryTarget = completed?.next?.label || completed?.next?.row;
            // 优先用平台自己的“下一节”按钮，它按平台的顺序走，不会像“下一个叶子”那样漏掉小节；
            // 按钮不可用时再退回点目录里的下一行。
            const next = findNextButton() || (directoryTarget && safeVisible(directoryTarget) ? directoryTarget : null);
            if (!next || next.disabled || next.getAttribute('aria-disabled') === 'true') throw new Error('未找到可用的“下一节”按钮');
            app._nextUnitPending = true;
            app._nextUnitSince = Date.now();
            const previous = learningStepSnapshot();
            app._clearCheckInterval();
            app._videoEl = null;
            app._isPlaying = false;
            next.scrollIntoView({ block: 'center' });
            log('info', options.completedKey
                ? `右侧已完成：${truncate(completed?.title, 30)}；点“下一节”进入下一小节${completed?.next ? `（下一行：${truncate(completed.next.title, 24)}）` : ''}`
                : `${previous.type || '当前内容'}：点击“下一节”，检测正文、题目或播放器切换（不等待整页加载完成）`);
            const previousCatalogueKey = currentActiveCell();
            const watchedDocs = courseDocuments();
            const loadedFrames = new WeakSet();
            const onFrameLoad = event => {
                if (isLearningContentFrame(event.target)) loadedFrames.add(event.target);
            };
            watchedDocs.forEach(doc => doc.addEventListener('load', onFrameLoad, true));
            app._navigationActive = true;
            try {
                // v1.3.7：页脚的“下一节”经常在可视区之外（要滚到底才看得见），
                // 先滚过去、等滚动稳定，再用完整的 pointer/mouse 序列点，别用裸 click()。
                await sleep(260);
                clickElement(next);
                const confirmed = new WeakSet();
                // 对号触发的目录跳节只需确认“已经切到该小节”，不必等正文或播放器识别完成。
                const timeoutMs = options.completedKey ? Math.min(app.configs.navigationTimeoutMs, 15000) : app.configs.navigationTimeoutMs;
                const deadline = Date.now() + timeoutMs;
                let signature = '';
                let stable = 0;
                while (Date.now() < deadline) {
                    if (stopped || app._destroyed) throw new Error('脚本已停止');
                    if (!settings.autoNext) throw new Error('自动跳节已关闭，已取消后续确认');
                    await sleep(app.configs.navigationPollMs);
                    const confirmation = navigationConfirmButton(previous);
                    if (confirmation && !confirmed.has(confirmation)) {
                        if (confirmation.disabled || confirmation.getAttribute('aria-disabled') === 'true') throw new Error('下一节确认按钮已禁用');
                        confirmed.add(confirmation);
                        confirmation.click();
                        log('info', '已确认进入下一节的导航窗口');
                    }
                    const now = learningStepSnapshot();
                    // 路由变化但正文仍旧时不放行，避免页面慢时连续误跳。
                    const routeLoaded = now.routeKey !== previous.routeKey &&
                        taskFrames().some(frame => isLearningContentFrame(frame) && loadedFrames.has(frame));
                    const changed = now.contentKey !== previous.contentKey || routeLoaded;
                    const arrivedCompleted = completedCatalogueCourseware(now.type);
                    const completedArrival = previousCatalogueKey && arrivedCompleted && arrivedCompleted.key !== previousCatalogueKey;
                    // 点目录行后平台会立刻把目标行设为 active：这一变化本身就说明已经切到下一节。
                    const activeNow = currentActiveCell();
                    const cellArrival = Boolean(previousCatalogueKey && activeNow && activeNow !== previousCatalogueKey);
                    const contentReady = changed && now.type && (now.type !== '视频' || app._getVideoEl());
                    const ready = completedArrival || cellArrival || contentReady;
                    if (ready) {
                        const currentSignature = completedArrival ? `completed:${arrivedCompleted.key}` : cellArrival ? `cell:${activeNow}` : now.identity;
                        stable = signature === currentSignature ? stable + 1 : 1;
                        signature = currentSignature;
                        if (stable >= app.configs.navigationStablePolls) {
                            app._nextUnitPending = false;
                            app._nextUnitSince = 0;
                            app._navigationActive = false;
                            app._videoEl = null;
                            app._reviewPending = false;
                            const landedIndex = app._currentCatalogueIndex();
                            if (landedIndex >= 0) app._catalogueFloor = landedIndex;
                            log('success', completedArrival ? '已切到下一小节，目录确认该小节已完成，继续处理' :
                                cellArrival ? '目录已切到下一小节，继续处理' : `已识别下一节的${now.type}，继续处理`);
                            if (getJQuery()?.fn && document.querySelector('#coursetree')) app._initCellData();
                            if (contentReady) app.play();
                            else setTimeout(() => { if (!app._destroyed && !app._nextUnitPending) app.play(); }, 600);
                            return;
                        }
                    } else { stable = 0; signature = ''; }
                }
                throw new Error('页面没有切到下一节（多半是该小节还没被平台标记完成）；已保留对号监听，不会重复点击');
            } finally {
                app._navigationActive = false;
                watchedDocs.forEach(doc => doc.removeEventListener('load', onFrameLoad, true));
            }
        }


        app.nextUnit = function (options = {}) {
            if (stopped) return;
            if (this._nextUnitPending) {
                const age = Date.now() - (this._nextUnitSince || 0);
                if (age <= 25000) {
                    if (!this._pendingSkipLoggedAt || Date.now() - this._pendingSkipLoggedAt > 5000) {
                        this._pendingSkipLoggedAt = Date.now();
                        log('info', '上一次“进入下一节”还没结束，稍后自动继续');
                    }
                    return;
                }
                log('warn', `“进入下一节”已锁定 ${Math.round(age / 1000)} 秒没有结果，自动解锁后重试`);
                this._nextUnitPending = false;
                this._navigationActive = false;
            }
            this._nextUnitPending = true;
            this._nextUnitSince = Date.now();
            goToNextStep(options).catch((error) => {
                this._nextUnitPending = false;
                this._nextUnitSince = 0;
                this._navigationActive = false;
                if (stopped || this._destroyed) return;
                const message = error.message || String(error);
                // 不进入 error 状态：切不过去通常只是平台还没打对号，继续等对号出现即可再跳，
                // 否则一次失败就会把整个自动化冻结在错误状态里。
                log('warn', `切换下一节未完成：${message}`);
                setMode('waiting');
                setActivity('暂未切到下一节，继续等待右侧对号（✓）…');
            });
        };

        app.inspectQuiz = function () {
            return extractQuestions().map((question, index) => ({
                id: index + 1,
                type: question.kind,
                question: question.title,
                options: question.options.map((option) => `${option.letter}. ${option.text}`),
            }));
        };

        app._advanceChapterTest = function () {
            if (stopped || quizBusy) return;
            if (!settings.autoQuiz) {
                this._isPlaying = false;
                log('warn', '辅助填选尚未开启：勾选“辅助填选”，再点击“开始”');
                setActivity('测验页（辅助填选未开启）');
                return;
            }
            quizBusy = true;
            app._chapterQuizBusy = true;
            let advanceAfterSubmit = false;
            (async () => {
                if (quizCompleted()) {
                    log('success', '检测到当前章节测验已完成');
                    advanceAfterSubmit = settings.autoNext;
                    setActivity(settings.autoNext ? '测验已完成，准备下一节' : '测验已完成，可手动进入下一节');
                    return;
                }
                log('info', '已进入章节测验，等待完整题目加载');
                const questions = await waitForQuizQuestions();
                if (questions === null) {
                    log('success', '检测到当前章节测验已完成');
                    advanceAfterSubmit = settings.autoNext;
                    setActivity(settings.autoNext ? '测验已完成，准备下一节' : '测验已完成，可手动进入下一节');
                    return;
                }
                if (questions.length > 100) throw new Error('题目数量超过 100，请分开处理');
                const docs = new Set(questions.map((question) => question.doc));
                if (docs.size !== 1) throw new Error('题目跨多个框架，已停止填选');
                const decoder = await buildTextDecoder(questions);
                if (decoder) {
                    for (const question of questions) {
                        question.title = decoder.decode(question.title);
                        for (const option of question.options) option.text = decoder.decode(option.text);
                    }
                    log('info', decoder.mode === 'glyph' ? '已按字形比对还原题干和选项' : '已用页面字体映射还原题干和选项');
                }
                const countText = clean(questions[0].doc.body.innerText).match(/题量\s*[:：]?\s*(\d+)/);
                if (countText && Number(countText[1]) !== questions.length) {
                    throw new Error(`页面显示 ${countText[1]} 道题，脚本只识别 ${questions.length} 道，已停止提交`);
                }
                const signature = questions.map((question) => `${question.kind}:${question.title}`).join('|');
                if (attemptedQuizzes.has(signature)) throw new Error('本次测验已尝试过，已停止重复提交');
                log('info', `识别到 ${questions.length} 道题，开始请求 DeepSeek`);
                log('info', '题干若含替换字，模型会先还原再作答，下面会显示还原结果');
                setActivity(`识别到 ${questions.length} 道题，等待 DeepSeek 作答…`);
                beginReviewSession(questions);
                questions.forEach(q => { const pairs = questionControls(q); answerBinding(q, pairs); });
                attemptedQuizzes.add(signature);
                const { answers, rawAnswers } = await askAnswers(questions, app._requestController.signal);
                if (stopped || app._destroyed || !settings.autoQuiz) return;
                const restoredById = new Map(rawAnswers
                    .filter((item) => typeof item.restored === 'string' && item.restored.trim())
                    .map((item) => [item.id, item.restored.trim()]));
                for (let index = 0; index < questions.length; index++) {
                    const question = questions[index];
                    const theme = commonOptionSuffix(question.options);
                    log('info', `${index + 1}. [${question.kind}] ${truncate(question.title, 34)} → ${answers.get(index + 1).join('')}${theme ? `（主题：${theme}）` : ''}`);
                    const restored = restoredById.get(index + 1);
                    if (!restored) {
                        log('warn', '   ↳ 模型未给出还原后的题干');
                        continue;
                    }
                    const score = restorationScore(question.title, restored);
                    log(score >= 0.5 ? 'success' : 'warn',
                        `   ↳ 还原（与原文重合 ${Math.round(score * 100)}%）：${truncate(restored, 48)}`);
                }
                const doubtful = Array.from(restoredById.entries())
                    .filter(([id, text]) => !questions[id - 1] || restorationScore(questions[id - 1].title, text) < 0.5)
                    .map(([id]) => id);
                if (!restoredById.size) log('warn', '模型未返回还原后的题干；若页面替换字较多，请核对答案后再提交');
                else if (doubtful.length) log('warn', `第 ${doubtful.join('、')} 题的还原与原文差异较大，提交前请核对`);
                setActivity('答案已生成，正在选择选项…');
                await selectAnswers(questions, answers);
                attemptedQuizzes.add(signature);
                app._reviewPending = true;
                app._isPlaying = false;
                app._clearCheckInterval();
                if (settings.autoSubmit) {
                    const outcome = await submitVerifiedQuiz(questions, {
                        signal: app._requestController.signal,
                        assertActive() { if (stopped || app._destroyed) throw new Error('脚本已停止'); },
                    });
                    log(outcome.status === 'completed' ? 'success' : 'warn', outcome.message);
                    setActivity(outcome.message);
                    setMode(outcome.status === 'completed' ? 'idle' : 'waiting');
                    advanceAfterSubmit = outcome.status === 'completed' && settings.autoNext;
                } else {
                    setActivity('本地答案字段已核对，等待手动提交');
                    setMode('waiting');
                    log('warn', '自动提交已关闭，请检查后手动提交');
                }
            })().catch((error) => {
                app._nextUnitPending = false;
                if (stopped) return;
                if (reviewSession) reviewSession.busy = false;
                app._reviewPending = true;
                log('error', `章节测验自动作答停止：${error.message || error}`);
                setActivity('测验停止：' + (error.message || ''));
                setMode('error');
            }).finally(() => {
                quizBusy = false;
                app._chapterQuizBusy = false;
                if (advanceAfterSubmit && !stopped && !app._destroyed && settings.autoNext) {
                    app._reviewPending = false;
                    app.nextUnit();
                }
            });
        };
    }

    function createPlayer() {
        const app = {
            _requestController: new AbortController(),
            configs: {
                autoplay: true,
                retryInterval: 2000,
                maxRetries: 10,
                videoCheckInterval: 500,
                guardNoProgressMs: 7000,
                guardResumeCooldownMs: 1500,
                autoAdvanceNoVideo: false,
                emptySectionGraceMs: 10000,
                unknownStepWarnMs: 60000,
                videoMarkWaitMs: 12000,
                stepWatchIntervalMs: 400,
                navigationTimeoutMs: 30000,
                navigationPollMs: 250,
                navigationStablePolls: 2,
            },
            _videoEl: null,
            _treeContainerEl: null,
            _isPlaying: false,
            _currentRetryCount: 0,
            _checkInterval: null,
            _eventVideoEl: null,
            _boundVideoHandlers: null,
            _nextUnitPending: false,
            _nextUnitSince: 0,
            _navigationActive: false,
            _pendingSkipLoggedAt: 0,
            _chapterAdvanceTimes: 0,
            _cellData: {
                cells: 0,
                nCells: 0,
                currentCellIndex: 0,
                currentNCellIndex: 0,
                currentVideoTitle: '',
            },
            get cellData() {
                return this._cellData;
            },
            run() {
                this._destroyed = false;
                log('success', `=== 辅助填选已启动 v${VERSION} ===`);
                this._nextUnitPending = false;
                this._chapterAdvanceTimes = 0;
                if (getJQuery()?.fn && document.querySelector('#coursetree')) {
                    this._getTreeContainer();
                    this._initCellData();
                }
                log('info', `当前学习步骤：${this._currentStepTitle() || '等待页面加载'}`);
                this._videoEl = null;
                this._getVideoEl();
                this._clearCheckInterval();
                if (getJQuery()?.fn) this._bindStepNavigation();
                this._startInlineQuizWatch();
                this._startStepWatch();
                this._startHealthWatch();
                this._catalogueFloor = this._currentCatalogueIndex();
                this._bindTreeClicks();
                this.play();
            },
            nextUnit() {
                if (this._nextUnitPending) {
                    log('warn', '已有小节切换正在进行，忽略重复请求');
                    return;
                }
                this._nextUnitPending = true;
                this._clearCheckInterval();
                try {
                    const el = this._getTreeContainer();
                    const cells = el.children('ul').children('li');
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    if (nCells.length > this._cellData.currentNCellIndex + 1) {
                        const nextNIndex = this._cellData.currentNCellIndex + 1;
                        this.playCurrentIndex(nCells.get(nextNIndex));
                    } else {
                        const nextIndex = this._cellData.currentCellIndex + 1;
                        if (nextIndex >= cells.length) {
                            log('success', '本课程学习完成了');
                            setActivity('全部小节已完成');
                            setMode('idle');
                            notifyCompletion('本课程所有小节都已完成（右侧目录全部打勾）');
                            return;
                        }
                        this._cellData.currentCellIndex = nextIndex;
                        this._cellData.currentNCellIndex = 0;
                        this.playCurrentIndex();
                    }
                } catch (error) {
                    this._nextUnitPending = false;
                    log('error', `切换下一小节失败：${error.message || error}`);
                }
            },
            _clearCheckInterval() {
                if (this._checkInterval) {
                    clearInterval(this._checkInterval);
                    this._checkInterval = null;
                }
            },
            _startVideoMonitoring() {
                this._clearCheckInterval();
                this._guardLastTime = 0;
                this._guardLastWallTs = 0;
                this._guardLastResumeTs = 0;
                this._checkInterval = setInterval(() => {
                    this._checkVideoStatus();
                }, this.configs.videoCheckInterval);
            },
            _startInlineQuizWatch() {
                if (this._inlineQuizTimer) return;
                this._inlineQuizTimer = setInterval(() => this._maybeSolveInlineQuiz(), 500);
            },
            _maybeSolveInlineQuiz() {
                if (this._inlineQuizBusy || this._destroyed || this._reviewPending || !settings.autoQuiz) return;
                try {
                    if (this._isChapterTest()) return;
                    if (quizCompleted() || !this._getVideoEl()) return;
                    const context = inlineContext(extractQuestions(true));
                    if (!context) return; // 不把整页章节测验当成视频弹题。
                    const { questions, submitRoot, submit } = context;
                    questions.forEach(questionControls);
                    if (!currentApiKey()) {
                        if (!this._inlineKeyWarned) {
                            this._inlineKeyWarned = true;
                            log('warn', '视频弹题需要 DeepSeek API Key：请在面板顶部输入并保存，脚本会自动继续');
                        }
                        const pendingVideo = this._getVideoEl();
                        if (pendingVideo && !pendingVideo.paused) {
                            try {
                                pendingVideo.pause();
                            } catch (error) {
                                /* 忽略 */
                            }
                        }
                        return;
                    }
                    this._inlineKeyWarned = false;
                    this._inlineDetectedAt = Date.now();
                    const signature = questions.map((question) => `${question.kind}:${question.title}:${question.options.length}`).join('|');
                    const attempts = this._inlineAttempts.get(signature) || 0;
                    if (attempts >= 1) return;
                    this._inlineAttempts.set(signature, attempts + 1);
                    const video = this._getVideoEl();
                    if (video && !video.paused) {
                        try {
                            video.pause();
                            log('info', '已暂停视频，等待弹题作答');
                            this._inlinePauseCheckTimer = setTimeout(() => {
                                if (this._inlineQuizBusy && !video.paused) {
                                    log('warn', '弹题期间播放器又自动恢复了播放，倒计时可能继续');
                                }
                            }, 700);
                        } catch (error) {
                            /* 忽略 */
                        }
                    }
                    this._inlineQuizBusy = true;
                    this._solveInlineQuiz(questions, submitRoot, submit, signature);
                } catch (error) {
                    log('error', `视频弹题检测失败：${error.message || error}`);
                }
            },
            async _solveInlineQuiz(questions, submitRoot, submit, signature) {
                let resumeAfterSubmit = false;
                try {
                    log('info', `检测到视频弹题（${questions.length} 道），开始作答`);
                    beginReviewSession(questions);
                    questions.forEach(q => { const pairs = questionControls(q); answerBinding(q, pairs); });
                    const decoder = fontDecoderCache.decoder;
                    if (decoder) {
                        for (const question of questions) {
                            question.title = decoder.decode(question.title);
                            for (const option of question.options) option.text = decoder.decode(option.text);
                        }
                        log('info', '已用缓存的字体映射还原视频弹题');
                    }
                    const { answers } = await (async () => {
                        const cached = this._inlineAnswerCache.get(signature);
                        if (cached) {
                            log('info', '使用已缓存的弹题答案');
                            return { answers: cached };
                        }
                        const result = await askAnswers(questions, this._requestController.signal);
                        this._inlineAnswerCache.set(signature, result.answers);
                        return result;
                    })();
                    for (let index = 0; index < questions.length; index++) {
                        log('info', `弹题 ${index + 1}. [${questions[index].kind}] ${truncate(questions[index].title, 34)} → ${answers.get(index + 1).join('')}`);
                    }
                    if (this._destroyed || !settings.autoQuiz) return;
                    if (typeof this._selectAnswers !== 'function') throw new Error('选择状态核对器不可用，已停止');
                    await this._selectAnswers(questions, answers);
                    this._reviewPending = true;
                    this._isPlaying = false;
                    this._clearCheckInterval();
                    if (settings.autoSubmit) {
                        const outcome = await submitVerifiedQuiz(questions, {
                            kind: 'inline', submitRoot, submit,
                            signal: this._requestController.signal,
                            assertActive: () => { if (this._destroyed) throw new Error('脚本已停止'); },
                        });
                        resumeAfterSubmit = outcome.status === 'closed' || outcome.status === 'completed';
                        log(resumeAfterSubmit ? 'success' : 'warn', outcome.message);
                        setActivity(outcome.message);
                        setMode(resumeAfterSubmit ? 'running' : 'waiting');
                    } else {
                        setActivity('弹题本地答案字段已核对，等待手动提交');
                        setMode('waiting');
                    }
                } catch (error) {
                    if (!this._destroyed) {
                        log('error', `视频弹题作答失败：${error.message || error}`);
                        setActivity('弹题填选停止：' + (error.message || ''));
                        setMode('error');
                    }
                } finally {
                    if (reviewSession?.questions === questions) reviewSession.busy = false;
                    this._inlineQuizBusy = false;
                    this._reviewPending = !resumeAfterSubmit;
                    if (resumeAfterSubmit && !this._destroyed) setTimeout(() => this.play(), 0);
                }
            },
            _tryResumePlayback(reason) {
                if (this._inlineQuizBusy) return;
                const now = Date.now();
                if (now - this._guardLastResumeTs < this.configs.guardResumeCooldownMs) return;
                this._guardLastResumeTs = now;
                const video = this._getVideoEl();
                if (!video || !this._isPlaying || this._playPending) return;
                if (Number(video.readyState) < 2) return;
                applyPlaybackRate(video);
                video.muted = true;
                video.defaultMuted = true;
                video.volume = 0;
                video.play().catch(() => {
                    video.muted = true;
                    video.play().catch((error) => log('error', `恢复播放失败：${error.message || error}`));
                });
            },
            _checkVideoStatus() {
                try {
                    const video = this._getVideoEl();
                    if (!video) return;
                    if (this._inlineQuizBusy) return;
                    applyPlaybackRate(video);
                    video.muted = true;
                    video.defaultMuted = true;
                    video.volume = 0;
                    if (video.paused) {
                        /* 页面已自行暂停，保持暂停 */
                    } else if (this._isPlaying && !video.ended) {
                        const now = Date.now();
                        const current = Number(video.currentTime || 0);
                        if (this._guardLastWallTs === 0) {
                            this._guardLastWallTs = now;
                            this._guardLastTime = current;
                        } else {
                            const stalled = Math.abs(current - this._guardLastTime) < 0.01;
                            const stalledMs = now - this._guardLastWallTs;
                            if (stalled && stalledMs >= this.configs.guardNoProgressMs) {
                                this._tryResumePlayback('no-progress');
                                this._guardLastWallTs = now;
                                this._guardLastTime = Number(video.currentTime || 0);
                            } else if (!stalled) {
                                this._guardLastWallTs = now;
                                this._guardLastTime = current;
                            }
                        }
                    }
                    if (video.ended && this._isPlaying) {
                        this._isPlaying = false;
                        setTimeout(() => this.nextUnit(), 400);
                    }
                } catch (error) {
                    log('error', `视频状态检查失败：${error.message || error}`);
                }
            },
            _tryTimes: 0,
            _stepAdvanceTimes: 0,
            _stepSwitchAt: 0,
            _stepSwitchPending: false,
            _delayedNextUnitTimer: null,
            _playPending: null,
            _transientPlayAttempts: 0,
            _markWaitIdentity: '',
            _markWaitTimer: null,
            _videoWaitTimer: null,
            _coursewareTabTimer: null,
            _coursewareScrollIdentity: '',
            _emptySectionTimer: null,
            _emptySectionIdentity: '',
            _emptySectionSkips: 0,
            _unknownLogIdentity: '',
            _unknownWarnTimer: null,
            _completedCatalogueAttempts: new Map(),
            _completedCatalogueRetryAt: new Map(),
            _catalogueFloor: -1,
            _staleMarkKey: '',
            _treeClickBound: false,
            _onTreeClick: null,
            _stepWatchTimer: null,
            _healthTimer: null,
            _stepWatchIdentity: '',
            _startStepWatch() {
                if (this._stepWatchTimer) return;
                this._stepWatchIdentity = learningStepSnapshot().identity;
                this._stepWatchTimer = setInterval(() => {
                    if (this._destroyed) return;
                    // 看门狗：锁着“进入下一节”却没有任何进行中的切换，5 秒后自动解锁，避免整机卡死。
                    if (this._nextUnitPending && !this._navigationActive && Date.now() - (this._nextUnitSince || 0) > 5000) {
                        this._nextUnitPending = false;
                        this._nextUnitSince = 0;
                        log('warn', '“进入下一节”一直锁着却没有实际切换，已自动解锁并继续');
                    }
                    if (this._nextUnitPending || this._inlineQuizBusy || this._chapterQuizBusy || this._reviewPending) return;
                    // 对号优先：即使正在处理播放或页面还在加载，也要第一时间响应右侧目录的完成标记。
                    if (this._tryCompletedCatalogueStep()) return;
                    if (this._playPending || state.mode === 'error') return;
                    const now = learningStepSnapshot();
                    if (!now.type || now.identity === this._stepWatchIdentity) return;
                    this._stepWatchIdentity = now.identity;
                    this._videoEl = null;
                    this._isPlaying = false;
                    this.play();
                }, this.configs.stepWatchIntervalMs);
            },
            _currentCatalogueIndex() {
                const key = currentActiveCell();
                if (!key) return -1;
                return catalogueEntries().findIndex(entry => entry.key === key);
            },
            _bindTreeClicks() {
                if (this._treeClickBound) return;
                this._treeClickBound = true;
                this._onTreeClick = (event) => {
                    if (!event.isTrusted) return;
                    const target = event.target;
                    if (!target || typeof target.closest !== 'function' || !target.closest('#coursetree')) return;
                    setTimeout(() => {
                        const index = this._currentCatalogueIndex();
                        if (index >= 0) this._catalogueFloor = index;
                    }, 300);
                };
                document.addEventListener('click', this._onTreeClick, true);
            },
            _startHealthWatch() {
                if (this._healthTimer) return;
                this._healthTimer = setInterval(() => {
                    if (this._destroyed) return;
                    if (!this._stepWatchTimer) this._startStepWatch();
                    if (this._nextUnitPending && !this._navigationActive && Date.now() - (this._nextUnitSince || 0) > 5000) {
                        this._nextUnitPending = false;
                        this._nextUnitSince = 0;
                        log('warn', '“进入下一节”一直锁着却没有实际切换，已自动解锁并重试');
                        this.play();
                    }
                    // v1.3.4：右侧已经打了对号、却 45 秒没换节（目录父行或页脚“下一节”的点击被吞），
                    // 重置重试计数再试一次，避免“必须重新点开始”才能继续。
                    const stuckIdentity = this._markWaitIdentity || '';
                    if (this._stallIdentity !== stuckIdentity) {
                        this._stallIdentity = stuckIdentity;
                        this._stallSince = Date.now();
                    } else if (
                        stuckIdentity &&
                        !this._nextUnitPending &&
                        !this._reviewPending &&
                        !this._inlineQuizBusy &&
                        !this._chapterQuizBusy &&
                        Date.now() - (this._stallSince || 0) > 45000 &&
                        completedCatalogueCourseware()
                    ) {
                        this._completedCatalogueAttempts.clear();
                        this._completedCatalogueRetryAt.clear();
                        this._giveUpKey = '';
                        this._stallSince = Date.now();
                        log('warn', '同一小节 45 秒没有切走（右侧已有对号），重置重试计数，再点一次“下一节”');
                        this.play();
                    }
                }, 2000);
            },
            _tryCompletedCatalogueStep() {
                if (this._destroyed || this._nextUnitPending || this._inlineQuizBusy || this._chapterQuizBusy || this._reviewPending || state.mode === 'error' ||
                    !settings.autoNext || !settings.skipCourseware) return false;
                const completed = completedCatalogueCourseware();
                if (!completed) return false;
                // 目录高亮行有时会滞后或回退到旧小节；只允许往前走，避免从正在加载的视频误跳回旧节。
                const entries = catalogueEntries();
                const index = entries.findIndex(entry => entry.key === completed.key);
                if (index >= 0 && index < (this._catalogueFloor ?? 0)) {
                    if (this._staleMarkKey !== completed.key) {
                        this._staleMarkKey = completed.key;
                        log('info', `目录高亮停在已经走过的小节“${truncate(completed.title, 20)}”上，忽略这次对号`);
                    }
                    return false;
                }
                // 同一小节最多尝试 6 次，两次之间至少间隔 10 秒，避免对号识别抖动时连续点击。
                // v1.3.4：原来只给 2 次，点两次没切过去就永久放弃，表现为“卡住、要重新点开始”。
                const retryAt = this._completedCatalogueRetryAt.get(completed.key) || 0;
                if (Date.now() < retryAt) return true;
                const attempts = this._completedCatalogueAttempts.get(completed.key) || 0;
                // v1.3.6：前两次仍用点击；如果点了两下页面还是不动，就直接按章节地址跳，
                // 避免出现“自动点 6 次都没切过去，只能手动点”。
                if (attempts >= 2 && completed.next && navigateToCatalogueEntry(completed.next)) {
                    this._completedCatalogueAttempts.set(completed.key, attempts + 1);
                    this._completedCatalogueRetryAt.set(completed.key, Date.now() + 15000);
                    return true;
                }
                if (attempts >= 6) {
                    if (this._giveUpKey !== completed.key) {
                        this._giveUpKey = completed.key;
                        log('warn', `“${truncate(completed.title, 20)}”自动点了 6 次“下一节”都没切过去；请手动点一下页脚的“下一节”，脚本会继续等对号`);
                    }
                    return true;
                }
                this._completedCatalogueAttempts.set(completed.key, attempts + 1);
                this._completedCatalogueRetryAt.set(completed.key, Date.now() + 10000);
                if (this._emptySectionTimer) {
                    clearTimeout(this._emptySectionTimer);
                    this._emptySectionTimer = null;
                }
                if (this._videoWaitTimer) {
                    clearTimeout(this._videoWaitTimer);
                    this._videoWaitTimer = null;
                }
                if (this._coursewareTabTimer) {
                    clearTimeout(this._coursewareTabTimer);
                    this._coursewareTabTimer = null;
                }
                const nextButton = findNextButton();
                if (!completed.next && (!nextButton || nextButton.disabled || nextButton.getAttribute('aria-disabled') === 'true')) {
                    setMode('idle');
                    setActivity('当前小节已完成，目录中没有下一小节');
                    return true;
                }
                this._clearCheckInterval();
                this._videoEl = null;
                this._isPlaying = false;
                log('success', `右侧已出现完成标记（✓）：${truncate(completed.title, 40)}`);
                log('info', `直接进入下一节：${truncate(completed.next?.title, 40) || '目录中的下一小节'}`);
                setMode('running');
                setActivity('已出现对号，正在进入下一节…');
                this.nextUnit({ completedKey: completed.key });
                return true;
            },
            _handleCoursewareStep() {
                this._videoEl = null;
                this._isPlaying = false;
                this._clearCheckInterval();
                if (!settings.autoNext) {
                    setMode('waiting');
                    setActivity('已识别 PPT/课件；开启“自动跳节”后，右侧出现对号时自动进入下一节');
                    return;
                }
                if (!settings.skipCourseware) {
                    setMode('waiting');
                    setActivity('已识别 PPT/课件；开启“对号跳节”后，右侧出现对号时自动进入下一节');
                    return;
                }
                // 只等右侧对号，不再“识别到课件就抢跳”；对号出现后由 _tryCompletedCatalogueStep 统一跳节。
                if (this._emptySectionTimer) {
                    clearTimeout(this._emptySectionTimer);
                    this._emptySectionTimer = null;
                }
                const snapshot = learningStepSnapshot();
                if (this._markWaitIdentity === snapshot.identity) return;
                this._markWaitIdentity = snapshot.identity;
                log('info', `已识别 PPT/PDF/课件：等待右侧完成标记（✓），出现后直接进入下一节。${catalogueSelfCheck()}`);
                setMode('waiting');
                setActivity('等待右侧对号（✓）…');
                if (this._markWaitTimer) clearTimeout(this._markWaitTimer);
                this._markWaitTimer = setTimeout(() => {
                    this._markWaitTimer = null;
                    if (this._destroyed || this._nextUnitPending || this._markWaitIdentity !== snapshot.identity) return;
                    if (learningStepSnapshot().identity !== snapshot.identity) return;
                    log('warn', '60 秒仍未出现对号：若这一节要手动翻完才打勾，可点面板“下一节”手动切换');
                }, 60000);
                // 这套课程的小节有“教学视频 / 课件 / 教材内容”多个页签：课件页本身不会自动打勾，
                // 真正能完成任务点的是“教学视频”。课件页 8 秒没对号就自动切过去播视频。
                if (this._coursewareTabTimer) clearTimeout(this._coursewareTabTimer);
                this._coursewareTabTimer = setTimeout(() => {
                    this._coursewareTabTimer = null;
                    if (this._destroyed || this._nextUnitPending || this._reviewPending || this._inlineQuizBusy) return;
                    if (this._markWaitIdentity !== snapshot.identity) return;
                    if (this._currentStepTitle() !== '课件') return;
                    if (completedCatalogueCourseware()) return;
                    const tab = this._videoTabElement();
                    if (!tab) return;
                    log('info', '这一节还有“教学视频”页签：课件页不会自己打勾，先切过去把视频播了');
                    setActivity('切到“教学视频”页签…');
                    clickElement(tab);
                    setTimeout(() => this.play(), 1500);
                }, 8000);
                // 自动翻页已按用户要求下线：长课件不再自动翻，等右侧对号出现再走；
                // 你手动翻完后平台打勾，脚本会照常跳下一节。
                if (this._coursewareScrollIdentity !== snapshot.identity) {
                    this._coursewareScrollIdentity = snapshot.identity;
                    this._noteCoursewareManualWait();
                }
            },
            // 自动翻页已移除：只在日志里说明一次，避免误以为脚本还在偷偷翻。
            _noteCoursewareManualWait() {
                setTimeout(() => {
                    if (this._destroyed) return;
                    if (this._currentStepTitle() !== '课件') return;
                    if (completedCatalogueCourseware()) return;
                    log('info', '这个课件要翻到底平台才打勾：自动翻页已取消，请你手动翻完；对号一出现会自动进下一节');
                }, 5000);
            },
            _videoTabElement() {
                if (!getJQuery()?.fn) return null;
                try {
                    return $('.prev_white:visible').filter((_, element) => {
                        const text = ($(element).text() || '').replace(/\s+/g, '');
                        return /教学视频/.test(text) || text === '2视频' || text === '视频';
                    }).get(0) || null;
                } catch (error) {
                    return null;
                }
            },
            _scheduleEmptySectionSkip() {
                if (this._emptySectionTimer || this._destroyed) return;
                const current = activeCatalogueEntry();
                // 父目录页（自身没有内容、只有子节）不用等 10 秒，3 秒就够；叶子小节给足加载时间。
                const grace = current && !current.isLeaf ? 3000 : this.configs.emptySectionGraceMs;
                this._emptySectionIdentity = learningStepSnapshot().identity;
                this._emptySectionTimer = setTimeout(() => {
                    this._emptySectionTimer = null;
                    if (this._destroyed || this._nextUnitPending || this._reviewPending || this._inlineQuizBusy || this._chapterQuizBusy || state.mode === 'error') return;
                    if (!settings.autoNext || !settings.skipCourseware) return;
                    if (currentLearningStep()) return;                                          // 期间加载出内容了，交给正常流程
                    if (this._emptySectionIdentity !== learningStepSnapshot().identity) return; // 页面已经变化
                    if (completedCatalogueCourseware()) return;                                 // 对号出现了，交给对号逻辑
                    if (!emptySectionHint()) return;                                            // “暂无内容”已消失，说明还在加载
                    if (this._emptySectionSkips >= 5) {
                        log('warn', '连续跳过 5 个空小节仍没有可识别内容，已停止自动跳节；请检查页面');
                        setActivity('连续空小节，已停止自动跳节');
                        return;
                    }
                    const next = findNextButton();
                    if (!next || next.disabled || next.getAttribute('aria-disabled') === 'true') {
                        log('warn', '这一节是空内容，又没有可用的“下一节”按钮；请手动切换');
                        setActivity('空小节，但没有可用的“下一节”');
                        return;
                    }
                    this._emptySectionSkips++;
                    log('warn', `这一节没有内容也没有对号（空小节），直接点“下一节”（${this._emptySectionSkips}/5）`);
                    setActivity('空小节，正在进入下一节…');
                    this._nextUnitPending = true;
                    this._nextUnitSince = Date.now();
                    this._clearCheckInterval();
                    next.click();
                    // 平台可能弹“任务点未完成，是否继续”，只确认弹窗里的按钮，不重复点页面上的“下一节”。
                    const startedAt = Date.now();
                    const confirmTimer = setInterval(() => {
                        if (this._destroyed || Date.now() - startedAt > 5000) {
                            clearInterval(confirmTimer);
                            return;
                        }
                        const button = navigationConfirmButton(learningStepSnapshot(), { allowTaskPrompt: true });
                        if (!button) return;
                        if (button.id !== 'popok' && !button.closest(DIALOG_SELECTOR) && !button.closest('#popcontent')) return;
                        clearInterval(confirmTimer);
                        try { button.click(); } catch (error) { /* 忽略 */ }
                        log('info', '已确认“进入下一节”的弹窗');
                    }, 500);
                    setTimeout(() => {
                        this._nextUnitPending = false;
                        if (this._destroyed) return;
                        this._videoEl = null;
                        this._isPlaying = false;
                        this.play();
                    }, 1800);
                }, grace);
            },
            _scheduleUnknownStepWarning() {
                if (this._unknownWarnTimer || this._destroyed) return;
                const identity = this._stepWatchIdentity;
                this._unknownWarnTimer = setTimeout(() => {
                    this._unknownWarnTimer = null;
                    if (this._destroyed || this._nextUnitPending || state.mode === 'error') return;
                    if (currentLearningStep()) return;
                    if (learningStepSnapshot().identity !== identity) return;
                    if (completedCatalogueCourseware()) return;
                    log('warn', '60 秒没有识别到任何内容，也没检测到“暂无内容”提示；如果本节确实有内容，请点面板“下一节”手动切换');
                }, this.configs.unknownStepWarnMs);
            },
            _inlineQuizTimer: null,
            _inlineQuizBusy: false,
            _inlineAttempts: new Map(),
            _inlineAnswerCache: new Map(),
            _inlineStructureWarned: false,
            _inlineKeyWarned: false,
            _inlineDetectedAt: 0,
            _inlinePauseCheckTimer: null,
            _guardLastTime: 0,
            _guardLastWallTs: 0,
            _guardLastResumeTs: 0,
            async play() {
                if (this._destroyed || this._inlineQuizBusy || this._reviewPending) return;
                if (this._playPending) return this._playPending;
                this._playPending = this._playOnce().finally(() => {
                    this._playPending = null;
                });
                return this._playPending;
            },
            async _playOnce() {
                try {
                    this._stepWatchIdentity = learningStepSnapshot().identity;
                    if (this._currentStepTitle()) this._emptySectionSkips = 0;
                    if (this._tryCompletedCatalogueStep()) return;
                    if (this._currentStepTitle() === '课件') {
                        this._handleCoursewareStep();
                        return;
                    }
                    if (this._isChapterTest()) {
                        this._videoEl = null;
                        this._isPlaying = false;
                        this._clearCheckInterval();
                        setMode('running');
                        this._advanceChapterTest();
                        return;
                    }
                    const el = this._getVideoEl();
                    if (el == null) {
                        if (this._currentStepTitle() === '视频') throw new Error('视频组件尚未加载完成');
                        if (this._advanceLearningStep()) {
                            log('info', '当前不在视频页，已尝试切到“视频”页签，1 秒后重试');
                            setTimeout(() => this.play(), 1000);
                            return;
                        }
                        if (this._isChapterTest()) {
                            this._advanceChapterTest();
                            return;
                        }
                        this._isPlaying = false;
                        this._clearCheckInterval();
                        setMode('idle');
                        if (this.configs.autoAdvanceNoVideo) {
                            log('warn', '当前小节未发现视频，按配置切换到下一小节');
                            this.nextUnit();
                        } else {
                            const hint = emptySectionHint();
                            if (this._unknownLogIdentity !== this._stepWatchIdentity) {
                                this._unknownLogIdentity = this._stepWatchIdentity;
                                log('info', `内容尚未识别，等待加载：${catalogueSelfCheck()}`);
                                if (hint) {
                                    log('warn', `页面显示“${hint}”，这一节没有可播放/可作答内容；等一会儿仍无右侧对号就点“下一节”`);
                                }
                            }
                            if (hint) this._scheduleEmptySectionSkip();
                            else this._scheduleUnknownStepWarning();
                            setActivity(hint ? '本节暂无内容，等待对号或自动跳过…' : '等待视频、测验或 PPT/课件加载…');
                            setMode('waiting');
                        }
                        return;
                    }
                    this._isPlaying = true;
                    this._videoEventHandle();
                    try {
                        el.muted = true;
                        el.defaultMuted = true;
                        el.volume = 0;
                        applyPlaybackRate(el);
                        await el.play();
                        if (this._destroyed) return;
                        this._tryTimes = 0;
                        this._transientPlayAttempts = 0;
                        applyPlaybackRate(el);
                        setMode('running');
                        const actualRate = Number(el.playbackRate) || 1;
                        log('success', `视频开始播放：${truncate(this._cellData.currentVideoTitle || '未命名', 24)}（${actualRate}x）`);
                        setActivity('视频播放中');
                        this._startVideoMonitoring();
                    } catch (playError) {
                        if (isTransientPlayError(playError)) {
                            await this._handleTransientPlayError(el);
                            return;
                        }
                        log('error', `视频播放失败：${playError.message || playError}`);
                        this._handlePlayError(playError);
                    }
                } catch (error) {
                    if (this._tryTimes >= this.configs.maxRetries) {
                        log('error', `视频播放失败，已达最大重试次数：${error.message || error}`);
                        this._clearCheckInterval();
                        setActivity('播放失败，请检查页面');
                        return;
                    }
                    this._tryTimes++;
                    log('warn', `${this.configs.retryInterval / 1000} 秒后重试播放 (${this._tryTimes}/${this.configs.maxRetries})`);
                    setTimeout(() => this.play(), this.configs.retryInterval);
                }
            },
            async _handleTransientPlayError(el) {
                this._transientPlayAttempts = (this._transientPlayAttempts || 0) + 1;
                if (this._transientPlayAttempts > 8) {
                    this._isPlaying = false;
                    this._clearCheckInterval();
                    log('error', '视频资源长时间未就绪，已停止重试；请检查播放器或刷新页面');
                    setActivity('视频资源未就绪');
                    setMode('error');
                    return;
                }
                log('info', `视频还在加载，等待就绪后继续播放（${this._transientPlayAttempts}/8）`);
                setActivity('等待视频加载…');
                await sleep(500);
                await waitForMediaReady(el, 3000);
                if (!el.isConnected) {
                    this._videoEl = null;
                    setTimeout(() => this.play(), 200);
                    return;
                }
                setTimeout(() => this.play(), 250);
            },
            _advanceLearningStep() {
                if (this._stepSwitchPending && Date.now() - this._stepSwitchAt < 4000) return true;
                const currentStepTitle = this._currentStepTitle();
                if (['章节测验', '视频', '课件'].includes(currentStepTitle) || !getJQuery()?.fn) return false;
                const clickElement = (element, label) => {
                    if (!element) return false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    log('info', `尝试点击${label}`);
                    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                    return true;
                };
                const videoTab = $('.prev_white:visible').filter((_, element) => {
                    const text = ($(element).text() || '').replace(/\s+/g, '');
                    return text === '2视频' || text === '视频';
                }).get(0);
                if (clickElement(videoTab, '“视频”页签')) return true;
                return false;
            },
            _currentStepTitle() {
                return currentLearningStep();
            },
            _isChapterTest() {
                return this._currentStepTitle() === '章节测验';
            },
            _advanceChapterTest() {
                log('warn', '测验填选器未就绪，请停止后重新开始；不会自动切换或提交');
            },
            _bindStepNavigation() {
                if (this._stepNavigationBound) return;
                this._stepNavigationBound = true;
                const reenterVideoMode = () => {
                    this._videoEl = null;
                    this._isPlaying = false;
                    this._reviewPending = false;
                    this._stepSwitchPending = true;
                    this._stepSwitchAt = Date.now();
                    setTimeout(() => {
                        try {
                            this._initCellData();
                        } catch (error) {
                            /* 页面尚未就绪 */
                        }
                        this.play();
                    }, 800);
                };
                $(document).off('click.xuexitongPlayerV4', '.prev_white').on('click.xuexitongPlayerV4', '.prev_white', (event) => {
                    const text = ($(event.currentTarget).text() || '').replace(/\s+/g, '');
                    if (/视频|章节测验|PPT|PDF|课件|文档|演示文稿|幻灯片/i.test(text)) {
                        log('info', `检测到步骤切换：${text}，重新识别页面`);
                        reenterVideoMode();
                    }
                });
            },
            _handlePlayError(error) {
                if (this._tryTimes >= this.configs.maxRetries) {
                    log('error', `视频播放失败，已达最大重试次数：${error.message || error}`);
                    this._isPlaying = false;
                    this._clearCheckInterval();
                    setActivity('播放失败，请检查页面');
                    return;
                }
                this._tryTimes++;
                log('warn', `${this.configs.retryInterval / 1000} 秒后重试播放 (${this._tryTimes}/${this.configs.maxRetries})`);
                if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
                this._delayedNextUnitTimer = setTimeout(() => {
                    this._delayedNextUnitTimer = null;
                    this.play();
                }, this.configs.retryInterval);
            },
            playCurrentIndex(nCell) {
                this._nextUnitPending = false;
                if (!nCell) {
                    const el = this._getTreeContainer();
                    const cells = el.children('ul').children('li');
                    const nCells = $(cells.get(this._cellData.currentCellIndex)).find('.posCatalog_select:not(.firstLayer)');
                    nCell = nCells.get(this._cellData.currentNCellIndex);
                }
                const $nCell = $(nCell);
                const clickableSpan = $nCell.find('.posCatalog_name')[0];
                if (!clickableSpan) {
                    log('error', '找不到可点击的课程节点，播放下一个视频失败');
                    return;
                }
                log('info', `切换到：${$(clickableSpan).attr('title') || '未知标题'}`);
                $(clickableSpan).click();
                this._videoEl = null;
                this._isPlaying = false;
                setTimeout(() => {
                    try {
                        this._initCellData();
                    } catch (error) {
                        log('warn', '课程目录尚未刷新，稍后自动重试');
                        return;
                    }
                    if (this.configs.autoplay) this.play();
                }, 1200);
            },
            _initCellData() {
                const el = this._getTreeContainer();
                const cells = el.children('ul').children('li');
                this._cellData.cells = cells.length;
                let nCellCounts = 0;
                let foundCurrent = false;
                cells.each((index, element) => {
                    const nCells = $(element).find('.posCatalog_select:not(.firstLayer)');
                    nCellCounts += nCells.length;
                    nCells.each((nIndex, nElement) => {
                        const $el = $(nElement);
                        if ($el.hasClass('posCatalog_active')) {
                            this._cellData.currentCellIndex = index;
                            this._cellData.currentNCellIndex = nIndex;
                            foundCurrent = true;
                            const titleSpan = $el.find('.posCatalog_name')[0];
                            if (titleSpan) this._cellData.currentVideoTitle = $(titleSpan).attr('title');
                        }
                    });
                });
                this._cellData.nCells = nCellCounts;
                if (!foundCurrent && nCellCounts > 0) log('warn', '未找到当前激活的视频节点，可能需要手动选择');
            },
            _getTreeContainer() {
                if (!this._treeContainerEl) {
                    const el = $('#coursetree');
                    if (el.length <= 0) throw new Error('找不到视频列表（#coursetree），请确认已进入课程播放页');
                    this._treeContainerEl = el;
                }
                return this._treeContainerEl;
            },
            _getVideoEl() {
                if (this._videoEl && !this._videoEl.isConnected) {
                    this._detachVideoEvents();
                    this._videoEl = null;
                }
                if (!this._videoEl) {
                    for (const doc of courseDocuments()) {
                        const video = Array.from(doc.querySelectorAll('video')).find(visible);
                        if (!video) continue;
                        this._videoEl = video;
                        video.muted = true;
                        applyPlaybackRate(video);
                        break;
                    }
                }
                return this._videoEl || null;
            },
            _videoEventHandle() {
                const el = this._videoEl;
                if (!el) return;
                if (this._eventVideoEl === el) return;
                this._detachVideoEvents();
                this._eventVideoEl = el;
                this._boundVideoHandlers = {
                    ended: this._handleVideoEnded.bind(this),
                    loadedmetadata: this._handleVideoLoaded.bind(this),
                    play: this._handleVideoPlay.bind(this),
                    pause: this._handleVideoPause.bind(this),
                    ratechange: this._handleVideoRateChange.bind(this),
                };
                el.addEventListener('ended', this._boundVideoHandlers.ended);
                el.addEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                el.addEventListener('play', this._boundVideoHandlers.play);
                el.addEventListener('pause', this._boundVideoHandlers.pause);
                el.addEventListener('ratechange', this._boundVideoHandlers.ratechange);
            },
            _detachVideoEvents() {
                if (!this._eventVideoEl || !this._boundVideoHandlers) return;
                this._eventVideoEl.removeEventListener('ended', this._boundVideoHandlers.ended);
                this._eventVideoEl.removeEventListener('loadedmetadata', this._boundVideoHandlers.loadedmetadata);
                this._eventVideoEl.removeEventListener('play', this._boundVideoHandlers.play);
                this._eventVideoEl.removeEventListener('pause', this._boundVideoHandlers.pause);
                this._eventVideoEl.removeEventListener('ratechange', this._boundVideoHandlers.ratechange);
                this._eventVideoEl = null;
                this._boundVideoHandlers = null;
            },
            _handleVideoEnded() {
                log('success', `“${truncate(this._cellData.currentVideoTitle || '当前视频', 24)}”播放完成`);
                this._isPlaying = false;
                this._clearCheckInterval();
                setActivity('视频已播完，等待右侧对号…');
                // 不再 0.4 秒就点下一节：先留时间让平台把对号打上，等不到再按视频规则继续。
                if (this._videoWaitTimer) clearTimeout(this._videoWaitTimer);
                this._videoWaitTimer = setTimeout(() => {
                    this._videoWaitTimer = null;
                    if (this._destroyed || this._nextUnitPending || this._reviewPending || this._inlineQuizBusy) return;
                    if (!settings.autoNext) {
                        setActivity('视频已播完，自动跳节已关闭');
                        return;
                    }
                    if (completedCatalogueCourseware()) return; // 对号已出现，交给对号监听去跳
                    log('warn', `视频播完 ${Math.round(this.configs.videoMarkWaitMs / 1000)} 秒仍没有对号（平台可能没把倍速播放计入观看时长），按“下一节”继续；建议把倍速调低重看这一节`);
                    this.nextUnit();
                }, this.configs.videoMarkWaitMs);
            },
            _handleVideoLoaded() {
                if (this.configs.autoplay && !this._isPlaying) this.play();
            },
            _handleVideoPlay() {
                this._isPlaying = true;
                this._stepSwitchPending = false;
                const video = this._getVideoEl();
                this._guardLastTime = Number(video?.currentTime || 0);
                this._guardLastWallTs = Date.now();
                if (this._delayedNextUnitTimer) {
                    clearTimeout(this._delayedNextUnitTimer);
                    this._delayedNextUnitTimer = null;
                }
            },
            _handleVideoPause() {
                if (this._inlineQuizBusy) return;
                if (!this._isPlaying) return;
                this._isPlaying = false;
                log('info', '视频已暂停');
            },
            _handleVideoRateChange() {
                const rate = Number(settings.rate) || 0;
                const video = this._videoEl;
                if (rate <= 0 || rateBlocked || !video) return;
                if (Math.abs(Number(video.playbackRate || 1) - rate) < 0.01) {
                    this._rateResets = 0;
                    return;
                }
                const now = Date.now();
                if (!this._rateResetAt || now - this._rateResetAt > 2000) this._rateResets = 0;
                this._rateResetAt = now;
                this._rateResets = (this._rateResets || 0) + 1;
                if (this._rateResets > 8) {
                    rateBlocked = true;
                    video.__xtRateTarget = 0;
                    unlockRateLock(video);
                    if (!this._rateWarned) {
                        this._rateWarned = true;
                        log('warn', `播放器反复重置倍速（实际 ${Number(video.playbackRate) || 1}x），已停止强制；可改用播放器自带倍速`);
                    }
                    return;
                }
                setTimeout(() => applyPlaybackRate(video), 0);
            },
            _bindPageGuards() {
                if (this._pageGuards) return;
                const preventPause = (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                };
                const resumePlaybackNow = () => this._tryResumePlayback('page-event');
                this._pageGuards = { preventPause, resumePlaybackNow };
                document.addEventListener('mouseleave', preventPause);
                window.addEventListener('mouseleave', preventPause);
                document.addEventListener('mouseout', preventPause);
                window.addEventListener('mouseout', preventPause);
                window.addEventListener('blur', resumePlaybackNow);
                document.addEventListener('visibilitychange', resumePlaybackNow);
            },
            destroy() {
                this._destroyed = true;
                if (this._markWaitTimer) clearTimeout(this._markWaitTimer);
                this._markWaitTimer = null;
                if (this._onTreeClick) {
                    document.removeEventListener('click', this._onTreeClick, true);
                    this._onTreeClick = null;
                    this._treeClickBound = false;
                }
                if (this._videoWaitTimer) clearTimeout(this._videoWaitTimer);
                this._videoWaitTimer = null;
                if (this._coursewareTabTimer) clearTimeout(this._coursewareTabTimer);
                this._coursewareTabTimer = null;
                if (this._emptySectionTimer) clearTimeout(this._emptySectionTimer);
                this._emptySectionTimer = null;
                if (this._unknownWarnTimer) clearTimeout(this._unknownWarnTimer);
                this._unknownWarnTimer = null;
                if (this._stepWatchTimer) clearInterval(this._stepWatchTimer);
                this._stepWatchTimer = null;
                if (this._healthTimer) clearInterval(this._healthTimer);
                this._healthTimer = null;
                if (this._inlineQuizTimer) {
                    clearInterval(this._inlineQuizTimer);
                    this._inlineQuizTimer = null;
                }
                this._inlineQuizBusy = false;
                this._isPlaying = false;
                this._clearCheckInterval();
                this._detachVideoEvents();
                if (this._delayedNextUnitTimer) clearTimeout(this._delayedNextUnitTimer);
                if (getJQuery()?.fn) $(document).off('.xuexitongPlayerV4');
                this._stepNavigationBound = false;
                if (this._pageGuards) {
                    const { preventPause, resumePlaybackNow } = this._pageGuards;
                    document.removeEventListener('mouseleave', preventPause);
                    window.removeEventListener('mouseleave', preventPause);
                    document.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('mouseout', preventPause);
                    window.removeEventListener('blur', resumePlaybackNow);
                    document.removeEventListener('visibilitychange', resumePlaybackNow);
                    this._pageGuards = null;
                }
            },
        };

        attachQuizAutomation(app);
        return app;
    }

    /* -------------------------------------------------------------- 面板 UI */

    const CSS = `
        :host { all: initial; }
        * { box-sizing: border-box; }
        .panel {
            position: fixed;
            width: 372px;
            color-scheme: dark;
            color: #e7eaf2;
            font: 12.5px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
            background: linear-gradient(180deg, rgba(24,27,35,.98), rgba(15,17,23,.985));
            border: 1px solid rgba(255,255,255,.09);
            border-radius: 14px;
            box-shadow: 0 18px 48px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05);
            overflow: hidden;
            pointer-events: auto;
            user-select: none;
        }
        .head {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 12px;
            background: rgba(255,255,255,.035);
            border-bottom: 1px solid rgba(255,255,255,.06);
            cursor: move;
        }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #5b6472; flex: none; }
        .dot.running { background: #2ee6a8; box-shadow: 0 0 0 3px rgba(46,230,168,.16); }
        .dot.waiting { background: #ffc861; box-shadow: 0 0 0 3px rgba(255,200,97,.14); }
        .dot.error { background: #ff5d5d; box-shadow: 0 0 0 3px rgba(255,93,93,.16); }
        .title { font-size: 13px; font-weight: 600; letter-spacing: .2px; }
        .ver { color: #6b7486; font-size: 10.5px; }
        .spacer { flex: 1; }
        .icon {
            width: 22px; height: 22px; line-height: 18px; text-align: center;
            border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04);
            color: #aab3c5; border-radius: 7px; cursor: pointer; font-size: 14px; padding: 0;
        }
        .icon:hover { background: rgba(255,255,255,.1); color: #fff; }
        .body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
        .panel.min .body { display: none; }
        .panel.min { width: 236px; }
        .row { display: flex; align-items: center; gap: 6px; }
        .keyrow input {
            flex: 1; min-width: 0;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px;
            padding: 6px 8px;
            color: #e7eaf2;
            font: inherit;
            outline: none;
        }
        .keyrow input:focus { border-color: #4c8dff; box-shadow: 0 0 0 2px rgba(76,141,255,.18); }
        .keyrow input::placeholder { color: #687184; }
        .btn {
            border: 1px solid rgba(255,255,255,.1);
            background: rgba(255,255,255,.05);
            color: #dfe4ee;
            padding: 5px 10px;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            white-space: nowrap;
        }
        .btn:hover { background: rgba(255,255,255,.1); }
        .btn:active { transform: translateY(1px); }
        .btn.primary { background: linear-gradient(180deg, #4479ff, #2f5fe0); border-color: #4a7eff; color: #fff; }
        .btn.primary:hover { background: linear-gradient(180deg, #5a8bff, #3a6ae8); }
        .btn.danger { background: rgba(255,93,93,.1); border-color: rgba(255,93,93,.3); color: #ff9d9d; }
        .btn.danger:hover { background: rgba(255,93,93,.18); }
        .btn.tiny { padding: 3px 8px; font-size: 11.5px; }
        .rate {
            margin-left: auto;
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 8px;
            color: #dfe4ee;
            font: inherit;
            padding: 4px 6px;
            outline: none;
            cursor: pointer;
        }
        .rate:focus { border-color: #4c8dff; }
        .lock { display: flex; align-items: center; gap: 4px; color: #b7c0d2; font-size: 11.5px; cursor: pointer; }
        .lock input { accent-color: #4c8dff; margin: 0; }
        .hint { color: #69738a; font-size: 10.5px; margin-top: -3px; }
        .statusline { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .pill {
            flex: none;
            padding: 2px 9px;
            border-radius: 999px;
            background: rgba(76,141,255,.14);
            color: #a8c4ff;
            font-size: 11.5px;
            font-weight: 600;
        }
        .chapter { color: #98a2b8; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .time { margin-left: auto; color: #8b95aa; font-size: 11px; font-variant-numeric: tabular-nums; flex: none; }
        .progress { height: 6px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; }
        .bar { height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, #3f7bff, #2ee6a8); transition: width .35s linear; }
        .activity { color: #8d97ac; font-size: 11.5px; min-height: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .toggles { flex-wrap: wrap; color: #b7c0d2; font-size: 11.5px; }
        .toggles label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
        .toggles input { accent-color: #4c8dff; margin: 0; }
        .log {
            height: 168px;
            overflow-y: auto;
            background: rgba(0,0,0,.32);
            border: 1px solid rgba(255,255,255,.06);
            border-radius: 10px;
            padding: 7px 8px;
            font-family: ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace;
            font-size: 11px;
            line-height: 1.55;
            user-select: text;
            scrollbar-width: thin;
        }
        .log::-webkit-scrollbar { width: 6px; }
        .log::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 3px; }
        .line { display: flex; gap: 6px; word-break: break-word; }
        .line .t { color: #5c667a; flex: none; font-variant-numeric: tabular-nums; }
        .line.info .m { color: #b9c3d6; }
        .line.success .m { color: #63e6b0; }
        .line.warn .m { color: #ffcf6b; }
        .line.error .m { color: #ff8f8f; }
        .foot { color: #5f6a7f; font-size: 10px; text-align: right; }
    `;

    const MARKUP = `
        <div class="panel" id="panel">
            <div class="head" id="drag">
                <span class="dot" id="dot"></span>
                <span class="title" id="mode-title">学习通辅助填选·自动提交</span>
                <span class="ver">v${VERSION}</span>
                <span class="spacer"></span>
                <button class="icon" data-act="min" title="最小化">–</button>
                <button class="icon" data-act="hide" title="隐藏（Alt+Shift+D 恢复）">×</button>
            </div>
            <div class="body">
                <div class="row keyrow">
                    <input id="key" type="password" spellcheck="false" autocomplete="off" placeholder="粘贴 DeepSeek API Key（sk-…）">
                    <button class="btn" data-act="save-key">保存</button>
                    <button class="btn" data-act="test-key">测试</button>
                </div>
                <div class="hint">Key 仅保存在本机油猴存储中，不会写入页面。</div>
                <div class="statusline">
                    <span class="pill" id="step">未开始</span>
                    <span class="chapter" id="chapter"></span>
                    <span class="time" id="time">--:--</span>
                </div>
                <div class="progress"><div class="bar" id="bar"></div></div>
                <div class="activity" id="activity">等待页面加载…</div>
                <div class="row">
                    <button class="btn primary" data-act="start">开始</button>
                    <button class="btn danger" data-act="stop">停止</button>
                    <button class="btn" data-act="next">下一节</button>
                    <select class="rate" id="rate" title="播放倍速（本次升级默认 10x；下方显示实际速度）">
                        <option value="0">跟随页面</option>
                        <option value="1">1.0x</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.5x</option>
                        <option value="1.75">1.75x</option>
                        <option value="2">2.0x</option>
                        <option value="2.5">2.5x</option>
                        <option value="3">3.0x</option>
                        <option value="5">5.0x</option>
                        <option value="10">10.0x</option>
                    </select>
                    <label class="lock" title="拦截页面把倍速改回 1x"><input type="checkbox" id="lock-rate"> 锁定</label>
                </div>
                <div class="row toggles">
                    <label><input type="checkbox" id="auto-quiz"> 辅助填选</label>
                    <label><input type="checkbox" id="auto-next"> 自动跳节</label>
                    <label><input type="checkbox" id="auto-submit"> 自动提交</label>
                    <label title="右侧目录出现完成标记（✓）时立刻进入下一节；PPT/PDF 等课件也按对号走"><input type="checkbox" id="skip-courseware"> 对号跳节</label>
                    <span class="spacer"></span>
                    <button class="btn tiny" data-act="inspect">识别题目</button>
                    <button class="btn tiny" data-act="audit">核对写入</button>
                    <button class="btn tiny" data-act="clear">清空日志</button>
                </div>
                <div class="log" id="log"></div>
                <div class="foot"><span id="rate-actual">实际 —</span> · ${AI_CONFIG.model} · ${AI_CONFIG.effort} 思考 · 上限 ${AI_CONFIG.maxTokens} tokens · <span id="submit-mode">核对后自动提交</span></div>
            </div>
        </div>
    `;

    let host = null;
    let shadow = null;
    let panelEl = null;
    let ui = {};

    function renderSubmitMode() {
        setText(ui.modeTitleEl, '学习通辅助填选·' + (settings.autoSubmit ? '自动提交' : '手动提交'));
        setText(ui.submitModeEl, settings.autoSubmit ? '核对后自动提交' : '手动提交');
    }

    function timeLabel() {
        const now = new Date();
        return [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map((value) => String(value).padStart(2, '0')).join(':');
    }

    function log(level, message) {
        const levels = ['info', 'success', 'warn', 'error'];
        const kind = levels.includes(level) ? level : 'info';
        const text = typeof message === 'string' ? message : String(message);
        try {
            if (kind === 'error') console.error('[XT-DS]', text);
            else if (kind === 'warn') console.warn('[XT-DS]', text);
            else console.log('[XT-DS]', text);
        } catch (error) {
            /* 忽略控制台不可用 */
        }
        if (!ui.logEl) return;
        const line = document.createElement('div');
        line.className = 'line ' + kind;
        const time = document.createElement('span');
        time.className = 't';
        time.textContent = timeLabel();
        const body = document.createElement('span');
        body.className = 'm';
        body.textContent = text;
        line.append(time, body);
        const stick = ui.logEl.scrollHeight - ui.logEl.scrollTop - ui.logEl.clientHeight < 48;
        ui.logEl.append(line);
        while (ui.logEl.children.length > LOG_LIMIT) ui.logEl.firstElementChild.remove();
        if (stick) ui.logEl.scrollTop = ui.logEl.scrollHeight;
    }

    function setActivity(text) {
        state.activity = text;
        if (ui.activityEl) ui.activityEl.textContent = text;
    }

    function setMode(mode) {
        state.mode = mode;
        if (ui.dotEl) ui.dotEl.className = 'dot ' + mode;
    }

    function setText(element, text) {
        if (element && element.textContent !== text) element.textContent = text;
    }

    function mount() {
        if (host) return;
        host = document.createElement('div');
        host.id = 'xt-ds-host';
        host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
        shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>${CSS}</style>${MARKUP}`;
        (document.documentElement || document.body).appendChild(host);

        ui = {
            panelEl: shadow.getElementById('panel'),
            dragEl: shadow.getElementById('drag'),
            dotEl: shadow.getElementById('dot'),
            stepEl: shadow.getElementById('step'),
            chapterEl: shadow.getElementById('chapter'),
            timeEl: shadow.getElementById('time'),
            barEl: shadow.getElementById('bar'),
            activityEl: shadow.getElementById('activity'),
            logEl: shadow.getElementById('log'),
            keyEl: shadow.getElementById('key'),
            autoQuizEl: shadow.getElementById('auto-quiz'),
            autoNextEl: shadow.getElementById('auto-next'),
            autoSubmitEl: shadow.getElementById('auto-submit'),
            skipCoursewareEl: shadow.getElementById('skip-courseware'),
            modeTitleEl: shadow.getElementById('mode-title'),
            submitModeEl: shadow.getElementById('submit-mode'),
            rateEl: shadow.getElementById('rate'),
            rateActualEl: shadow.getElementById('rate-actual'),
            lockEl: shadow.getElementById('lock-rate'),
        };
        panelEl = ui.panelEl;

        ui.keyEl.value = settings.apiKey;
        ui.autoQuizEl.checked = settings.autoQuiz;
        ui.autoNextEl.checked = settings.autoNext;
        ui.autoSubmitEl.checked = settings.autoSubmit;
        ui.skipCoursewareEl.checked = settings.skipCourseware;
        renderSubmitMode();
        ui.rateEl.value = String(settings.rate || 0);
        ui.lockEl.checked = settings.lockRate;
        // v1.3.5：不再沿用“最小化”——窗口变窄后旧位置会把面板挤出可视区，用户就看不到日志了。
        panelEl.classList.remove('min');
        const clampPanel = () => {
            const width = panelEl.offsetWidth || 370;
            const height = panelEl.offsetHeight || 480;
            const saved = settings.position;
            if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
                panelEl.style.left = clamp(saved.x, 8, Math.max(8, window.innerWidth - width - 8)) + 'px';
                panelEl.style.top = clamp(saved.y, 8, Math.max(8, window.innerHeight - Math.min(height, 160))) + 'px';
            } else {
                panelEl.style.right = '18px';
                panelEl.style.top = '76px';
            }
        };
        clampPanel();
        try {
            window.addEventListener('resize', () => {
                const rect = panelEl.getBoundingClientRect();
                settings.position = { x: rect.left, y: rect.top };
                clampPanel();
            });
        } catch (error) { /* 忽略 */ }

        shadow.addEventListener('click', onPanelClick);
        ui.keyEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveKey();
            }
            event.stopPropagation();
        });
        ui.keyEl.addEventListener('input', () => {
            settings.apiKey = String(ui.keyEl.value || '').trim();
            if (state.app) state.app._inlineKeyWarned = false;
        });
        ui.autoQuizEl.addEventListener('change', () => {
            settings.autoQuiz = ui.autoQuizEl.checked;
            if (!settings.autoQuiz) stopAutomation('已关闭辅助填选');
            // 每次加载重新关闭辅助填选，避免继承旧的自动答题开关。
            log('info', `辅助填选已${settings.autoQuiz ? '开启' : '关闭'}；${settings.autoSubmit ? '核对后自动提交' : '等待手动提交'}`);
            if (settings.autoQuiz && state.app && !state.app._destroyed) state.app.play();
        });
        ui.autoSubmitEl.addEventListener('change', () => {
            settings.autoSubmit = ui.autoSubmitEl.checked;
            storage.set('autoSubmit', settings.autoSubmit);
            renderSubmitMode();
            log('info', `自动提交已${settings.autoSubmit ? '开启（下一次填选完成后生效）' : '关闭；待执行的自动确认会取消'}`);
        });
        ui.skipCoursewareEl.addEventListener('change', () => {
            settings.skipCourseware = ui.skipCoursewareEl.checked;
            storage.set('skipCourseware', settings.skipCourseware);
            log('info', settings.skipCourseware
                ? '对号跳节已开启：右侧出现 ✓ 就进入下一节'
                : '对号跳节已关闭：不会自动切换下一节');
            if (state.app && !state.app._destroyed) state.app.play();
        });
        ui.autoNextEl.addEventListener('change', () => {
            settings.autoNext = ui.autoNextEl.checked;
            storage.set('autoNext', settings.autoNext);
            log('info', `自动跳节已${settings.autoNext ? '开启' : '关闭'}`);
            if (state.app && !state.app._destroyed) state.app.play();
        });
        ui.rateEl.addEventListener('change', () => {
            const rate = Number(ui.rateEl.value) || 0;
            settings.rate = rate;
            storage.set('rate', rate);
            rateBlocked = false;
            if (state.app?._videoEl) {
                state.app._videoEl.__xtRateRejected = false;
                state.app._videoEl.__xtRateRequested = null;
            }
            if (state.app) {
                state.app._rateWarned = false;
                state.app._rateResets = 0;
            }
            if (rate <= 0 || !settings.lockRate) {
                const video = state.app && state.app._videoEl;
                unlockRateLock(video);
            }
            applyRateToCurrent();
            log('info', rate > 0 ? `播放目标已设为 ${rate}x（含后续视频），实际值见面板底部` : '播放倍速已恢复为跟随页面');
        });
        ui.lockEl.addEventListener('change', () => {
            settings.lockRate = ui.lockEl.checked;
            storage.set('lockRate', settings.lockRate);
            if (!settings.lockRate) {
                const video = state.app && state.app._videoEl;
                unlockRateLock(video);
            }
            applyRateToCurrent();
            log('info', `倍速锁定已${settings.lockRate ? '开启' : '关闭'}`);
        });

        enableDrag();
        ['keydown', 'keyup', 'keypress'].forEach((type) => {
            host.addEventListener(type, (event) => event.stopPropagation());
        });
        window.addEventListener('resize', clampPosition);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function clampPosition() {
        if (!panelEl || !panelEl.style.left) return;
        const rect = panelEl.getBoundingClientRect();
        panelEl.style.left = clamp(rect.left, 0, Math.max(0, window.innerWidth - Math.min(rect.width, 372))) + 'px';
        panelEl.style.top = clamp(rect.top, 0, Math.max(0, window.innerHeight - 52)) + 'px';
    }

    function enableDrag() {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;
        ui.dragEl.addEventListener('pointerdown', (event) => {
            if (event.target.closest('button')) return;
            const rect = panelEl.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            panelEl.style.right = 'auto';
            panelEl.style.left = rect.left + 'px';
            panelEl.style.top = rect.top + 'px';
            ui.dragEl.setPointerCapture(event.pointerId);
        });
        ui.dragEl.addEventListener('pointermove', (event) => {
            if (!dragging) return;
            const width = panelEl.getBoundingClientRect().width;
            panelEl.style.left = clamp(event.clientX - offsetX, 0, Math.max(0, window.innerWidth - width)) + 'px';
            panelEl.style.top = clamp(event.clientY - offsetY, 0, Math.max(0, window.innerHeight - 44)) + 'px';
        });
        const end = (event) => {
            if (!dragging) return;
            dragging = false;
            const rect = panelEl.getBoundingClientRect();
            settings.position = { x: rect.left, y: rect.top };
            storage.set('position', settings.position);
        };
        ui.dragEl.addEventListener('pointerup', end);
        ui.dragEl.addEventListener('pointercancel', end);
    }

    function toggleMin() {
        if (!panelEl) return;
        panelEl.classList.toggle('min');
        settings.minimized = panelEl.classList.contains('min');
        storage.set('minimized', settings.minimized);
        clampPosition();
    }

    function toggleVisible() {
        if (!host) return;
        host.style.display = host.style.display === 'none' ? '' : 'none';
    }

    function onPanelClick(event) {
        const button = event.target.closest('[data-act]');
        if (!button) return;
        event.preventDefault();
        const action = button.dataset.act;
        if (action === 'save-key') saveKey();
        else if (action === 'test-key') testKey();
        else if (action === 'start') startAutomation();
        else if (action === 'stop') stopAutomation('手动停止');
        else if (action === 'next') advanceOnce();
        else if (action === 'inspect') {
            inspectQuestions().catch((error) => log('error', `识别题目失败：${error.message || error}`));
        }
        else if (action === 'diagnose') diagnoseFont();
        else if (action === 'audit') inspectAnswerWrites();
        else if (action === 'clear') {
            if (ui.logEl) ui.logEl.textContent = '';
        } else if (action === 'min') toggleMin();
        else if (action === 'hide') toggleVisible();
    }

    function currentApiKey() {
        const typed = ui && ui.keyEl ? String(ui.keyEl.value || '').trim() : '';
        return typed || clean(settings.apiKey);
    }

    function saveKey() {
        const value = String(ui.keyEl.value || '').trim();
        settings.apiKey = value;
        storage.set('apiKey', value);
        if (state.app) state.app._inlineKeyWarned = false;
        log(value ? 'success' : 'warn', value ? 'API Key 已保存到本机油猴存储' : '已清空 API Key');
        setActivity(value ? 'API Key 已保存' : '未设置 API Key');
    }

    async function testKey() {
        const key = String(ui.keyEl.value || settings.apiKey || '').trim();
        if (!key) {
            log('warn', '请先填写 API Key');
            return;
        }
        setActivity('正在验证 API Key…');
        try {
            const response = await gmRequest({
                method: 'GET',
                url: MODELS_URL,
                headers: { Authorization: `Bearer ${key}` },
                timeout: 20000,
            });
            if (response.status === 200) {
                log('success', 'API Key 可用');
                setActivity('API Key 验证通过');
            } else {
                const message = describeHttpError(response);
                log('error', message);
                setActivity(message);
            }
        } catch (error) {
            log('error', error.message || String(error));
            setActivity(error.message || '验证失败');
        }
    }

    function applyRateToCurrent() {
        if (!state.app) return;
        let video = null;
        try {
            video = state.app._videoEl || (typeof state.app._getVideoEl === 'function' ? state.app._getVideoEl() : null);
        } catch (error) {
            return;
        }
        if (!video) return;
        if (settings.rate > 0) {
            applyPlaybackRate(video);
            return;
        }
        unlockRateLock(video);
        try {
            video.playbackRate = 1;
        } catch (error) {
            /* 个别播放器禁止修改倍速 */
        }
    }

    function startAutomation() {
        const typedKey = String(ui.keyEl?.value || '').trim();
        if (typedKey !== settings.apiKey) {
            settings.apiKey = typedKey;
            storage.set('apiKey', typedKey);
        }
        if (state.app && typeof state.app.destroy === 'function') {
            try {
                state.app.destroy();
            } catch (error) {
                /* 忽略旧实例清理失败 */
            }
        }
        state.app = null;
        if ((!getJQuery() || !getJQuery().fn) && !['章节测验', '课件'].includes(currentLearningStep()) && !completedCatalogueCourseware()) {
            log('error', '视频页尚未加载 jQuery，请稍后重试；测验页可直接识别');
            return;
        }
        setMode('running');
        setActivity('正在启动自动化…');
        try {
            const app = createPlayer();
            state.app = app;
            app.run();
            app._bindPageGuards();
        } catch (error) {
            try {
                state.app?.destroy?.();
            } catch (cleanupError) {
                /* 忽略清理失败 */
            }
            state.app = null;
            setMode('error');
            const message = error.message || String(error);
            log('error', `启动失败：${message}`);
            setActivity(`启动失败：${message}`);
        }
    }

    function stopAutomation(reason) {
        if (state.app && typeof state.app.destroy === 'function') {
            try {
                state.app.destroy();
            } catch (error) {
                /* 忽略清理失败 */
            }
        }
        state.app = null;
        setMode('idle');
        setActivity(reason ? `已停止（${reason}）` : '已停止');
        log('warn', '自动化已停止');
    }

    function advanceOnce() {
        if (!state.app) {
            log('warn', '尚未启动，请先点击“开始”');
            return;
        }
        state.app.nextUnit();
        setActivity('已请求切换下一节');
    }

    async function inspectQuestions() {
        let questions = [];
        try {
            questions = extractQuestions() || [];
        } catch (error) {
            log('error', `识别题目失败：${error.message || error}`);
            return;
        }
        if (!questions.length) {
            log('warn', '当前页面没有识别到题目（可能尚未进入章节测验）');
            return;
        }
        log('info', '注意：超星用字体替换防复制——页面显示正常，复制或读取出来却是别的字；下面是脚本读到的文字');
        const decoder = await buildTextDecoder(questions);
        if (decoder) {
            for (const question of questions) {
                question.title = decoder.decode(question.title);
                for (const option of question.options) option.text = decoder.decode(option.text);
            }
            log('success', decoder.mode === 'glyph' ? '已按字形比对还原下面的题干和选项' : '已用页面字体映射还原下面的题干和选项');
        } else {
            log('warn', '没有可用的字体映射：下面若有读不通的字（如“乱叁”“厶”），就是被替换的字；点“开始”后模型会先还原，并在日志里回显还原结果');
        }
        log('info', `识别到 ${questions.length} 道题：`);
        for (let index = 0; index < questions.length; index++) {
            const item = questions[index];
            log('info', `${index + 1}. [${item.kind}] ${truncate(item.title, 40)}｜选项 ${item.options.length} 个`);
        }
    }

    function diagnoseFont() {
        const lines = [];
        try {
            performance.getEntriesByType('resource')
                .filter((entry) => /\.(woff2?|ttf|otf)(\?|#|$)/i.test(entry.name))
                .slice(0, 10)
                .forEach((entry) => lines.push(`字体资源：${entry.name}`));
        } catch (error) {
            /* 忽略 */
        }
        try {
            document.fonts.forEach((font) => lines.push(`@font：${font.family} ${font.weight} ${font.status}`));
        } catch (error) {
            /* 忽略 */
        }
        try {
            for (const sheet of Array.from(document.styleSheets)) {
                let rules = null;
                try {
                    rules = sheet.cssRules;
                } catch (error) {
                    continue;
                }
                for (const rule of Array.from(rules || [])) {
                    if (rule.type === 5) lines.push(`@font-face：${rule.style.fontFamily} ${truncate(rule.style.src, 120)}`);
                }
            }
        } catch (error) {
            /* 忽略 */
        }
        let card = null;
        try {
            const questions = extractQuestions();
            card = questions[0]?.card || document.querySelector('.questionLi, .TiMu, .mark_item, .question');
        } catch (error) {
            card = document.querySelector('.questionLi, .TiMu, .mark_item, .question');
        }
        if (card) {
            const style = getComputedStyle(card);
            lines.push(`题目字体：${style.fontFamily} / ${style.fontSize} / 颜色 ${style.color}`);
            for (const pseudo of ['::before', '::after']) {
                try {
                    const content = getComputedStyle(card, pseudo).content;
                    if (content && content !== 'none' && content !== 'normal') lines.push(`${pseudo}：${truncate(content, 100)}`);
                } catch (error) {
                    /* 忽略 */
                }
            }
            for (const attr of ['title', 'aria-label', 'data-title', 'data-text']) {
                const value = card.getAttribute(attr);
                if (value) lines.push(`${attr}：${truncate(value, 80)}`);
            }
        } else {
            lines.push('未找到题目卡片，请在章节测验页运行');
        }
        try {
            let found = 0;
            for (const doc of deepDocuments()) {
                const submit = findButtonContaining(doc, '提交');
                if (submit && visible(submit)) {
                    const container = submit.parentElement?.parentElement;
                    lines.push(`提交按钮：<${submit.tagName}> ${truncate(clean(submit.innerText || submit.value), 20)}｜容器：${truncate(clean(container?.innerText), 80)}`);
                    found++;
                    if (found >= 3) break;
                }
            }
        } catch (error) {
            /* 忽略 */
        }
        log('info', '=== 字体/伪元素诊断 ===');
        lines.slice(0, 30).forEach((line) => log('info', line));
        if (!lines.length) log('warn', '未发现字体或伪元素线索');
    }

    function renderStatus() {
        if (!ui.stepEl) return;
        const app = state.app;
        let step = '';
        if (app) {
            try {
                step = app._currentStepTitle() || '';
            } catch (error) {
                step = '';
            }
        }
        if (!step) {
            step = app ? '待命'
                : state.mode === 'error' ? '异常'
                    : state.mode === 'waiting' ? '等待页面' : '未开始';
        }
        setText(ui.stepEl, step);

        let chapter = '';
        if (app && app._cellData) {
            const data = app._cellData;
            if (data.cells) chapter = `第 ${data.currentCellIndex + 1}/${data.cells} 章 · 第 ${data.currentNCellIndex + 1} 节`;
            if (data.currentVideoTitle) chapter += ` · ${truncate(data.currentVideoTitle, 16)}`;
        }
        setText(ui.chapterEl, chapter);

        let time = '--:--';
        let percent = 0;
        if (app) {
            try {
                const video = app._videoEl;
                if (video && Number.isFinite(video.duration) && video.duration > 0) {
                    percent = Math.min(100, (video.currentTime / video.duration) * 100);
                    time = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
                }
            } catch (error) {
                /* 忽略读取失败 */
            }
        }
        if (ui.barEl) ui.barEl.style.width = percent.toFixed(2) + '%';
        setText(ui.timeEl, time);

        let actualRate = '实际 —';
        if (app) {
            try {
                const video = app._videoEl;
                if (video) actualRate = `实际 ${Number(video.playbackRate) || 1}x`;
            } catch (error) {
                /* 忽略读取失败 */
            }
        }
        setText(ui.rateActualEl, actualRate);
    }

    function installHotkey() {
        window.addEventListener('keydown', (event) => {
            if (event.altKey && event.shiftKey && String(event.key).toLowerCase() === 'd') {
                event.preventDefault();
                event.stopPropagation();
                toggleVisible();
            }
        }, true);
    }

    function registerMenus() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        try {
            GM_registerMenuCommand('显示 / 隐藏面板', toggleVisible);
            GM_registerMenuCommand('开始自动化', () => startAutomation());
            GM_registerMenuCommand('停止自动化', () => stopAutomation('菜单停止'));
            GM_registerMenuCommand('识别当前题目', inspectQuestions);
            GM_registerMenuCommand('目录 / 对号自检', () => log('info', catalogueSelfCheck()));
            GM_registerMenuCommand('核对答案写入（不提交）', inspectAnswerWrites);
            GM_registerMenuCommand('字体 / 伪元素诊断', diagnoseFont);
            GM_registerMenuCommand('清空日志', () => {
                if (ui.logEl) ui.logEl.textContent = '';
            });
        } catch (error) {
            /* 菜单不可用时忽略 */
        }
    }

    function ensureJQuery() {
        return new Promise((resolve, reject) => {
            let injected = false;
            const started = Date.now();
            const timer = setInterval(() => {
                if (getJQuery() && getJQuery().fn) {
                    clearInterval(timer);
                    resolve();
                    return;
                }
                const elapsed = Date.now() - started;
                if (!injected && elapsed >= 2500) {
                    injected = true;
                    try {
                        const script = document.createElement('script');
                        script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
                        script.onerror = () => log('warn', 'jQuery 备用地址加载失败，继续等待页面自身脚本');
                        (document.head || document.documentElement).appendChild(script);
                    } catch (error) {
                        log('warn', '注入 jQuery 失败，继续等待页面自身脚本');
                    }
                }
                if (elapsed >= 20000) {
                    clearInterval(timer);
                    reject(new Error('页面未加载 jQuery，无法启动自动化'));
                }
            }, 200);
        });
    }

    async function waitForCourseTree() {
        for (let attempt = 0; attempt < 240; attempt++) {
            if (getJQuery() && getJQuery()('#coursetree').length > 0) return true;
            if (attempt % 20 === 0) setActivity('等待课程页面加载（#coursetree）…');
            await sleep(250);
        }
        return false;
    }

    async function boot() {
        setMode('waiting');
        setActivity('正在等待学习通课程页…');
        try {
            const initialStep = currentLearningStep();
            if (['章节测验', '课件'].includes(initialStep) || completedCatalogueCourseware(initialStep)) {
                setMode('idle');
                setActivity(initialStep === '章节测验' ? '已识别测验：勾选辅助填选后点击开始；' + (settings.autoSubmit ? '核对后自动提交' : '等待手动提交') :
                    '当前小节右侧已有完成标记：勾选“对号跳节”后点击开始，会自动进入下一节');
                return;
            }
            await ensureJQuery();
            if (state.app) return;
            const ready = await waitForCourseTree();
            if (state.app) return;
            if (!ready) {
                setMode('idle');
                log('warn', '60 秒内未检测到课程目录，请确认已进入课程播放页；可稍后点击“开始”');
                setActivity('未检测到课程目录，可手动开始');
                return;
            }
            if (!settings.apiKey) {
                log('warn', '尚未保存 API Key：视频可自动播放，章节测验前需要填写');
            }
            setMode('idle');
            setActivity('请点击开始；辅助填选默认关闭，提交方式由自动提交开关决定');
        } catch (error) {
            if (state.app) return;
            setMode('error');
            const message = error.message || String(error);
            log('error', message);
            setActivity(message);
        }
    }

    /* ------------------------------------------------------------------ 启动 */

    mount();
    registerMenus();
    installHotkey();
    // 原生 confirm 默认保留；仅在单次已核对的提交点击中临时处理并立即恢复。
    log('warn', '⚠️ 使用警示：本脚本仅供技术研究，禁止用于网课刷课；一切使用后果由使用者自行承担。');
    log('info', `面板已加载 v${VERSION}`);
    if (settings.apiKey) log('info', '已读取本机保存的 API Key');
    setInterval(renderStatus, 1000);
    boot();

    // 便于在油猴管理面板外调试：window.__xtDs
    try {
        window.__xtDs = {
            version: VERSION,
            get app() { return state.app; },
            start: startAutomation,
            stop: stopAutomation,
            inspect: inspectQuestions,
            requestAnswers,
        };
    } catch (error) {
        /* 某些页面禁用 window 扩展时忽略 */
    }
})();
