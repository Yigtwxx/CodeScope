"use client"

import { useState } from 'react'
import { Conversation } from '../types/conversations'
import { ConversationCard } from './conversation-card'
import { Search, Plus, MessageSquare } from 'lucide-react'
import { searchConversations } from '../lib/conversations'

interface ConversationListProps {
    conversations: Conversation[]
    activeConversationId: string | null
    onSelect: (id: string) => void
    onDelete: (id: string) => void
    onRename: (id: string, newTitle: string) => void
    onNewChat: () => void
}

export function ConversationList({
    conversations,
    activeConversationId,
    onSelect,
    onDelete,
    onRename,
    onNewChat
}: ConversationListProps) {
    const [searchQuery, setSearchQuery] = useState('')

    const filteredConversations = searchQuery
        ? searchConversations(searchQuery)
        : conversations.sort((a, b) => b.updatedAt - a.updatedAt)

    return (
        <div className="flex flex-col h-full">
            {/* Search */}
            <div className="p-3 border-b border-white/10 flex-shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search conversations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-blue-500/50"
                    />
                </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredConversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-white/40">
                        <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
                        <p className="text-sm">
                            {searchQuery ? 'No conversations found' : 'No conversations yet'}
                        </p>
                    </div>
                ) : (
                    filteredConversations.map((conv) => (
                        <ConversationCard
                            key={conv.id}
                            conversation={conv}
                            isActive={conv.id === activeConversationId}
                            onClick={() => onSelect(conv.id)}
                            onDelete={() => onDelete(conv.id)}
                            onRename={(newTitle) => onRename(conv.id, newTitle)}
                        />
                    ))
                )}
            </div>

            {/* New Chat Button */}
            <div className="p-3 border-t border-white/10 flex-shrink-0">
                <button
                    onClick={onNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg px-4 py-2.5 text-sm font-medium text-blue-400 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    New Conversation
                </button>
            </div>
        </div>
    )
}
