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
const { calcAge, calcCareer } = require('./parser');

const ROOT = path.resolve(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'data', 'actors.json');
const HTML_FILE = path.join(ROOT, 'docs', 'index.html');

function fmtBirth(birth) {
  return birth ? birth.replace(/-/g, '.') : '';
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
    aliases: (r.aliases || []).filter((a) => a && a !== r.nameZh && a !== r.nameJa),
    birth: fmtBirth(r.birth),
    age: calcAge(r.birth),
    height: r.height || '',
    weight: r.weight || '',
    threeSize: r.threeSize || '',
    cup: r.cup || '',
    status: r.retired ? '引退' : '现役',
    career: calcCareer(r),
    agency: r.agency || '',
    social: r.social || { x: '', instagram: '', tiktok: '' },
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
td.name { white-space: normal; min-width: 110px; }
td.name .zh { font-weight: 600; }
td.name .ja { color: #888; font-size: 12px; }
td.name .alias { color: #bbb; font-size: 11px; margin-top: 2px; }
td img { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; background: #eee; }
td .miss { color: #999; }
td.social a { display: inline-block; margin-right: 6px; opacity: .8; }
td.social a:hover { opacity: 1; }
td.social img { width: 16px; height: 16px; border-radius: 0; background: transparent; vertical-align: middle; }
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
    <input type="text" id="search" placeholder="搜索名字（中文/日文/曾用名）..." autocomplete="off">
    <select id="filterStatus">
      <option value="">全部状态</option>
      <option value="现役">现役</option>
      <option value="引退">引退</option>
    </select>
    <select id="filterCup">
      <option value="">全部罩杯</option>
    </select>
    <select id="filterAgency">
      <option value="">全部公司</option>
    </select>
    <select id="filterBust">
      <option value="">全部三围(胸围)</option>
    </select>
    <select id="filterSocial">
      <option value="">社交媒体</option>
      <option value="x">有 X</option>
      <option value="instagram">有 Instagram</option>
      <option value="tiktok">有 TikTok</option>
      <option value="any">有任意社交</option>
      <option value="none">无社交</option>
    </select>
    <span class="stats" id="stats"></span>
  </div>
</div>
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>头像</th>
        <th data-sort="nameZh">名字 <span class="arrow">▲</span></th>
        <th data-sort="birth">出生 <span class="arrow">▲</span></th>
        <th data-sort="age">年龄 <span class="arrow">▲</span></th>
        <th data-sort="height">身高 <span class="arrow">▲</span></th>
        <th data-sort="weight">体重 <span class="arrow">▲</span></th>
        <th>三围</th>
        <th data-sort="cup">罩杯 <span class="arrow">▲</span></th>
        <th data-sort="status">状态 <span class="arrow">▲</span></th>
        <th data-sort="career">职业生涯 <span class="arrow">▲</span></th>
        <th data-sort="agency">所在公司 <span class="arrow">▲</span></th>
        <th>社交媒体</th>
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
const filterAgency = document.getElementById('filterAgency');
const filterBust = document.getElementById('filterBust');
const filterSocial = document.getElementById('filterSocial');
const stats = document.getElementById('stats');
const noResult = document.getElementById('noResult');

// 从三围字符串取胸围（第一个数字）
function getBust(threeSize) {
  const m = /(\d+)/.exec(threeSize || '');
  return m ? parseInt(m[1], 10) : 0;
}
// 胸围分段
const BUST_BUCKETS = [
  { label: '<80', min: 0, max: 79 },
  { label: '80-84', min: 80, max: 84 },
  { label: '85-89', min: 85, max: 89 },
  { label: '90-94', min: 90, max: 94 },
  { label: '≥95', min: 95, max: 999 },
];

// 构建罩杯筛选选项
const cups = [...new Set(DATA.map(d => d.cup).filter(Boolean))].sort();
cups.forEach(c => {
  const opt = document.createElement('option');
  opt.value = c; opt.textContent = c;
  filterCup.appendChild(opt);
});

// 构建公司筛选选项
const agencies = [...new Set(DATA.map(d => d.agency).filter(Boolean))].sort();
agencies.forEach(a => {
  const opt = document.createElement('option');
  opt.value = a; opt.textContent = a;
  filterAgency.appendChild(opt);
});

// 构建胸围分段选项
BUST_BUCKETS.forEach(b => {
  const opt = document.createElement('option');
  opt.value = b.label; opt.textContent = b.label;
  filterBust.appendChild(opt);
});

function cell(v) { return v || '—'; }

// 社交媒体图标链接（使用 Simple Icons CDN 官方图标）
function socialCell(s) {
  if (!s) return '—';
  const links = [];
  if (s.x) links.push('<a href="https://x.com/' + s.x + '" target="_blank" rel="noopener" title="X"><img src="https://cdn.simpleicons.org/x/000000" width="16" height="16" alt="X"></a>');
  if (s.instagram) links.push('<a href="https://instagram.com/' + s.instagram + '" target="_blank" rel="noopener" title="Instagram"><img src="https://cdn.simpleicons.org/instagram/E4405F" width="16" height="16" alt="Instagram"></a>');
  if (s.tiktok) links.push('<a href="https://tiktok.com/@' + s.tiktok + '" target="_blank" rel="noopener" title="TikTok"><img src="https://cdn.simpleicons.org/tiktok/000000" width="16" height="16" alt="TikTok"></a>');
  return links.length ? links.join(' ') : '—';
}

function renderRow(d) {
  const avatar = d.avatar
    ? '<img src="' + d.avatar + '" alt="' + (d.nameZh || d.nameJa) + '" loading="lazy">'
    : '—';
  const statusTag = d.status === '现役'
    ? '<span class="tag tag-active">现役</span>'
    : '<span class="tag tag-retired">引退</span>';
  const aliasLine = (d.aliases && d.aliases.length)
    ? '<div class="alias">' + d.aliases.join('、') + '</div>'
    : '';
  return '<tr>'
    + '<td>' + avatar + '</td>'
    + '<td class="name"><div class="zh">' + (d.nameZh || '—') + '</div><div class="ja">' + (d.nameJa || '') + '</div>' + aliasLine + '</td>'
    + '<td>' + cell(d.birth) + '</td>'
    + '<td>' + (d.age ? d.age + '岁' : '—') + '</td>'
    + '<td>' + (d.height ? d.height + 'cm' : '—') + '</td>'
    + '<td>' + cell(d.weight) + '</td>'
    + '<td>' + cell(d.threeSize) + '</td>'
    + '<td>' + cell(d.cup) + '</td>'
    + '<td>' + statusTag + '</td>'
    + '<td>' + cell(d.career) + '</td>'
    + '<td>' + cell(d.agency) + '</td>'
    + '<td class="social">' + socialCell(d.social) + '</td>'
    + '</tr>';
}

function render() {
  const q = searchInput.value.trim().toLowerCase();
  const st = filterStatus.value;
  const cp = filterCup.value;
  const ag = filterAgency.value;
  const bust = filterBust.value;
  const soc = filterSocial.value;

  let visible = 0;
  const rows = DATA.map(d => {
    // 搜索范围：中文名 + 日文名 + 曾用名
    const haystack = (d.nameZh + d.nameJa + (d.aliases || []).join('')).toLowerCase();
    const matchName = !q || haystack.includes(q);
    const matchStatus = !st || d.status === st;
    const matchCup = !cp || d.cup === cp;
    const matchAgency = !ag || d.agency === ag;
    // 胸围分段筛选
    let matchBust = true;
    if (bust) {
      const b = getBust(d.threeSize);
      const bucket = BUST_BUCKETS.find(x => x.label === bust);
      matchBust = b > 0 && bucket && b >= bucket.min && b <= bucket.max;
    }
    // 社交媒体筛选
    let matchSocial = true;
    if (soc) {
      const s = d.social || {};
      const hasAny = !!(s.x || s.instagram || s.tiktok);
      if (soc === 'any') matchSocial = hasAny;
      else if (soc === 'none') matchSocial = !hasAny;
      else matchSocial = !!s[soc];
    }
    const show = matchName && matchStatus && matchCup && matchAgency && matchBust && matchSocial;
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
filterAgency.addEventListener('change', render);
filterBust.addEventListener('change', render);
filterSocial.addEventListener('change', render);

render();
</script>
</body>
</html>`;
}

main();
