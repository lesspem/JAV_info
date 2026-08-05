#!/usr/bin/env node
/**
 * 生成 docs/edit.html — 可视化数据编辑器
 * 表格里直接点格子编辑，改完下载 CSV 覆盖 data/edit.csv 即可触发自动同步。
 *
 * 用法：node scripts/build-editor.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JSON_FILE = path.join(ROOT, 'data', 'actors.json');
const HTML_FILE = path.join(ROOT, 'docs', 'edit.html');

// 可编辑字段（与 export-csv.js 的 COLUMNS 保持一致）
const FIELDS = [
  { key: 'name', label: '名字(主键)', readonly: true, width: 110 },
  { key: 'nameZh', label: '中文名', width: 110 },
  { key: 'nameJa', label: '日文名', width: 110 },
  { key: 'aliases', label: '曾用名(顿号分隔)', width: 140 },
  { key: 'avatar', label: '头像URL', width: 160 },
  { key: 'birth', label: '出生(YYYY-MM-DD)', width: 110 },
  { key: 'bloodType', label: '血型', width: 55 },
  { key: 'height', label: '身高', width: 55 },
  { key: 'weight', label: '体重', width: 65 },
  { key: 'threeSize', label: '三围', width: 110 },
  { key: 'cup', label: '罩杯', width: 60 },
  { key: 'retired', label: '引退', width: 60, type: 'bool' },
  { key: 'retiredAt', label: '引退时间', width: 100 },
  { key: 'debut', label: '出道时间', width: 100 },
  { key: 'agency', label: '公司', width: 120 },
  { key: 'x', label: 'Twitter', width: 110 },
  { key: 'instagram', label: 'Instagram', width: 110 },
  { key: 'tiktok', label: 'TikTok', width: 110 },
  { key: 'works', label: '作品', width: 120 },
];

function main() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error('请先运行 node scripts/report.js 生成 data/actors.json');
    process.exit(1);
  }

  const records = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));

  const data = records.map((r) => {
    const s = r.social || {};
    return {
      name: r.name || '',
      nameZh: r.nameZh || '',
      nameJa: r.nameJa || '',
      aliases: (r.aliases || []).join('、'),
      avatar: r.avatar || '',
      birth: r.birth || '',
      bloodType: r.bloodType || '',
      height: r.height || '',
      weight: r.weight || '',
      threeSize: r.threeSize || '',
      cup: r.cup || '',
      retired: r.retired ? 'TRUE' : 'FALSE',
      retiredAt: r.retiredAt || '',
      debut: r.debut || '',
      agency: r.agency || '',
      x: s.x || '',
      instagram: s.instagram || '',
      tiktok: s.tiktok || '',
      works: r.works || '',
    };
  });

  fs.mkdirSync(path.dirname(HTML_FILE), { recursive: true });
  fs.writeFileSync(HTML_FILE, buildHTML(data), 'utf8');
  console.log(`编辑器已生成: ${HTML_FILE} (${records.length} 人)`);
}

function buildHTML(data) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>数据编辑器 - 女优信息总表</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 16px; }
.bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
h1 { font-size: 20px; margin-right: 10px; }
input.search { padding: 7px 11px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; width: 200px; }
button { padding: 7px 14px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; background: #1890ff; color: #fff; }
button:hover { opacity: .9; }
button.ghost { background: #fff; color: #333; border: 1px solid #ddd; }
.stat { font-size: 13px; color: #888; margin-left: auto; }
.hint { background: #fffbe6; border: 1px solid #ffe58f; border-radius: 6px; padding: 10px 12px; font-size: 13px; margin-bottom: 12px; line-height: 1.7; }
.hint b { color: #d46b08; }
.wrap { overflow: auto; max-height: calc(100vh - 200px); background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
table { border-collapse: collapse; font-size: 12px; }
th, td { border: 1px solid #f0f0f0; padding: 0; white-space: nowrap; }
th { background: #fafafa; padding: 8px 6px; font-weight: 600; color: #555; position: sticky; top: 0; z-index: 2; font-size: 12px; }
td input, td select { border: none; padding: 6px; font-size: 12px; width: 100%; background: transparent; font-family: inherit; }
td input:focus, td select:focus { outline: 2px solid #1890ff; background: #f0f8ff; }
td.ro input { background: #fafafa; color: #888; }
tr:hover td { background: #fcfcfc; }
td.changed input { background: #fffbe6; font-weight: 600; }
.idx { background: #fafafa; color: #aaa; text-align: center; padding: 6px; font-size: 11px; position: sticky; left: 0; z-index: 1; }
</style>
</head>
<body>

<div class="bar">
  <h1>数据编辑器</h1>
  <input class="search" id="search" placeholder="搜索名字定位" autocomplete="off">
  <button id="download">下载修改后的 CSV</button>
  <button class="ghost" id="copyJson">复制当前行 JSON</button>
  <button class="ghost" id="reset">撤销全部修改</button>
  <span class="stat" id="stat"></span>
</div>

<div class="hint">
  <b>怎么用：</b>直接点格子修改（改过的格子会变黄）→ 点「下载修改后的 CSV」→
  把下载的文件<b>上传替换</b> <code>data/edit.csv</code>（GitHub 网页 Add file → Upload files）→
  自动同步工作流会在 1-2 分钟内更新所有数据和网页。<br>
  <b>或者：</b>点某一行任意格子后点「复制当前行 JSON」，粘贴到 <code>manual/&lt;名字&gt;.json</code> 里也能生效。<br>
  <b>注意：</b>第一列「名字(主键)」不可改；曾用名多个用顿号 <code>、</code> 分隔；引退填 TRUE/FALSE。
</div>

<div class="wrap">
  <table>
    <thead>
      <tr>
        <th class="idx">#</th>
        ${FIELDS.map((f) => `<th style="min-width:${f.width}px">${f.label}</th>`).join('')}
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>
</div>

<script>
const FIELDS = ${JSON.stringify(FIELDS)};
const ORIGINAL = ${JSON.stringify(data)};
let DATA = JSON.parse(JSON.stringify(ORIGINAL));

const tbody = document.getElementById('tbody');
const stat = document.getElementById('stat');
const search = document.getElementById('search');
let currentRow = -1;

function render() {
  const q = search.value.trim().toLowerCase();
  tbody.innerHTML = '';
  let shown = 0;
  DATA.forEach((row, i) => {
    const hay = (row.name + row.nameZh + row.nameJa + row.aliases).toLowerCase();
    if (q && !hay.includes(q)) return;
    shown++;
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="idx">' + (i + 1) + '</td>' +
      FIELDS.map(f => {
        const val = row[f.key] || '';
        const orig = ORIGINAL[i][f.key] || '';
        const cls = (f.readonly ? 'ro ' : '') + (val !== orig ? 'changed' : '');
        if (f.type === 'bool') {
          return '<td class="' + cls + '"><select data-row="' + i + '" data-key="' + f.key + '">' +
            '<option value="FALSE"' + (val === 'FALSE' ? ' selected' : '') + '>FALSE</option>' +
            '<option value="TRUE"' + (val === 'TRUE' ? ' selected' : '') + '>TRUE</option>' +
            '</select></td>';
        }
        return '<td class="' + cls + '"><input value="' + String(val).replace(/"/g, '&quot;') + '"' +
          ' data-row="' + i + '" data-key="' + f.key + '"' + (f.readonly ? ' readonly' : '') + '></td>';
      }).join('');
    tbody.appendChild(tr);
  });
  const changed = DATA.filter((r, i) => FIELDS.some(f => (r[f.key] || '') !== (ORIGINAL[i][f.key] || ''))).length;
  stat.textContent = '显示 ' + shown + ' / ' + DATA.length + ' 人｜已修改 ' + changed + ' 人';
}

tbody.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset.row) return;
  const i = +el.dataset.row;
  DATA[i][el.dataset.key] = el.value;
  currentRow = i;
  const td = el.closest('td');
  const orig = ORIGINAL[i][el.dataset.key] || '';
  td.classList.toggle('changed', el.value !== orig);
  const changed = DATA.filter((r, k) => FIELDS.some(f => (r[f.key] || '') !== (ORIGINAL[k][f.key] || ''))).length;
  stat.textContent = stat.textContent.replace(/已修改 \\d+ 人/, '已修改 ' + changed + ' 人');
});

tbody.addEventListener('change', e => {
  if (e.target.tagName === 'SELECT') {
    const i = +e.target.dataset.row;
    DATA[i][e.target.dataset.key] = e.target.value;
    currentRow = i;
    render();
  }
});

tbody.addEventListener('focusin', e => {
  if (e.target.dataset.row) currentRow = +e.target.dataset.row;
});

function esc(v) {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\\n\\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

document.getElementById('download').addEventListener('click', () => {
  const keys = FIELDS.map(f => f.key);
  const rows = [keys.join(',')];
  DATA.forEach(r => rows.push(keys.map(k => esc(r[k])).join(',')));
  const blob = new Blob(['\\uFEFF' + rows.join('\\n') + '\\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'edit.csv';
  a.click();
});

document.getElementById('copyJson').addEventListener('click', () => {
  if (currentRow < 0) { alert('请先点击某一行的任意格子'); return; }
  const r = DATA[currentRow];
  const o = ORIGINAL[currentRow];
  const out = { name: r.name };
  FIELDS.forEach(f => {
    if (f.key === 'name') return;
    const v = r[f.key] || '';
    if (v === (o[f.key] || '')) return; // 只输出改动的字段
    if (f.key === 'aliases') out.aliases = v.split(/[、,，]/).map(s => s.trim()).filter(Boolean);
    else if (f.key === 'retired') out.retired = v === 'TRUE';
    else if (['x', 'instagram', 'tiktok'].includes(f.key)) {
      out.social = out.social || {};
      out.social[f.key] = v;
    } else out[f.key] = v;
  });
  const json = JSON.stringify(out, null, 2);
  navigator.clipboard.writeText(json).then(() => {
    alert('已复制 ' + r.name + ' 的改动 JSON：\\n\\n' + json + '\\n\\n粘贴到 manual/' + r.name + '.json');
  });
});

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('确定撤销所有修改？')) return;
  DATA = JSON.parse(JSON.stringify(ORIGINAL));
  render();
});

search.addEventListener('input', render);
render();
</script>
</body>
</html>`;
}

main();
