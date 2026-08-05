/**
 * 维基 wikitext / xslist 页面解析模块
 * 解析逻辑与用户脚本「jav备注」保持一致，便于两端产出同构数据。
 *
 * 数据约定（重要）：
 * - birth 存 ISO 风格字符串 "YYYY-MM-DD"，月/日未知用 "??"，如 "1993-08-??"
 * - age 不入库（随时间变化），由消费端根据 birth 实时计算
 */

'use strict';

/** 从 wikitext 中提取模板参数，按 keys 顺序取第一个有值的 */
function pickParam(txt, keys) {
  for (const key of keys) {
    // 匹配 |key = <same-line-value>，值不能跨行也不能吃掉后续参数
    const re = new RegExp('\\|\\s*' + key + '\\s*=([^\\n]*)');
    const m = re.exec(txt);
    if (m) {
      const v = m[1]
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/'{2,}/g, '')
        .trim();
      if (v) return v;
    }
  }
  return '';
}

/** 闭区间 => 已结束（2015年 - 2023年）；开区间 => 在役（2015年 -） */
function isClosedPeriod(s) {
  return /\d{4}\s*年?\s*[-–—~〜]\s*\d{4}\s*年/.test(s);
}

/** 从闭区间字符串中取出结束年份，如「2015年 - 2023年」=> "2023" */
function closedPeriodEnd(s) {
  const m = /\d{4}\s*年?\s*[-–—~〜]\s*(\d{4})\s*年/.exec(s || '');
  return m ? m[1] : '';
}

/** 从期间字符串中取出起始年份，如「2015年 - 2023年」=> "2015" */
function periodStart(s) {
  const m = /(\d{4})\s*年/.exec(s || '');
  return m ? m[1] : '';
}

/** 根据 birth("YYYY-MM-DD"，月日可为 "??") 计算当前年龄 */
function calcAge(birth) {
  if (!birth) return '';
  const m = /^(\d{4})-(\d{2}|\?\?)-(\d{2}|\?\?)$/.exec(birth);
  if (!m) return '';
  const y = parseInt(m[1], 10);
  const now = new Date();
  let age = now.getFullYear() - y;
  // 月/日已知时判断生日是否已过
  if (m[2] !== '??' && m[3] !== '??') {
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    const passed =
      now.getMonth() + 1 > mo || (now.getMonth() + 1 === mo && now.getDate() >= d);
    if (!passed) age -= 1;
  }
  return age > 0 && age < 120 ? String(age) : '';
}

const pad2 = (v) => (v ? String(v).padStart(2, '0') : '??');

/** 组装 ISO 风格生日字符串 */
function toISOBirth(y, m, d) {
  if (!y) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** 空记录模板 */
function emptyRecord() {
  return {
    nameJa: '',
    nameZh: '',
    aliases: [],
    avatar: '',
    birth: '',
    bloodType: '',
    height: '',
    weight: '',
    threeSize: '',
    cup: '',
    retired: false,
    retiredAt: '',
    debut: '',
    agency: '',
    social: { x: '', instagram: '', tiktok: '' },
    works: '',
    sources: [],
  };
}

/**
 * 生成"职业生涯"展示字符串
 *   引退：debut - retiredAt   （若 retiredAt 只有年份则不带月日）
 *   现役：debut - 至今
 *   无 debut 时返回空
 * 日期分隔符统一用 '.'
 */
function fmtDate(v) {
  return v ? String(v).replace(/-/g, '.') : '';
}
function calcCareer(rec) {
  const debut = fmtDate(rec.debut);
  if (!debut && !rec.retired) return '';
  const from = debut || '?';
  const to = rec.retired ? fmtDate(rec.retiredAt) || '?' : '至今';
  return `${from} - ${to}`;
}

/**
 * 解析维基 wikitext（日文维基 / 中文维基共用 {{AV女優}} 模板）
 * @param {string} wikitext
 * @returns {object} 记录对象，字段缺失则为空字符串
 */
function parseWikitext(wikitext) {
  const r = emptyRecord();
  if (!wikitext) return r;

  // ---- 生年月日：优先 生年/生月/生日；其次 {{birth date and age|Y|M|D}} ----
  let by = pickParam(wikitext, ['生年']);
  let bm = pickParam(wikitext, ['生月']);
  let bd = pickParam(wikitext, ['生日']);
  if (!by) {
    const bda =
      /(?:出生日期|生年月日|birth_date)\s*=\s*\{\{\s*(?:birth date and age|生年月日と年齢|bd)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i.exec(
        wikitext
      );
    if (bda) {
      by = bda[1];
      bm = bda[2];
      bd = bda[3];
    }
  }
  if (by) r.birth = toISOBirth(by, bm, bd);

  // ---- 头像：取 infobox 中的图片文件名 ----
  const img = pickParam(wikitext, ['画像ファイル', '画像', 'image', 'Image']);
  if (img) {
    // 只保留文件名，去除前缀 File: / ファイル: 和尺寸参数
    const imgName = img.replace(/^(?:File|ファイル|Image|画像)\s*[:：]\s*/i, '').split('|')[0].trim();
    if (imgName) {
      // Wikimedia Commons URL 格式
      const encoded = encodeURIComponent(imgName.replace(/ /g, '_'));
      r.avatar = `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=200`;
    }
  }

  // ---- 身高 ----
  const h = pickParam(wikitext, ['身長', '身高']);
  if (h) {
    const hm = /\d+(\.\d+)?/.exec(h);
    if (hm) r.height = hm[0].split('.')[0];
  }

  // ---- 血型 ----
  const bt = pickParam(wikitext, ['血液型', '血型']);
  if (bt) {
    // 提取 A/B/O/AB 型；数据只保留字母，"型"字由展示端在需要时加回
    const btm = /(AB|A|B|O)\s*型?/i.exec(bt);
    if (btm) r.bloodType = btm[1].toUpperCase();
  }

  // ---- 体重（很多条目为空）----
  const wt = pickParam(wikitext, ['体重', '體重']);
  if (wt) {
    const wm = /\d+/.exec(wt);
    if (wm) r.weight = wm[0] + 'kg';
  }

  // ---- 三围 ----
  const bust = pickParam(wikitext, ['バスト']);
  const waist = pickParam(wikitext, ['ウエスト']);
  const hip = pickParam(wikitext, ['ヒップ']);
  const num = (s) => {
    const m = /\d+(\.\d+)?/.exec(s || '');
    return m ? m[0] : '';
  };
  if (bust && waist && hip) {
    r.threeSize = `${num(bust)} - ${num(waist)} - ${num(hip)}`;
  } else {
    const three = pickParam(wikitext, ['スリーサイズ', '三圍', '三围']);
    if (three) r.threeSize = three.replace(/cm/gi, '').trim();
  }

  // ---- 罩杯：保留完整写法 E65 -> E-65 ----
  const cup = pickParam(wikitext, ['カップ', 'ブラサイズ', '罩杯']);
  if (cup) {
    const c = cup.replace(/[（(][^）)]*[）)]/g, '').trim();
    const cmm = /([A-Za-z]+)\s*[-‐–—]?\s*(\d{2,3})?/.exec(c);
    if (cmm) r.cup = cmm[1].toUpperCase() + (cmm[2] ? '-' + cmm[2] : '');
  }

  // ---- 引退判定 + 退役时间 ----
  const period = pickParam(wikitext, ['AV出演期間', '出演期間', '活動内容', '活動時期']);
  if (period && isClosedPeriod(period)) {
    r.retired = true;
    r.retiredAt = closedPeriodEnd(period);
  }
  if (!r.retired && !period) {
    const act = pickParam(wikitext, ['活動期間']);
    if (act && isClosedPeriod(act)) {
      r.retired = true;
      r.retiredAt = closedPeriodEnd(act);
    }
  }

  // 尝试从正文抽取更精确的引退日期 YYYY-MM-DD
  // 依赖已确定的 retiredAt 年份作为过滤条件，避免误抓其他年份的日期
  if (r.retired && r.retiredAt && /^\d{4}$/.test(r.retiredAt)) {
    const year = r.retiredAt;
    // 剥除引用块（<ref> 内的日期是发布记录，不算引退日期）
    const clean = wikitext
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/<ref[^/]*\/>/g, '');

    // 优先级：真正的引退事件（引退作发售 / 引退活动 / 完全引退）
    // 其次是引退发表（宣布）作为兜底
    // 关键：不能匹配 "引退を発表" 这种「宣布日期」（除非找不到更精确的）
    const REAL_RETIRE =
      '(?:AV引退作|完全引退|引退イベント|セクシー女優引退|活動引退|引退作品|ラストシーン|ラスト作品)';
    const ANNOUNCE = '(?:引退を発表|引退発表)';

    const tryPatterns = [
      new RegExp(`${year}年\\s*(\\d{1,2})月\\s*(\\d{1,2})日[^。\\n]{0,80}${REAL_RETIRE}`),
      new RegExp(`(\\d{1,2})月\\s*(\\d{1,2})日[^。\\n]{0,60}${REAL_RETIRE}`),
      new RegExp(`${year}年\\s*(\\d{1,2})月\\s*(\\d{1,2})日[^。\\n]{0,80}${ANNOUNCE}`),
      new RegExp(`(\\d{1,2})月\\s*(\\d{1,2})日[^。\\n]{0,60}${ANNOUNCE}`),
    ];

    for (const p of tryPatterns) {
      const m = p.exec(clean);
      if (m) {
        r.retiredAt = `${year}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
        break;
      }
    }
  }
  // 兜底：正文明确的引退动词。需先剥除 <ref> 引用块，
  // 否则会匹配到参考资料里别人的引退新闻标题。
  if (!r.retired) {
    const cleaned = wikitext
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/<ref[^/]*\/>/g, '')
      .replace(/\{\{Cite[^}]*\}\}/gi, '')
      .replace(/\|\s*(?:title|url|script-title)\s*=\s*[^\n|}]*/gi, '')
      .replace(/\[https?:\/\/[^\s\]]+\s+[^\]]+\]/g, '');
    const retireRe =
      /引退し|を引退|引退を発表|引退後|に引退|宣[布佈]引退|正式引退|身[份分]引退|已引退|退出AV|從[^。]{0,30}引退/;
    if (retireRe.test(cleaned)) r.retired = true;
  }

  // ---- 曾用名 / 别名 ----
  // 別名字段形如「鬼頭桃菜（本名）」，可能有多个用 、/，或空格分隔
  const alias = pickParam(wikitext, ['別名', '別名義', '旧芸名', '曾用名']);
  if (alias) {
    const raw = alias
      // 常见分隔符：中文顿号、日文顿号、逗号、斜杠、多空白
      .split(/[、,，/／]|\s{2,}|\s/)
      .map((s) => s.replace(/[（(][^）)]*[）)]/g, '').trim())
      // 过滤：空值、过长、纯 ASCII（多为误抓的 URL 片段）
      .filter((s) => s && s.length <= 12 && !/^[\w.\-]+$/.test(s));
    // 去重 + 剔除与 nameJa/nameZh 相同的项（后面 report/html 层还会二次过滤，但这里先净化存储）
    const dedup = [...new Set(raw)].filter((a) => a !== r.nameJa && a !== r.nameZh);
    r.aliases = dedup;
  }

  // ---- 所在公司 / 事务所 ----
  const agencyRaw = pickParam(wikitext, [
    '専属契約',
    '所属事務所',
    '事務所',
    '所属',
    'レーベル',
    '經紀公司',
    '经纪公司',
  ]);
  if (agencyRaw) {
    // 剥除 File:xxx.png / Image:xxx.jpg 图片引用（匹配到图片扩展名为止），只保留公司名
    let cleaned = agencyRaw
      .replace(/(?:File|Image|ファイル|画像)\s*[:：].*?\.(?:png|jpe?g|gif|svg|webp)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    // 多段历史（如「A社(xxx時代) B社」）：括号是历史注释，取最后一个 ')' 之后的部分＝当前所属
    // 注意不能按空格切分，否则「S1 NO.1 STYLE」会被截成「STYLE」
    const lastParen = cleaned.lastIndexOf(')');
    const lastParenZh = cleaned.lastIndexOf('）');
    const cut = Math.max(lastParen, lastParenZh);
    if (cut > -1 && cut < cleaned.length - 1) {
      const tail = cleaned.slice(cut + 1).trim();
      if (tail) cleaned = tail;
    }
    r.agency = cleaned;
  }

  // ---- 出道日期 ----
  // 思路：先从 AV出演期間 取起始年份，再在正文中找该年的「M月D日 ... デビュー」
  const debutYear = periodStart(period || pickParam(wikitext, ['活動期間']));
  if (debutYear) {
    const clean2 = wikitext
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/<ref[^/]*\/>/g, '');
    // 模式：「YYYY年M月D日 ... デビュー」或紧邻 AVデビュー 的「M月D日」
    const dPatterns = [
      new RegExp(`${debutYear}年\\s*(\\d{1,2})月\\s*(\\d{1,2})日[^。\\n]{0,80}(?:AVデビュー|デビュー作|AV出演開始)`),
      /(\d{1,2})月\s*(\d{1,2})日[^。\n]{0,80}(?:AVデビュー|でAVデビュー|デビュー作品)/,
      /(\d{1,2})月\s*(\d{1,2})日[^。\n]{0,60}デビュー/,
    ];
    for (const p of dPatterns) {
      const m = p.exec(clean2);
      if (m) {
        r.debut = `${debutYear}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
        break;
      }
    }
    // 找不到精确日期就只留年份
    if (!r.debut) r.debut = debutYear;
  }

  // ---- 社交媒体 ----
  // 只从维基官方账户模板抽取，避免误抓正文引用里其他人的账户。
  // 三大平台的官方模板：{{Twitter|user}} / {{X|user}} / {{Instagram|user}} / {{TikTok|user}}
  const twT = /\{\{\s*(?:Twitter|X)\s*\|\s*([A-Za-z0-9_]{2,20})\s*[|}]/i.exec(wikitext);
  if (twT) r.social.x = twT[1];

  const igT = /\{\{\s*Instagram\s*\|\s*([A-Za-z0-9_.]{2,30})\s*[|}]/i.exec(wikitext);
  if (igT) r.social.instagram = igT[1];

  const ttT = /\{\{\s*TikTok\s*\|\s*([A-Za-z0-9_.]{2,30})\s*[|}]/i.exec(wikitext);
  if (ttT) r.social.tiktok = ttT[1];

  return r;
}

/**
 * 解析 xslist.org 详情页正文段落
 * @param {string} text 段落纯文本
 */
function parseXslistText(text) {
  const r = emptyRecord();
  if (!text) return r;

  const bm = /出生:\s*(\d{4})年(?:(\d{1,2})月)?(?:(\d{1,2})日)?/.exec(text);
  if (bm) r.birth = toISOBirth(bm[1], bm[2], bm[3]);

  const hm = /身高:\s*(\d+)\s*cm/.exec(text);
  if (hm) r.height = hm[1];

  const wm = /体重:\s*(\d+)\s*kg/.exec(text);
  if (wm) r.weight = wm[1] + 'kg';

  const ts = /三围:\s*([\d\s\-]+)/.exec(text);
  if (ts) r.threeSize = ts[1].trim();

  const cm = /罩杯:\s*([A-Za-z]+)\s*[-‐–—]?\s*(\d{2,3})?/.exec(text);
  if (cm) r.cup = cm[1].toUpperCase() + (cm[2] ? '-' + cm[2] : '');

  return r;
}

/** 从维基 API 响应中取出 wikitext */
function extractWikitext(json) {
  try {
    const pages = json.query.pages;
    const page = pages[Object.keys(pages)[0]];
    if (page && page.revisions) return page.revisions[0].slots.main['*'];
  } catch (e) {
    /* 条目不存在或结构异常，返回空 */
  }
  return '';
}

/**
 * 从维基 API 响应中取出跨语言链接标题（langlinks）。
 * 用于从日文维基条目拿到对应的中文条目名 = 中文译名。
 */
function extractLangLink(json) {
  try {
    const pages = json.query.pages;
    const page = pages[Object.keys(pages)[0]];
    if (page && page.langlinks && page.langlinks.length) {
      return page.langlinks[0]['*'] || '';
    }
  } catch (e) {
    /* 无跨语言链接 */
  }
  return '';
}

/** 判断记录是否已集齐主要字段（集齐则无需再查后续数据源） */
function isComplete(r) {
  return !!(r.birth && r.height && r.cup && r.threeSize);
}

/** 用 extra 补 base 中为空的字段（base 优先级更高） */
function mergeRecord(base, extra) {
  for (const key of [
    'nameJa',
    'nameZh',
    'avatar',
    'birth',
    'bloodType',
    'height',
    'weight',
    'threeSize',
    'cup',
    'retiredAt',
    'debut',
    'agency',
  ]) {
    if (!base[key] && extra[key]) base[key] = extra[key];
  }
  if (!base.retired && extra.retired) base.retired = true;
  // 别名数组：合并去重
  if (extra.aliases && extra.aliases.length) {
    const set = new Set([...(base.aliases || []), ...extra.aliases]);
    base.aliases = [...set];
  }
  // 社交媒体：逐个补空
  if (extra.social) {
    base.social = base.social || { x: '', instagram: '', tiktok: '' };
    for (const k of ['x', 'instagram', 'tiktok']) {
      if (!base.social[k] && extra.social[k]) base.social[k] = extra.social[k];
    }
  }
  return base;
}

/** 记录是否含任何有效数据 */
function hasData(r) {
  return !!(r.birth || r.height || r.cup || r.threeSize || r.weight);
}

module.exports = {
  pickParam,
  isClosedPeriod,
  closedPeriodEnd,
  periodStart,
  toISOBirth,
  calcAge,
  calcCareer,
  fmtDate,
  emptyRecord,
  parseWikitext,
  parseXslistText,
  extractWikitext,
  extractLangLink,
  isComplete,
  mergeRecord,
  hasData,
};
