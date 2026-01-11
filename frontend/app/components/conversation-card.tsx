"use client"

import { useState } from 'react'
import { Conversation } from '../types/conversations'
import { MessageSquare, Trash2, Edit2, Check, X } from 'lucide-react'

// Konuşma kartı bileşeni özellikleri (props)
interface ConversationCardProps {
    conversation: Conversation
    isActive: boolean
    onClick: () => void
    onDelete: () => void
    onRename: (newTitle: string) => void
}

export function ConversationCard({
    conversation,
    isActive,
    onClick,
    onDelete,
    onRename
}: ConversationCardProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editTitle, setEditTitle] = useState(conversation.title)

    // Yeniden adlandırma işlemini onayla
    const handleRename = () => {
        if (editTitle.trim() && editTitle !== conversation.title) {
            onRename(editTitle.trim())
        }
        setIsEditing(false)
    }

    // Yeniden adlandırmayı iptal et
    const handleCancel = () => {
        setEditTitle(conversation.title)
        setIsEditing(false)
    }

    // Mesaj önizlemesi ve zaman bilgisi
    const messagePreview = conversation.messages[0]?.content.slice(0, 60) || 'No messages'
    const timeAgo = getTimeAgo(conversation.updatedAt)
    const messageCount = conversation.messages.length

    return (
        <div
            className={`group p-3 rounded-lg border transition-all cursor-pointer hover:bg-white/5 ${isActive
                ? 'bg-blue-500/10 border-blue-500/30'
                : 'bg-black/20 border-white/10 hover:border-white/20'
                }`}
            onClick={!isEditing ? onClick : undefined}
        >
            {/* Başlık Alanı */}
            {isEditing ? (
                // Düzenleme Modu
                <div className="flex items-center gap-2 mb-2">
                    <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename()
                            if (e.key === 'Escape') handleCancel()
                        }}
                        className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            handleRename()
                        }}
                        className="p-1 hover:bg-green-500/20 rounded"
                    >
                        <Check className="h-4 w-4 text-green-400" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            handleCancel()
                        }}
                        className="p-1 hover:bg-red-500/20 rounded"
                    >
                        <X className="h-4 w-4 text-red-400" />
                    </button>
                </div>
            ) : (
                // Görüntüleme Modu
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <MessageSquare className="h-4 w-4 text-blue-400 flex-shrink-0" />
                        <h3 className="text-sm font-medium text-white truncate">
                            {conversation.title}
                        </h3>
                    </div>
                    {/* Hover ile görünen eylem butonları */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setIsEditing(true)
                            }}
                            className="p-1 hover:bg-blue-500/20 rounded"
                            title="Rename"
                        >
                            <Edit2 className="h-3.5 w-3.5 text-blue-400" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                if (confirm(`Delete "${conversation.title}"?`)) {
                                    onDelete()
                                }
                            }}
                            className="p-1 hover:bg-red-500/20 rounded"
                            title="Delete"
                        >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                    </div>
                </div>
            )}

            {/* Mesaj Önizlemesi */}
            <p className="text-xs text-white/50 truncate mb-2">{messagePreview}...</p>

            {/* Meta Bilgiler (Zaman, mesaj sayısı) */}
            <div className="flex items-center justify-between text-[10px] text-white/30">
                <span>{timeAgo}</span>
                <span>{messageCount} messages</span>
            </div>
        </div>
    )
}

// Zaman farkını hesaplayan yardımcı fonksiyon
function getTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)

    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

    return new Date(timestamp).toLocaleDateString()
}

