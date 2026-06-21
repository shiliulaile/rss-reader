import React, { useState, useEffect } from 'react'
import { useUIStore } from './store/uiStore'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import ArticleView from './components/ArticleView'
import AddFeedDialog from './components/AddFeedDialog'
import { Search, Star, Rss, PanelLeft, RefreshCw } from 'lucide-react'

export default function App() {
  const [countdown, setCountdown] = useState('')
  const [announcement, setAnnouncement] = useState<{ text: string; link?: string } | null>(null)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const {
    view, setView, searchQuery, setSearchQuery,
    selectedArticleId, sidebarOpen, setSidebarOpen, selectArticle,
    toast, toastType,
  } = useUIStore()

  // 获取公告
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.announcement.get().then(setAnnouncement)
    }
  }, [])

  // 监听更新事件
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.onUpdateAvailable((info) => setUpdateInfo(info))
    window.electronAPI.onUpdateProgress((p) => setUpdateProgress(p.percent || 0))
    window.electronAPI.onUpdateDownloaded(() => {
      setDownloading(false)
      setUpdateInfo(null)
      if (confirm('新版本已下载完成，是否立即重启安装？')) {
        window.electronAPI?.update.install()
      }
    })
  }, [])

  // 自动刷新倒计时
  useEffect(() => {
    const update = async () => {
      if (!window.electronAPI) return
      try {
        const { nextRefresh } = await window.electronAPI.settings.getRefreshTime()
        const remaining = Math.max(0, nextRefresh - Date.now())
        const min = Math.floor(remaining / 60000)
        const sec = Math.floor((remaining % 60000) / 1000)
        setCountdown(`${min}:${sec.toString().padStart(2, '0')}`)
      } catch {
        setCountdown('')
      }
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-white text-surface-800">
      {/* Title Bar */}
      <header className="h-10 bg-white border-b border-surface-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-surface-100 rounded-md transition-colors"
            title={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          >
            <PanelLeft size={16} className="text-surface-500" />
          </button>
          <div className="flex items-center gap-2">
            <Rss size={16} className="text-primary-500" />
            <span className="text-sm font-semibold">RSS Reader</span>
            {countdown && (
              <span className="flex items-center gap-1 text-[11px] text-surface-400 ml-2">
                <RefreshCw size={11} />
                {countdown}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setView('all'); selectArticle(null) }}
            className={`sidebar-item text-xs py-1 px-3 ${view === 'all' || (!view) ? 'active' : ''}`}
          >
            <Rss size={14} />
            全部
          </button>
          <button
            onClick={() => { setView('starred'); selectArticle(null) }}
            className={`sidebar-item text-xs py-1 px-3 ${view === 'starred' ? 'active' : ''}`}
          >
            <Star size={14} />
            星标
          </button>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              type="text"
              placeholder="搜索文章..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 w-48 bg-surface-50"
            />
          </div>
        </div>
      </header>

      {/* 公告栏 */}
      {announcement?.text && (
        <div className="bg-primary-500 text-white text-center text-sm py-1.5 px-4 shrink-0 flex items-center justify-center gap-2">
          <span>{announcement.text}</span>
          {announcement.link && (
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); window.electronAPI?.openExternal(announcement.link!) }}
              className="underline text-white/90 hover:text-white"
            >查看详情</a>
          )}
          <button onClick={() => setAnnouncement(null)} className="text-white/70 hover:text-white ml-2">✕</button>
        </div>
      )}

      {/* 更新提醒 */}
      {updateInfo && !downloading && (
        <div className="bg-orange-500 text-white text-center text-sm py-1.5 px-4 shrink-0 flex items-center justify-center gap-2">
          <span>有新版本 {updateInfo.version} 可用</span>
          <button
            onClick={async () => {
              setDownloading(true)
              await window.electronAPI?.update.download()
            }}
            className="bg-white text-orange-600 px-3 py-0.5 rounded text-xs font-medium"
          >立即更新</button>
          <button onClick={() => setUpdateInfo(null)} className="text-white/70 hover:text-white ml-1">✕</button>
        </div>
      )}
      {downloading && (
        <div className="bg-orange-500 text-white text-center text-sm py-1.5 px-4 shrink-0">
          正在下载更新... {updateProgress > 0 ? Math.round(updateProgress) + '%' : ''}
        </div>
      )}

      {/* Main Content - 两栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 侧栏 */}
        <div className={`border-r border-surface-200 transition-all duration-200 overflow-hidden shrink-0 ${sidebarOpen ? 'w-56' : 'w-0'}`}>
          <div className="w-56 h-full">
            <Sidebar />
          </div>
        </div>

        {/* 内容区：要么文章列表，要么文章阅读（同一区域切换） */}
        <div className="flex-1 overflow-hidden">
          {selectedArticleId ? <ArticleView /> : <ArticleList />}
        </div>
      </div>

      {/* Add Feed Dialog */}
      <AddFeedDialog />

      {/* Toast 提示 */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 ${
          toastType === 'success' ? 'bg-green-600 text-white' :
          toastType === 'error' ? 'bg-red-600 text-white' :
          'bg-surface-800 text-white'
        }`}>
          {toast}
        </div>
      )}
    </div>
  )
}
