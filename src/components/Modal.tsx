import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from './useFocusTrap'

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

/**
 * Modal rendered through the prototype's own #modalRoot container and classes
 * (.mask/.modal/.modal-*). Focus moves into the dialog on open, Tab cycles
 * inside it, and focus returns to the trigger on close — `aria-modal` alone
 * does none of that.
 */
export default function Modal({ title, children, footer, onClose, width }: ModalProps) {
  const dialogRef = useFocusTrap<HTMLDivElement>()
  // Callers pass an inline arrow, so the effect must not depend on its identity:
  // a fresh identity each render would re-run the effect and steal focus back.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
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
