import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useChat } from '@/app/hooks/use-chat'
import { ApiError } from '@/app/lib/api'
import type { Message } from '@/app/types/conversations'

vi.mock('@/app/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/app/lib/api')>('@/app/lib/api')
  return { ...actual, streamChat: vi.fn() }
})

const { streamChat } = await import('@/app/lib/api')
const streamChatMock = vi.mocked(streamChat)

/** A message store that behaves like the one `useConversations` provides. */
function createStore(initial: Message[] = []) {
  const state = { messages: initial }
  const setMessages = (update: Message[] | ((previous: Message[]) => Message[])) => {
    state.messages = typeof update === 'function' ? update(state.messages) : update
  }
  return { state, setMessages }
}

function stream(...chunks: string[]) {
  return async function* () {
    for (const chunk of chunks) yield chunk
  }
}

describe('useChat', () => {
  it('appends the question and streams the answer into the last message', async () => {
    streamChatMock.mockImplementation(stream('Auth ', 'is ', 'handled in login.py.'))
    const store = createStore()
    const { result } = renderHook(() => useChat(store.setMessages))

    await act(() => result.current.send('how does auth work'))

    expect(store.state.messages).toHaveLength(2)
    expect(store.state.messages[0]).toMatchObject({ role: 'user', content: 'how does auth work' })
    expect(store.state.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Auth is handled in login.py.',
    })
  })

  it('reports generating state for the duration of the request', async () => {
    streamChatMock.mockImplementation(stream('ok'))
    const store = createStore()
    const { result } = renderHook(() => useChat(store.setMessages))

    expect(result.current.isGenerating).toBe(false)
    await act(() => result.current.send('question'))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
  })

  it('surfaces a backend error in place of the answer', async () => {
    streamChatMock.mockImplementation(async function* () {
      throw new ApiError('Ollama is not reachable', 503)
      yield '' // never reached; marks this an async generator
    })
    const store = createStore()
    const { result } = renderHook(() => useChat(store.setMessages))

    await act(() => result.current.send('question'))

    expect(store.state.messages[1]?.content).toBe('**Error:** Ollama is not reachable')
  })

  it('keeps a partial answer when the stream is aborted', async () => {
    streamChatMock.mockImplementation(async function* () {
      yield 'partial'
      throw new DOMException('Aborted', 'AbortError')
    })
    const store = createStore()
    const { result } = renderHook(() => useChat(store.setMessages))

    await act(() => result.current.send('question'))

    expect(store.state.messages[1]?.content).toBe('partial')
  })

  it('drops the empty bubble when aborted before the first token', async () => {
    streamChatMock.mockImplementation(async function* () {
      throw new DOMException('Aborted', 'AbortError')
      yield '' // never reached; marks this an async generator
    })
    const store = createStore()
    const { result } = renderHook(() => useChat(store.setMessages))

    await act(() => result.current.send('question'))

    expect(store.state.messages).toHaveLength(1)
    expect(store.state.messages[0]?.role).toBe('user')
  })

  it('stop() aborts the request that is still in flight', async () => {
    let captured: AbortSignal | undefined
    streamChatMock.mockImplementation(async function* (_message, signal) {
      captured = signal
      yield 'first token'
      // Hang until the caller aborts, the way a real slow model would.
      await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })
    const store = createStore()
    const { result } = renderHook(() => useChat(store.setMessages))

    let pending: Promise<void>
    act(() => {
      pending = result.current.send('question')
    })
    await waitFor(() => expect(result.current.isGenerating).toBe(true))

    act(() => result.current.stop())
    await act(() => pending)

    expect(captured?.aborted).toBe(true)
    expect(result.current.isGenerating).toBe(false)
    expect(store.state.messages[1]?.content).toBe('first token')
  })
})
