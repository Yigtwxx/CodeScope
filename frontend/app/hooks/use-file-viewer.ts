'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readFile, toErrorMessage } from '../lib/api'

/** Loads a single file into the code viewer. */
export function useFileViewer() {
  const [path, setPath] = useState<string | undefined>(undefined)
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)

  useEffect(() => () => abortRef.current?.abort(), [])

  const open = useCallback(async (absolutePath: string) => {
    // A second click while the first read is in flight would otherwise race and
    // could show the wrong file's contents.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setPath(absolutePath)
    setIsLoading(true)
    setError(undefined)
    setContent('')

    try {
      const file = await readFile(absolutePath, controller.signal)
      setContent(file.content)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(toErrorMessage(caught))
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [])

  const close = useCallback(() => {
    abortRef.current?.abort()
    setPath(undefined)
    setContent('')
    setError(undefined)
    setIsLoading(false)
  }, [])

  return { path, content, isLoading, error, open, close }
}
