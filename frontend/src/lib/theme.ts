// Theme management — persisted to localStorage
// Default: 'dark' (matches current design)

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'yt-smm-theme'

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEY, theme)
}

export function toggleTheme(): Theme {
  const current = document.documentElement.getAttribute('data-theme') as Theme ?? 'dark'
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
