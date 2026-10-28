export type ThemeMode = 'light' | 'dark' | 'auto'

const THEME_KEY = 'rdp-panel-theme'
let autoWatching = false

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

  const mq = matchMedia('(prefers-color-scheme: dark)')
  if (mode === 'auto' && !autoWatching) {
    mq.addEventListener('change', () => paint('auto'))
    autoWatching = true
  }
}
