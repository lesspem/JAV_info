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
    works: r.works || '',
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
.title-row { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.header h1 { font-size: 24px; }
.update-time { font-size: 13px; color: #999; text-align: right; line-height: 1.5; }
.controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.controls input, .controls select {
  padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 14px; background: #fff;
}
.controls input { width: 168px; text-align: center; }
.controls select { min-width: 100px; }
.stats { font-size: 13px; color: #888; margin-left: auto; }
.table-wrap { max-width: 1200px; margin: 0 auto; overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
thead { background: #fafafa; position: sticky; top: 0; z-index: 1; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 13px; white-space: nowrap; vertical-align: middle; }
th { font-weight: 600; color: #555; cursor: pointer; user-select: none; }
th:hover { color: #000; }
th .arrow { font-size: 10px; margin-left: 4px; opacity: .4; }
th.sorted .arrow { opacity: 1; color: #1890ff; }
td.name { white-space: normal; min-width: 110px; }
td.idx { color: #aaa; font-size: 12px; text-align: center; width: 36px; }
th.col-avatar, td.avatar { text-align: center; }
td.avatar { width: 70px; }
td.name .zh { font-weight: 600; }
td.name .ja { color: #888; font-size: 12px; }
td.name .alias { color: #bbb; font-size: 11px; margin-top: 2px; }
td img { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; background: #eee; }
td .miss { color: #999; }
td.social a { display: inline-block; margin-right: 2px; opacity: .8; }
td.social a:hover { opacity: 1; }
td.social img { width: 16px; height: 16px; border-radius: 0; background: transparent; vertical-align: middle; }
td.social, td.works, td.birth, td.threesize { text-align: center; }
th.col-birth, th.col-social, th.col-works, th.col-threesize { text-align: center; }
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
  <div class="title-row">
    <h1>女优信息总表</h1>
    <span class="update-time">数据更新: ${new Date().toISOString().slice(0, 10)}<br>${new Date().toTimeString().slice(0, 5)}</span>
  </div>
  <div class="controls">
    <input type="text" id="search" placeholder="搜索女优(中/日/曾用名)" autocomplete="off">
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
      <option value="">全部(三围)</option>
    </select>
    <select id="filterSocial">
      <option value="">社交媒体</option>
      <option value="x">Twitter</option>
      <option value="instagram">Instagram</option>
      <option value="tiktok">TikTok</option>
      <option value="any">任意社交</option>
      <option value="none">无社交</option>
    </select>
    <span class="stats" id="stats"></span>
  </div>
</div>
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th class="col-avatar">头像</th>
        <th data-sort="nameZh">名字 <span class="arrow">▲</span></th>
        <th class="col-birth" data-sort="birth">出生 <span class="arrow">▲</span></th>
        <th data-sort="age">年龄 <span class="arrow">▲</span></th>
        <th data-sort="height">身高 <span class="arrow">▲</span></th>
        <th data-sort="weight">体重 <span class="arrow">▲</span></th>
        <th class="col-threesize" data-sort="threeSize">三围 <span class="arrow">▲</span></th>
        <th data-sort="cup">罩杯 <span class="arrow">▲</span></th>
        <th data-sort="career">职业生涯 <span class="arrow">▲</span></th>
        <th data-sort="agency">所在公司 <span class="arrow">▲</span></th>
        <th class="col-social">社交媒体</th>
        <th data-sort="status">状态 <span class="arrow">▲</span></th>
        <th class="col-works">作品</th>
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
// 注意：本文件用模板字符串输出，正则里的反斜杠必须写成 \\\\d 才能在生成的 HTML 里得到 \\d
function getBust(threeSize) {
  const m = /(\\d+)/.exec(threeSize || '');
  return m ? parseInt(m[1], 10) : 0;
}
// 胸围分段（label 不能含 < > 等字符，否则会破坏 HTML 解析）
const BUST_BUCKETS = [
  { label: '80以下', min: 0, max: 79 },
  { label: '80-84', min: 80, max: 84 },
  { label: '85-89', min: 85, max: 89 },
  { label: '90-94', min: 90, max: 94 },
  { label: '95以上', min: 95, max: 999 },
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

// 社交媒体图标链接
// Twitter 小蓝鸟用内联 SVG data URI（cdn.simpleicons.org 已不可用）
const TWITTER_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1DA1F2"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733a4.67 4.67 0 0 0 2.048-2.578 9.3 9.3 0 0 1-2.958 1.13 4.66 4.66 0 0 0-7.938 4.25 13.229 13.229 0 0 1-9.602-4.868c-.4.69-.63 1.49-.63 2.342A4.66 4.66 0 0 0 3.96 9.824a4.647 4.647 0 0 1-2.11-.583v.06a4.66 4.66 0 0 0 3.737 4.568 4.692 4.692 0 0 1-2.104.08 4.661 4.661 0 0 0 4.352 3.234 9.348 9.348 0 0 1-5.786 1.995c-.376 0-.747-.022-1.112-.065a13.175 13.175 0 0 0 7.14 2.093c8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602a9.47 9.47 0 0 0 2.323-2.41z"/></svg>');
const INSTAGRAM_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E4405F"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>');
const TIKTOK_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000000"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>');
function socialCell(s) {
  if (!s) return '—';
  const links = [];
  if (s.x) links.push('<a href="https://x.com/' + s.x + '" target="_blank" rel="noopener" title="Twitter"><img src="' + TWITTER_ICON + '" width="16" height="16" alt="Twitter"></a>');
  if (s.instagram) links.push('<a href="https://instagram.com/' + s.instagram + '" target="_blank" rel="noopener" title="Instagram"><img src="' + INSTAGRAM_ICON + '" width="16" height="16" alt="Instagram"></a>');
  if (s.tiktok) links.push('<a href="https://tiktok.com/@' + s.tiktok + '" target="_blank" rel="noopener" title="TikTok"><img src="' + TIKTOK_ICON + '" width="16" height="16" alt="TikTok"></a>');
  return links.length ? links.join(' ') : '—';
}

function renderRow(d, idx) {
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
    + '<td class="idx">' + idx + '</td>'
    + '<td class="avatar">' + avatar + '</td>'
    + '<td class="name"><div class="zh">' + (d.nameZh || '—') + '</div><div class="ja">' + (d.nameJa || '') + '</div>' + aliasLine + '</td>'
    + '<td class="birth">' + cell(d.birth) + '</td>'
    + '<td>' + (d.age ? d.age + '岁' : '—') + '</td>'
    + '<td>' + (d.height ? d.height + 'cm' : '—') + '</td>'
    + '<td>' + cell(d.weight) + '</td>'
    + '<td class="threesize">' + cell(d.threeSize) + '</td>'
    + '<td>' + cell(d.cup) + '</td>'
    + '<td>' + cell(d.career) + '</td>'
    + '<td>' + cell(d.agency) + '</td>'
    + '<td class="social">' + socialCell(d.social) + '</td>'
    + '<td>' + statusTag + '</td>'
    + '<td class="works">' + (d.works || '—') + '</td>'
    + '</tr>';
}

function render() {
  const q = searchInput.value.trim().toLowerCase();
  const st = filterStatus.value;
  const cp = filterCup.value;
  const ag = filterAgency.value;
  const bust = filterBust.value;
  const soc = filterSocial.value;

  let seq = 0;
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
    if (!show) return '';
    seq++;
    return renderRow(d, seq);
  });

  tbody.innerHTML = rows.join('');
  stats.textContent = '显示 ' + seq + ' / ' + DATA.length + ' 人';
  noResult.classList.toggle('hidden', seq > 0);
}

// 排序
let sortKey = '';
let sortAsc = true;

document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    // 三围默认从大到小（点第一次就降序），其他字段默认升序
    if (sortKey === key) { sortAsc = !sortAsc; }
    else { sortKey = key; sortAsc = key === 'threeSize' ? false : true; }

    document.querySelectorAll('th').forEach(t => t.classList.remove('sorted'));
    th.classList.add('sorted');
    th.querySelector('.arrow').textContent = sortAsc ? '▲' : '▼';

    DATA.sort((a, b) => {
      let va = a[key] || '';
      let vb = b[key] || '';
      // 三围按胸围数值排序
      if (key === 'threeSize') {
        va = getBust(va);
        vb = getBust(vb);
      } else if (['age', 'height'].includes(key)) {
        // 其他数字字段按数值排序
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
