import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatMessage } from '@/app/components/chat-message'

const ANSWER_WITH_SOURCES = [
  '<!--codescope:sources-->',
  '1|auth.py|python|src/auth.py|/repo/src/auth.py',
  '<!--/codescope:sources-->',
  '',
  'Authentication is handled in `auth.py`.',
].join('\n')

describe('ChatMessage', () => {
  it('renders user messages as plain text', () => {
    render(<ChatMessage role="user" content="How does login work?" />)

    expect(screen.getByText('How does login work?')).toBeInTheDocument()
  })

  it('never leaks the citation markers into the rendered answer', () => {
    render(<ChatMessage role="assistant" content={ANSWER_WITH_SOURCES} />)

    expect(screen.queryByText(/codescope:sources/)).not.toBeInTheDocument()
  })

  it('summarises how many sources were consulted', () => {
    render(<ChatMessage role="assistant" content={ANSWER_WITH_SOURCES} />)

    expect(screen.getByRole('button', { name: /Sources consulted \(1\)/ })).toBeInTheDocument()
  })

  it('reveals source details only after the panel is expanded', async () => {
    const user = userEvent.setup()
    render(<ChatMessage role="assistant" content={ANSWER_WITH_SOURCES} />)

    expect(screen.queryByText('src/auth.py')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Sources consulted/ }))

    expect(screen.getByText('src/auth.py')).toBeInTheDocument()
    expect(screen.getByText('python')).toBeInTheDocument()
  })

  it('opens the absolute path when a source is clicked', async () => {
    const user = userEvent.setup()
    const onSelectSource = vi.fn()
    render(
      <ChatMessage role="assistant" content={ANSWER_WITH_SOURCES} onSelectSource={onSelectSource} />
    )

    await user.click(screen.getByRole('button', { name: /Sources consulted/ }))
    await user.click(screen.getByRole('button', { name: /auth\.py/ }))

    // Regression: the relative path used to be passed here, which always 404ed.
    expect(onSelectSource).toHaveBeenCalledWith('/repo/src/auth.py')
  })

  it('shows a typing indicator while an empty answer is streaming', () => {
    render(<ChatMessage role="assistant" content="" isStreaming />)

    expect(screen.getByRole('status', { name: 'Thinking' })).toBeInTheDocument()
  })

  it('stops showing the indicator once tokens arrive', () => {
    render(<ChatMessage role="assistant" content="Partial answer" isStreaming />)

    expect(screen.queryByRole('status', { name: 'Thinking' })).not.toBeInTheDocument()
    expect(screen.getByText('Partial answer')).toBeInTheDocument()
  })

  it('renders assistant markdown rather than escaping it', () => {
    render(<ChatMessage role="assistant" content="# Heading" />)

    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument()
  })
})

describe('link rendering', () => {
  it('renders a fabricated file link as code, not a link', () => {
    // Regression: the model dressed a citation up as
    // [proje.py](file:///home/user/code/proje.py), which does not exist.
    render(
      <ChatMessage
        role="assistant"
        content="See [proje.py](file:///home/user/code/proje.py) for the parser."
      />
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('proje.py').tagName).toBe('CODE')
  })

  it('renders a relative path link as code too', () => {
    render(<ChatMessage role="assistant" content="See [app.py](app.py)." />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('keeps a real web link, opened safely', () => {
    render(<ChatMessage role="assistant" content="See [the docs](https://example.com)." />)

    const link = screen.getByRole('link', { name: 'the docs' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
