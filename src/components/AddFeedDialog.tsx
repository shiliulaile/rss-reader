import React, { useState, useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import type { Category } from '../types'
import { X, Rss, Loader2 } from 'lucide-react'

export default function AddFeedDialog() {
  const [url, setUrl] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { showAddFeedDialog, setShowAddFeedDialog, triggerFeedRefresh } = useUIStore()

  useEffect(() => {
    if (showAddFeedDialog && window.electronAPI) {
      window.electronAPI.categories.list().then(setCategories)
      setUrl('')
      setError('')
      setCategoryId(undefined)
    }
  }, [showAddFeedDialog])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    if (!window.electronAPI) return

    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.feeds.add(url.trim(), categoryId)
      triggerFeedRefresh()
      setShowAddFeedDialog(false)
    } catch (err: any) {
      console.error('Add feed error:', err)
      const msg = err?.message || (typeof err === 'string' ? err : null)
      setError(msg || '添加失败，请检查URL是否为有效的RSS订阅源')
    } finally {
      setLoading(false)
    }
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
              订阅源 URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
              className="input-field"
              autoFocus
              required
            />
          </div>

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
              {loading ? '添加中...' : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
