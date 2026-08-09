#!/usr/bin/env node
/**
 * 只针对无头像的记录做二次补全：
 *   1. gfriends 姓氏前缀匹配（唯一命中才用）
 *   2. 日文维基反查真实条目名（如「八乃翼」→「八乃つばさ」），再匹配 gfriends
 *   3. minnano-av 兜底
 *
 * 用法：
 *   node scripts/fix-avatars.js           # 修复无头像的
 *   node scripts/fix-avatars.js --dry     # 只预览
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUTO_DIR = path.join(ROOT, 'auto');

const DRY = process.argv.includes('--dry');
const FUZZY = process.argv.includes('--fuzzy'); // 允许姓氏前缀匹配（可能误配，请人工审核）
const UA = 'JAV_info-crawler/0.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- gfriends 索引 ----
const GF_FILETREE = 'https://raw.githubusercontent.com/gfriends/gfriends/master/Filetree.json';
const GF_RAW_BASE = 'https://raw.githubusercontent.com/gfriends/gfriends/master/Content/';

async function loadGfriends() {
  const res = await fetch(GF_FILETREE, { headers: { 'User-Agent': UA } });
  const j = await res.json();
  // name -> { company, rank }
  const idx = {};
  for (const company of Object.keys(j.Content || {})) {
    const prefix = parseInt(company.split('-')[0], 10);
    const rank = isNaN(prefix) ? 99 : prefix;
    for (const file of Object.keys(j.Content[company])) {
      const name = file.replace(/\.jpg$/i, '');
      const prev = idx[name];
      if (!prev || rank < prev.rank) idx[name] = { company, rank };
    }
  }
  return idx;
}

function gfURL(name, idx) {
  const hit = idx[name];
  if (!hit) return '';
  return GF_RAW_BASE + encodeURIComponent(hit.company) + '/' + encodeURIComponent(name) + '.jpg';
}

/** 策略 A：按姓氏前缀在 gfriends 找唯一候选 */
function findByPrefix(chineseName, idx) {
  // 取名字前 2 个字作为姓氏前缀
  for (let len = 3; len >= 2; len--) {
    if (chineseName.length < len) continue;
    const prefix = chineseName.slice(0, len);
    const matches = Object.keys(idx).filter((n) => n.startsWith(prefix));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

/**
 * 策略 B：用当前名字查日文维基，看条目实际标题（如中文名会自动重定向到日文名）
 */
async function findViaWiki(name) {
  const u =
    'https://ja.wikipedia.org/w/api.php?action=query&prop=info&format=json&redirects=1&titles=' +
    encodeURIComponent(name);
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    const j = await res.json();
    const pages = j.query?.pages || {};
    const p = pages[Object.keys(pages)[0]];
    if (p && p.title && !p.missing) return p.title;
    // 中文写法查不到时，尝试中文维基 → 跨语言链接
    const zu =
      'https://zh.wikipedia.org/w/api.php?action=query&prop=langlinks&lllang=ja&lllimit=1&format=json&redirects=1&titles=' +
      encodeURIComponent(name);
    const zres = await fetch(zu, { headers: { 'User-Agent': UA } });
    const zj = await zres.json();
    const zp = zj.query?.pages || {};
    const zpp = zp[Object.keys(zp)[0]];
    if (zpp?.langlinks?.[0]) return zpp.langlinks[0]['*'];
  } catch (e) {
    /* skip */
  }
  return '';
}

/** 策略 C：minnano-av 搜索 → JSON-LD 头像 */
async function findViaMinnano(name) {
  try {
    const html = await (
      await fetch(
        'https://www.minnano-av.com/search_result.php?search_scope=actress&search_word=' +
          encodeURIComponent(name),
        { headers: { 'User-Agent': UA } }
      )
    ).text();
    const ld =
      /"@type":\s*"Person"[\s\S]*?"name":\s*"([^"]+)"[\s\S]*?"image":\s*"([^"]+)"/i.exec(html);
    if (ld && ld[1] === name) return ld[2];
    const og = /property="og:image"[^>]*content="([^"]+actress[^"]+)"/i.exec(html);
    if (og) return og[1];
  } catch (e) {
    /* skip */
  }
  return '';
}

async function main() {
  console.log('加载 gfriends 索引…');
  const gfIdx = await loadGfriends();
  console.log(`gfriends: ${Object.keys(gfIdx).length} 位`);

  const files = fs.readdirSync(AUTO_DIR).filter((f) => f.endsWith('.json'));
  const noAvatar = [];
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(path.join(AUTO_DIR, f), 'utf8'));
    if (!rec.avatar) noAvatar.push({ file: f, rec });
  }
  console.log(`无头像记录: ${noAvatar.length}\n`);

  let fixedByPrefix = 0;
  let fixedByWiki = 0;
  let fixedByMinnano = 0;
  let stillNo = 0;

  for (const { file, rec } of noAvatar) {
    const name = rec.name;
    let src = '';
    let via = '';

    // A: 前缀匹配（仅 --fuzzy 时启用，因为可能把同姓不同人误配）
    if (FUZZY) {
      const prefixHit = findByPrefix(name, gfIdx);
      if (prefixHit) {
        src = gfURL(prefixHit, gfIdx);
        via = `gfriends(前缀:${prefixHit})`;
        fixedByPrefix++;
      }
    }

    // B: 维基反查（安全：依赖维基规范条目名）
    if (!src) {
      const jaTitle = await findViaWiki(name);
      if (jaTitle && jaTitle !== name && gfIdx[jaTitle]) {
        src = gfURL(jaTitle, gfIdx);
        via = `gfriends(维基:${jaTitle})`;
        fixedByWiki++;
      }
      await sleep(300);
    }

    // C: minnano 兜底
    if (!src) {
      const mn = await findViaMinnano(name);
      if (mn) {
        src = mn;
        via = 'minnano-av';
        fixedByMinnano++;
      }
      await sleep(300);
    }

    if (src) {
      console.log(`✓ ${name} <- ${via}`);
      if (!DRY) {
        rec.avatar = src;
        if (!rec.sources.some((s) => s === via.split('(')[0])) rec.sources.push(via.split('(')[0]);
        fs.writeFileSync(path.join(AUTO_DIR, file), JSON.stringify(rec, null, 2) + '\n', 'utf8');
      }
    } else {
      console.log(`✗ ${name}`);
      stillNo++;
    }
  }

  console.log(`\n统计:`);
  console.log(`  前缀匹配: ${fixedByPrefix}`);
  console.log(`  维基反查: ${fixedByWiki}`);
  console.log(`  minnano:  ${fixedByMinnano}`);
  console.log(`  仍无头像: ${stillNo}`);
  if (DRY) console.log('\n(预览模式，未写入)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
