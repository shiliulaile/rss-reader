import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  selectedFeedId: number | null
  selectedCategoryId: number | null
  selectedArticleId: number | null
  view: 'all' | 'starred' | 'category' | 'feed'
  searchQuery: string
  showAddFeedDialog: boolean
  feedListVersion: number
  articleListVersion: number
  toast: string
  toastType: 'success' | 'error' | 'info'
  setSidebarOpen: (open: boolean) => void
  selectFeed: (id: number | null) => void
  selectCategory: (id: number | null) => void
  selectArticle: (id: number | null) => void
  setView: (view: 'all' | 'starred' | 'category' | 'feed') => void
  setSearchQuery: (query: string) => void
  setShowAddFeedDialog: (show: boolean) => void
  triggerFeedRefresh: () => void
  triggerArticleRefresh: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  hideToast: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  selectedFeedId: null,
  selectedCategoryId: null,
  selectedArticleId: null,
  view: 'all',
  searchQuery: '',
  showAddFeedDialog: false,
  feedListVersion: 0,
  articleListVersion: 0,
  toast: '',
  toastType: 'info',
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  selectFeed: (id) => set({ selectedFeedId: id, view: id ? 'feed' : 'all', selectedArticleId: null }),
  selectCategory: (id) => set({ selectedCategoryId: id, view: id ? 'category' : 'all', selectedFeedId: null, selectedArticleId: null }),
  selectArticle: (id) => set({ selectedArticleId: id }),
  setView: (view) => set({ view, selectedFeedId: null, selectedCategoryId: null, selectedArticleId: null }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setShowAddFeedDialog: (show) => set({ showAddFeedDialog: show }),
  triggerFeedRefresh: () => set((s) => ({ feedListVersion: s.feedListVersion + 1 })),
  triggerArticleRefresh: () => set((s) => ({ articleListVersion: s.articleListVersion + 1 })),
  showToast: (msg, type = 'info') => {
    set({ toast: msg, toastType: type })
    setTimeout(() => set({ toast: '' }), 3000)
  },
  hideToast: () => set({ toast: '' }),
}))
