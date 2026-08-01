import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NEW_CONVERSATION_TITLE, useConversations } from '@/app/hooks/use-conversations'
import { getConversations } from '@/app/lib/conversations'
import { StorageKeys } from '@/app/lib/storage'
import type { Conversation, Message } from '@/app/types/conversations'

function message(role: Message['role'], content: string): Message {
  return { role, content, timestamp: 1 }
}

function seed(conversations: Conversation[], activeId?: string) {
  window.localStorage.setItem(StorageKeys.conversations, JSON.stringify(conversations))
  if (activeId) window.localStorage.setItem(StorageKeys.activeConversation, activeId)
}

async function mount() {
  const view = renderHook(() => useConversations())
  await waitFor(() => expect(view.result.current.conversations.length).toBeGreaterThan(0))
  return view
}

describe('useConversations', () => {
  it('starts with one empty thread when storage is empty', async () => {
    const { result } = await mount()

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.activeConversation?.title).toBe(NEW_CONVERSATION_TITLE)
    // A greeting is seeded so the panel is never blank.
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]?.role).toBe('assistant')
  })

  it('restores stored threads and the previously active one', async () => {
    seed(
      [
        { id: 'a', title: 'Auth', messages: [], createdAt: 1, updatedAt: 3 },
        { id: 'b', title: 'Routing', messages: [], createdAt: 2, updatedAt: 2 },
      ],
      'b'
    )

    const { result } = await mount()

    expect(result.current.conversations).toHaveLength(2)
    expect(result.current.activeId).toBe('b')
  })

  it('falls back to the newest thread when the stored active id is gone', async () => {
    seed([{ id: 'a', title: 'Auth', messages: [], createdAt: 1, updatedAt: 3 }], 'deleted')

    const { result } = await mount()

    expect(result.current.activeId).toBe('a')
  })

  it('migrates a pre-0.2 history into the first thread', async () => {
    window.localStorage.setItem(
      StorageKeys.messages,
      JSON.stringify([message('assistant', 'greeting'), message('user', 'explain the parser')])
    )

    const { result } = await mount()

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.activeConversation?.title).toBe('explain the parser')
    expect(result.current.messages).toHaveLength(2)
  })

  it('titles a thread from its first question', async () => {
    const { result } = await mount()

    act(() => result.current.setMessages([message('user', 'where is the router defined')]))

    expect(result.current.activeConversation?.title).toBe('where is the router defined')
  })

  it('keeps the title once it has been set', async () => {
    const { result } = await mount()

    act(() => result.current.setMessages([message('user', 'first question')]))
    act(() =>
      result.current.setMessages([message('user', 'first question'), message('user', 'second')])
    )

    expect(result.current.activeConversation?.title).toBe('first question')
  })

  it('persists messages to storage', async () => {
    const { result } = await mount()

    act(() => result.current.setMessages([message('user', 'persisted question')]))

    await waitFor(() =>
      expect(getConversations()[0]?.messages[0]?.content).toBe('persisted question')
    )
  })

  it('starts a new thread and makes it active', async () => {
    const { result } = await mount()
    const firstId = result.current.activeId

    act(() => result.current.newConversation())

    expect(result.current.conversations).toHaveLength(2)
    expect(result.current.activeId).not.toBe(firstId)
    expect(result.current.activeConversation?.title).toBe(NEW_CONVERSATION_TITLE)
  })

  it('switches between threads without losing either', async () => {
    const { result } = await mount()
    act(() => result.current.setMessages([message('user', 'first thread')]))
    const firstId = result.current.activeId!

    act(() => result.current.newConversation())
    act(() => result.current.setMessages([message('user', 'second thread')]))

    act(() => result.current.selectConversation(firstId))
    expect(result.current.messages[0]?.content).toBe('first thread')
  })

  it('renames a thread', async () => {
    const { result } = await mount()

    act(() => result.current.renameConversation(result.current.activeId!, '  Renamed  '))

    expect(result.current.activeConversation?.title).toBe('Renamed')
  })

  it('ignores a blank rename', async () => {
    const { result } = await mount()

    act(() => result.current.renameConversation(result.current.activeId!, '   '))

    expect(result.current.activeConversation?.title).toBe(NEW_CONVERSATION_TITLE)
  })

  it('deletes a thread and activates another', async () => {
    const { result } = await mount()
    const firstId = result.current.activeId!
    act(() => result.current.newConversation())
    const secondId = result.current.activeId!

    act(() => result.current.deleteConversation(secondId))

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.activeId).toBe(firstId)
  })

  it('never leaves the user without a thread', async () => {
    const { result } = await mount()

    act(() => result.current.deleteConversation(result.current.activeId!))

    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.activeId).toBe(result.current.conversations[0]!.id)
  })

  it('resets the active thread back to a greeting', async () => {
    const { result } = await mount()
    act(() => result.current.setMessages([message('user', 'a question')]))

    act(() => result.current.resetActiveConversation())

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]?.role).toBe('assistant')
    expect(result.current.activeConversation?.title).toBe(NEW_CONVERSATION_TITLE)
  })

  it('records the indexed repository on the active thread', async () => {
    const { result } = await mount()

    act(() => result.current.setRepoPath('C:/repo'))

    expect(result.current.activeConversation?.repoPath).toBe('C:/repo')
  })
})
