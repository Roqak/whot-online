import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import type { ConnectionStatus } from '../net/connection'

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === 'open') return null
  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex justify-center pad-safe-top"
    >
      <span className="chip m-2 bg-table-900/95 text-xs text-fg-muted ring-1 ring-table-600/60">
        <Loader2 size={13} className="animate-spin" />
        {status === 'reconnecting' ? 'Reconnecting to the table' : 'Connecting'}
      </span>
    </motion.div>
  )
}
