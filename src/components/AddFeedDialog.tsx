import React, { useState, useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import type { Category } from '../types'
import { X, Rss, Loader2, Search } from 'lucide-react'

interface DetectedFeed {
  title: string
  url: string
}

export default function AddFeedDialog() {
  const [url, setUrl] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState('')
  const [detectedFeeds, setDetectedFeeds] = useState<DetectedFeed[]>([])
  const { showAddFeedDialog, setShowAddFeedDialog, triggerFeedRefresh } = useUIStore()

  useEffect(() => {
    if (showAddFeedDialog && window.electronAPI) {
      window.electronAPI.categories.list().then(setCategories)
      setUrl('')
      setError('')
      setCategoryId(undefined)
      setDetectedFeeds([])
    }
  }, [showAddFeedDialog])

  const handleDetect = async () => {
    if (!url.trim() || !window.electronAPI) return
    setDetecting(true)
    setError('')
    setDetectedFeeds([])
    try {
      const feeds = await window.electronAPI.feeds.detect(url.trim())
      if (feeds.length > 0) {
        setDetectedFeeds(feeds)
      } else {
        setError('未找到 RSS 订阅源，请手动输入 RSS 地址')
      }
    } catch {
      setError('检测失败，请检查网址是否正确')
    } finally {
      setDetecting(false)
    }
  }

  const handleAddFeed = async (feedUrl: string) => {
    if (!window.electronAPI) return
    setLoading(true)
    setError('')
    try {
      await window.electronAPI.feeds.add(feedUrl, categoryId)
      triggerFeedRefresh()
      setShowAddFeedDialog(false)
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : null)
      setError(msg || '添加失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || !window.electronAPI) return
    await handleAddFeed(url.trim())
  }

  if (!showAddFeedDialog) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <Rss size={18} className="text-primary-500" />
            <h2 className="text-base font-semibold text-surface-800">添加订阅源</h2>
          </div>
          <button
            onClick={() => setShowAddFeedDialog(false)}
            className="p-1 hover:bg-surface-100 rounded-md transition-colors"
          >
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              网站地址或 RSS 链接
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setDetectedFeeds([]) }}
                placeholder="https://sspai.com 或 https://sspai.com/feed"
                className="input-field flex-1"
                autoFocus
              />
              <button
                type="button"
                onClick={handleDetect}
                disabled={detecting || !url.trim()}
                className="btn-secondary flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
              >
                {detecting ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                检测
              </button>
            </div>
            <p className="text-xs text-surface-400 mt-1">输入网站首页地址，点击「检测」自动查找 RSS 源</p>
          </div>

          {/* 检测到的源 */}
          {detectedFeeds.length > 0 && (
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-primary-700">找到以下订阅源：</p>
              {detectedFeeds.map((feed, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-primary-900 truncate">{feed.title || feed.url}</p>
                    <p className="text-xs text-primary-500 truncate">{feed.url}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddFeed(feed.url)}
                    disabled={loading}
                    className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap disabled:opacity-50"
                  >
                    {loading ? '添加中...' : '+ 添加'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              分类（可选）
            </label>
            <select
              value={categoryId || ''}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
              className="input-field"
            >
              <option value="">无分类</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddFeedDialog(false)}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? '添加中...' : '直接添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
