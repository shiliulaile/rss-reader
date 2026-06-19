import React, { useEffect } from 'react'
import { useUIStore } from './store/uiStore'
import Sidebar from './components/Sidebar'
import ArticleList from './components/ArticleList'
import ArticleView from './components/ArticleView'
import AddFeedDialog from './components/AddFeedDialog'
import { Search, Star, Rss, ChevronLeft, PanelLeft } from 'lucide-react'

export default function App() {
  const {
    view, setView, searchQuery, setSearchQuery,
    selectedArticleId, sidebarOpen, setSidebarOpen, selectArticle,
  } = useUIStore()

  // 点击文章时自动收起侧栏，给阅读腾出空间
  useEffect(() => {
    if (selectedArticleId) {
      setSidebarOpen(false)
    }
  }, [selectedArticleId])

  return (
    <div className="h-screen flex flex-col bg-white text-surface-800">
      {/* Title Bar */}
      <header className="drag-region h-10 bg-white border-b border-surface-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="no-drag p-1 hover:bg-surface-100 rounded-md transition-colors"
            title={sidebarOpen ? '收起侧栏' : '展开侧栏'}
          >
            <PanelLeft size={16} className="text-surface-500" />
          </button>
          <div className="flex items-center gap-2">
            <Rss size={16} className="text-primary-500" />
            <span className="text-sm font-semibold">RSS Reader</span>
          </div>
        </div>
        <div className="flex items-center gap-2 no-drag">
          <button
            onClick={() => { setView('all'); selectArticle(null) }}
            className={`sidebar-item text-xs py-1 px-3 ${view === 'all' ? 'active' : ''}`}
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

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - 阅读文章时自动收起 */}
        <div className={`border-r border-surface-200 transition-all duration-200 overflow-hidden shrink-0 ${sidebarOpen ? 'w-56' : 'w-0'}`}>
          <div className="w-56 h-full">
            <Sidebar />
          </div>
        </div>

        {/* Article List - 阅读文章时缩窄 */}
        <div className={`border-r border-surface-200 shrink-0 transition-all duration-300 ${
          selectedArticleId ? 'w-72' : 'flex-1'
        }`}>
          <ArticleList />
        </div>

        {/* Article View - 阅读文章时撑满剩余空间 */}
        <div className={`flex-1 transition-all duration-300 ${selectedArticleId ? '' : 'hidden'}`}>
          <ArticleView />
        </div>
      </div>

      {/* Add Feed Dialog */}
      <AddFeedDialog />
    </div>
  )
}
