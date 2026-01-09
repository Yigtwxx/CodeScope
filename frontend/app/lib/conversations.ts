import { Conversation, Message } from '../types/conversations'

const STORAGE_KEY = 'codescope_conversations'
const ACTIVE_CONV_KEY = 'codescope_active_conversation'

/**
 * Generate a conversation title from the first user message
 */
export function generateTitle(firstMessage: string): string {
    const cleaned = firstMessage.trim().slice(0, 50)
    return cleaned + (firstMessage.length > 50 ? '...' : '')
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get all conversations from localStorage
 */
export function getConversations(): Conversation[] {
    if (typeof window === 'undefined') return []

    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return stored ? JSON.parse(stored) : []
    } catch (error) {
        console.error('Failed to load conversations:', error)
        return []
    }
}

/**
 * Save conversations to localStorage
 */
export function saveConversations(conversations: Conversation[]): void {
    if (typeof window === 'undefined') return

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
    } catch (error) {
        console.error('Failed to save conversations:', error)
    }
}

/**
 * Get a specific conversation by ID
 */
export function getConversation(id: string): Conversation | null {
    const conversations = getConversations()
    return conversations.find(c => c.id === id) || null
}

/**
 * Save or update a conversation
 */
export function saveConversation(
    id: string,
    messages: Message[],
    title?: string,
    repoPath?: string
): void {
    const conversations = getConversations()
    const index = conversations.findIndex(c => c.id === id)

    if (index >= 0) {
        // Update existing
        conversations[index].messages = messages
        conversations[index].updatedAt = Date.now()
        if (title) conversations[index].title = title
        if (repoPath !== undefined) conversations[index].repoPath = repoPath
    } else {
        // Create new
        const firstUserMessage = messages.find(m => m.role === 'user')?.content || 'New Chat'
        conversations.push({
            id,
            title: title || generateTitle(firstUserMessage),
            messages,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            repoPath
        })
    }

    saveConversations(conversations)
}

/**
 * Delete a conversation
 */
export function deleteConversation(id: string): void {
    const conversations = getConversations()
    const filtered = conversations.filter(c => c.id !== id)
    saveConversations(filtered)

    // If deleted active conversation, clear it
    if (getActiveConversationId() === id) {
        clearActiveConversation()
    }
}

/**
 * Rename a conversation
 */
export function renameConversation(id: string, newTitle: string): void {
    const conversations = getConversations()
    const index = conversations.findIndex(c => c.id === id)

    if (index >= 0) {
        conversations[index].title = newTitle
        conversations[index].updatedAt = Date.now()
        saveConversations(conversations)
    }
}

/**
 * Search conversations
 */
export function searchConversations(query: string): Conversation[] {
    if (!query.trim()) return getConversations()

    const all = getConversations()
    const lowerQuery = query.toLowerCase()

    return all.filter(conv => {
        // Search in title
        if (conv.title.toLowerCase().includes(lowerQuery)) return true

        // Search in messages
        return conv.messages.some(msg =>
            msg.content.toLowerCase().includes(lowerQuery)
        )
    }).sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Get active conversation ID
 */
export function getActiveConversationId(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(ACTIVE_CONV_KEY)
}

/**
 * Set active conversation ID
 */
export function setActiveConversationId(id: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(ACTIVE_CONV_KEY, id)
}

/**
 * Clear active conversation
 */
export function clearActiveConversation(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(ACTIVE_CONV_KEY)
}
