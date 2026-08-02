import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Re-rendering with a changed value here clears the error and retries. */
  resetKeys?: unknown[]
  fallback: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
  /** Last seen `resetKeys`, so the reset can be derived rather than an effect. */
  seenResetKeys: unknown[]
}

function keysChanged(a: unknown[] = [], b: unknown[] = []): boolean {
  return a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
}

/**
 * Catches render errors so one broken screen can't leave the app with nothing
 * on it and no way out — which is what happened when the Plan tab threw
 * inside a PWA: no browser chrome to go back with, and the crashing tab is in
 * the URL, so reloading returned straight to it.
 *
 * `resetKeys` is how recovery actually happens in practice: keying on the
 * active tab means switching tabs clears the error by itself.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, seenResetKeys: this.props.resetKeys ?? [] }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  // Derived rather than done in componentDidUpdate: clearing the error there
  // costs a second render of the broken subtree before the good one.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const next = props.resetKeys ?? []
    if (!keysChanged(state.seenResetKeys, next)) return null
    return { seenResetKeys: next, error: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset)
    return this.props.children
  }
}
