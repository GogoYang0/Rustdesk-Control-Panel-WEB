import { useEffect, useRef, useState } from 'react'

import { LANGUAGES, setLanguage } from './core'
import { useLang } from './withLocale'

export default function LanguageSwitcher({ floating = false }: { floating?: boolean }) {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const current = LANGUAGES.find((item) => item.code === lang) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`lang-switch${floating ? ' floating' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="lang-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="切换语言"
        title="切换语言"
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="9" cy="9" r="6.5" />
          <path d="M2.8 9h12.4M9 2.5c1.8 1.8 2.7 4 2.7 6.5S10.8 13.7 9 15.5C7.2 13.7 6.3 11.5 6.3 9S7.2 4.3 9 2.5z" />
        </svg>
        <span>{current.label}</span>
      </button>
      {open ? (
        <div className="lang-menu" role="menu" aria-label="语言">
          {LANGUAGES.map((item) => (
            <button
              key={item.code}
              type="button"
              role="menuitemradio"
              aria-checked={item.code === lang}
              className={`lang-menu-item${item.code === lang ? ' on' : ''}`}
              onClick={() => {
                setOpen(false)
                setLanguage(item.code)
              }}
            >
              <span>{item.name}</span>
              <span className="lang-code">{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
