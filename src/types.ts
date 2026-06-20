export interface Category {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
  created_at: string
}

export interface Feed {
  id: number
  title: string
  url: string
  site_url: string
  description: string
  icon_url: string
  category_id: number | null
  category_name: string | null
  error_count: number
  last_error: string | null
  last_fetched_at: string | null
  created_at: string
  unread_count: number
}

export interface Article {
  id: number
  feed_id: number
  guid: string
  title: string
  url: string
  author: string
  summary: string
  content: string
  content_type: string
  published_at: string
  is_read: number
  is_starred: number
  created_at: string
  feed_title?: string
  feed_icon?: string
  site_url?: string
}

export interface ArticleListOptions {
  feedId?: number
  categoryId?: number
  isStarred?: boolean
  isRead?: boolean
  search?: string
  limit?: number
  offset?: number
}

export declare global {
  interface Window {
    electronAPI: {
      categories: {
        list: () => Promise<Category[]>
        create: (name: string, parentId?: number) => Promise<Category>
        rename: (id: number, name: string) => Promise<boolean>
        delete: (id: number) => Promise<boolean>
      }
      feeds: {
        list: () => Promise<Feed[]>
        add: (url: string, categoryId?: number) => Promise<Feed>
        refresh: (feedId?: number) => Promise<any[]>
        remove: (id: number) => Promise<boolean>
        updateCategory: (feedId: number, categoryId: number | null) => Promise<boolean>
        detect: (siteUrl: string) => Promise<Array<{ title: string; url: string }>>
        generateFromUrl: (siteUrl: string) => Promise<{ success: boolean; feedId?: number; title?: string }>
      }
      articles: {
        list: (options: ArticleListOptions) => Promise<Article[]>
        markRead: (id: number) => Promise<boolean>
        markAllRead: (feedId?: number) => Promise<boolean>
        toggleStar: (id: number) => Promise<boolean>
        get: (id: number) => Promise<Article>
      }
      opml: {
        import: () => Promise<{ count: number }>
        export: () => Promise<boolean>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<boolean>
        getRefreshTime: () => Promise<{ nextRefresh: number; interval: number }>
      }
      openExternal: (url: string) => Promise<void>
    }
  }
}
