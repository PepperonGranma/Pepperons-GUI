import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export type DropdownOption = [value: string, label: string, disabled?: boolean]

/** Select-only combobox. The portal escapes cards while inheriting the app theme. */
export function Dropdown({ label, value, options, onChange, disabled = false, placeholder = 'Select…' }: {
  label: string
  value: string
  options: DropdownOption[]
  onChange(value: string): void
  disabled?: boolean
  placeholder?: string
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const typeahead = useRef({ text: '', at: 0 })
  const [open, setOpen] = useState(false)
  const [activeValue, setActiveValue] = useState<string | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 })
  const enabled = options.filter((option) => !option[2])
  const selected = options.find((option) => option[0] === value)
  const activeIndex = options.findIndex((option) => option[0] === activeValue && !option[2])
  const expanded = open && !disabled

  function show(last = false) {
    if (disabled) return
    typeahead.current = { text: '', at: 0 }
    setActiveValue(selected && !selected[2] ? value : enabled.at(last ? -1 : 0)?.[0] ?? null)
    setOpen(true)
  }

  function choose(option: DropdownOption) {
    if (disabled || option[2]) return
    setOpen(false)
    onChange(option[0])
    trigger.current?.focus({ preventScroll: true })
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || disabled) return
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (expanded && event.key === 'Escape') { event.preventDefault(); event.stopPropagation() }
      setOpen(false)
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!expanded) {
        show(event.key === 'ArrowUp' || event.key === 'End')
        if (event.key === 'Home' || event.key === 'End') setActiveValue(enabled.at(event.key === 'End' ? -1 : 0)?.[0] ?? null)
        return
      }
      const current = enabled.findIndex((option) => option[0] === activeValue)
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length
      setActiveValue(enabled[index]?.[0] ?? null)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!expanded) show()
      else if (activeIndex >= 0) choose(options[activeIndex])
      return
    }
    if (event.key.length === 1) {
      event.preventDefault()
      const now = Date.now()
      const text = (now - typeahead.current.at < 700 ? typeahead.current.text : '') + event.key.toLowerCase()
      typeahead.current = { text, at: now }
      const repeated = [...text].every((letter) => letter === text[0])
      const prefix = repeated ? text[0] : text
      const current = enabled.findIndex((option) => option[0] === activeValue)
      const ordered = repeated ? [...enabled.slice(current + 1), ...enabled.slice(0, current + 1)] : enabled
      const match = ordered.find((option) => option[1].toLowerCase().startsWith(prefix))
      setOpen(true)
      if (match) setActiveValue(match[0])
    }
  }

  useLayoutEffect(() => {
    if (!expanded || !trigger.current) return
    const reposition = () => {
      const rect = trigger.current!.getBoundingClientRect()
      const padding = 8
      const width = Math.min(Math.max(rect.width, 220), window.innerWidth - padding * 2)
      const below = window.innerHeight - rect.bottom - padding - 6
      const above = rect.top - padding - 6
      const upwards = below < 180 && above > below
      const maxHeight = Math.max(40, Math.min(280, upwards ? above : below))
      const height = Math.min(menu.current?.scrollHeight || maxHeight, maxHeight)
      setPosition({
        left: Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding)),
        top: upwards ? Math.max(padding, rect.top - height - 6) : rect.bottom + 6,
        width, maxHeight,
      })
    }
    reposition()
    const observer = new ResizeObserver(reposition)
    observer.observe(trigger.current)
    const scroll = (event: Event) => { if (event.target !== menu.current) reposition() }
    window.addEventListener('resize', reposition)
    document.addEventListener('scroll', scroll, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', reposition); document.removeEventListener('scroll', scroll, true) }
  }, [expanded, options.length, position.width])

  useEffect(() => {
    if (!expanded) return
    const outside = (event: Event) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false)
    }
    const blur = () => setOpen(false)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    window.addEventListener('blur', blur)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); window.removeEventListener('blur', blur) }
  }, [expanded])

  useEffect(() => {
    if (disabled) setOpen(false)
    if (open && !enabled.some((option) => option[0] === activeValue)) setActiveValue(enabled[0]?.[0] ?? null)
  }, [disabled, open, options, activeValue])

  useLayoutEffect(() => {
    const active = menu.current?.querySelector<HTMLElement>('[data-active="true"]')
    if (!expanded || !active || !menu.current) return
    const top = active.offsetTop
    const bottom = top + active.offsetHeight
    if (top < menu.current.scrollTop) menu.current.scrollTop = top
    else if (bottom > menu.current.scrollTop + menu.current.clientHeight) menu.current.scrollTop = bottom - menu.current.clientHeight
  }, [expanded, activeValue, position.maxHeight])

  return <>
    <button type="button" ref={trigger} className="dropdown-trigger" role="combobox" aria-label={label}
      aria-expanded={expanded} aria-haspopup="listbox" aria-controls={expanded ? `${id}-list` : undefined}
      aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      data-value={value} disabled={disabled} onKeyDown={keyDown} onClick={() => expanded ? setOpen(false) : show()}>
      <span>{selected?.[1] ?? (value || placeholder)}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {expanded && createPortal(<div ref={menu} id={`${id}-list`} className="dropdown-menu" role="listbox" aria-label={label} style={position}>
      {options.length ? options.map((option, index) => <div key={option[0]} id={`${id}-option-${index}`} role="option"
        className="dropdown-option" aria-selected={option[0] === value} aria-disabled={Boolean(option[2])}
        data-active={option[0] === activeValue && !option[2]} data-value={option[0]}
        onPointerMove={() => { if (!option[2]) setActiveValue(option[0]) }}
        onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
        <span>{option[1]}{option[2] && <small>Unavailable</small>}</span>
        {option[0] === value && <Check size={15} aria-hidden="true" />}
      </div>) : <div className="dropdown-empty">No options available</div>}
    </div>, document.querySelector('.app') || document.body)}
  </>
}
