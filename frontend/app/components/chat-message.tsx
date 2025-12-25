import React from 'react'
import ReactMarkdown from 'react-markdown'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/cjs/prism'
import vscDarkPlus from 'react-syntax-highlighter/dist/cjs/styles/prism/vsc-dark-plus'
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
                    "max-w-[80%] rounded-lg px-4 py-3 text-sm",
                    role === 'user'
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                )}
            >
                {role === 'assistant' ? (
                    <ReactMarkdown
                        components={{
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
