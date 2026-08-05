#!/usr/bin/env node
/**
 * 删除女优：一键从 auto/ + manual/ + seeds/names.txt 中清除，并重新生成所有产物。
 *
 * 用法：
 *   node scripts/remove.js 麻豆
 *   node scripts/remove.js 三上悠亜 明日花キララ   # 可同时删多人
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const AUTO_DIR = path.join(ROOT, 'auto');
const MANUAL_DIR = path.join(ROOT, 'manual');
const SEEDS_FILE = path.join(ROOT, 'seeds', 'names.txt');

const names = process.argv.slice(2).filter(Boolean);
if (!names.length) {
  console.error('用法: node scripts/remove.js <名字1> [名字2] ...');
  process.exit(1);
}

let removed = 0;

for (const name of names) {
  console.log(`\n删除: ${name}`);

  // 1. 删 auto/<name>.json
  const autoFile = path.join(AUTO_DIR, name + '.json');
  if (fs.existsSync(autoFile)) {
    fs.unlinkSync(autoFile);
    console.log(`  ✓ 删除 auto/${name}.json`);
  } else {
    console.log(`  - auto/${name}.json 不存在`);
  }

  // 2. 删 manual/<name>.json
  const manualFile = path.join(MANUAL_DIR, name + '.json');
  if (fs.existsSync(manualFile)) {
    fs.unlinkSync(manualFile);
    console.log(`  ✓ 删除 manual/${name}.json`);
  } else {
    console.log(`  - manual/${name}.json 不存在`);
  }

  // 3. 从 seeds/names.txt 中删除该行
  if (fs.existsSync(SEEDS_FILE)) {
    const lines = fs.readFileSync(SEEDS_FILE, 'utf8').split(/\r?\n/);
    const filtered = lines.filter((line) => {
      const stripped = line.replace(/\s*#.*$/, '').trim();
      return stripped !== name;
    });
    if (filtered.length < lines.length) {
      fs.writeFileSync(SEEDS_FILE, filtered.join('\n'), 'utf8');
      console.log(`  ✓ 从 seeds/names.txt 删除`);
    } else {
      console.log(`  - seeds/names.txt 中未找到`);
    }
  }

  removed++;
}

console.log(`\n已删除 ${removed} 人，正在重新生成...`);

// 重新生成所有产物
execSync('node scripts/report.js', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/build-html.js', { cwd: ROOT, stdio: 'inherit' });
execSync('node scripts/merge.js', { cwd: ROOT, stdio: 'inherit' });

console.log('\n完成！记得 git add -A && git commit && git push');
