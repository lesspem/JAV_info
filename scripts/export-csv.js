#!/usr/bin/env node
/**
 * 导出所有女优数据为 CSV，供 Excel / Numbers 批量编辑。
 *
 * 用法：
 *   node scripts/export-csv.js
 * 产出：
 *   data/edit.csv
 *
 * 编辑完保存为 CSV，再运行 node scripts/import-csv.js 写回 manual/
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'data', 'actors.json');
const CSV_FILE = path.join(ROOT, 'data', 'edit.csv');

// CSV 列顺序（name 是主键，不要改动这一列的值）
const COLUMNS = [
  'name',
  'nameZh',
  'nameJa',
  'aliases',
  'avatar',
  'birth',
  'bloodType',
  'height',
  'weight',
  'threeSize',
  'cup',
  'retired',
  'retiredAt',
  'debut',
  'agency',
  'x',
  'instagram',
  'tiktok',
  'works',
];

/** CSV 字段转义：含逗号/引号/换行时用双引号包裹，内部引号翻倍 */
function esc(v) {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function main() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error('请先运行 node scripts/report.js 生成 data/actors.json');
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));

  const rows = [COLUMNS.join(',')];
  for (const r of records) {
    const s = r.social || {};
    const row = [
      r.name || '',
      r.nameZh || '',
      r.nameJa || '',
      (r.aliases || []).join('、'), // 别名用顿号分隔
      r.avatar || '',
      r.birth || '',
      r.bloodType || '',
      r.height || '',
      r.weight || '',
      r.threeSize || '',
      r.retired ? 'TRUE' : 'FALSE',
      r.retiredAt || '',
      r.debut || '',
      r.agency || '',
      s.x || '',
      s.instagram || '',
      s.tiktok || '',
      r.works || '',
    ];
    // 注意：cup 要插到 threeSize 之后、retired 之前，保持与 COLUMNS 一致
    row.splice(10, 0, r.cup || '');
    rows.push(row.map(esc).join(','));
  }

  fs.mkdirSync(path.dirname(CSV_FILE), { recursive: true });
  // 加 BOM，Excel 打开中日文不乱码
  fs.writeFileSync(CSV_FILE, '\uFEFF' + rows.join('\n') + '\n', 'utf8');

  console.log(`已导出 ${records.length} 条到: ${CSV_FILE}`);
  console.log('\n下一步：');
  console.log('  1. 用 Excel / Numbers / VS Code 打开 data/edit.csv 批量编辑');
  console.log('  2. 保存（保持 CSV 格式）');
  console.log('  3. 运行 node scripts/import-csv.js 写回 manual/');
  console.log('\n注意：不要改动 name 列（它是匹配主键）');
}

main();
