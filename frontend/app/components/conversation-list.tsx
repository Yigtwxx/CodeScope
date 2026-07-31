'use client'

import { useMemo, useState } from 'react'
import { MessageSquare, Plus, Search } from 'lucide-react'
import { ConversationCard } from './conversation-card'
import type { Conversation } from '../types/conversations'

interface ConversationListProps {
  conversations: Conversation[]
  activeConversationId?: string | undefined
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, newTitle: string) => void
  onNewConversation: () => void
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onDelete,
  onRename,
  onNewConversation,
}: ConversationListProps) {
  const [query, setQuery] = useState('')

  // Filter the list the caller already owns rather than re-reading storage, so
  // a rename or delete is reflected immediately.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return conversations
    return conversations.filter(
      (conversation) =>
        conversation.title.toLowerCase().includes(needle) ||
        conversation.messages.some((message) => message.content.toLowerCase().includes(needle))
    )
  }, [conversations, query])

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-shrink-0 border-b border-white/10 p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search conversations"
            aria-label="Search conversations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-purple-500/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/40">
            <MessageSquare className="h-10 w-10 opacity-30" aria-hidden="true" />
            <p className="text-sm">
              {query ? 'No matching conversations' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          visible.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeConversationId}
              onSelect={() => onSelect(conversation.id)}
              onDelete={() => onDelete(conversation.id)}
              onRename={(newTitle) => onRename(conversation.id, newTitle)}
            />
          ))
        )}
      </div>

      <div className="flex-shrink-0 border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/15 px-4 py-2.5 text-sm font-medium text-purple-200 transition-colors hover:bg-purple-500/25"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New conversation
        </button>
      </div>
    </div>
  )
}
