import { Fragment, useSyncExternalStore, type ReactNode } from 'react'

import { getLang, subscribeLang } from './core'

export function I18nRoot({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang, getLang)
  return <Fragment key={lang}>{children}</Fragment>
}

export function useLang() {
  return useSyncExternalStore(subscribeLang, getLang, getLang)
}
