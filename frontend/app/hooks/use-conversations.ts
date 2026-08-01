'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  clearActiveConversation,
  generateId,
  generateTitle,
  getActiveConversationId,
  getConversations,
  migrateLegacyHistory,
  saveConversations,
  setActiveConversationId,
} from '../lib/conversations'
import type { Conversation, Message } from '../types/conversations'

export const NEW_CONVERSATION_TITLE = 'New conversation'

const GREETING =
  'Hi, I am CodeScope. Index a repository from settings, then ask me about your code.'

function createGreeting(): Message[] {
  return [{ role: 'assistant', content: GREETING, timestamp: Date.now() }]
}

function createConversation(): Conversation {
  const now = Date.now()
  return {
    id: generateId(),
    title: NEW_CONVERSATION_TITLE,
    messages: createGreeting(),
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Owns the conversation list, the active thread, and its persistence.
 *
 * The active thread's messages are the single source of truth for the chat
 * panel; `setMessages` writes straight through to the stored conversation.
 */
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | undefined>(undefined)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load once on mount. localStorage is unavailable during server rendering, so
  // reading it in a state initialiser would cause a hydration mismatch. The
  // lint rule targets effects that re-derive state on every render; this one
  // runs a single time, which is the sanctioned way to seed from storage.
  useEffect(() => {
    migrateLegacyHistory()
    const stored = getConversations()
    const restored = stored.length > 0 ? stored : [createConversation()]
    const savedActiveId = getActiveConversationId()

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration
    setConversations(restored)
    setActiveId(
      restored.some((conversation) => conversation.id === savedActiveId)
        ? savedActiveId
        : restored[0]!.id
    )
    // Batched with the two updates above, so the persist effect below never
    // observes `isLoaded` without the restored list and cannot write over it.
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (isLoaded) saveConversations(conversations)
  }, [conversations, isLoaded])

  useEffect(() => {
    if (!isLoaded) return
    if (activeId) setActiveConversationId(activeId)
    else clearActiveConversation()
  }, [activeId, isLoaded])

  const activeConversation = conversations.find((conversation) => conversation.id === activeId)

  const setMessages = useCallback(
    (update: Message[] | ((previous: Message[]) => Message[])) => {
      setConversations((previous) =>
        previous.map((conversation) => {
          if (conversation.id !== activeId) return conversation

          const messages = typeof update === 'function' ? update(conversation.messages) : update
          // Title the thread from its first question, once.
          const firstQuestion = messages.find((message) => message.role === 'user')
          const title =
            conversation.title === NEW_CONVERSATION_TITLE && firstQuestion
              ? generateTitle(firstQuestion.content)
              : conversation.title

          return { ...conversation, messages, title, updatedAt: Date.now() }
        })
      )
    },
    [activeId]
  )

  const setRepoPath = useCallback(
    (repoPath: string) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === activeId ? { ...conversation, repoPath } : conversation
        )
      )
    },
    [activeId]
  )

  const newConversation = useCallback(() => {
    const created = createConversation()
    setConversations((previous) => [created, ...previous])
    setActiveId(created.id)
  }, [])

  const selectConversation = useCallback((id: string) => setActiveId(id), [])

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === id
          ? { ...conversation, title: trimmed, updatedAt: Date.now() }
          : conversation
      )
    )
  }, [])

  const deleteConversation = useCallback(
    (id: string) => {
      const remaining = conversations.filter((conversation) => conversation.id !== id)
      // Never leave the user with nothing to type into.
      const next = remaining.length > 0 ? remaining : [createConversation()]

      setConversations(next)
      if (activeId === id || activeId === undefined) setActiveId(next[0]!.id)
    },
    [activeId, conversations]
  )

  // Named to avoid shadowing the storage helper of the same name imported above.
  const resetActiveConversation = useCallback(() => {
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              title: NEW_CONVERSATION_TITLE,
              messages: createGreeting(),
              updatedAt: Date.now(),
            }
          : conversation
      )
    )
  }, [activeId])

  return {
    conversations,
    activeConversation,
    activeId,
    messages: activeConversation?.messages ?? [],
    setMessages,
    setRepoPath,
    newConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    resetActiveConversation,
  }
}
