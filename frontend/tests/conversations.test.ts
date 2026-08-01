import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteConversation,
  generateTitle,
  getActiveConversationId,
  getConversation,
  getConversations,
  migrateLegacyHistory,
  renameConversation,
  saveConversation,
  saveConversations,
  searchConversations,
  setActiveConversationId,
} from '@/app/lib/conversations'
import { StorageKeys } from '@/app/lib/storage'
import type { Conversation, Message } from '@/app/types/conversations'

function message(role: Message['role'], content: string): Message {
  return { role, content, timestamp: 1 }
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'a',
    title: 'First',
    messages: [message('user', 'how does auth work')],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('generateTitle', () => {
  it('collapses whitespace and keeps short questions intact', () => {
    expect(generateTitle('  how   does\nauth work? ')).toBe('how does auth work?')
  })

  it('truncates long questions', () => {
    const title = generateTitle('a'.repeat(200))
    expect(title).toHaveLength(51)
    expect(title.endsWith('...')).toBe(true)
  })

  it('falls back when there is nothing to title with', () => {
    expect(generateTitle('   ')).toBe('New conversation')
  })
})

describe('storage round-trip', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(getConversations()).toEqual([])
  })

  it('sorts by most recently updated', () => {
    saveConversations([
      conversation({ id: 'old', updatedAt: 10 }),
      conversation({ id: 'new', updatedAt: 20 }),
    ])

    expect(getConversations().map((item) => item.id)).toEqual(['new', 'old'])
  })

  it('discards malformed entries rather than throwing', () => {
    window.localStorage.setItem(
      StorageKeys.conversations,
      JSON.stringify([conversation(), { id: 'broken' }, null])
    )

    expect(getConversations()).toHaveLength(1)
  })

  it('survives a corrupt payload', () => {
    window.localStorage.setItem(StorageKeys.conversations, 'not json')
    expect(getConversations()).toEqual([])
  })
})

describe('saveConversation', () => {
  it('creates a thread titled from its first user message', () => {
    const created = saveConversation('id-1', [
      message('assistant', 'greeting'),
      message('user', 'where is the router defined'),
    ])

    expect(created.title).toBe('where is the router defined')
    expect(getConversations()).toHaveLength(1)
  })

  it('updates an existing thread in place', () => {
    saveConversation('id-1', [message('user', 'first')])
    saveConversation('id-1', [message('user', 'first'), message('assistant', 'second')])

    const stored = getConversations()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.messages).toHaveLength(2)
  })

  it('keeps the original title when updating', () => {
    saveConversation('id-1', [message('user', 'first')], 'Custom title')
    saveConversation('id-1', [message('user', 'changed')])

    expect(getConversation('id-1')?.title).toBe('Custom title')
  })
})

describe('rename and delete', () => {
  beforeEach(() => {
    saveConversations([conversation({ id: 'a' }), conversation({ id: 'b', title: 'Second' })])
  })

  it('renames a thread', () => {
    renameConversation('a', '  Renamed  ')
    expect(getConversation('a')?.title).toBe('Renamed')
  })

  it('ignores a blank rename', () => {
    renameConversation('a', '   ')
    expect(getConversation('a')?.title).toBe('First')
  })

  it('deletes a thread', () => {
    deleteConversation('a')
    expect(getConversations().map((item) => item.id)).toEqual(['b'])
  })

  it('clears the active id when the active thread is deleted', () => {
    setActiveConversationId('a')
    deleteConversation('a')
    expect(getActiveConversationId()).toBeUndefined()
  })

  it('leaves the active id alone when another thread is deleted', () => {
    setActiveConversationId('a')
    deleteConversation('b')
    expect(getActiveConversationId()).toBe('a')
  })
})

describe('searchConversations', () => {
  beforeEach(() => {
    saveConversations([
      conversation({ id: 'a', title: 'Auth flow', messages: [message('user', 'login')] }),
      conversation({
        id: 'b',
        title: 'Routing',
        messages: [message('assistant', 'the middleware runs first')],
      }),
    ])
  })

  it('returns everything for an empty query', () => {
    expect(searchConversations('  ')).toHaveLength(2)
  })

  it('matches titles case-insensitively', () => {
    expect(searchConversations('AUTH').map((item) => item.id)).toEqual(['a'])
  })

  it('matches message bodies', () => {
    expect(searchConversations('middleware').map((item) => item.id)).toEqual(['b'])
  })

  it('returns nothing when there is no match', () => {
    expect(searchConversations('kubernetes')).toEqual([])
  })
})

describe('migrateLegacyHistory', () => {
  it('folds a pre-0.2 thread into the conversation list', () => {
    window.localStorage.setItem(
      StorageKeys.messages,
      JSON.stringify([message('assistant', 'greeting'), message('user', 'explain the parser')])
    )
    window.localStorage.setItem(StorageKeys.repoPath, 'C:/repo')

    const migrated = migrateLegacyHistory()

    expect(migrated?.title).toBe('explain the parser')
    expect(migrated?.repoPath).toBe('C:/repo')
    expect(getConversations()).toHaveLength(1)
    // The legacy key is consumed so the migration runs at most once.
    expect(window.localStorage.getItem(StorageKeys.messages)).toBeNull()
  })

  it('ignores a history that only holds the greeting', () => {
    window.localStorage.setItem(
      StorageKeys.messages,
      JSON.stringify([message('assistant', 'greeting')])
    )

    expect(migrateLegacyHistory()).toBeUndefined()
    expect(getConversations()).toEqual([])
  })

  it('does nothing when conversations already exist', () => {
    saveConversations([conversation()])
    window.localStorage.setItem(
      StorageKeys.messages,
      JSON.stringify([message('user', 'legacy question')])
    )

    expect(migrateLegacyHistory()).toBeUndefined()
    expect(getConversations()).toHaveLength(1)
  })

  it('is a no-op when there is no legacy history', () => {
    expect(migrateLegacyHistory()).toBeUndefined()
  })
})
