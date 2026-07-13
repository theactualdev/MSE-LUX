import type { PriceSet } from '@/types/money'

/** Authored catalog currencies (mirrors Phase 1 money model's admin-authored set). */
export type CatalogCurrency = 'NGN' | 'USD'

/** A single selected option on a variant, e.g. { name: 'Size', value: '18cm' }. */
export interface OptionValue {
  name: string
  value: string
}

export interface ProductVariant {
  id: string
  sku: string
  /** e.g. [{name:'Size',value:'18cm'},{name:'Color',value:'Gold'}] */
  options: OptionValue[]
  /** Optional per-variant override; falls back to product.priceSet when absent. */
  priceSet?: PriceSet
  inventory: number
  /** Optional variant-specific image (e.g. a colorway shot). */
  image?: string
}

export interface Product {
  id: string
  name: string
  slug: string
  shortDescription: string
  description: string
  /** Base authored NGN+USD prices. */
  priceSet: PriceSet
  /** Optional sale price; when present, render struck-through original + sale. */
  salePriceSet?: PriceSet
  sku: string
  /** Inventory for products without variants. */
  inventory: number
  material: string
  categorySlug: string
  subcategorySlug?: string
  collectionSlugs: string[]
  /** Gallery images; [0] is the hero image. */
  images: { src: string; alt: string }[]
  /** e.g. Size:['16cm','18cm','20cm'], Color:['Gold','Silver'] */
  optionTypes: { name: string; values: string[] }[]
  /** Empty if the product has no variants. */
  variants: ProductVariant[]
  badges: ('new' | 'best-seller')[]
  status: 'active' | 'draft'
  seo: { title?: string; description?: string }
}

export interface Subcategory {
  slug: string
  name: string
  categorySlug: string
}

export interface Category {
  slug: string
  name: string
  description?: string
  image?: string
  subcategories: Subcategory[]
}

export interface Collection {
  slug: string
  name: string
  description?: string
  image?: string
  productSlugs: string[]
}
