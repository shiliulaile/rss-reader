import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Categories
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    create: (name: string, parentId?: number) => ipcRenderer.invoke('categories:create', name, parentId),
    rename: (id: number, name: string) => ipcRenderer.invoke('categories:rename', id, name),
    delete: (id: number) => ipcRenderer.invoke('categories:delete', id),
  },

  // Feeds
  feeds: {
    list: () => ipcRenderer.invoke('feeds:list'),
    add: (url: string, categoryId?: number) => ipcRenderer.invoke('feeds:add', url, categoryId),
    refresh: (feedId?: number) => ipcRenderer.invoke('feeds:refresh', feedId),
    remove: (id: number) => ipcRenderer.invoke('feeds:remove', id),
    updateCategory: (feedId: number, categoryId: number | null) => ipcRenderer.invoke('feeds:updateCategory', feedId, categoryId),
    detect: (siteUrl: string) => ipcRenderer.invoke('feeds:detect', siteUrl),
    generateFromUrl: (siteUrl: string) => ipcRenderer.invoke('feeds:generateFromUrl', siteUrl),
  },

  // Articles
  articles: {
    list: (options: {
      feedId?: number
      categoryId?: number
      isStarred?: boolean
      isRead?: boolean
      search?: string
      limit?: number
      offset?: number
    }) => ipcRenderer.invoke('articles:list', options),
    markRead: (id: number) => ipcRenderer.invoke('articles:markRead', id),
    markAllRead: (feedId?: number) => ipcRenderer.invoke('articles:markAllRead', feedId),
    toggleStar: (id: number) => ipcRenderer.invoke('articles:toggleStar', id),
    get: (id: number) => ipcRenderer.invoke('articles:get', id),
  },

  // OPML
  opml: {
    import: () => ipcRenderer.invoke('opml:import'),
    export: () => ipcRenderer.invoke('opml:export'),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getRefreshTime: () => ipcRenderer.invoke('settings:getRefreshTime'),
    getVersion: () => ipcRenderer.invoke('settings:getVersion'),
  },

  // 更新
  update: {
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
  },

  // 公告
  announcement: {
    get: () => ipcRenderer.invoke('announcement:get'),
  },

  // 更新事件监听
  onUpdateAvailable: (cb: (info: any) => void) => {
    ipcRenderer.on('update-available', (_e, info) => cb(info))
  },
  onUpdateProgress: (cb: (progress: any) => void) => {
    ipcRenderer.on('download-progress', (_e, p) => cb(p))
  },
  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on('update-downloaded', () => cb())
  },

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  copyToClipboard: (text: string) => ipcRenderer.invoke('shell:copyToClipboard', text),
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
