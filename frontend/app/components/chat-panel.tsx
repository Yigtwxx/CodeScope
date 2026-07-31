'use client'

import { useEffect, useRef, type FormEvent } from 'react'
import { Loader2, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatMessage } from './chat-message'
import { ModeSelector } from './mode-selector'
import type { SearchMode } from '../lib/api'
import type { Message } from '../types/conversations'

interface ChatPanelProps {
  messages: Message[]
  isGenerating: boolean
  isSearching: boolean
  mode: SearchMode
  onModeChange: (mode: SearchMode) => void
  input: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  onSelectSource: (absolutePath: string) => void
  notice?: string | undefined
}

const PLACEHOLDERS: Record<SearchMode, string> = {
  rag: 'Ask a question about your codebase...',
  regex: 'Enter a regex pattern, e.g. class \\w+Service',
  fuzzy: 'Search with typo tolerance, e.g. authentiction',
}

export function ChatPanel({
  messages,
  isGenerating,
  isSearching,
  mode,
  onModeChange,
  input,
  onInputChange,
  onSubmit,
  onStop,
  onSelectSource,
  notice,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Every streamed token changes `messages`, and a smooth scroll restarted on
  // each one never settles — the view ends up short of the bottom. Jump
  // instantly while tokens arrive, then scroll smoothly once generation ends.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isGenerating ? 'auto' : 'smooth' })
  }, [messages, isGenerating])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <ChatMessage
            key={`${message.timestamp}-${index}`}
            role={message.role}
            content={message.content}
            isStreaming={isGenerating && index === messages.length - 1}
            onSelectSource={onSelectSource}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 space-y-3 border-t border-white/10 p-4">
        {notice && (
          <p
            role="alert"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
          >
            {notice}
          </p>
        )}

        <ModeSelector value={mode} onChange={onModeChange} disabled={isGenerating || isSearching} />

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder={PLACEHOLDERS[mode]}
            disabled={isGenerating || isSearching}
            aria-label={PLACEHOLDERS[mode]}
            className="flex-1 border-white/10 bg-[#0f0f0f] text-white placeholder:text-white/40"
          />
          {isGenerating ? (
            <Button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="bg-white text-black hover:bg-white/90"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isSearching || !input.trim()}
              aria-label="Send"
              className="bg-white text-black hover:bg-white/90"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          )}
        </form>
      </div>
    </>
  )
}
