import React, { useEffect, useState } from 'react'
import { useUIStore } from '../store/uiStore'
import type { Article } from '../types'
import { Star, ExternalLink, ChevronLeft, Loader2 } from 'lucide-react'

export default function ArticleView() {
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(false)
  const { selectedArticleId, selectArticle } = useUIStore()

  useEffect(() => {
    if (!selectedArticleId || !window.electronAPI) {
      setArticle(null)
      return
    }
    setLoading(true)
    window.electronAPI.articles.get(selectedArticleId).then((a: Article) => {
      setArticle(a)
      setLoading(false)
    })
  }, [selectedArticleId])

  const handleToggleStar = async () => {
    if (!article || !window.electronAPI) return
    const newState = await window.electronAPI.articles.toggleStar(article.id)
    setArticle({ ...article, is_starred: newState ? 1 : 0 })
  }

  const handleOpenExternal = () => {
    if (article?.url && window.electronAPI) {
      window.electronAPI.openExternal(article.url)
    }
  }

  if (!article) {
    return (
      <div className="flex items-center justify-center h-full bg-surface-50">
        <div className="text-center text-surface-400">
          <div className="text-5xl mb-4">📖</div>
          <p className="text-sm">选择一篇文章开始阅读</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-200 bg-white shrink-0">
        <button
          onClick={() => selectArticle(null)}
          className="flex items-center gap-1 text-sm text-surface-500 hover:text-surface-700 transition-colors"
        >
          <ChevronLeft size={16} />
          返回
        </button>
        <div className="flex items-center gap-1">
          {loading && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs text-primary-600">
              <Loader2 size={13} className="animate-spin" />
              加载中...
            </span>
          )}
          <button
            onClick={handleToggleStar}
            className={`p-1.5 rounded hover:bg-surface-100 transition-colors ${article.is_starred ? 'text-yellow-500' : 'text-surface-400'}`}
            title={article.is_starred ? '取消星标' : '添加星标'}
          >
            <Star size={16} fill={article.is_starred ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded hover:bg-surface-100 text-surface-400 transition-colors"
            title="在浏览器中打开"
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-10 py-8">
          {/* Meta */}
          <div className="flex items-center gap-2 text-xs text-surface-400 mb-3">
            <span className="font-medium text-surface-500">{article.feed_title}</span>
            {article.author && <><span>·</span><span>{article.author}</span></>}
            {article.published_at && (
              <><span>·</span><span>{new Date(article.published_at).toLocaleString('zh-CN')}</span></>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-surface-900 mb-8 leading-snug">
            {article.title}
          </h1>

          {/* Content */}
          <div
            className="prose prose-sm max-w-none prose-headings:text-surface-900 prose-a:text-primary-600 prose-img:rounded-lg prose-p:leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: (article.content || article.summary || '<p style="color:#94a3b8">提取中...</p>')
            }}
          />

          {/* 摘要类提醒 */}
          {article.url && (article.url.includes('douban.com') || (article.content || '').length < 200) && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="text-amber-800 font-medium mb-1">📝 温馨提醒</p>
              <p className="text-amber-700">
                当前仅显示文章摘要，完整内容请点击下方按钮在浏览器中查看原文
              </p>
            </div>
          )}

          {/* External Link */}
          {article.url && (
            <div className="mt-4 pt-6 border-t border-surface-200">
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 transition-colors"
              >
                <ExternalLink size={14} />
                在浏览器中查看原文
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
