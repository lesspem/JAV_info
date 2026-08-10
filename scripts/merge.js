#!/usr/bin/env node
/**
 * 合并脚本：auto/ + manual/ → dist/
 *
 * 规则：
 *   1. 读取 auto/ 下所有 *.json 作为基础数据
 *   2. 读取 manual/ 下所有 *.json，其字段覆盖（非空字段）同名记录
 *   3. 生成分片文件 dist/shard-XX.json（按名字首字符哈希分 16 片，便于按需加载）
 *   4. 生成索引 dist/index.json，格式：{ shardCount: N, actors: { "名字": shardId } }
 *
 * 用法：
 *   node scripts/merge.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AUTO_DIR = path.join(ROOT, 'auto');
const MANUAL_DIR = path.join(ROOT, 'manual');
const DIST_DIR = path.join(ROOT, 'dist');
const SHARD_COUNT = 16;

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

function hashShard(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return ((hash >>> 0) % SHARD_COUNT);
}

function merge() {
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 1. 读取
  const auto = readJsonDir(AUTO_DIR);
  const manual = readJsonDir(MANUAL_DIR);
  console.log(`auto: ${Object.keys(auto).length} 条, manual: ${Object.keys(manual).length} 条`);

  // 2. 合并 manual 覆盖 auto
  const allNames = new Set([...Object.keys(auto), ...Object.keys(manual)]);
  const merged = {};
  for (const name of allNames) {
    const base = auto[name] || {};
    const over = manual[name] || {};
    // manual 非空字段覆盖 auto
    const final = { ...base };
    for (const [k, v] of Object.entries(over)) {
      if (v !== '' && v !== null && v !== undefined) final[k] = v;
    }
    final.name = name;
    merged[name] = final;
  }
  console.log(`合并后共 ${Object.keys(merged).length} 条`);

  // 3. 分片
  const shards = Array.from({ length: SHARD_COUNT }, () => ({}));
  const index = {};
  // 反查表：nameZh / nameJa / 曾用名 → 主键 name
  // 让消费端不需要加载分片就能按中文名/曾用名反查到分片号
  const reverse = {};
  for (const [name, data] of Object.entries(merged)) {
    const sid = hashShard(name);
    shards[sid][name] = data;
    index[name] = sid;
    // 反查表：把该人的所有别名指到主键
    const addAlias = (alt) => {
      if (!alt || alt === name || reverse[alt] || index[alt]) return;
      reverse[alt] = name;
    };
    addAlias(data.nameZh);
    addAlias(data.nameJa);
    (data.aliases || []).forEach(addAlias);
  }

  // 清理旧 dist
  for (const f of fs.readdirSync(DIST_DIR)) {
    if (f.startsWith('shard-') || f === 'index.json') {
      fs.unlinkSync(path.join(DIST_DIR, f));
    }
  }

  // 写入分片
  for (let i = 0; i < SHARD_COUNT; i++) {
    const count = Object.keys(shards[i]).length;
    if (count === 0) continue;
    const fname = `shard-${String(i).padStart(2, '0')}.json`;
    fs.writeFileSync(path.join(DIST_DIR, fname), JSON.stringify(shards[i], null, 2) + '\n', 'utf8');
    console.log(`  ${fname}: ${count} 条`);
  }

  // 写入索引（actors: 主键→分片号；aliases: 别名→主键）
  const indexData = { shardCount: SHARD_COUNT, actors: index, aliases: reverse };
  fs.writeFileSync(
    path.join(DIST_DIR, 'index.json'),
    JSON.stringify(indexData, null, 2) + '\n',
    'utf8'
  );

  console.log(`\n输出到 dist/: ${SHARD_COUNT} 片 + index.json`);
}

merge();
