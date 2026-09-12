import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence: a render crash anywhere unmounts React and leaves
 * nothing but the dark page background — a "black screen". This catches it
 * and shows what went wrong with a way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[whot] render crash', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-2xl font-extrabold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-fg-muted">
          The table hit an unexpected error. Reloading usually sorts it out.
        </p>
        <pre className="max-h-40 max-w-md overflow-auto rounded-xl bg-table-900/80 p-3 text-left text-[11px] text-fg-faint">
          {this.state.error.message}
        </pre>
        <button className="btn-primary px-6" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}