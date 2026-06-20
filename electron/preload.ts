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
  },

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
