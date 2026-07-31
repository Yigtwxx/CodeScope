'use client'

import { memo, useState, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseAnswer, type SourceCitation } from '../lib/citations'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  /** Renders a typing indicator while the answer is still streaming. */
  isStreaming?: boolean
  onSelectSource?: (path: string) => void
}

/** Badge colours per language, falling back to neutral grey. */
const LANGUAGE_STYLES: Record<string, string> = {
  python: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  javascript: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  typescript: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  java: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  go: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  rust: 'bg-red-500/20 text-red-300 border-red-500/30',
  csharp: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  markdown: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
}

const NEUTRAL_STYLE = 'bg-gray-500/20 text-gray-300 border-gray-500/30'

function SourcePanel({
  sources,
  onSelectSource,
}: {
  sources: SourceCitation[]
  onSelectSource?: (path: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-500/5">
      <button
        type="button"
        onClick={() => setIsExpanded((open) => !open)}
        aria-expanded={isExpanded}
        className="group flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-emerald-500/10"
      >
        <span className="flex items-center gap-2.5 text-xs font-semibold text-emerald-400">
          <FileText className="h-4 w-4" aria-hidden="true" />
          Sources consulted ({sources.length})
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        )}
      </button>

      {isExpanded && (
        <ul className="space-y-1 px-3 pb-3 pt-1">
          {sources.map((source) => (
            <li key={`${source.id}-${source.path}`}>
              <button
                type="button"
                onClick={() => onSelectSource?.(source.absolutePath)}
                // Answers restored from storage may lack an absolute path.
                disabled={!onSelectSource || !source.absolutePath}
                className="w-full rounded-md border border-transparent p-2.5 text-left transition-all enabled:cursor-pointer enabled:hover:border-emerald-500/20 enabled:hover:bg-white/5 disabled:cursor-default"
              >
                <span className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0 font-mono text-xs font-bold text-emerald-400">
                    {source.id}.
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="text-sm font-semibold text-white">{source.filename}</code>
                      <span
                        className={cn(
                          'rounded border px-2 py-0.5 font-mono text-[10px] font-medium',
                          LANGUAGE_STYLES[source.language] ?? NEUTRAL_STYLE
                        )}
                      >
                        {source.language}
                      </span>
                    </span>
                    <span className="block truncate font-mono text-[11px] text-white/50">
                      {source.path}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type CodeProps = ComponentPropsWithoutRef<'code'> & { inline?: boolean }

/** Renders fenced blocks with syntax highlighting and inline spans plainly. */
function CodeRenderer({ className, children, inline, ...props }: CodeProps) {
  const language = /language-(\w+)/.exec(className ?? '')?.[1]

  if (inline || !language) {
    return (
      <code {...props} className={cn('rounded bg-black/40 px-1 py-0.5 text-[0.85em]', className)}>
        {children}
      </code>
    )
  }

  return (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={language}
      PreTag="div"
      customStyle={{ borderRadius: '0.5rem', fontSize: '0.8125rem' }}
    >
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  )
}

/** A link the model made up rather than one it could have read anywhere. */
function isFabricatedHref(href: string): boolean {
  return !/^https?:\/\//i.test(href)
}

/**
 * Render links defensively.
 *
 * Models occasionally dress a citation up as a link and invent the target —
 * `[proje.py](file:///home/user/code/proje.py)`. Those paths do not exist, and
 * a dead link in a grounded answer is worse than no link. Anything that is not
 * a real web URL is shown as the code span it should have been; sources are
 * listed in the panel above, where they are clickable and real.
 */
function LinkRenderer({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  if (!href || isFabricatedHref(href)) {
    return <code className="rounded bg-black/40 px-1 py-0.5 text-[0.85em]">{children}</code>
  }
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-purple-300 underline underline-offset-2 hover:text-purple-200"
    >
      {children}
    </a>
  )
}

function ChatMessageComponent({
  role,
  content,
  isStreaming = false,
  onSelectSource,
}: ChatMessageProps) {
  const isAssistant = role === 'assistant'
  const { sources, content: body } = isAssistant ? parseAnswer(content) : { sources: [], content }

  const showTypingIndicator = isStreaming && body.trim().length === 0

  return (
    <div className={cn('mb-4 flex w-full', isAssistant ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-3 text-sm shadow-sm',
          isAssistant ? 'bg-zinc-800 text-white' : 'bg-blue-600 text-white'
        )}
      >
        {sources.length > 0 && (
          <SourcePanel sources={sources} {...(onSelectSource ? { onSelectSource } : {})} />
        )}

        {showTypingIndicator ? (
          <span className="flex items-center gap-1 py-1" role="status" aria-label="Thinking">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        ) : isAssistant ? (
          <div className="prose prose-invert max-w-none prose-p:my-2 prose-pre:my-2">
            <ReactMarkdown components={{ code: CodeRenderer, a: LinkRenderer }}>
              {body}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{body}</div>
        )}
      </div>
    </div>
  )
}

// Chat history re-renders on every streamed token; memoising keeps older
// messages from re-parsing their markdown each time.
export const ChatMessage = memo(ChatMessageComponent)
