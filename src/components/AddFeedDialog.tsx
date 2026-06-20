import React, { useState, useEffect, useRef } from 'react'
import { useUIStore } from '../store/uiStore'
import type { Category } from '../types'
import { X, Rss, Loader2 } from 'lucide-react'

interface DetectedFeed {
  title: string
  url: string
}

const AUTO_DETECT_DELAY = 800 // 毫秒

export default function AddFeedDialog() {
  const [url, setUrl] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState('')
  const [detectedFeeds, setDetectedFeeds] = useState<DetectedFeed[]>([])
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { showAddFeedDialog, setShowAddFeedDialog, triggerFeedRefresh } = useUIStore()

  // 打开对话框时重置
  useEffect(() => {
    if (showAddFeedDialog && window.electronAPI) {
      window.electronAPI.categories.list().then(setCategories)
      setUrl('')
      setError('')
      setCategoryId(undefined)
      setDetectedFeeds([])
    }
  }, [showAddFeedDialog])

  // URL 输入变化时自动检测（防抖）
  useEffect(() => {
    if (detectTimer.current) clearTimeout(detectTimer.current)
    setDetectedFeeds([])
    setError('')
    const val = url.trim()
    // 输入太短或不像网址就不检测
    if (val.length < 4 || (!val.includes('.') && !val.startsWith('http'))) return
    // 已经是以 .xml .rss 结尾的，不用检测
    if (val.endsWith('.xml') || val.endsWith('.rss') || val.includes('/feed') || val.includes('/rss')) return
    detectTimer.current = setTimeout(() => {
      handleDetect(val)
    }, AUTO_DETECT_DELAY)
    return () => { if (detectTimer.current) clearTimeout(detectTimer.current) }
  }, [url])

  const handleDetect = async (targetUrl: string) => {
    if (!targetUrl || !window.electronAPI) return
    setDetecting(true)
    try {
      const feeds = await window.electronAPI.feeds.detect(targetUrl)
      if (feeds.length > 0) {
        setDetectedFeeds(feeds)
      } else {
        setError('未找到 RSS 订阅源，可手动输入 RSS 地址')
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
      let msg = err?.message || (typeof err === 'string' ? err : null) || ''
      // 去掉 Electron IPC 前缀
      msg = msg.replace(/^Error invoking remote method ['"].*?['"]:\s*Error:\s*/, '')
      setError(msg || '添加失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.electronAPI) return
    // 如果检测到源，直接使用第一个检测到的源地址
    const feedUrl = detectedFeeds.length > 0 ? detectedFeeds[0].url : url.trim()
    if (!feedUrl) return
    await handleAddFeed(feedUrl)
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
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setDetectedFeeds([]) }}
                placeholder="输入网站地址，自动检测 RSS 源…"
                className="input-field pr-8"
                autoFocus
              />
              {detecting && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <Loader2 size={16} className="animate-spin text-primary-500" />
                </div>
              )}
            </div>
            <p className="text-xs mt-1">
              {detecting ? (
                <span className="text-primary-600">正在检测 RSS 源…</span>
              ) : (
                <span className="text-surface-400">输入后自动检测，找到的订阅源会显示在下方</span>
              )}
            </p>
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
              disabled={loading || detecting || !url.trim()}
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
