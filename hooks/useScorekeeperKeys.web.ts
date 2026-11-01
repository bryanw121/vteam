import { useEffect, useRef } from 'react'

type Handlers = { pointA: () => void; pointB: () => void; undo: () => void; redo: () => void; enabled: boolean }

/**
 * Desktop scoring from the keyboard: A / ← point to team A, B / → point to team B,
 * Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z (or Ctrl+Y) redo. Ignored while typing in a field.
 */
export function useScorekeeperKeys(handlers: Handlers) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current
      if (!h.enabled || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') { e.preventDefault(); return e.shiftKey ? h.redo() : h.undo() }
      if (mod && key === 'y') { e.preventDefault(); return h.redo() }
      if (mod || e.repeat) return
      if (key === 'a' || e.key === 'ArrowLeft') { e.preventDefault(); h.pointA() }
      else if (key === 'b' || e.key === 'ArrowRight') { e.preventDefault(); h.pointB() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
