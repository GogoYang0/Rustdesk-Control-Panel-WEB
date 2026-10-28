export type ThemeMode = 'light' | 'dark' | 'auto'

const THEME_KEY = 'rdp-panel-theme'
let autoQuery: MediaQueryList | null = null
let autoHandler: (() => void) | null = null

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'dark' || stored === 'auto' ? stored : 'light'
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function paint(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolve(mode)
}

/**
 * Applies a mode and remembers it. `auto` also follows the OS while the page is
 * open. Called once from main.tsx so every route (login included) is themed, and
 * from the shell's switch on change.
 */
export function applyThemeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode)
  paint(mode)

  // Only follow the OS while `auto` is selected: a listener left behind would
  // repaint an explicit light/dark choice on the next system change.
  const mq = matchMedia('(prefers-color-scheme: dark)')
  if (autoQuery && autoQuery !== mq && autoHandler) {
    autoQuery.removeEventListener('change', autoHandler)
    autoQuery = null
    autoHandler = null
  }
  if (mode === 'auto' && !autoHandler) {
    autoHandler = () => paint('auto')
    autoQuery = mq
    mq.addEventListener('change', autoHandler)
  }
  if (mode !== 'auto' && autoQuery && autoHandler) {
    autoQuery.removeEventListener('change', autoHandler)
    autoQuery = null
    autoHandler = null
  }
}
