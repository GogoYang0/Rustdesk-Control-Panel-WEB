import en from './messages/en.json'
import ja from './messages/ja.json'
import ru from './messages/ru.json'
import zhTW from './messages/zh-TW.json'
import { applyPatterns } from './patterns'

export const LANGUAGES = [
  { code: 'zh-CN', label: '简中', name: '简体中文' },
  { code: 'zh-TW', label: '繁中', name: '繁體中文' },
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'ru', label: 'RU', name: 'Русский' },
  { code: 'ja', label: '日', name: '日本語' },
] as const

export type Lang = (typeof LANGUAGES)[number]['code']

const STORAGE_KEY = 'rdp-panel-lang'
const dictionaries: Record<Exclude<Lang, 'zh-CN'>, Record<string, string>> = {
  'zh-TW': zhTW,
  en,
  ru,
  ja,
}

function detect(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.some((item) => item.code === stored) ? (stored as Lang) : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

let current: Lang = typeof localStorage === 'undefined' ? 'zh-CN' : detect()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function langLabel(lang: Lang): string {
  return LANGUAGES.find((item) => item.code === lang)?.label ?? lang
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setLanguage(next: Lang): void {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage can be unavailable in private mode; the in-memory choice still applies.
  }
  document.documentElement.lang = next
  document.documentElement.classList.add('lang-switching')
  window.setTimeout(() => document.documentElement.classList.remove('lang-switching'), 340)
  for (const listener of listeners) listener()
}

export function initLanguage(): void {
  document.documentElement.lang = current
}

export function translate(text: string): string {
  if (current === 'zh-CN') return text
  const key = text.replace(/\s+/g, ' ').trim()
  if (!key) return text
  const hit = dictionaries[current][key]
  if (hit) {
    const leading = text.match(/^\s*/)?.[0] ?? ''
    const trailing = text.match(/\s*$/)?.[0] ?? ''
    return `${leading}${hit}${trailing}`
  }
  return applyPatterns(text, current)
}
