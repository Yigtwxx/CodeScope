'use client'

import { useState } from 'react'
import { Check, MessageSquare, Pencil, Trash2, X } from 'lucide-react'
import type { Conversation } from '../types/conversations'

interface ConversationCardProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (newTitle: string) => void
}

export function ConversationCard({
  conversation,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: ConversationCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(conversation.title)

  const commitRename = () => {
    const title = draftTitle.trim()
    if (title && title !== conversation.title) onRename(title)
    setIsEditing(false)
  }

  const cancelRename = () => {
    setDraftTitle(conversation.title)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/10 p-2">
        <input
          type="text"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename()
            if (event.key === 'Escape') cancelRename()
          }}
          onBlur={commitRename}
          aria-label="Conversation title"
          className="min-w-0 flex-1 rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:border-purple-400 focus:outline-none"
          autoFocus
        />
        <button
          type="button"
          // onBlur fires before onClick, so the rename is already committed;
          // this button exists for pointer users who expect a confirm control.
          onMouseDown={(event) => event.preventDefault()}
          onClick={commitRename}
          aria-label="Save title"
          className="cursor-pointer rounded p-1 hover:bg-white/10"
        >
          <Check className="h-4 w-4 text-green-400" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={cancelRename}
          aria-label="Cancel rename"
          className="cursor-pointer rounded p-1 hover:bg-white/10"
        >
          <X className="h-4 w-4 text-white/60" />
        </button>
      </div>
    )
  }

  const preview =
    conversation.messages.find((message) => message.role === 'user')?.content ??
    conversation.messages[0]?.content ??
    'No messages yet'

  return (
    <div
      className={`group relative rounded-lg border transition-colors ${
        isActive
          ? 'border-purple-500/40 bg-purple-500/10'
          : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/5'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'true' : undefined}
        className="w-full cursor-pointer p-3 text-left"
      >
        <span className="flex items-center gap-2">
          <MessageSquare
            className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-purple-300' : 'text-white/40'}`}
            aria-hidden="true"
          />
          {/* Reserve room for the hover actions so long titles do not slide under them. */}
          <span className="truncate pr-12 text-sm font-medium text-white">
            {conversation.title}
          </span>
        </span>
        <span className="mt-1.5 block truncate text-xs text-white/40">{preview}</span>
        <span className="mt-1.5 flex items-center justify-between text-[10px] text-white/30">
          <span>{formatTimeAgo(conversation.updatedAt)}</span>
          <span>
            {conversation.messages.length}{' '}
            {conversation.messages.length === 1 ? 'message' : 'messages'}
          </span>
        </span>
      </button>

      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          aria-label={`Rename ${conversation.title}`}
          title="Rename"
          className="cursor-pointer rounded p-1 hover:bg-white/10"
        >
          <Pencil className="h-3.5 w-3.5 text-white/60" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete "${conversation.title}"?`)) onDelete()
          }}
          aria-label={`Delete ${conversation.title}`}
          title="Delete"
          className="cursor-pointer rounded p-1 hover:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5 text-white/60 hover:text-red-400" />
        </button>
      </div>
    </div>
  )
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`
  return new Date(timestamp).toLocaleDateString()
}
