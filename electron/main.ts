import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import { getDatabase, closeDatabase } from './database'
import Parser from 'rss-parser'
import fs from 'fs'
// @extractus/article-extractor 是 ESM 模块，使用动态导入

const parser = new Parser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } })

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    backgroundColor: '#ffffff', show: false,
  })
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000 // 30 分钟
let nextRefreshTime = Date.now() + AUTO_REFRESH_INTERVAL

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  registerIpcHandlers()

  // 定时自动刷新所有订阅源
  nextRefreshTime = Date.now() + AUTO_REFRESH_INTERVAL
  setInterval(async () => {
    nextRefreshTime = Date.now() + AUTO_REFRESH_INTERVAL
    try {
      const db = getDatabase()
      const feeds = db.prepare('SELECT * FROM feeds').all() as any[]
      for (const feed of feeds) {
        try {
          const parsed = await parser.parseURL(feed.url)
          const upsertArticle = db.prepare([
            'INSERT INTO articles (feed_id, guid, title, url, author, summary, content, published_at)',
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            'ON CONFLICT(feed_id, guid) DO UPDATE SET',
            '  title = excluded.title, url = excluded.url, author = excluded.author,',
            '  summary = excluded.summary, content = excluded.content, published_at = excluded.published_at',
          ].join('\n'))
          for (const item of parsed.items || []) {
            upsertArticle.run(
              feed.id, item.guid || item.link || '',
              item.title || '', item.link || '',
              item.creator || item.author || '',
              (item.contentSnippet || '').substring(0, 500),
              item.content || item.contentSnippet || '',
              item.pubDate ? new Date(item.pubDate).toISOString() : null
            )
          }
          db.prepare('UPDATE feeds SET last_fetched_at = CURRENT_TIMESTAMP, error_count = 0, last_error = NULL WHERE id = ?').run(feed.id)
        } catch {}
      }
    } catch {}
  }, AUTO_REFRESH_INTERVAL)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})

function registerIpcHandlers() {
  const db = getDatabase()

  // ---- Categories ----
  ipcMain.handle('categories:list', () => {
    return db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all()
  })

  ipcMain.handle('categories:create', (_e, name, parentId) => {
    const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM categories').get() as any
    const result = db.prepare('INSERT INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)').run(name, parentId || null, maxSort.next)
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid)
  })

  ipcMain.handle('categories:rename', (_e, id, name) => {
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id)
    return true
  })

  ipcMain.handle('categories:delete', (_e, id) => {
    db.prepare('UPDATE feeds SET category_id = NULL WHERE category_id = ?').run(id)
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    return true
  })

  // ---- Feeds ----
  ipcMain.handle('feeds:list', () => {
    const sql = [
      'SELECT f.*, c.name as category_name,',
      '  (SELECT COUNT(*) FROM articles WHERE feed_id = f.id AND is_read = 0) as unread_count',
      'FROM feeds f',
      'LEFT JOIN categories c ON f.category_id = c.id',
      'ORDER BY f.title',
    ].join('\n')
    return db.prepare(sql).all()
  })

  ipcMain.handle('feeds:add', async (_e, url, categoryId) => {
    try {
      const feed = await parser.parseURL(url)
      db.prepare(
        'INSERT INTO feeds (title, url, site_url, description, icon_url, category_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(feed.title || url, url, feed.link || '', feed.description || '', feed.image?.url || '', categoryId || null)
      const feedId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id

      const insertArticle = db.prepare([
        'INSERT OR IGNORE INTO articles (feed_id, guid, title, url, author, summary, content, published_at)',
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ].join('\n'))

      const insertMany = db.transaction((items: any[]) => {
        for (const item of items) {
          insertArticle.run(
            feedId, item.guid || item.link || '',
            item.title || '', item.link || '',
            item.creator || item.author || '',
            (item.contentSnippet || '').substring(0, 500),
            item.content || item.contentSnippet || '',
            item.pubDate ? new Date(item.pubDate).toISOString() : null
          )
        }
      })
      insertMany(feed.items || [])

      const sql = [
        'SELECT f.*, c.name as category_name,',
        '  (SELECT COUNT(*) FROM articles WHERE feed_id = f.id AND is_read = 0) as unread_count',
        'FROM feeds f LEFT JOIN categories c ON f.category_id = c.id WHERE f.id = ?',
      ].join('\n')
      return db.prepare(sql).get(feedId)
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE constraint failed')) {
        throw new Error('该订阅源已存在，请勿重复添加')
      }
      // 将 RSS 解析错误转中文
      let msg = (error?.message || error || '') as string
      if (msg.includes('Status code 4') || msg.includes('Status code 5')) msg = '网站返回错误，请确认网址是否正确'
      else if (msg.includes('Unable to parse XML') || msg.includes('Unexpected close tag') || msg.includes('not well-formed') || msg.includes('Invalid character') || msg.includes('Invalid byte')) msg = '该地址不是 RSS 订阅源，请尝试使用「检测」功能自动查找'
      else if (msg.includes('timed out') || msg.includes('timeout')) msg = '连接超时，请检查网络或网址'
      else if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) msg = '无法解析域名，请检查网址是否正确'
      else if (msg.includes('ECONNREFUSED')) msg = '连接被拒绝，网站可能暂时不可用'
      else msg = '添加失败，请先用「检测」按钮查找 RSS 源，或直接输入 RSS 地址'
      throw new Error(msg)
    }
  })

  /** 从任意网页生成订阅源（用 Readability 提取正文） */
  ipcMain.handle('feeds:generateFromUrl', async (_e, siteUrl: string) => {
    try {
      const resp = await fetch(siteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
        redirect: 'follow',
      })
      const html = await resp.text()
      if (html.length < 200) throw new Error('无法获取网页内容')

      const cheerio = require('cheerio')
      const $ = cheerio.load(html)
      const siteTitle = $('title').text().trim() || siteUrl
      const feedName = siteTitle.substring(0, 50)

      const exists = db.prepare('SELECT id FROM feeds WHERE url = ?').get(siteUrl)
      if (exists) throw new Error('该地址已存在')

      const result = db.prepare(
        'INSERT INTO feeds (title, url, site_url, description) VALUES (?, ?, ?, ?)'
      ).run(feedName, siteUrl, siteUrl, '从网页自动生成的订阅源')
      const feedId = result.lastInsertRowid as number

      try {
        const { parseHTML } = require('linkedom')
        const { Readability } = require('@mozilla/readability')
        const reader = new Readability(parseHTML(html).window.document, { keepClasses: true })
        const article = reader.parse()
        if (article && article.content) {
          db.prepare(
            'INSERT INTO articles (feed_id, guid, title, url, content, published_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(feedId, siteUrl, article.title || feedName, siteUrl, article.content, new Date().toISOString())
        }
      } catch {}

      return { success: true, feedId, title: feedName }
    } catch (e: any) {
      throw new Error(e?.message || '生成失败')
    }
  })

  ipcMain.handle('feeds:refresh', async (_e, feedId) => {
    nextRefreshTime = Date.now() + AUTO_REFRESH_INTERVAL
    try {
      const feeds: any[] = feedId
        ? [db.prepare('SELECT * FROM feeds WHERE id = ?').get(feedId) as any]
        : db.prepare('SELECT * FROM feeds').all() as any[]
      const results = []
      for (const feed of feeds) {
        try {
          const parsed = await parser.parseURL(feed.url)
          const upsertArticle = db.prepare([
            'INSERT INTO articles (feed_id, guid, title, url, author, summary, content, published_at)',
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            'ON CONFLICT(feed_id, guid) DO UPDATE SET',
            '  title = excluded.title,',
            '  url = excluded.url,',
            '  author = excluded.author,',
            '  summary = excluded.summary,',
            '  content = excluded.content,',
            '  published_at = excluded.published_at',
          ].join('\n'))
          let newCount = 0
          for (const item of parsed.items || []) {
            const info = upsertArticle.run(
              feed.id, item.guid || item.link || '',
              item.title || '', item.link || '',
              item.creator || item.author || '',
              (item.contentSnippet || '').substring(0, 500),
              item.content || item.contentSnippet || '',
              item.pubDate ? new Date(item.pubDate).toISOString() : null
            )
            if (info.changes > 0) newCount++
          }
          db.prepare('UPDATE feeds SET last_fetched_at = CURRENT_TIMESTAMP, error_count = 0, last_error = NULL WHERE id = ?').run(feed.id)
          results.push({ id: feed.id, title: feed.title, newArticles: newCount, success: true })
        } catch (err: any) {
          db.prepare('UPDATE feeds SET error_count = error_count + 1, last_error = ? WHERE id = ?').run(err.message, feed.id)
          results.push({ id: feed.id, title: feed.title, error: err.message, success: false })
        }
      }
      return results
    } catch (error: any) {
      throw new Error('Refresh failed: ' + error.message)
    }
  })

  ipcMain.handle('feeds:remove', (_e, id) => {
    db.prepare('DELETE FROM articles WHERE feed_id = ?').run(id)
    db.prepare('DELETE FROM feeds WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('feeds:updateCategory', (_e, feedId, categoryId) => {
    db.prepare('UPDATE feeds SET category_id = ? WHERE id = ?').run(categoryId, feedId)
    return true
  })

  /** 常见 RSS 分类名中英文翻译 */
  function translateFeedTitle(title: string): string {
    const map: Record<string, string> = {
      'Home': '首页', 'Featured': '精选', 'Featured Articles': '精选文章',
      'Latest': '最新', 'Latest News': '最新新闻', 'News': '新闻',
      'Technology': '科技', 'Tech': '科技', 'Science': '科学',
      'Business': '商业', 'Finance': '财经', 'Economy': '经济',
      'Sports': '体育', 'Entertainment': '娱乐', 'Culture': '文化',
      'Lifestyle': '生活', 'Health': '健康', 'Food': '美食',
      'Travel': '旅游', 'Gaming': '游戏', 'Games': '游戏',
      'Video': '视频', 'Photos': '图片', 'Podcasts': '播客',
      'Opinion': '观点', 'Editorial': '社论', 'Reviews': '评测',
      'World': '国际', 'World News': '国际新闻', 'China': '中国',
      'Politics': '政治', 'Education': '教育', 'Environment': '环境',
      'Design': '设计', 'Development': '开发', 'Programming': '编程',
      'AI': '人工智能', 'Mobile': '手机', 'Apps': '应用',
      'Software': '软件', 'Hardware': '硬件', 'Security': '安全',
      'Startups': '创业', 'Internet': '互联网', 'Social Media': '社交媒体',
    }
    // 精确匹配
    if (map[title.trim()]) return map[title.trim()]
    // 部分匹配（标题中包含关键词，全部替换）
    for (const [en, cn] of Object.entries(map)) {
      if (en.length > 2 && title.toLowerCase().includes(en.toLowerCase())) {
        title = title.replace(new RegExp(en, 'gi'), cn)
      }
    }
    return title
  }

  // ---- 自动检测 RSS 源 ----
  ipcMain.handle('feeds:detect', async (_e, siteUrl: string) => {
    try {
      // 确保 URL 格式正确
      if (!siteUrl.startsWith('http')) siteUrl = 'https://' + siteUrl
      const url = new URL(siteUrl)
      const discovered: Array<{ title: string; url: string }> = []
      const checked = new Set<string>()

      // 1) 先看网页 HTML 中有没有 <link> 指向 RSS
      try {
        const resp = await fetch(url.href, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
          redirect: 'follow',
        })
        const html = await resp.text()
        // 提取 <link type="application/rss+xml" href="..." title="...">
        const linkRe = /<link[^>]*?(?:type\s*=\s*["'](application\/(?:rss|atom)\+xml)["'][^>]*?href\s*=\s*["']([^"']+)["']|href\s*=\s*["']([^"']+)["'][^>]*?type\s*=\s*["'](application\/(?:rss|atom)\+xml)["'])(?:[^>]*?title\s*=\s*["']([^"']*)["'])?/gi
        let m: RegExpExecArray | null
        while ((m = linkRe.exec(html)) !== null) {
          const feedUrl = m[2] || m[3]
          const feedTitle = m[4] || ''
          if (feedUrl && !checked.has(feedUrl)) {
            checked.add(feedUrl)
            const fullUrl = feedUrl.startsWith('http') ? feedUrl : new URL(feedUrl, url.origin).href
            discovered.push({ title: feedTitle, url: fullUrl })
          }
        }
      } catch {}

      // 2) 检查常见路径（先去重）
      const commonPaths = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feeds']
      for (const path of commonPaths) {
        const feedUrl = url.origin + path
        if (checked.has(feedUrl)) continue
        checked.add(feedUrl)
        try {
          const resp = await fetch(feedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            redirect: 'follow',
          })
          const text = await resp.text()
          if (text.includes('<rss') || text.includes('<feed') || text.includes('<rdf:RDF')) {
            discovered.push({ title: '', url: feedUrl })
          }
        } catch {}
      }

      // 3) 智能去重（/rss 和 /rss.xml 视为同一源）
      const seen = new Set<string>()
      const deduped = discovered.filter(f => {
        let key = f.url.replace(/\/+$/, '').replace(/\.xml$/, '')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // 4) 生成可读的显示名称
      const describeFeed = (url: string, siteTitle: string): string => {
        const path = new URL(url).pathname
        // 根据路径判断源的类型
        if (path === '/' || path === '/feed' || path === '/rss' || path === '/atom' || path === '/index.xml' || path === '/feeds') return '📡 全部文章'
        if (path === '/feed/') return '📡 全部文章'
        // 分类源：提取路径中的分类名
        const catMatch = path.match(/\/(?:category|categories|topic|section|topics)\/([^/]+)/i)
        if (catMatch) {
          const cat = translateFeedTitle(decodeURIComponent(catMatch[1]))
          return '📂 ' + cat
        }
        // /comments/feed → 评论
        if (path.includes('/comments/') || path.includes('/comment/')) return '💬 评论'
        // 其他路径：提取最后一段
        const last = path.split('/').filter(Boolean).pop() || ''
        if (last && last !== 'feed' && last !== 'rss' && last !== 'atom') {
          return '📄 ' + translateFeedTitle(decodeURIComponent(last))
        }
        return '📡 ' + (siteTitle || '订阅源')
      }

      // 5) 如果没有检测到原生源，尝试 RSSHub + 通用网页提取
      if (deduped.length === 0) {
        const domain = url.hostname.replace(/^www\./, '')
        const rsshubUrls = [
          'https://rsshub.app/' + domain,
          'https://rsshub.app/website?url=' + encodeURIComponent(url.origin),
        ]
        for (const rsshubUrl of rsshubUrls) {
          try {
            const r = await fetch(rsshubUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(8000) })
            const text = await r.text()
            if (text.includes('<rss') || text.includes('<feed')) {
              deduped.push({ title: '📡 ' + domain + ' (RSSHub)', url: rsshubUrl })
              break
            }
          } catch {}
        }
      }

      // 6) 仍然没有？提供通用网页抓取选项（用 Readability 提取）
      if (deduped.length === 0) {
        deduped.push({
          title: '🔧 从网页生成（实验性）',
          url: url.origin,
        })
      }

      // 7) 为每个源生成显示名称
      const siteTitle = deduped.length > 0 ? deduped[0]?.title || '' : ''
      for (const feed of deduped) {
        if (!feed.title) feed.title = describeFeed(feed.url, siteTitle)
      }

      return deduped
    } catch {
      return []
    }
  })

  // ---- Articles ----
  ipcMain.handle('articles:list', (_e, options) => {
    let query = [
      'SELECT a.*, f.title as feed_title, f.icon_url as feed_icon',
      'FROM articles a',
      'JOIN feeds f ON a.feed_id = f.id',
      'WHERE 1=1',
    ].join('\n')
    const params: any[] = []
    if (options.feedId) { query += ' AND a.feed_id = ?'; params.push(options.feedId) }
    if (options.categoryId) { query += ' AND f.category_id = ?'; params.push(options.categoryId) }
    if (options.isStarred) { query += ' AND a.is_starred = 1' }
    if (options.isRead !== undefined) { query += options.isRead ? ' AND a.is_read = 1' : ' AND a.is_read = 0' }
    if (options.search) { query += ' AND (a.title LIKE ? OR a.summary LIKE ?)'; params.push('%' + options.search + '%', '%' + options.search + '%') }
    query += ' ORDER BY a.published_at DESC LIMIT ? OFFSET ?'
    params.push(options.limit || 50, options.offset || 0)
    return db.prepare(query).all(...params)
  })

  ipcMain.handle('articles:markRead', (_e, id) => {
    db.prepare('UPDATE articles SET is_read = 1 WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('articles:markAllRead', (_e, feedId) => {
    if (feedId) { db.prepare('UPDATE articles SET is_read = 1 WHERE feed_id = ?').run(feedId) }
    else { db.prepare('UPDATE articles SET is_read = 1').run() }
    return true
  })

  ipcMain.handle('articles:toggleStar', (_e, id) => {
    const article = db.prepare('SELECT is_starred FROM articles WHERE id = ?').get(id) as any
    if (article) {
      db.prepare('UPDATE articles SET is_starred = ? WHERE id = ?').run(article.is_starred ? 0 : 1, id)
      return !article.is_starred
    }
    return false
  })

  /** 获取文章（如内容为摘要，同步提取全文） */
  ipcMain.handle('articles:get', async (_e, id) => {
    const article = db.prepare('SELECT a.*, f.title as feed_title, f.site_url FROM articles a JOIN feeds f ON a.feed_id = f.id WHERE a.id = ?').get(id) as any
    if (!article) return null

    const content = article.content || ''
    const isDraftJs = renderDraftJsContent(content) !== null
    const isRaw = looksLikeRawData(content)
    const needsExtract = isDraftJs || isRaw || content.trim().length === 0

    if (needsExtract) {
      // 先试 Draft.js 渲染
      if (isDraftJs) {
        const draftHtml = renderDraftJsContent(content)
        if (draftHtml) {
          db.prepare('UPDATE articles SET content = ?, summary = ? WHERE id = ?').run(draftHtml, (article.summary || ''), id)
          article.content = draftHtml
          return article
        }
      }
      // 再试 URL 提取
      if (article.url && content.length > 0) {
        try {
          const extracted = await extractFromUrl(article.url)
          if (extracted && extracted.content && extracted.content.length > 200) {
            // 验证提取结果包含文章标题
            const titleKey = article.title?.substring(0, 15) || ''
            if (!titleKey || extracted.content.includes(titleKey)) {
              db.prepare('UPDATE articles SET content = ?, summary = ? WHERE id = ?').run(extracted.content, extracted.summary || '', id)
              article.content = extracted.content
              article.summary = extracted.summary
            }
          }
        } catch {}
      }
    }
    return article
  })

  /** 去除提取内容中的相关推荐/热门/原文链接等干扰 */
  function cleanContent(html: string): string {
    if (!html) return html
    try {
      const cheerio = require('cheerio')
      const $ = cheerio.load(html)
      // 1) 去掉包含推荐/相关关键词的区块
      const kw = ['相关推荐','相关文章','热门阅读','推荐阅读','猜你喜欢','相关新闻','RELATED','Recommended','热门文章','编辑推荐','相关资讯','热点推荐','大家还在看','延伸阅读']
      $('section, aside, nav, div[class*=related], div[class*=recommend], div[class*=hot], div[class*=read]').each(function(this: any) {
        for (const k of kw) { if ($(this).text().includes(k)) { $(this).remove(); break } }
      })
      // 2) 去掉原文链接后面的推荐内容（如"分享文章""你可能还想看"等）
      //    先找到"原文"、"原文链接"等段落，移除其后面的兄弟元素
      let foundOriginal = false
      $('p, div').each(function(this: any) {
        const t = $(this).text().trim()
        if (!foundOriginal && (/^原文[\s:：]/.test(t) || /^原文链接[\s:：]/.test(t) || /^本文链接[\s:：]/.test(t))) {
          foundOriginal = true
          return // 保留这个元素，标记已找到
        }
        if (foundOriginal) {
          $(this).remove() // 原文后面的内容全部移除
        }
      })
      // 3) 去掉空的 hr（分割线）
      $('hr').remove()
      return $('body').html() || html
    } catch { return html }
  }

  /** 提取网页正文：cheerio 选择器 + Readability 双层方案 */
  async function extractFromUrl(url: string) {
    // 方法一：cheerio 选择器（最稳定，CJS 兼容）
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
        redirect: 'follow',
      })
      const html = await resp.text()
      if (html.length < 200) return null

      const cheerio = require('cheerio')
      const $ = cheerio.load(html)
      const selectors = ['article', '.article-content', '.post-content', '.entry-content', '.content', 'main', '.main-content', '.post_body', '#article-content']
      for (const sel of selectors) {
        const el = $(sel).html()
        if (el && el.length > 200) return { content: cleanContent(el), summary: $(el).text().substring(0, 500) }
      }
      const paragraphs: string[] = []
      $('p').each((_: number, el: any) => { const t = $(el).text().trim(); if (t.length > 30) paragraphs.push($.html(el)) })
      if (paragraphs.length > 2) return { content: cleanContent(paragraphs.join('')), summary: paragraphs.join(' ').substring(0, 500) }
    } catch {}

    // 方法二：linkedom + Readability（更精确）
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept': 'text/html' },
        redirect: 'follow',
      })
      const html = await resp.text()
      if (html.length < 200) return null
      const { parseHTML } = require('linkedom')
      const { Readability } = require('@mozilla/readability')
      const reader = new Readability(parseHTML(html).window.document, { keepClasses: true })
      const article = reader.parse()
      if (article && article.content && article.content.length > 200) {
        return { content: cleanContent(article.content), summary: article.textContent?.substring(0, 500) || '' }
      }
    } catch {}

    return null
  }

  /** 渲染 Draft.js JSON 内容（豆瓣等使用该格式） */
  function renderDraftJsContent(raw: string): string | null {
    try {
      const decoded = raw
        .replace(/&#34;/g, '"').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      // 1) 提取 JSON 之前的元信息（作者、评价等）
      const jsonStart = decoded.indexOf('{"entityMap"')
      let metaHtml = ''
      if (jsonStart > 0) {
        const meta = decoded.substring(0, jsonStart).trim()
        if (meta) {
          metaHtml = '<div class="draft-meta">'
            + meta.replace(/\n/g, '<br/>')
            + '</div>'
        }
      }
      // 2) 提取 blocks 中的 text
      const bs = decoded.indexOf('"blocks"')
      let texts: string[] = []
      if (bs !== -1) {
        const section = decoded.substring(bs)
        texts = extractDraftJsTexts(section)
      }
      // 3) 如果完整渲染失败，至少返回元信息或剥离 JSON 后的纯文本
      if (texts.length === 0 && metaHtml) return metaHtml
      if (texts.length === 0) {
        // 兜底：去掉所有 {"... 之类的内容
        const cleaned = decoded.replace(/\{"entityMap".*$/s, '').trim()
        if (cleaned) return '<p>' + cleaned.replace(/\n/g, '<br/>') + '</p>'
        return null
      }
      // 4) 拼接渲染
      let bodyHtml = ''
      for (const t of texts) {
        const trimmed = t.replace(/\n/g, '<br/>').trim()
        if (trimmed) bodyHtml += '<p>' + trimmed + '</p>'
      }
      return metaHtml + bodyHtml || null
    } catch (e) {
      return null
    }
  }

  /** 从 "blocks" 数组中安全提取所有 text 字段 */
  function extractDraftJsTexts(section: string): string[] {
    const texts: string[] = []
    let i = 0
    while (i < section.length) {
      const ti = section.indexOf('"text"', i)
      if (ti === -1) break
      const ci = section.indexOf(':', ti + 6)
      if (ci === -1) break
      const q1 = section.indexOf('"', ci + 1)
      if (q1 === -1) break
      let q2 = -1
      let j = q1 + 1
      while (j < section.length) {
        const c = section[j]
        if (c === '\\') { j += 2; continue }
        if (c === '"') { q2 = j; break }
        j++
      }
      if (q2 === -1) break
      let text = section.substring(q1 + 1, q2)
      text = text.replace(/\\u([0-9a-fA-F]{1,4})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16))
      })
      texts.push(text)
      i = q2 + 1
    }
    return texts
  }

  /** 判断内容是否为乱码/原始数据（JSON结构、HTML实体编码等） */
  function looksLikeRawData(text: string): boolean {
    if (!text) return true
    // 检查 HTML 编码后的 JSON 特征（&#34;entityMap&#34; 等）
    const encodedPatterns = ['entityMap', 'blocks', 'inlineStyleRanges', 'entityRanges']
    let matchCount = 0
    for (const p of encodedPatterns) { if (text.includes(p)) matchCount++ }
    if (matchCount >= 2) return true
    // 大量 HTML 实体编码
    const entityCount = (text.match(/&[a-z]+;/g) || []).length
    if (entityCount > 10) return true
    // Unicode 转义序列
    const escapeCount = (text.match(/\\u[0-9a-fA-F]{4}/g) || []).length
    if (escapeCount > 5) return true
    return false
  }

  // ---- OPML Import/Export ----
  ipcMain.handle('opml:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      filters: [{ name: 'OPML', extensions: ['opml', 'xml'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return { count: 0 }
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8')
      const outlines: any[] = []
      const lines = content.split('\n')
      let currentCategory: string | null = null
      for (const line of lines) {
        const feedMatch = line.match(/<outline[^>]*text="([^"]*)"[^>]*xmlUrl="([^"]*)"[^>]*(?:htmlUrl="([^"]*)")?[^>]*\/?>/i)
        const catMatch = line.match(/<outline[^>]*text="([^"]+)"[^>]*>/i)
        if (feedMatch) {
          outlines.push({ title: feedMatch[1], xmlUrl: feedMatch[2], htmlUrl: feedMatch[3], category: currentCategory })
        } else if (catMatch && !line.includes('xmlUrl=')) {
          currentCategory = catMatch[1]
        }
      }
      let added = 0
      for (const outline of outlines) {
        if (!outline.xmlUrl) continue
        try {
          let catId: number | null = null
          if (outline.category) {
            const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(outline.category) as any
            if (existing) { catId = existing.id }
            else { catId = (db.prepare('INSERT INTO categories (name) VALUES (?)').run(outline.category).lastInsertRowid as number) }
          }
          const feed = await parser.parseURL(outline.xmlUrl)
          db.prepare('INSERT OR IGNORE INTO feeds (title, url, site_url, description, category_id) VALUES (?, ?, ?, ?, ?)')
            .run(outline.title || feed.title || '', outline.xmlUrl, outline.htmlUrl || feed.link || '', feed.description || '', catId)
          added++
        } catch { /* skip invalid feeds */ }
      }
      return { count: added }
    } catch (error: any) {
      throw new Error('OPML import failed: ' + error.message)
    }
  })

  ipcMain.handle('opml:export', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: 'feeds.opml',
      filters: [{ name: 'OPML', extensions: ['opml'] }],
    })
    if (result.canceled || !result.filePath) return false
    const feeds = db.prepare('SELECT * FROM feeds ORDER BY title').all() as any[]
    const categories = db.prepare('SELECT * FROM categories').all() as any[]
    const catMap = new Map(categories.map((c: any) => [c.id, c.name]))
    const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    let opml = '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>RSS Reader Export</title>\n  </head>\n  <body>\n'

    const feedsByCat = new Map<number | null, any[]>()
    for (const feed of feeds) {
      const key = feed.category_id || -1
      if (!feedsByCat.has(key)) feedsByCat.set(key, [])
      feedsByCat.get(key)!.push(feed)
    }

    const uncategorized = feedsByCat.get(-1) || []
    for (const feed of uncategorized) {
      opml += '    <outline text="' + escapeXml(feed.title) + '" xmlUrl="' + escapeXml(feed.url) + '" htmlUrl="' + escapeXml(feed.site_url || '') + '"/>\n'
    }

    for (const [catId, catFeeds] of feedsByCat) {
      if (catId === -1) continue
      const catName = catMap.get(catId as number) || 'Uncategorized'
      opml += '    <outline text="' + escapeXml(catName) + '">\n'
      for (const feed of catFeeds) {
        opml += '      <outline text="' + escapeXml(feed.title) + '" xmlUrl="' + escapeXml(feed.url) + '" htmlUrl="' + escapeXml(feed.site_url || '') + '"/>\n'
      }
      opml += '    </outline>\n'
    }

    opml += '  </body>\n</opml>'
    fs.writeFileSync(result.filePath, opml, 'utf-8')
    return true
  })

  // ---- Settings ----
  ipcMain.handle('settings:get', (_e, key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row ? row.value : null
  })
  ipcMain.handle('settings:set', (_e, key, value) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
    return true
  })
  ipcMain.handle('settings:getRefreshTime', () => {
    return { nextRefresh: nextRefreshTime, interval: AUTO_REFRESH_INTERVAL }
  })

  // ---- Open External ----
  ipcMain.handle('shell:openExternal', (_e, url) => {
    shell.openExternal(url)
  })
}
