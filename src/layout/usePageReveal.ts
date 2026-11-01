import { useLayoutEffect, type RefObject } from 'react'

const SELECTOR = '.page-head, .page > .banner, .page > .toolbar, .page > .tabs, .card'
const MAX_INDEX = 8

function pageRoot(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('.page')
}

/** Assigns reading-order indices to page regions and cards, including async ones. */
export default function usePageReveal<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  routeKey: string,
  ready: boolean,
): void {
  useLayoutEffect(() => {
    if (!ready) return
    const container = containerRef.current
    if (!container) return
    let index = 0
    const seen = new WeakSet<Element>()

    const reveal = (el: HTMLElement) => {
      if (seen.has(el)) return
      seen.add(el)
      el.style.setProperty('--reveal-i', String(Math.min(index, MAX_INDEX)))
      index += 1
      el.classList.add('reveal-in')
    }

    const scan = () => {
      const page = pageRoot(container)
      if (!page) return
      for (const element of page.querySelectorAll<HTMLElement>(SELECTOR)) {
        reveal(element)
      }
    }

    scan()
    const frame = requestAnimationFrame(scan)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== 'childList' || record.addedNodes.length === 0) continue
        scan()
        return
      }
    })
    observer.observe(container, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      for (const el of container.querySelectorAll<HTMLElement>('.reveal-in')) {
        el.classList.remove('reveal-in')
        el.style.removeProperty('--reveal-i')
      }
    }
  }, [containerRef, routeKey, ready])
}
