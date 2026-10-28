import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from './useFocusTrap'

interface SideSheetProps {
  title: string
  children: ReactNode
  onClose: () => void
}

function sheetRoot(): HTMLElement {
  let root = document.getElementById('sheetRoot')
  if (!root) {
    root = document.createElement('div')
    root.id = 'sheetRoot'
    document.body.appendChild(root)
  }
  return root
}

/**
 * Right-hand detail panel from the prototype (#sheet). Its own portal keeps it
 * out of the modal root, so a sheet opened from a page never stacks on top of
 * an unrelated dialog. Escape and the scrim close it; focus is trapped.
 */
export default function SideSheet({ title, children, onClose }: SideSheetProps) {
  const panelRef = useFocusTrap<HTMLDivElement>()
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
    <div className="sheet-mask" onClick={onClose}>
      <div
        className="sheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button
            className="icon-btn"
            type="button"
            title="关闭"
            aria-label="关闭"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    sheetRoot(),
  )
}
