#!/usr/bin/env node
/**
 * 从厂牌官网抓取女优名单，补充 seeds/names.txt。
 * 只抓「名字」，详细数据仍由 crawl.js 从维基 + gfriends 获取。
 *
 * 支持厂牌：MOODYZ / IDEA POCKET / S1 / kawaii / Madonna / 本中 / Attackers / Premium
 * 用法：
 *   node scripts/crawl-studio.js                        # 抓全部厂牌，写入 seeds
 *   node scripts/crawl-studio.js --dry                   # 只列出新发现的名字，不写入
 *   node scripts/crawl-studio.js --only MOODYZ,S1        # 只抓指定厂牌
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SEEDS_FILE = path.join(ROOT, 'seeds', 'names.txt');

const DRY = process.argv.includes('--dry');
// --only MOODYZ,S1  只抓指定厂牌
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > -1 ? (process.argv[onlyIdx + 1] || '').split(',').map((s) => s.trim()) : null;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 五十音分页后缀（各厂牌官网通用）
const KANA_PAGES = ['a', 'ka', 'sa', 'ta', 'na', 'ha', 'ma', 'ya', 'ra', 'wa'];

// 已验证可抓的厂牌（FALENO 返回 403，已排除）
const STUDIOS = [
  { name: 'MOODYZ', base: 'https://moodyz.com/actress' },
  { name: 'IDEA POCKET', base: 'https://ideapocket.com/actress' },
  { name: 'S1', base: 'https://s1s1s1.com/actress' },
  { name: 'kawaii', base: 'https://kawaii-av.com/actress' },
  { name: 'Madonna', base: 'https://www.madonna-av.com/actress' },
  { name: 'Attackers', base: 'https://attackers.net/actress' },
  { name: 'PREMIUM', base: 'https://premium-beauty.com/actress' },
  { name: '本中', base: 'https://honnaka.jp/actress' },
  { name: 'OPPAI', base: 'https://www.oppai-av.com/actress' },
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Cookie: 'age_check_done=1' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * 解析厂牌女优列表页，提取名字。
 * 页面结构：<p class="name">女优名</p>
 */
function parseNames(html) {
  const names = [];
  const re = /<p[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([^<]+)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const n = m[1].trim();
    // 过滤：空、纯英文（那是罗马字行）、过长
    if (n && n.length >= 2 && n.length <= 12 && !/^[A-Za-z\s.]+$/.test(n)) {
      names.push(n);
    }
  }
  return names;
}

async function crawlStudio(studio) {
  const found = new Set();
  // 先抓首页，再抓各五十音分页
  const urls = [studio.base, ...KANA_PAGES.map((k) => `${studio.base}/${k}`)];
  for (const url of urls) {
    try {
      const html = await fetchText(url);
      parseNames(html).forEach((n) => found.add(n));
    } catch (e) {
      // 某些分页不存在属正常
    }
    await sleep(400);
  }
  return found;
}

function readSeeds() {
  if (!fs.existsSync(SEEDS_FILE)) return new Set();
  return new Set(
    fs
      .readFileSync(SEEDS_FILE, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.replace(/\s*#.*$/, '').trim())
      .filter(Boolean)
  );
}

async function main() {
  const existing = readSeeds();
  console.log(`现有 seeds: ${existing.size} 人\n`);

  const allNew = new Map(); // 名字 -> 来源厂牌
  const targets = ONLY ? STUDIOS.filter((s) => ONLY.includes(s.name)) : STUDIOS;
  for (const studio of targets) {
    process.stdout.write(`抓取 ${studio.name} ... `);
    const names = await crawlStudio(studio);
    let newCount = 0;
    names.forEach((n) => {
      if (!existing.has(n) && !allNew.has(n)) {
        allNew.set(n, studio.name);
        newCount++;
      }
    });
    console.log(`共 ${names.size} 人，新发现 ${newCount} 人`);
  }

  console.log(`\n合计新发现 ${allNew.size} 人`);
  if (allNew.size === 0) return;

  // 按厂牌统计
  const byStudio = {};
  for (const s of allNew.values()) byStudio[s] = (byStudio[s] || 0) + 1;
  console.log('厂牌分布:', JSON.stringify(byStudio, null, 0));

  const list = [...allNew.keys()];
  if (DRY) {
    console.log('\n[预览] 新名字:');
    list.forEach((n) => console.log('  ' + n + '  (' + allNew.get(n) + ')'));
    return;
  }

  fs.appendFileSync(SEEDS_FILE, '\n' + list.join('\n') + '\n', 'utf8');
  console.log(`\n已追加到 seeds/names.txt`);
  console.log('下一步: node scripts/crawl.js  然后  npm run build');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
