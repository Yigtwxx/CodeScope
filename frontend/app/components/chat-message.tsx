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
    const [sourcesExpanded, setSourcesExpanded] = useState(false) // Collapsed by default

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
                {/* Source Citations (Cleaner, ChatGPT-style) */}
                {sources.length > 0 && (
                    <div className="mb-4 border border-emerald-500/20 rounded-lg overflow-hidden bg-emerald-500/5">
                        {/* Header - Collapsed by default */}
                        <button
                            onClick={() => setSourcesExpanded(!sourcesExpanded)}
                            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-emerald-500/10 transition-colors group"
                        >
                            <div className="flex items-center gap-2.5 text-xs font-semibold text-emerald-400">
                                <FileText className="h-4 w-4" />
                                <span>Araştırılan Kaynak Dosyalar ({sources.length})</span>
                            </div>
                            {sourcesExpanded ? (
                                <ChevronUp className="h-4 w-4 text-emerald-400 group-hover:text-emerald-300" />
                            ) : (
                                <ChevronDown className="h-4 w-4 text-emerald-400 group-hover:text-emerald-300" />
                            )}
                        </button>

                        {/* Source List - Cleaner design */}
                        {sourcesExpanded && (
                            <div className="px-3 pb-3 pt-1 space-y-2">
                                {sources.map((source) => {
                                    // Language-specific colors
                                    const langColors: Record<string, string> = {
                                        'python': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                                        'javascript': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
                                        'typescript': 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
                                        'java': 'bg-orange-500/20 text-orange-300 border-orange-500/30',
                                        'go': 'bg-teal-500/20 text-teal-300 border-teal-500/30',
                                        'rust': 'bg-red-500/20 text-red-300 border-red-500/30',
                                        'markdown': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
                                    };
                                    const langColor = langColors[source.language] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';

                                    return (
                                        <div
                                            key={source.id}
                                            className="group hover:bg-white/5 p-2.5 rounded-md transition-all cursor-default border border-transparent hover:border-emerald-500/20"
                                        >
                                            <div className="flex items-start gap-2">
                                                <span className="text-emerald-400 font-mono text-xs font-bold flex-shrink-0 mt-0.5">
                                                    {source.id}.
                                                </span>
                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <code className="text-white font-semibold text-sm">
                                                            {source.filename}
                                                        </code>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded border font-mono font-medium ${langColor}`}>
                                                            {source.language}
                                                        </span>
                                                    </div>
                                                    <div className="text-white/50 text-[11px] font-mono truncate group-hover:text-white/70 transition-colors">
                                                        {source.path}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
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
