import React, { useEffect, useState, useCallback } from 'react'
import { useUIStore } from '../store/uiStore'
import type { Article } from '../types'
import { Clock, Star, BookOpen, RefreshCw, CheckCheck } from 'lucide-react'

export default function ArticleList() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const {
    view, selectedFeedId, selectedCategoryId, searchQuery,
    selectedArticleId, selectArticle, articleListVersion,
  } = useUIStore()

  const loadArticles = useCallback(async () => {
    if (!window.electronAPI) return
    setLoading(true)
    try {
      const options: any = { limit: 100 }
      if (view === 'feed' && selectedFeedId) options.feedId = selectedFeedId
      if (view === 'category' && selectedCategoryId) options.categoryId = selectedCategoryId
      if (view === 'starred') options.isStarred = true
      if (searchQuery) options.search = searchQuery

      const result = await window.electronAPI.articles.list(options)
      setArticles(result)
    } finally {
      setLoading(false)
    }
  }, [view, selectedFeedId, selectedCategoryId, searchQuery, articleListVersion])

  useEffect(() => { loadArticles() }, [loadArticles])

  const handleMarkAllRead = async () => {
    if (window.electronAPI) {
      await window.electronAPI.articles.markAllRead(selectedFeedId || undefined)
      loadArticles()
    }
  }

  const handleToggleStar = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (window.electronAPI) {
      await window.electronAPI.articles.toggleStar(id)
      loadArticles()
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
    if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
    return date.toLocaleDateString('zh-CN')
  }

  const stripHtml = (html: string) => {
    return html?.replace(/<[^>]*>/g, '').substring(0, 150) || ''
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          {view !== 'all' && (
            <button
              onClick={() => useUIStore.getState().setView('all')}
              className="text-xs text-primary-600 hover:text-primary-700 transition-colors"
            >
              全部
            </button>
          )}
          <h2 className="text-sm font-semibold text-surface-700">
            {view === 'all' && '全部文章'}
            {view === 'starred' && '星标文章'}
            {view === 'feed' && '订阅源文章'}
            {view === 'category' && '分类文章'}
            {searchQuery && `搜索: ${searchQuery}`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadArticles}
            className="p-1.5 hover:bg-surface-100 rounded-md transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary-500' : 'text-surface-400'} />
          </button>
          <button
            onClick={handleMarkAllRead}
            className="p-1.5 hover:bg-surface-100 rounded-md transition-colors"
            title="全部标为已读"
          >
            <CheckCheck size={14} className="text-surface-400" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && articles.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-surface-400 text-sm">
            加载中...
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-surface-400 text-sm gap-2">
            <BookOpen size={32} />
            <span>暂无文章</span>
          </div>
        ) : (
          articles.map(article => (
            <div
              key={article.id}
              onClick={() => {
                selectArticle(article.id)
                if (!article.is_read && window.electronAPI) {
                  window.electronAPI.articles.markRead(article.id)
                  setArticles(prev => prev.map(a => a.id === article.id ? { ...a, is_read: 1 } : a))
                }
              }}
              className={`article-item ${!article.is_read ? 'unread' : ''} ${selectedArticleId === article.id ? 'active' : ''}`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] text-surface-400 truncate">{article.feed_title}</span>
                    {article.author && (
                      <span className="text-[11px] text-surface-400">· {article.author}</span>
                    )}
                  </div>
                  <h3 className={`text-sm leading-tight mb-1 ${!article.is_read ? 'font-semibold' : 'font-medium text-surface-600'}`}>
                    {article.title}
                  </h3>
                  <p className="text-xs text-surface-400 line-clamp-2 leading-relaxed">
                    {stripHtml(article.summary || article.content || '')}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-surface-400 flex items-center gap-1">
                      <Clock size={10} />
                      {formatDate(article.published_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleToggleStar(e, article.id)}
                  className={`shrink-0 p-1 rounded transition-colors ${article.is_starred ? 'text-yellow-500' : 'text-surface-300 hover:text-yellow-500'}`}
                >
                  <Star size={14} fill={article.is_starred ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
