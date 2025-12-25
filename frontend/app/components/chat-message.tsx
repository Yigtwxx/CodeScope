import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
    role: 'user' | 'assistant'
    content: string
}

export function ChatMessage({ role, content }: ChatMessageProps) {
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
                        {content}
                    </ReactMarkdown>
                ) : (
                    <div className="whitespace-pre-wrap">{content}</div>
                )}
            </div>
        </div>
    )
}
