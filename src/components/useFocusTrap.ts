import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Moves focus into the container on mount, keeps Tab inside it, and restores
 * the previously focused element on unmount. Escape stays with the caller —
 * a sheet and a modal close differently.
 */
export function useFocusTrap<T extends HTMLElement>(
  active = true,
  restoreTarget?: HTMLElement | null,
) {
  const ref = useRef<T>(null)

  useEffect(() => {
    if (!active) return
    // Safari does not focus a button on click, so the trigger must be passed
    // explicitly rather than inferred from document.activeElement.
    const previouslyFocused = restoreTarget ?? (document.activeElement as HTMLElement | null)
    const node = ref.current
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null,
      )

    ;(focusables()[0] ?? node)?.focus({ preventScroll: true })

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) {
        // Everything is disabled (e.g. a busy confirm): keep focus inside.
        event.preventDefault()
        node?.focus({ preventScroll: true })
        return
      }
      const head = list[0]
      const tail = list[list.length - 1]
      const active = document.activeElement
      // Focus can sit on the container itself (a click on plain text) or
      // outside it entirely; both would let Tab walk behind the overlay.
      if (!active || active === node || !node?.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? tail : head).focus()
        return
      }
      if (event.shiftKey && active === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && active === tail) {
        event.preventDefault()
        head.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [active, restoreTarget])

  return ref
}
