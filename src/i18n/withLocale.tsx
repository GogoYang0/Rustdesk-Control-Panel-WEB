import { useSyncExternalStore, type ComponentType } from 'react'

import { getLang, subscribeLang } from './core'

export function useLang() {
  return useSyncExternalStore(subscribeLang, getLang, getLang)
}

/** Re-renders the routed page on locale changes without remounting its state. */
export function withLocale<P extends object>(Component: ComponentType<P>) {
  function LocalizedPage(props: P) {
    useLang()
    return <Component {...props} />
  }
  LocalizedPage.displayName = `Localized(${Component.displayName ?? Component.name ?? 'Page'})`
  return LocalizedPage
}
