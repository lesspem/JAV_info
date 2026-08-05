#!/usr/bin/env node
/**
 * 汇总报告：扫描 auto/ + manual/，生成
 *   data/actors.json  全量 JSON（机器读）
 *   data/actors.md    Markdown 表格（人工浏览/找缺失，GitHub 上直接渲染）
 *
 * 用法：
 *   node scripts/report.js           # 生成 json + md 并打印待补清单
 *   node scripts/report.js --json    # 纯 JSON 输出（便于脚本处理）
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { calcAge, calcCareer } = require('./parser');

const ROOT = path.resolve(__dirname, '..');
const AUTO_DIR = path.join(ROOT, 'auto');
const MANUAL_DIR = path.join(ROOT, 'manual');
const DATA_DIR = path.join(ROOT, 'data');
const JSON_FILE = path.join(DATA_DIR, 'actors.json');
const MD_FILE = path.join(DATA_DIR, 'actors.md');

const AVATARS_DIR = path.join(ROOT, 'assets', 'avatars');
const AVATARS_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/** 参与缺失统计的字段 */
const FIELDS = ['birth', 'height', 'weight', 'threeSize', 'cup'];
const MISS = '—';
const JSON_MODE = process.argv.includes('--json');

/**
 * 查找本地上传的头像文件。
 * 匹配规则：assets/avatars/<name 或 nameZh 或 nameJa>.{jpg,png,...}
 * @returns {string} 相对路径（如 assets/avatars/三上悠亜.jpg）或空字符串
 */
function findLocalAvatar(name, nameZh, nameJa) {
  if (!fs.existsSync(AVATARS_DIR)) return '';
  // 按优先级尝试：name（种子名）→ nameZh（中文名）→ nameJa（日文名）
  const candidates = [name, nameZh, nameJa].filter(Boolean);
  // 去重
  const tried = new Set();
  for (const n of candidates) {
    if (tried.has(n)) continue;
    tried.add(n);
    for (const ext of AVATARS_EXTS) {
      const file = path.join(AVATARS_DIR, n + ext);
      if (fs.existsSync(file)) {
        return `assets/avatars/${n}${ext}`;
      }
    }
  }
  return '';
}

function readJsonDir(dir) {
  const result = {};
  if (!fs.existsSync(dir)) return result;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const key = data.name || file.replace('.json', '');
      result[key] = data;
    } catch (e) {
      console.warn(`跳过无效文件 ${file}: ${e.message}`);
    }
  }
  return result;
}

/** 生日 "1993-08-16" -> "1993.08.16" */
function fmtBirth(birth) {
  return birth ? birth.replace(/-/g, '.') : '';
}

/** 头像单元格：优先本地上传 > auto/manual 的 URL > ❌ */
function fmtAvatar(rec) {
  // 优先级：本地文件 > manual 覆盖的 avatar > auto 抓的 avatar
  const localPath = findLocalAvatar(rec.name, rec.nameZh, rec.nameJa);
  const src = localPath || rec.avatar || '';
  if (!src) return MISS;
  const alt = rec.nameZh || rec.nameJa || rec.name || '';
  // 本地路径需要从 data/ 往上一级引用（因为 md 文件在 data/ 下）
  const href = localPath ? `../${src}` : src;
  return `<img src="${href}" width="60" alt="${alt}">`;
}

/**
 * 名字单元格：中文名（加粗）/ 日文名 / 曾用名（不带前缀）
 * Markdown 表格用 <br> 换行
 */
function fmtName(rec) {
  const ja = rec.nameJa || rec.name || '';
  const zh = rec.nameZh || '';
  const lines = [];
  if (zh) lines.push(`**${zh}**`);
  if (ja && ja !== zh) lines.push(ja);
  if (!lines.length) lines.push(MISS);
  // 曾用名（每个名字一行显示）
  const aliases = (rec.aliases || []).filter((a) => a && a !== zh && a !== ja);
  if (aliases.length) lines.push(`<sub>${aliases.join('<br>')}</sub>`);
  return lines.join('<br>');
}

/** 社交媒体单元格：官方图标链接，X 用旧版 Twitter 小蓝鸟 */
function fmtSocial(rec) {
  const s = rec.social || {};
  const links = [];
  if (s.x) links.push(`[![X](https://cdn.simpleicons.org/twitter/1DA1F2/20)](https://x.com/${s.x})`);
  if (s.instagram) links.push(`[![Instagram](https://cdn.simpleicons.org/instagram/E4405F/20)](https://instagram.com/${s.instagram})`);
  if (s.tiktok) links.push(`[![TikTok](https://cdn.simpleicons.org/tiktok/000000/20)](https://tiktok.com/@${s.tiktok})`);
  return links.length ? links.join(' ') : MISS;
}

/** 单元格取值，空则显示 — */
const cell = (v) => (v ? String(v) : MISS);
const cellSuffix = (v, suf) => (v ? String(v) + suf : MISS);

function buildMarkdown(records, incompleteCount) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push('# 女优信息总表');
  lines.push('');
  lines.push(
    `> 共 ${records.length} 人 ｜ 完整 ${records.length - incompleteCount} 人 ｜ 待补 ${incompleteCount} 人 ｜ 更新于 ${today}`
  );
  lines.push('>');
  lines.push(`> ${MISS} 表示该字段缺失或不适用。补充方式：在 \`manual/<名字>.json\` 中填入对应字段。`);
  lines.push('> 名字列：加粗中文名 / 日文名 / 曾用名。年龄按当前日期实时计算，不入库。');
  lines.push('> 职业生涯：出道日期 - 引退日期（现役显示「至今」）。');
  lines.push('>');
  lines.push(
    '> 头像优先级：`assets/avatars/<名字>.jpg` 本地上传 > `manual` 指定的 URL > 维基自动抓取。'
  );
  lines.push('');
  lines.push(
    '| # | 头像 | 名字 | 出生 | 年龄 | 血型 | 身高 | 体重 | 三围 | 罩杯 | 职业生涯 | 所在公司 | 社交媒体 | 状态 | 作品 |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  records.forEach((r, i) => {
    const status = r.retired ? '引退' : '现役';
    lines.push(
      `| ${i + 1} | ${fmtAvatar(r)} | ${fmtName(r)} | ${cell(fmtBirth(r.birth))} | ${cellSuffix(calcAge(r.birth), '岁')} | ` +
        `${cell(r.bloodType)} | ${cellSuffix(r.height, 'cm')} | ${cell(r.weight)} | ${cell(r.threeSize)} | ${cell(r.cup)} | ` +
        `${cell(calcCareer(r))} | ${cell(r.agency)} | ${fmtSocial(r)} | ${status} | ${cell(r.works)} |`
    );
  });

  lines.push('');
  return lines.join('\n');
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const auto = readJsonDir(AUTO_DIR);
  const manual = readJsonDir(MANUAL_DIR);

  const allNames = new Set([...Object.keys(auto), ...Object.keys(manual)]);
  const records = [];
  const incomplete = [];

  for (const name of [...allNames].sort()) {
    const base = auto[name] || {};
    const over = manual[name] || {};
    const rec = { ...base };
    // manual 非空字段覆盖 auto
    for (const [k, v] of Object.entries(over)) {
      if (v !== '' && v !== null && v !== undefined) rec[k] = v;
    }
    rec.name = name;
    if (!rec.nameJa) rec.nameJa = name;

    // 本地上传的头像优先，写入 avatar 字段（相对仓库根的路径）
    // 支持用 种子名/中文名/日文名 命名文件
    // 这样 dist/actors.json 消费端也能直接用（拼上 raw.githubusercontent.com 前缀即可）
    const localAvatar = findLocalAvatar(name, rec.nameZh, rec.nameJa);
    if (localAvatar) rec.avatar = localAvatar;

    const missing = FIELDS.filter((f) => !rec[f]);
    if (missing.length > 0) {
      incomplete.push({ name, missing, sources: rec.sources || [] });
    }

    delete rec.error;
    delete rec.missing;
    records.push(rec);
  }

  // 写 JSON
  fs.writeFileSync(JSON_FILE, JSON.stringify(records, null, 2) + '\n', 'utf8');
  // 写 Markdown
  fs.writeFileSync(MD_FILE, buildMarkdown(records, incomplete.length), 'utf8');

  if (JSON_MODE) {
    console.log(JSON.stringify({ total: records.length, incomplete }, null, 2));
    return;
  }

  console.log(`总计 ${records.length} 人`);
  console.log(`数据完整: ${records.length - incomplete.length} 人`);
  console.log(`需要补充: ${incomplete.length} 人\n`);

  if (incomplete.length > 0) {
    console.log('=== 待补清单 ===');
    for (const { name, missing, sources } of incomplete) {
      console.log(`  ${name}  缺: [${missing.join(', ')}]  来源: ${sources.join('+') || '无'}`);
    }
    console.log(`\n补充方法: 在 manual/ 下建 "<名字>.json"，填入缺失字段即可。`);
  }

  console.log(`\nJSON: ${JSON_FILE}`);
  console.log(`表格: ${MD_FILE}  <- 推到 GitHub 后点开即为渲染好的表格`);
}

main();
