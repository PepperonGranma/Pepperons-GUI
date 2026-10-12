import { useEffect, type RefObject } from 'react'

// Pointer-driven effects are expressed as CSS custom properties on the element
// under the cursor; refresh.css decides what they do. Attributes and properties
// set here are never managed by React, so re-renders leave them alone.
const SPOTLIGHT_SURFACES = '.section-card, .profile-card, .guide-step, .dashboard-header, .option-row'
const TILT_SURFACES = '[data-tilt]'
const TILT_PROPERTIES = ['--tx', '--ty', '--tilt-ax', '--tilt-ay', '--tilt-deg', '--gx', '--gy']

export function useInteractiveSurfaces(root: RefObject<HTMLElement | null>, { spotlight, tilt, ripple }: { spotlight: boolean; tilt: boolean; ripple: boolean }) {
  useEffect(() => {
    const element = root.current
    if (!element || (!spotlight && !tilt && !ripple)) return
    let frame = 0
    let latest: PointerEvent | null = null
    let lit: HTMLElement | null = null
    let tilted: HTMLElement | null = null

    const clearLit = () => { lit?.style.removeProperty('--mx'); lit?.style.removeProperty('--my'); lit = null }
    const clearTilted = () => { if (tilted) for (const name of TILT_PROPERTIES) tilted.style.removeProperty(name); tilted = null }

    const apply = () => {
      frame = 0
      const event = latest
      if (!event || !(event.target instanceof Element)) return
      const surface = spotlight ? event.target.closest<HTMLElement>(SPOTLIGHT_SURFACES) : null
      if (surface !== lit) clearLit()
      if (surface) {
        const box = surface.getBoundingClientRect()
        surface.style.setProperty('--mx', `${event.clientX - box.left}px`)
        surface.style.setProperty('--my', `${event.clientY - box.top}px`)
        lit = surface
      }
      // A mouse hovers; a finger does not, and tilting under a touch only smears the tap.
      const target = tilt && event.pointerType === 'mouse' ? event.target.closest<HTMLElement>(TILT_SURFACES) : null
      if (target !== tilted) clearTilted()
      if (target) {
        const box = target.getBoundingClientRect()
        const x = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width - .5) * 2))
        const y = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height - .5) * 2))
        const strength = Number(target.dataset.tilt) || 8
        // One axis-angle rotation approximates rotateX(-y) rotateY(x) and composes
        // with existing transform animations through the separate `rotate` property.
        target.style.setProperty('--tx', x.toFixed(3))
        target.style.setProperty('--ty', y.toFixed(3))
        target.style.setProperty('--tilt-ax', (-y).toFixed(3))
        target.style.setProperty('--tilt-ay', x.toFixed(3))
        target.style.setProperty('--tilt-deg', `${(Math.min(1, Math.hypot(x, y)) * strength).toFixed(2)}deg`)
        target.style.setProperty('--gx', `${((x + 1) * 50).toFixed(1)}%`)
        target.style.setProperty('--gy', `${((y + 1) * 50).toFixed(1)}%`)
        tilted = target
      }
    }

    const onMove = (event: PointerEvent) => { latest = event; if (!frame) frame = requestAnimationFrame(apply) }
    const onLeave = () => { latest = null; clearLit(); clearTilted() }
    const onDown = (event: PointerEvent) => {
      if (!ripple || !(event.target instanceof Element)) return
      const button = event.target.closest<HTMLElement>('button.primary:not(:disabled)')
      if (!button) return
      const box = button.getBoundingClientRect()
      button.style.setProperty('--px', `${event.clientX - box.left}px`)
      button.style.setProperty('--py', `${event.clientY - box.top}px`)
      // Alternating between two identical animations restarts it on every press.
      button.dataset.ripple = button.dataset.ripple === 'a' ? 'b' : 'a'
    }

    element.addEventListener('pointermove', onMove, { passive: true })
    element.addEventListener('pointerleave', onLeave)
    element.addEventListener('pointerdown', onDown, { passive: true })
    return () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('pointerdown', onDown)
      if (frame) cancelAnimationFrame(frame)
      clearLit()
      clearTilted()
    }
  }, [root, spotlight, tilt, ripple])
}
