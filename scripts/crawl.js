#!/usr/bin/env node
/**
 * 爬虫：读取 seeds/names.txt 中的女优名，逐个查日文维基 → 中文维基 → xslist，
 * 结果写入 auto/<name>.json。已存在的记录默认跳过（可用 --force 强制刷新）。
 *
 * 用法：
 *   node scripts/crawl.js               # 增量抓取
 *   node scripts/crawl.js --force       # 全量重抓
 *   node scripts/crawl.js --limit 20    # 只处理前 N 个（用于测试）
 *
 * 注意：Node 18+ 才有内建 fetch。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseWikitext,
  parseXslistText,
  extractWikitext,
  extractLangLink,
  isComplete,
  mergeRecord,
  hasData,
  emptyRecord,
} = require('./parser');

const ROOT = path.resolve(__dirname, '..');
const SEEDS_FILE = path.join(ROOT, 'seeds', 'names.txt');
const AUTO_DIR = path.join(ROOT, 'auto');

const JA_API = 'https://ja.wikipedia.org/w/api.php';
const ZH_API = 'https://zh.wikipedia.org/w/api.php';
const XSL_SEARCH = 'https://xslist.org/search?query=';

const args = new Set(process.argv.slice(2));
const FORCE = args.has('--force');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : 0;

const UA = 'JAV_info-crawler/0.1 (+https://github.com/lesspem/JAV_info)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- gfriends 头像库 ----
// https://github.com/gfriends/gfriends 提供 10 万+ 女优头像
// Filetree.json 结构：{ Content: { "公司名": { "女优名.jpg": "女优名.jpg?t=时间戳" } } }
// 公司名前缀数字越小画质越高（0- 最高清）
const GF_FILETREE = 'https://raw.githubusercontent.com/gfriends/gfriends/master/Filetree.json';
const GF_RAW_BASE = 'https://raw.githubusercontent.com/gfriends/gfriends/master/Content/';
let gfIndex = null; // { 女优名: 最优公司名 }

/** 启动时加载一次 gfriends 索引 */
async function loadGfriends() {
  if (gfIndex !== null) return;
  gfIndex = {};
  try {
    const j = await fetchJSON(GF_FILETREE);
    for (const company of Object.keys(j.Content || {})) {
      const prefix = parseInt(company.split('-')[0], 10);
      const rank = isNaN(prefix) ? 99 : prefix; // 数字越小画质越高
      for (const file of Object.keys(j.Content[company])) {
        const name = file.replace(/\.jpg$/i, '');
        const prev = gfIndex[name];
        if (!prev || rank < prev.rank) {
          gfIndex[name] = { company, rank };
        }
      }
    }
    console.log(`gfriends 索引载入：${Object.keys(gfIndex).length} 位女优`);
  } catch (e) {
    console.warn(`gfriends 索引加载失败（跳过该头像源）：${e.message}`);
    gfIndex = {};
  }
}

/** 从 gfriends 查头像 URL；按 名字/中文名/日文名 依次匹配 */
function gfriendsAvatar(...names) {
  if (!gfIndex) return '';
  for (const n of names) {
    if (n && gfIndex[n]) {
      const company = gfIndex[n].company;
      return GF_RAW_BASE + encodeURIComponent(company) + '/' + encodeURIComponent(n) + '.jpg';
    }
  }
  return '';
}

/** 安全化文件名（保留中日文字符，替换文件系统敏感字符） */
function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

/**
 * @param {string} api      维基 API 端点
 * @param {string} title    条目名
 * @param {string} langlink 需要一并取回的跨语言链接语种（如 'zh'），留空则不取
 */
function wikiApiUrl(api, title, langlink) {
  const params = new URLSearchParams({
    action: 'query',
    prop: langlink ? 'revisions|langlinks' : 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    format: 'json',
    redirects: '1',
    titles: title,
  });
  if (langlink) {
    params.set('lllang', langlink);
    params.set('lllimit', '1');
  }
  return `${api}?${params.toString()}`;
}

/**
 * 查询维基条目。
 * @returns {{rec: object, langTitle: string}} langTitle 为跨语言链接标题（中文译名）
 */
async function tryWiki(api, name, langlink) {
  try {
    const json = await fetchJSON(wikiApiUrl(api, name, langlink));
    const wt = extractWikitext(json);
    const langTitle = langlink ? extractLangLink(json) : '';
    if (!wt) return { rec: emptyRecord(), langTitle };
    return { rec: parseWikitext(wt), langTitle };
  } catch (e) {
    console.warn(`  wiki fail (${api}): ${e.message}`);
    return { rec: emptyRecord(), langTitle: '' };
  }
}

/**
 * xslist 搜索页 -> 详情页 -> 第一段正文
 * xslist 页面结构：detail 页面第一/第二个 <p> 包含出生/身高/三围等信息。
 */
async function tryXslist(name) {
  try {
    const search = await fetchText(XSL_SEARCH + encodeURIComponent(name));
    // 详情页链接形如 <a href="/model/xxxx"> 或绝对路径
    const linkRe = /href="([^"]*model\/[^"]+)"[^>]*>([^<]+)</gi;
    let m;
    let detailUrl = '';
    while ((m = linkRe.exec(search))) {
      if (m[2].indexOf(name) > -1) {
        detailUrl = m[1].startsWith('http') ? m[1] : `https://xslist.org${m[1]}`;
        break;
      }
    }
    if (!detailUrl) return emptyRecord();
    const detailHtml = await fetchText(detailUrl);
    // 抽取正文段落：取所有 <p>...</p>，找含「出生:」或「身高:」的
    const paras = [...detailHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((x) =>
      x[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim()
    );
    const info = paras.find((p) => /出生:|身高:/.test(p));
    if (!info) return emptyRecord();
    return parseXslistText(info);
  } catch (e) {
    console.warn(`  xslist fail: ${e.message}`);
    return emptyRecord();
  }
}

/**
 * minnano-av.com：搜索女优名 → 详情页有 JSON-LD 的 Person schema（含头像 URL）。
 * 只用于补头像，不抓其他字段（维基更准确）。
 */
const MINNANO_SEARCH = 'https://www.minnano-av.com/search_result.php?search_scope=actress&search_word=';

async function tryMinnanoAvatar(name) {
  try {
    const html = await fetchText(MINNANO_SEARCH + encodeURIComponent(name));
    // JSON-LD: {"@type": "Person", "name": "...", "image": "https://..."}
    const ldMatch = /"@type":\s*"Person"[\s\S]*?"name":\s*"([^"]+)"[\s\S]*?"image":\s*"([^"]+)"/i.exec(html);
    if (ldMatch && ldMatch[1] === name) {
      return ldMatch[2]; // image URL
    }
    // 退而求其次：og:image + og:url 确认是女优详情页
    const og = /property="og:image"[^>]*content="([^"]+actress[^"]+)"/i.exec(html);
    if (og) return og[1];
    return '';
  } catch (e) {
    console.warn(`  minnano-av fail: ${e.message}`);
    return '';
  }
}

async function crawlOne(name) {
  const merged = emptyRecord();
  merged.sources = [];

  // 1) 日文维基（同时取 zh 跨语言链接作为中文名）
  const { rec: ja, langTitle: zhTitle } = await tryWiki(JA_API, name, 'zh');
  if (hasData(ja)) {
    mergeRecord(merged, ja);
    merged.sources.push('ja.wikipedia');
  }
  // 日文条目名本身就是 nameJa
  if (!merged.nameJa) merged.nameJa = name;
  // 中文维基条目名即中文名
  if (zhTitle) merged.nameZh = zhTitle;

  if (isComplete(merged) && merged.nameZh) {
    // 数据完整但仍需补头像（gfriends 优先）
    const gfImg = gfriendsAvatar(name, merged.nameZh, merged.nameJa);
    if (gfImg) { merged.avatar = gfImg; if (!merged.sources.includes('gfriends')) merged.sources.push('gfriends'); }
    return merged;
  }

  // 2) 中文维基
  await sleep(300);
  const zhLookup = zhTitle || name;
  const { rec: zh } = await tryWiki(ZH_API, zhLookup);
  if (hasData(zh)) {
    mergeRecord(merged, zh);
    merged.sources.push('zh.wikipedia');
  }
  // 中文维基的条目名就是中文名
  if (!merged.nameZh && zhTitle) merged.nameZh = zhTitle;

  if (isComplete(merged)) {
    // 数据完整但仍需补头像
    const gfImg = gfriendsAvatar(name, merged.nameZh, merged.nameJa);
    if (gfImg) { merged.avatar = gfImg; if (!merged.sources.includes('gfriends')) merged.sources.push('gfriends'); }
    return merged;
  }

  // 3) xslist
  await sleep(300);
  const xs = await tryXslist(name);
  if (hasData(xs)) {
    mergeRecord(merged, xs);
    merged.sources.push('xslist');
  }

  // 4) gfriends 头像库（10万+，覆盖率高、画质好）
  // 优先使用 gfriends：即使维基已有头像，gfriends 的图更大更清晰，直接覆盖
  {
    const gfImg = gfriendsAvatar(name, merged.nameZh, merged.nameJa);
    if (gfImg) {
      merged.avatar = gfImg;
      if (!merged.sources.includes('gfriends')) merged.sources.push('gfriends');
    }
  }

  // 5) minnano-av 兜底（gfriends 和维基都没有时）
  if (!merged.avatar) {
    await sleep(300);
    const img = await tryMinnanoAvatar(name);
    if (img) {
      merged.avatar = img;
      merged.sources.push('minnano-av');
    }
  }

  return merged;
}

/** 标注文本：抓不到数据时追加到 seeds 名字后面 */
const NO_DATA_MARK = '  # 未抓到数据';

/** 从 seeds 一行里剥离已有的「# 未抓到数据」标注，返回纯名字 */
function stripMark(line) {
  return line.replace(/\s*#\s*未抓到数据\s*$/, '').trim();
}

function readSeeds() {
  if (!fs.existsSync(SEEDS_FILE)) {
    console.error(`seeds 文件不存在：${SEEDS_FILE}`);
    console.error('请先在 seeds/names.txt 中每行写一个女优名。');
    process.exit(1);
  }
  return fs
    .readFileSync(SEEDS_FILE, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    // 整行是注释（纯说明行）才跳过；带「# 未抓到数据」标注的名字行要保留
    .filter((s) => s && !(s.startsWith('#') && !/未抓到数据/.test(s)))
    .map(stripMark)
    .filter(Boolean);
}

/**
 * 抓取结束后回写 seeds/names.txt：
 * 对「全空」的名字在行尾追加「# 未抓到数据」，成功抓到的则移除该标注。
 * 保留纯注释行、空行和原有顺序。
 * @param {Set<string>} emptyNames 本次抓取判定为全空的名字集合
 */
function annotateSeeds(emptyNames) {
  const raw = fs.readFileSync(SEEDS_FILE, 'utf8').split(/\r?\n/);
  const out = raw.map((line) => {
    const trimmed = line.trim();
    // 空行、纯说明注释行原样保留
    if (!trimmed || (trimmed.startsWith('#') && !/未抓到数据/.test(trimmed))) {
      return line;
    }
    const name = stripMark(trimmed);
    if (!name) return line;
    if (emptyNames.has(name)) return name + NO_DATA_MARK;
    return name; // 抓到数据 → 去掉可能存在的旧标注
  });
  fs.writeFileSync(SEEDS_FILE, out.join('\n'), 'utf8');
}

/** 需要检查完整性的字段 */
const FIELDS = ['birth', 'height', 'weight', 'threeSize', 'cup'];

/** 返回记录中为空的字段名列表 */
function missingFields(rec) {
  return FIELDS.filter((f) => !rec[f]);
}

async function main() {
  fs.mkdirSync(AUTO_DIR, { recursive: true });
  // 先加载 gfriends 头像索引（一次性，约 6.5MB）
  await loadGfriends();
  let names = readSeeds();
  if (LIMIT) names = names.slice(0, LIMIT);
  console.log(`共 ${names.length} 个待处理，force=${FORCE}`);

  let full = 0;
  let partial = 0;
  let empty = 0;
  let skip = 0;
  const emptyNames = new Set();

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const outFile = path.join(AUTO_DIR, safeFileName(name) + '.json');
    if (!FORCE && fs.existsSync(outFile)) {
      skip++;
      // 跳过的记录也要判断是否为空，以便正确维护 seeds 标注
      try {
        const old = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        if (!hasData(old)) emptyNames.add(name);
      } catch (e) {
        /* 文件损坏就当作有数据，避免误标 */
      }
      continue;
    }
    process.stdout.write(`[${i + 1}/${names.length}] ${name} ... `);

    let rec;
    try {
      rec = await crawlOne(name);
    } catch (e) {
      console.log(`ERR ${e.message}`);
      rec = emptyRecord();
      rec.error = e.message;
    }

    // 无论抓到多少，一律落盘，便于事后人工检查/补全
    rec.name = name;
    if (!rec.nameJa) rec.nameJa = name;
    rec.missing = missingFields(rec);
    rec.updatedAt = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(outFile, JSON.stringify(rec, null, 2) + '\n', 'utf8');

    if (rec.missing.length === 0) {
      console.log(`FULL (${rec.sources.join('+')})`);
      full++;
    } else if (hasData(rec)) {
      console.log(`PARTIAL (${rec.sources.join('+') || '-'}) 缺: ${rec.missing.join(',')}`);
      partial++;
    } else {
      console.log('EMPTY 全部缺失');
      empty++;
      emptyNames.add(name);
    }

    await sleep(500); // 温柔一点
  }

  console.log(`\n完成：完整=${full} 部分缺失=${partial} 全空=${empty} 跳过=${skip}`);

  // 回写 seeds：标注未抓到数据的名字
  annotateSeeds(emptyNames);
  if (emptyNames.size) {
    console.log(`已在 seeds/names.txt 中标注 ${emptyNames.size} 个未抓到数据的名字`);
  }

  console.log(`接下来运行 node scripts/report.js 查看待补清单`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
