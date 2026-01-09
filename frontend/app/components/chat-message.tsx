import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'

interface ChatMessageProps {
    role: 'user' | 'assistant'
    content: string
}

interface SourceCitation {
    id: string
    filename: string
    language: string
    path: string
}

function parseSourceCitations(content: string): { sources: SourceCitation[], mainContent: string } {
    // Parse sources from RAG response
    const sourcePattern = /\*\*📚 Kullanılan Kaynaklar:\*\*\n\n([\s\S]*?)\n---\n/
    const match = content.match(sourcePattern)

    if (match) {
        const sourcesText = match[1]
        const mainContent = content.replace(match[0], '')

        // Parse individual sources: **[1]** `filename.py` *(python)* - path/to/file.py
        const sources: SourceCitation[] = []
        const sourceLines = sourcesText.split('\n').filter(line => line.trim())

        for (const line of sourceLines) {
            const sourceMatch = line.match(/\*\*\[(\d+)\]\*\*\s+`([^ `]+)`\s +\*\(([^)] +) \) \*\s + -\s + (.+) /)
            if (sourceMatch) {
                sources.push({
                    id: sourceMatch[1],
                    filename: sourceMatch[2],
                    language: sourceMatch[3],
                    path: sourceMatch[4]
                })
            }
        }

        return { sources, mainContent }
    }

    return { sources: [], mainContent: content }
}

export function ChatMessage({ role, content }: ChatMessageProps) {
    const [sourcesExpanded, setSourcesExpanded] = useState(true)

    // Parse sources from assistant messages
    const { sources, mainContent } = role === 'assistant'
        ? parseSourceCitations(content)
        : { sources: [], mainContent: content }

    return (
        <div
            className={cn(
                "flex w-full mb-4",
                role === 'user' ? "justify-end" : "justify-start"
            )}
        >
            <div
                className={cn(
                    "max-w-[80%] rounded-lg px-4 py-3 text-sm shadow-sm",
                    role === 'user'
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-700 text-white"
                )}
            >
                {/* Source Citations (ChatGPT-style) */}
                {sources.length > 0 && (
                    <div className="mb-4 border border-blue-500/30 rounded-lg overflow-hidden bg-blue-500/5">
                        {/* Header */}
                        <button
                            onClick={() => setSourcesExpanded(!sourcesExpanded)}
                            className="w-full px-3 py-2 flex items-center justify-between hover:bg-blue-500/10 transition-colors"
                        >
                            <div className="flex items-center gap-2 text-xs font-medium text-blue-400">
                                <FileText className="h-3.5 w-3.5" />
                                <span>Sources ({sources.length})</span>
                            </div>
                            {sourcesExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5 text-blue-400" />
                            ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
                            )}
                        </button>

                        {/* Source List */}
                        {sourcesExpanded && (
                            <div className="px-3 pb-2 space-y-1.5">
                                {sources.map((source) => (
                                    <div
                                        key={source.id}
                                        className="text-xs text-white/80 hover:text-white hover:bg-white/5 p-2 rounded transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-blue-400 font-mono font-medium flex-shrink-0">
                                                [{source.id}]
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <code className="text-white font-medium">
                                                        {source.filename}
                                                    </code>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-mono">
                                                        {source.language}
                                                    </span>
                                                </div>
                                                <div className="text-white/40 text-[11px] mt-0.5 truncate group-hover:text-white/60">
                                                    {source.path}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Main Message Content */}
                {role === 'assistant' ? (
                    <ReactMarkdown
                        components={{
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            code({ className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '')
                                return match ? (
                                    <SyntaxHighlighter
                                        {...props}
                                        style={vscDarkPlus}
                                        language={match[1]}
                                        PreTag="div"
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code {...props} className={className}>
                                        {children}
                                    </code>
                                )
                            }
                        }}
                    >
                        {mainContent}
                    </ReactMarkdown>
                ) : (
                    <div className="whitespace-pre-wrap">{content}</div>
                )}
            </div>
        </div>
    )
}
