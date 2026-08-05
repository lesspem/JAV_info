# JAV_info

信息数据库，供油猴脚本 [jav备注](https://greasyfork.org/scripts/469250) 及类似脚本使用。

## 架构

```
seeds/names.txt        # 待抓取的演员名清单（每行一个）
scripts/
  parser.js            # 维基 / xslist 解析器（复用脚本端逻辑）
  crawl.js             # 爬虫：seeds → auto/*.json
  merge.js             # 合并：auto/ + manual/ → dist/shard-*.json + dist/index.json
auto/                  # 爬虫产出（勿手动修改）
manual/                # 人工补全 / 覆盖（手动维护，优先级高于 auto）
dist/                  # 合并后的最终数据（供脚本消费）
  index.json           # 名字 → 分片号
  shard-00.json ...    # 分片数据文件
.github/workflows/     # GitHub Actions：定时爬取 + 自动合并
```

## 头像

三级优先级，从高到低：

1. **本地上传**（最高）：把图片放到 `assets/avatars/` 下，支持 jpg/jpeg/png/gif/webp。
   文件名可以用**中文名、日文名或种子名**任意一个，例如以下三种都能替换三上悠亜的头像：
   - `assets/avatars/三上悠亜.jpg`（日文名 / 种子名）
   - `assets/avatars/三上悠亞.jpg`（中文名）

   放进去后跑 `node scripts/report.js` 自动生效，不需要改任何 JSON。
   查找顺序：种子名 → 中文名 → 日文名，命中第一个就用。
2. **manual 指定 URL**：在 `manual/<名字>.json` 里写 `"avatar": "https://..."`。
3. **维基自动抓取**（默认）：爬虫从维基 infobox 的 `画像` 字段生成 Wikimedia Commons 链接。

都没有则表格显示 ❌。

## 数据格式

每条记录：

```json
{
  "name": "三上悠亜",
  "nameJa": "三上悠亜",      // 日文名（= 日文维基条目名）
  "nameZh": "三上悠亞",      // 中文名（= 中文维基条目名，经跨语言链接自动获取）
  "birth": "1993-08-16",   // YYYY-MM-DD，月/日未知用 "??"
  "height": "159",          // cm，纯数字字符串
  "weight": "40kg",         // 带单位；很多条目为空
  "threeSize": "88 - 57 - 83",
  "cup": "G",
  "retired": true,
  "retiredAt": "2023",      // 引退年份；现役为空
  "sources": ["ja.wikipedia"],
  "updatedAt": "2026-08-05"
}
```

**注意：不存 age**，年龄由消费端/报告根据 `birth` 实时计算，避免数据陈旧。

## 工作流程

1. **爬全量**：`node scripts/crawl.js`（增量）或 `--force`（重抓）。
   无论抓到多少字段，都会落盘到 `auto/<名字>.json`，并标注 `missing` 缺失字段。
2. **看报告**：`node scripts/report.js` 生成两份文件并打印待补清单：
   - `data/actors.json` — 全量 JSON
   - `data/actors.md` — Markdown 表格，推到 GitHub 后点开即为渲染好的表格，缺失字段标 ❌
3. **人工补全**：照着 `data/actors.md` 里标 ❌ 的项，在 `manual/<名字>.json` 里补字段。
4. **发布给脚本**：`node scripts/merge.js` 合并 auto + manual → `dist/` 分片供脚本消费。

## 用法

### 1. 添加/补全演员

- **自动抓**：在 `seeds/names.txt` 追加名字，push 后 Actions 自动跑，或本地：
  ```bash
  node scripts/crawl.js         # 增量
  node scripts/crawl.js --force # 全量重抓
  node scripts/merge.js         # 合并到 dist
  ```
- **人工补/纠错**：在 `manual/` 下建 `<女优名>.json`，字段与上面一致。
  非空字段会覆盖 auto 里的对应字段，为空字符串则不覆盖（会保留 auto 的值）。

### 2. 删出演员
```1.打开JAV_info内顶部Actions
2。左侧点 remove-actor
3.右上角 Run workflow
4.弹出框里填名字（多个用空格分隔，seeds/names.txt，大小写要一致）
5.点绿色 Run workflow 按钮
约 30 秒后完成，自动提交推送。刷新页面就能看到删除的提交，网页也会自动更新。
6.终端命令把远程改动拉本地：cd ~/ComateProjects/JAV_info && git pull
7拉完后本地的 docs/index.html 就是最新的了，刷新浏览器即可看到删除效果。
```
### 3. 消费端（用户脚本）

**方案 A：jsDelivr CDN（推荐，国内速度好）**
```js
const INDEX = 'https://cdn.jsdelivr.net/gh/lesspem/JAV_info@main/dist/index.json';
const SHARD = (id) => `https://cdn.jsdelivr.net/gh/lesspem/JAV_info@main/dist/shard-${String(id).padStart(2,'0')}.json`;

// 首次拉 index 存 GM_setValue，7 天过期
// 查询某女优时按 index 找到分片号，再拉分片，缓存到 GM_setValue
```

**方案 B：直连 raw.githubusercontent.com**
```
https://raw.githubusercontent.com/lesspem/JAV_info/main/dist/index.json
```

### 3. 定时更新

`.github/workflows/crawl.yml`：每周一 UTC 18:00 自动跑爬虫 + 合并 + 提交。
`.github/workflows/merge.yml`：手改 `manual/` push 后自动重新合并 dist。

## 注意事项

- 爬虫遵守 robots，每个请求间 sleep 500ms。请勿改小。
- xslist 站点结构可能变化，如爬虫失败请查看 `scripts/crawl.js` 的 `tryXslist` 函数。
- 本仓库仅存元数据（生日/身高/三围等公开信息），不涉及作品信息与图片。
