import React, { useEffect, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import type { Feed, Category } from '../types'
import { Rss, Folder, Plus, RefreshCw, Trash2, FolderPlus, Download, Upload, MoreHorizontal, ChevronRight } from 'lucide-react'

export default function Sidebar() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [menuFeed, setMenuFeed] = useState<Feed | null>(null)
  const { view, selectedFeedId, selectedCategoryId, selectFeed, selectCategory, setView, setShowAddFeedDialog, feedListVersion } = useUIStore()

  const loadData = async () => {
    if (!window.electronAPI) return
    const [f, c] = await Promise.all([
      window.electronAPI.feeds.list(),
      window.electronAPI.categories.list(),
    ])
    setFeeds(f)
    setCategories(c)
  }

  useEffect(() => { loadData() }, [feedListVersion])

  const handleRefreshAll = async () => {
    setLoading(true)
    if (window.electronAPI) {
      await window.electronAPI.feeds.refresh()
      await loadData()
    }
    setLoading(false)
  }

  const handleRemoveFeed = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (window.electronAPI) {
      await window.electronAPI.feeds.remove(id)
      await loadData()
    }
  }

  const handleDeleteCategory = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (window.electronAPI) {
      await window.electronAPI.categories.delete(id)
      await loadData()
    }
  }

  const handleImport = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.opml.import()
      if (result.count > 0) {
        await loadData()
        useUIStore.getState().showToast(`成功导入 ${result.count} 个订阅源`, 'success')
      } else {
        useUIStore.getState().showToast('未找到新的订阅源', 'info')
      }
    }
  }

  const handleExport = async () => {
    if (window.electronAPI) {
      await window.electronAPI.opml.export()
    }
  }

  const totalUnread = feeds.reduce((sum, f) => sum + f.unread_count, 0)

  return (
    <div className="flex flex-col h-full bg-surface-50">
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* All Items */}
        <button
          onClick={() => setView('all')}
          className={`sidebar-item w-full ${view === 'all' ? 'active' : ''}`}
        >
          <Rss size={16} />
          <span className="flex-1 text-left">全部文章</span>
          {totalUnread > 0 && (
            <span className="badge badge-primary">{totalUnread}</span>
          )}
        </button>

        {/* Starred */}
        <button
          onClick={() => setView('starred')}
          className={`sidebar-item w-full ${view === 'starred' ? 'active' : ''}`}
        >
          <span className="text-yellow-500">★</span>
          <span className="flex-1 text-left">星标文章</span>
        </button>

        <div className="my-2 border-t border-surface-200" />

        {/* Categories */}
        {categories.map(cat => (
          <div key={cat.id}>
            <button
              onClick={() => selectCategory(cat.id)}
              className={`sidebar-item w-full group ${selectedCategoryId === cat.id ? 'active' : ''}`}
            >
              <Folder size={16} className="text-surface-400" />
              <span className="flex-1 text-left truncate">{cat.name}</span>
              <span className="badge">{feeds.filter(f => f.category_id === cat.id).reduce((s, f) => s + f.unread_count, 0)}</span>
              <button
                onClick={(e) => handleDeleteCategory(e, cat.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-200 rounded"
              >
                <Trash2 size={12} className="text-surface-400" />
              </button>
            </button>
          </div>
        ))}

        <div className="my-2 border-t border-surface-200" />

        {/* Feeds */}
        {feeds.map(feed => (
          <button
            key={feed.id}
            onClick={() => selectFeed(feed.id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenuPos({ x: e.clientX, y: e.clientY })
              setMenuFeed(feed)
            }}
            className={`sidebar-item w-full group ${selectedFeedId === feed.id ? 'active' : ''}`}
          >
            {feed.icon_url ? (
              <img src={feed.icon_url} alt="" className="w-4 h-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <Rss size={16} className="text-primary-500" />
            )}
            <span className="flex-1 text-left truncate text-xs">{feed.title}</span>
            {feed.unread_count > 0 && (
              <span className="badge badge-primary">{feed.unread_count}</span>
            )}
            <button
              onClick={(e) => handleRemoveFeed(e, feed.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-200 rounded ml-1"
            >
              <Trash2 size={12} className="text-surface-400" />
            </button>
          </button>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="p-2 border-t border-surface-200 space-y-1">
        <button
          onClick={() => setShowAddFeedDialog(true)}
          className="sidebar-item w-full text-primary-600 hover:bg-primary-50"
        >
          <Plus size={16} />
          <span className="text-left">添加订阅</span>
        </button>
        <button
          onClick={handleRefreshAll}
          disabled={loading}
          className="sidebar-item w-full text-surface-600"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span className="text-left">{loading ? '刷新中...' : '全部刷新'}</span>
        </button>
        <button
          onClick={handleImport}
          className="sidebar-item w-full text-surface-600"
        >
          <Download size={16} />
          <span className="text-left">导入 RSS 源</span>
        </button>
        <button
          onClick={handleExport}
          className="sidebar-item w-full text-surface-600"
        >
          <Upload size={16} />
          <span className="text-left">导出 RSS 源</span>
        </button>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            if (window.electronAPI) {
              window.electronAPI.openExternal('https://gw67bure8m.feishu.cn/share/base/form/shrcnl43JwVbVN7gakTHFu3DA2g')
            }
          }}
          className="sidebar-item w-full text-xs text-surface-400 hover:text-primary-500 transition-colors"
        >
          <span className="text-left">🐛 BUG 反馈</span>
        </a>
      </div>

      {/* 右键菜单 */}
      {menuPos && menuFeed && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => { setMenuPos(null); setMenuFeed(null) }}
          onContextMenu={(e) => { e.preventDefault(); setMenuPos(null); setMenuFeed(null) }}
        >
          <div
            className="absolute bg-white rounded-lg shadow-xl border border-surface-200 py-1 w-52 text-sm"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              onClick={async () => {
                if (menuFeed?.url && window.electronAPI) {
                  await window.electronAPI.copyToClipboard(menuFeed.url)
                }
                setMenuPos(null); setMenuFeed(null)
              }}
              className="w-full text-left px-4 py-2 hover:bg-surface-100 text-surface-700 transition-colors"
            >
              复制 RSS 源地址
            </button>
            <button
              onClick={() => {
                selectFeed(menuFeed.id)
                setMenuPos(null); setMenuFeed(null)
              }}
              className="w-full text-left px-4 py-2 hover:bg-surface-100 text-surface-700 transition-colors"
            >
              查看内容
            </button>
            <div className="border-t border-surface-100 my-1" />
            <button
              onClick={async () => {
                if (window.electronAPI) {
                  await window.electronAPI.feeds.refresh(menuFeed.id)
                  await loadData()
                }
                setMenuPos(null); setMenuFeed(null)
              }}
              className="w-full text-left px-4 py-2 hover:bg-surface-100 text-surface-700 transition-colors"
            >
              刷新
            </button>
            <button
              onClick={(e) => {
                handleRemoveFeed(e as any, menuFeed.id)
                setMenuPos(null); setMenuFeed(null)
              }}
              className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 transition-colors"
            >
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
