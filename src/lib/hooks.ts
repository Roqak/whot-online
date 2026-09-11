import { useEffect, useRef, useState } from 'react'

/** Tracks an element's width so the hand can fan itself to fit. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export interface Countdown {
  remainingMs: number
  /** 1 at the start of the turn, 0 when time is up. */
  fraction: number
}

/** Counts down to a server deadline, remembering how long the window was. */
export function useCountdown(deadline: number | null, key: unknown): Countdown {
  const totalRef = useRef(0)
  const keyRef = useRef(key)
  const [now, setNow] = useState(() => Date.now())

  if (keyRef.current !== key) {
    keyRef.current = key
    totalRef.current = deadline ? Math.max(1, deadline - Date.now()) : 0
  }
  if (deadline && totalRef.current === 0) totalRef.current = Math.max(1, deadline - Date.now())

  useEffect(() => {
    if (!deadline) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])

  if (!deadline) return { remainingMs: 0, fraction: 0 }
  const remainingMs = Math.max(0, deadline - now)
  return { remainingMs, fraction: Math.max(0, Math.min(1, remainingMs / totalRef.current)) }
}

/** Runs a callback when a value changes, skipping the first render. */
export function useOnChange<T>(value: T, fn: (value: T, previous: T) => void) {
  const previous = useRef(value)
  const callback = useRef(fn)
  callback.current = fn
  useEffect(() => {
    if (previous.current !== value) {
      const before = previous.current
      previous.current = value
      callback.current(value, before)
    }
  }, [value])
}
