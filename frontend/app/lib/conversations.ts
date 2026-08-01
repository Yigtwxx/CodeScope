/**
 * Conversation persistence.
 *
 * Threads live in localStorage; all access goes through the guarded helpers in
 * `storage.ts` rather than touching `window.localStorage` directly.
 */

import { readJson, readString, removeKey, StorageKeys, writeJson, writeString } from './storage'
import type { Conversation, Message } from '../types/conversations'

const MAX_TITLE_LENGTH = 48

/** Derive a thread title from its first user message. */
export function generateTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().replace(/\s+/g, ' ')
  if (!cleaned) return 'New conversation'
  return cleaned.length > MAX_TITLE_LENGTH
    ? `${cleaned.slice(0, MAX_TITLE_LENGTH).trimEnd()}...`
    : cleaned
}

/**
 * Identifier for a new conversation.
 *
 * `crypto.randomUUID` is unavailable over plain HTTP on some browsers, so the
 * timestamp-plus-entropy form is the fallback.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/** Every stored conversation, most recently updated first. */
export function getConversations(): Conversation[] {
  const stored = readJson<Conversation[]>(StorageKeys.conversations, [])
  if (!Array.isArray(stored)) return []
  return stored.filter(isConversation).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveConversations(conversations: Conversation[]): void {
  writeJson(StorageKeys.conversations, conversations)
}

export function getConversation(id: string): Conversation | undefined {
  return getConversations().find((conversation) => conversation.id === id)
}

/** Create a conversation, or replace the messages of an existing one. */
export function saveConversation(
  id: string,
  messages: Message[],
  title?: string,
  repoPath?: string
): Conversation {
  const conversations = getConversations()
  const index = conversations.findIndex((conversation) => conversation.id === id)
  const now = Date.now()

  if (index >= 0) {
    const updated: Conversation = {
      ...conversations[index]!,
      messages,
      updatedAt: now,
      ...(title ? { title } : {}),
      ...(repoPath === undefined ? {} : { repoPath }),
    }
    conversations[index] = updated
    saveConversations(conversations)
    return updated
  }

  const firstUserMessage = messages.find((message) => message.role === 'user')
  const created: Conversation = {
    id,
    title: title ?? generateTitle(firstUserMessage?.content ?? ''),
    messages,
    createdAt: now,
    updatedAt: now,
    ...(repoPath === undefined ? {} : { repoPath }),
  }
  saveConversations([created, ...conversations])
  return created
}

export function deleteConversation(id: string): void {
  saveConversations(getConversations().filter((conversation) => conversation.id !== id))
  if (getActiveConversationId() === id) clearActiveConversation()
}

export function renameConversation(id: string, newTitle: string): void {
  const title = newTitle.trim()
  if (!title) return

  const conversations = getConversations()
  const index = conversations.findIndex((conversation) => conversation.id === id)
  if (index < 0) return

  conversations[index] = { ...conversations[index]!, title, updatedAt: Date.now() }
  saveConversations(conversations)
}

/** Match against titles and message bodies. An empty query returns everything. */
export function searchConversations(query: string): Conversation[] {
  const all = getConversations()
  const needle = query.trim().toLowerCase()
  if (!needle) return all

  return all.filter(
    (conversation) =>
      conversation.title.toLowerCase().includes(needle) ||
      conversation.messages.some((message) => message.content.toLowerCase().includes(needle))
  )
}

export function getActiveConversationId(): string | undefined {
  return readString(StorageKeys.activeConversation) || undefined
}

export function setActiveConversationId(id: string): void {
  writeString(StorageKeys.activeConversation, id)
}

export function clearActiveConversation(): void {
  removeKey(StorageKeys.activeConversation)
}

/**
 * Fold a pre-0.2 single-thread history into the conversation list.
 *
 * Returns the migrated thread when one was found, so callers can make it
 * active. The legacy key is removed afterwards so this runs at most once.
 */
export function migrateLegacyHistory(): Conversation | undefined {
  const legacy = readJson<Message[]>(StorageKeys.messages, [])
  removeKey(StorageKeys.messages)

  if (!Array.isArray(legacy) || legacy.length === 0) return undefined
  // A lone greeting is not worth preserving as a thread.
  if (!legacy.some((message) => message.role === 'user')) return undefined
  if (getConversations().length > 0) return undefined

  const repoPath = readString(StorageKeys.repoPath)
  return saveConversation(generateId(), legacy, undefined, repoPath || undefined)
}

function isConversation(value: unknown): value is Conversation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Conversation>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.messages) &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  )
}
