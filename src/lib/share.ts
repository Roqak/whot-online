import { toast } from 'sonner'

/**
 * Copies text to the clipboard where the browser allows it.
 * Falls back to the legacy execCommand path because the async clipboard
 * API only exists on secure origins (HTTPS or localhost) — a LAN server
 * served over plain HTTP has neither.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied or insecure context: try the legacy path.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/**
 * Native share sheet when available (secure origins), otherwise a copy.
 * Never fails silently: if copying is blocked too, the link is toasted
 * so the player can still read it.
 */
export async function shareOrCopy(text: string, url: string): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Whot! Online', text, url })
      return
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return // they closed the sheet
      // fall through to copy
    }
  }
  const copied = await copyText(url)
  if (copied) toast(text)
  else toast(`${text} ${url}`, { duration: 8000 })
}