export interface ContentSection {
  heading: string
  body: string[]
}

export interface ContentPage {
  title: string
  intro?: string
  sections: ContentSection[]
}

/** `lastUpdated` is an ISO date string, `YYYY-MM-DD`. */
export interface PolicyPage extends ContentPage {
  lastUpdated: string
}

export interface FaqGroup {
  heading: string
  items: { q: string; a: string }[]
}

export type PolicySlug = 'shipping-returns' | 'privacy' | 'terms'
