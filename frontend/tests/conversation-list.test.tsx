import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConversationList } from '@/app/components/conversation-list'
import type { Conversation } from '@/app/types/conversations'

const CONVERSATIONS: Conversation[] = [
  {
    id: 'a',
    title: 'Auth flow',
    messages: [{ role: 'user', content: 'how does login work', timestamp: 1 }],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'b',
    title: 'Routing',
    messages: [{ role: 'assistant', content: 'the middleware runs first', timestamp: 2 }],
    createdAt: 2,
    updatedAt: 2,
  },
]

function renderList(overrides: Partial<Parameters<typeof ConversationList>[0]> = {}) {
  const props = {
    conversations: CONVERSATIONS,
    activeConversationId: 'a',
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onNewConversation: vi.fn(),
    ...overrides,
  }
  render(<ConversationList {...props} />)
  return props
}

describe('ConversationList', () => {
  it('lists every conversation', () => {
    renderList()

    expect(screen.getByText('Auth flow')).toBeInTheDocument()
    expect(screen.getByText('Routing')).toBeInTheDocument()
  })

  it('marks the active conversation', () => {
    renderList()

    const active = screen.getByText('Auth flow').closest('button')
    expect(active).toHaveAttribute('aria-current', 'true')
  })

  it('previews the first user message', () => {
    renderList()

    expect(screen.getByText('how does login work')).toBeInTheDocument()
  })

  it('filters by title', async () => {
    renderList()

    await userEvent.type(screen.getByLabelText('Search conversations'), 'rout')

    expect(screen.queryByText('Auth flow')).not.toBeInTheDocument()
    expect(screen.getByText('Routing')).toBeInTheDocument()
  })

  it('filters by message body', async () => {
    renderList()

    await userEvent.type(screen.getByLabelText('Search conversations'), 'middleware')

    expect(screen.getByText('Routing')).toBeInTheDocument()
    expect(screen.queryByText('Auth flow')).not.toBeInTheDocument()
  })

  it('explains an empty filter result', async () => {
    renderList()

    await userEvent.type(screen.getByLabelText('Search conversations'), 'kubernetes')

    expect(screen.getByText('No matching conversations')).toBeInTheDocument()
  })

  it('explains an empty list', () => {
    renderList({ conversations: [] })

    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  it('selects a conversation on click', async () => {
    const props = renderList()

    await userEvent.click(screen.getByText('Routing'))

    expect(props.onSelect).toHaveBeenCalledWith('b')
  })

  it('starts a new conversation', async () => {
    const props = renderList()

    await userEvent.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(props.onNewConversation).toHaveBeenCalled()
  })

  it('renames a conversation from the inline editor', async () => {
    const props = renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Rename Auth flow' }))
    const field = screen.getByLabelText('Conversation title')
    await userEvent.clear(field)
    await userEvent.type(field, 'Authentication{Enter}')

    expect(props.onRename).toHaveBeenCalledWith('a', 'Authentication')
  })

  it('abandons a rename on Escape', async () => {
    const props = renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Rename Auth flow' }))
    await userEvent.type(screen.getByLabelText('Conversation title'), ' extra{Escape}')

    expect(props.onRename).not.toHaveBeenCalled()
  })

  it('deletes only after the confirmation is accepted', async () => {
    const props = renderList()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await userEvent.click(screen.getByRole('button', { name: 'Delete Auth flow' }))
    expect(props.onDelete).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Auth flow' }))
    expect(props.onDelete).toHaveBeenCalledWith('a')
  })
})
