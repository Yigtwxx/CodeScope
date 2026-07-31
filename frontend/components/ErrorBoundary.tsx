'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

/**
 * Catches render-time errors anywhere below it and shows a recoverable screen
 * instead of an unmounted, blank page.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a] p-8 text-white">
        <div className="max-w-xl space-y-5 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-white/60">
            The interface hit an unexpected error. Reloading usually clears it.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-4 text-left font-mono text-sm text-red-300">
            {this.state.error?.message ?? 'Unknown error'}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cursor-pointer rounded-lg bg-white px-6 py-2.5 font-medium text-black transition-colors hover:bg-white/90"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
