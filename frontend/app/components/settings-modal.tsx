'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { streamIngest, toErrorMessage } from '../lib/api'

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onIngestSuccess: (path: string) => void
  initialPath?: string
}

/** Emitted by the backend on the final line of a successful ingestion. */
const COMPLETION_MARKER = 'INGESTION COMPLETE'

export function SettingsModal({
  open,
  onOpenChange,
  onIngestSuccess,
  initialPath = '',
}: SettingsModalProps) {
  const [repoPath, setRepoPath] = useState(initialPath)
  const [isIngesting, setIsIngesting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [progress, setProgress] = useState('')

  const abortRef = useRef<AbortController | undefined>(undefined)
  const progressRef = useRef<HTMLPreElement>(null)

  // Abort any in-flight ingestion if the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Keep the newest progress line visible.
  useEffect(() => {
    const element = progressRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [progress])

  const close = useCallback(() => {
    if (isIngesting) return
    onOpenChange(false)
  }, [isIngesting, onOpenChange])

  // Escape closes the dialog, matching standard modal behaviour.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    // Without this the form does a full page navigation and the app reloads.
    event.preventDefault()

    const path = repoPath.trim().replace(/^['"]+|['"]+$/g, '')
    if (!path || isIngesting) return

    const controller = new AbortController()
    abortRef.current = controller

    setIsIngesting(true)
    setError(undefined)
    setProgress('')

    let completed = false
    try {
      for await (const chunk of streamIngest(path, controller.signal)) {
        setProgress((previous) => previous + chunk)
        if (chunk.includes(COMPLETION_MARKER)) completed = true
      }

      if (!completed) {
        setError('Indexing ended before it finished. Check the progress log above.')
        return
      }

      notifyCompletion()
      onIngestSuccess(path)
      onOpenChange(false)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(toErrorMessage(caught))
    } finally {
      setIsIngesting(false)
      abortRef.current = undefined
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-white/20 bg-[#1a1b26] shadow-2xl">
        <div className="flex flex-shrink-0 items-start justify-between border-b border-white/10 p-6">
          <div>
            <h2 id="settings-title" className="text-xl font-semibold text-white">
              Repository
            </h2>
            <p className="mt-1 text-sm text-white/50">Index a local repository to chat with it</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={isIngesting}
            aria-label="Close"
            className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <div>
              <label htmlFor="repoPath" className="mb-2 block text-sm font-medium text-white/70">
                Repository path
              </label>
              <input
                id="repoPath"
                type="text"
                value={repoPath}
                onChange={(event) => setRepoPath(event.target.value)}
                disabled={isIngesting}
                placeholder="C:\Users\you\Projects\my-repo"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm text-white transition-colors placeholder:text-white/30 focus:border-blue-500/50 focus:bg-white/10 focus:outline-none disabled:opacity-50"
                required
              />
              <p className="mt-2 text-xs text-white/40">
                Absolute path to a folder on this machine. Indexing replaces the previous
                repository.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            {progress && (
              <pre
                ref={progressRef}
                aria-live="polite"
                className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 font-mono text-xs text-blue-200"
              >
                {progress}
              </pre>
            )}
          </div>

          <div className="flex flex-shrink-0 gap-3 border-t border-white/10 p-6">
            <button
              type="button"
              onClick={close}
              disabled={isIngesting}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isIngesting || !repoPath.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-600 disabled:bg-blue-500/40"
            >
              {isIngesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Indexing...
                </>
              ) : (
                'Index repository'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Show a desktop notification when indexing finishes, if permitted. */
function notifyCompletion() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    new Notification('CodeScope', {
      body: 'Repository indexed. You can start asking questions.',
      icon: '/favicon.ico',
    })
  } catch {
    // Notifications are a nicety; never let them break the flow.
  }
}
