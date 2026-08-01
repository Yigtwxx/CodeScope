'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { streamChat, toErrorMessage } from '../lib/api'
import type { Message } from '../types/conversations'

type SetMessages = (update: Message[] | ((previous: Message[]) => Message[])) => void

/**
 * Drives a streaming answer into an externally owned message list.
 *
 * The messages themselves belong to the active conversation, so this hook only
 * owns the in-flight request and the generating flag.
 */
export function useChat(setMessages: SetMessages) {
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | undefined>(undefined)

  // Abort a streaming answer if the page unmounts mid-response.
  useEffect(() => () => abortRef.current?.abort(), [])

  const replaceLastAssistantMessage = useCallback(
    (content: string) => {
      setMessages((previous) => {
        const next = [...previous]
        const last = next[next.length - 1]
        // Replace immutably; mutating in place meant React could skip the
        // re-render and the answer appeared to freeze mid-stream.
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content }
        }
        return next
      })
    },
    [setMessages]
  )

  const send = useCallback(
    async (question: string) => {
      const controller = new AbortController()
      abortRef.current = controller

      setIsGenerating(true)
      const now = Date.now()
      setMessages((previous) => [
        ...previous,
        { role: 'user', content: question, timestamp: now },
        { role: 'assistant', content: '', timestamp: now + 1 },
      ])

      let answer = ''
      try {
        for await (const chunk of streamChat(question, controller.signal)) {
          answer += chunk
          replaceLastAssistantMessage(answer)
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          // Stopping before the first token would otherwise leave an empty
          // assistant bubble behind. Any partial answer is kept.
          if (!answer) {
            setMessages((previous) =>
              previous[previous.length - 1]?.content === '' ? previous.slice(0, -1) : previous
            )
          }
          return
        }
        replaceLastAssistantMessage(`**Error:** ${toErrorMessage(caught)}`)
      } finally {
        setIsGenerating(false)
        abortRef.current = undefined
      }
    },
    [replaceLastAssistantMessage, setMessages]
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { isGenerating, send, stop }
}
