#!/usr/bin/env node
/**
 * 从 data/edit.csv 读取编辑后的数据，差异部分写入 manual/<名字>.json。
 * 只有与 auto/ 不同的字段才会写入 manual/（避免覆盖无意义的重复数据）。
 *
 * 用法：
 *   node scripts/import-csv.js           # 正常导入
 *   node scripts/import-csv.js --dry     # 只预览变更，不实际写入
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUTO_DIR = path.join(ROOT, 'auto');
const MANUAL_DIR = path.join(ROOT, 'manual');
const CSV_FILE = path.join(ROOT, 'data', 'edit.csv');

const SEEDS_FILE = path.join(ROOT, 'seeds', 'names.txt');

const DRY = process.argv.includes('--dry');

/** 删除一个女优的所有数据文件 + seeds 条目 */
function removeActor(name) {
  const autoFile = path.join(AUTO_DIR, name + '.json');
  if (fs.existsSync(autoFile)) fs.unlinkSync(autoFile);
  const manualFile = path.join(MANUAL_DIR, name + '.json');
  if (fs.existsSync(manualFile)) fs.unlinkSync(manualFile);
  // 从 seeds 删除
  if (fs.existsSync(SEEDS_FILE)) {
    const lines = fs.readFileSync(SEEDS_FILE, 'utf8').split(/\r?\n/);
    const filtered = lines.filter((line) => {
      const stripped = line.replace(/\s*#.*$/, '').trim();
      return stripped !== name;
    });
    if (filtered.length < lines.length) {
      fs.writeFileSync(SEEDS_FILE, filtered.join('\n'), 'utf8');
    }
  }
}

/** 简易 CSV 解析（支持双引号包裹的字段） */
function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    const obj = {};
    header.forEach((h, i) => (obj[h] = (vals[i] || '').trim()));
    return obj;
  });
}

function parseLine(line) {
  const fields = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else { cur += ch; }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error('找不到 data/edit.csv，请先运行 node scripts/export-csv.js');
    process.exit(1);
  }

  const rows = parseCSV(fs.readFileSync(CSV_FILE, 'utf8'));
  console.log(`读取 CSV: ${rows.length} 行`);

  let changed = 0;
  let deleted = 0;

  for (const row of rows) {
    const name = row.name;
    if (!name) continue;

    // _delete 列填 TRUE 则删除这个女优的全部数据
    if ((row._delete || '').trim().toUpperCase() === 'TRUE') {
      if (DRY) {
        console.log(`[预览] 删除 ${name}`);
      } else {
        removeActor(name);
        console.log(`  ✗ 已删除 ${name}`);
      }
      deleted++;
      continue;
    }

    // 读 auto 数据作为对比基准
    let auto = {};
    const autoFile = path.join(AUTO_DIR, name + '.json');
    if (fs.existsSync(autoFile)) {
      try { auto = JSON.parse(fs.readFileSync(autoFile, 'utf8')); } catch (e) {}
    }
    const autoSocial = auto.social || {};

    // 构建 manual 对象（只写与 auto 不同的字段）
    const manual = {};

    const check = (csvKey, autoKey, csvVal) => {
      const av = auto[autoKey] || '';
      if (csvVal && csvVal !== String(av)) manual[autoKey] = csvVal;
    };

    check('nameZh', 'nameZh', row.nameZh);
    check('nameJa', 'nameJa', row.nameJa);
    check('avatar', 'avatar', row.avatar);
    check('birth', 'birth', row.birth);
    check('bloodType', 'bloodType', row.bloodType);
    check('height', 'height', row.height);
    check('weight', 'weight', row.weight);
    check('threeSize', 'threeSize', row.threeSize);
    check('cup', 'cup', row.cup);
    check('retiredAt', 'retiredAt', row.retiredAt);
    check('debut', 'debut', row.debut);
    check('agency', 'agency', row.agency);
    check('works', 'works', row.works);

    // retired 布尔值
    const csvRetired = (row.retired || '').toUpperCase() === 'TRUE';
    if (csvRetired !== (auto.retired || false)) manual.retired = csvRetired;

    // 别名
    const csvAliases = (row.aliases || '').split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    const autoAliases = (auto.aliases || []).join('、');
    if (csvAliases.length && csvAliases.join('、') !== autoAliases) manual.aliases = csvAliases;

    // 社交媒体
    const social = {};
    if (row.x && row.x !== (autoSocial.x || '')) social.x = row.x;
    if (row.instagram && row.instagram !== (autoSocial.instagram || '')) social.instagram = row.instagram;
    if (row.tiktok && row.tiktok !== (autoSocial.tiktok || '')) social.tiktok = row.tiktok;
    if (Object.keys(social).length) manual.social = { ...(autoSocial), ...social };

    // 有差异才写入
    if (Object.keys(manual).length === 0) continue;
    manual.name = name;

    // 合并已有的 manual 文件
    const manualFile = path.join(MANUAL_DIR, name + '.json');
    let existing = {};
    if (fs.existsSync(manualFile)) {
      try { existing = JSON.parse(fs.readFileSync(manualFile, 'utf8')); } catch (e) {}
    }
    const merged = { ...existing, ...manual };

    if (DRY) {
      console.log(`[预览] ${name}:`, JSON.stringify(manual));
    } else {
      fs.mkdirSync(MANUAL_DIR, { recursive: true });
      fs.writeFileSync(manualFile, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      console.log(`  ✓ manual/${name}.json`);
    }
    changed++;
  }

  console.log(`\n${DRY ? '预览' : '写入'}了 ${changed} 人的数据${deleted ? '，删除了 ' + deleted + ' 人' : ''}`);
  if (!DRY && (changed > 0 || deleted > 0)) {
    console.log('\n下一步：');
    console.log('  npm run build');
    console.log('  git add -A && git commit -m "批量更新数据" && git push');
  }
}

main();
