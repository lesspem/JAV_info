#!/usr/bin/env node
/**
 * 生成 docs/index.html — 带搜索和筛选的女优信息网页
 * 数据内嵌在 HTML 中，推到 GitHub Pages 或直接本地打开均可。
 *
 * 用法：node scripts/build-html.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { calcAge } = require('./parser');

const ROOT = path.resolve(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'data', 'actors.json');
const HTML_FILE = path.join(ROOT, 'docs', 'index.html');

function fmtBirth(birth) {
  return birth ? birth.replace(/-/g, '.') : '';
}
function fmtRetiredAt(v) {
  return v ? String(v).replace(/-/g, '.') : '';
}

function main() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error('请先运行 node scripts/report.js 生成 data/actors.json');
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));

  // 预处理数据给前端用
  const data = records.map((r) => ({
    avatar: r.avatar || '',
    nameZh: r.nameZh || '',
    nameJa: r.nameJa || r.name || '',
    birth: fmtBirth(r.birth),
    age: calcAge(r.birth),
    height: r.height || '',
    weight: r.weight || '',
    threeSize: r.threeSize || '',
    cup: r.cup || '',
    status: r.retired ? '引退' : '现役',
    retiredAt: r.retired ? fmtRetiredAt(r.retiredAt) : '',
  }));

  const html = buildHTML(data);
  fs.mkdirSync(path.dirname(HTML_FILE), { recursive: true });
  fs.writeFileSync(HTML_FILE, html, 'utf8');
  console.log(`HTML 已生成: ${HTML_FILE} (${records.length} 人)`);
}

function buildHTML(data) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>女优信息总表</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; }
.header { max-width: 1200px; margin: 0 auto 20px; }
.header h1 { font-size: 24px; margin-bottom: 12px; }
.controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.controls input, .controls select {
  padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 14px; background: #fff;
}
.controls input { width: 260px; }
.controls select { min-width: 100px; }
.stats { font-size: 13px; color: #888; margin-left: auto; }
.table-wrap { max-width: 1200px; margin: 0 auto; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
thead { background: #fafafa; position: sticky; top: 0; z-index: 1; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 13px; white-space: nowrap; }
th { font-weight: 600; color: #555; cursor: pointer; user-select: none; }
th:hover { color: #000; }
th .arrow { font-size: 10px; margin-left: 4px; opacity: .4; }
th.sorted .arrow { opacity: 1; color: #1890ff; }
td.name { white-space: normal; min-width: 100px; }
td.name .zh { font-weight: 600; }
td.name .ja { color: #888; font-size: 12px; }
td img { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; background: #eee; }
td .miss { color: #ff4d4f; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-active { background: #e6fffb; color: #13c2c2; }
.tag-retired { background: #fff1f0; color: #ff4d4f; }
tr.hidden { display: none; }
.no-result { text-align: center; padding: 40px; color: #999; }
@media (max-width: 768px) {
  .controls { flex-direction: column; }
  .controls input { width: 100%; }
  .stats { margin-left: 0; margin-top: 8px; }
}
</style>
</head>
<body>
<div class="header">
  <h1>女优信息总表</h1>
  <div class="controls">
    <input type="text" id="search" placeholder="搜索名字（中文/日文）..." autocomplete="off">
    <select id="filterStatus">
      <option value="">全部状态</option>
      <option value="现役">现役</option>
      <option value="引退">引退</option>
    </select>
    <select id="filterCup">
      <option value="">全部罩杯</option>
    </select>
    <span class="stats" id="stats"></span>
  </div>
</div>
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>头像</th>
        <th data-sort="name">名字 <span class="arrow">▲</span></th>
        <th data-sort="birth">出生 <span class="arrow">▲</span></th>
        <th data-sort="age">年龄 <span class="arrow">▲</span></th>
        <th data-sort="height">身高 <span class="arrow">▲</span></th>
        <th data-sort="weight">体重 <span class="arrow">▲</span></th>
        <th>三围</th>
        <th data-sort="cup">罩杯 <span class="arrow">▲</span></th>
        <th data-sort="status">状态 <span class="arrow">▲</span></th>
        <th data-sort="retiredAt">退役时间 <span class="arrow">▲</span></th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>
  <div class="no-result hidden" id="noResult">没有找到匹配的结果</div>
</div>
<script>
const DATA = ${JSON.stringify(data)};

const tbody = document.getElementById('tbody');
const searchInput = document.getElementById('search');
const filterStatus = document.getElementById('filterStatus');
const filterCup = document.getElementById('filterCup');
const stats = document.getElementById('stats');
const noResult = document.getElementById('noResult');

// 构建罩杯筛选选项
const cups = [...new Set(DATA.map(d => d.cup).filter(Boolean))].sort();
cups.forEach(c => {
  const opt = document.createElement('option');
  opt.value = c; opt.textContent = c;
  filterCup.appendChild(opt);
});

function cell(v) { return v || '<span class="miss">❌</span>'; }

function renderRow(d) {
  const avatar = d.avatar
    ? '<img src="' + d.avatar + '" alt="' + (d.nameZh || d.nameJa) + '" loading="lazy">'
    : '<span class="miss">❌</span>';
  const statusTag = d.status === '现役'
    ? '<span class="tag tag-active">现役</span>'
    : '<span class="tag tag-retired">引退</span>';
  return '<tr>'
    + '<td>' + avatar + '</td>'
    + '<td class="name"><div class="zh">' + (d.nameZh || '—') + '</div><div class="ja">' + (d.nameJa || '') + '</div></td>'
    + '<td>' + cell(d.birth) + '</td>'
    + '<td>' + cell(d.age) + '</td>'
    + '<td>' + cell(d.height) + '</td>'
    + '<td>' + cell(d.weight) + '</td>'
    + '<td>' + cell(d.threeSize) + '</td>'
    + '<td>' + cell(d.cup) + '</td>'
    + '<td>' + statusTag + '</td>'
    + '<td>' + (d.retiredAt || '—') + '</td>'
    + '</tr>';
}

function render() {
  const q = searchInput.value.trim().toLowerCase();
  const st = filterStatus.value;
  const cp = filterCup.value;

  let visible = 0;
  const rows = DATA.map(d => {
    const matchName = !q || (d.nameZh + d.nameJa).toLowerCase().includes(q);
    const matchStatus = !st || d.status === st;
    const matchCup = !cp || d.cup === cp;
    const show = matchName && matchStatus && matchCup;
    if (show) visible++;
    return show ? renderRow(d) : '';
  });

  tbody.innerHTML = rows.join('');
  stats.textContent = '显示 ' + visible + ' / ' + DATA.length + ' 人';
  noResult.classList.toggle('hidden', visible > 0);
}

// 排序
let sortKey = '';
let sortAsc = true;

document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortKey === key) { sortAsc = !sortAsc; }
    else { sortKey = key; sortAsc = true; }

    document.querySelectorAll('th').forEach(t => t.classList.remove('sorted'));
    th.classList.add('sorted');
    th.querySelector('.arrow').textContent = sortAsc ? '▲' : '▼';

    DATA.sort((a, b) => {
      let va = a[key] || '';
      let vb = b[key] || '';
      // 数字字段按数值排序
      if (['age', 'height'].includes(key)) {
        va = parseInt(va) || 0;
        vb = parseInt(vb) || 0;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    render();
  });
});

searchInput.addEventListener('input', render);
filterStatus.addEventListener('change', render);
filterCup.addEventListener('change', render);

render();
</script>
</body>
</html>`;
}

main();
