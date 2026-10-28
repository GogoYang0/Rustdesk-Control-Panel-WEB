import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
  width?: number
}

function modalRoot(): HTMLElement {
  let root = document.getElementById('modalRoot')
  if (!root) {
    root = document.createElement('div')
    root.id = 'modalRoot'
    document.body.appendChild(root)
  }
  return root
}

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Modal rendered through the prototype's own #modalRoot container and classes
 * (.mask/.modal/.modal-*). Focus moves into the dialog on open, Tab cycles
 * inside it, and focus returns to the trigger on close — `aria-modal` alone does
 * none of that.
 */
export default function Modal({ title, children, footer, onClose, width }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Callers pass an inline arrow, so the effect must not depend on its identity:
  // a fresh identity each render would re-run the effect and steal focus back.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const node = dialogRef.current
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null,
      )

    const first = focusables()[0]
    first?.focus({ preventScroll: true })

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current()
        return
      }
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
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className="mask" onClick={onClose}>
      <div
        className="modal"
        ref={dialogRef}
        style={width ? { width } : undefined}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>,
    modalRoot(),
  )
}
