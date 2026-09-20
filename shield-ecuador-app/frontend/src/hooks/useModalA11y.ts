import { RefObject, useEffect } from 'react'

// Shared behaviour for modal dialogs: move focus inside, trap Tab, close on Escape, lock body
// scroll and give focus back on close. `returnFocusTo` exists because Safari does not focus a
// button when it is clicked, so document.activeElement at open time is often just <body>.
export function useModalA11y(
  dialog: RefObject<HTMLElement | null>,
  onClose: () => void,
  returnFocusTo?: () => HTMLElement | null,
) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab' || !dialog.current) return
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      if (focusable.length === 0) { e.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialog.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      const target = returnFocusTo?.() ?? (opener && opener !== document.body ? opener : null)
      target?.focus()
    }
    // onClose/returnFocusTo are read once per open; callers pass stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
