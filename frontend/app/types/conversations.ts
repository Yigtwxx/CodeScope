export interface Message {
    role: 'user' | 'assistant'
    content: string
    timestamp: number
}

export interface Conversation {
    id: string
    title: string
    messages: Message[]
    createdAt: number
    updatedAt: number
    repoPath?: string
}

export interface SearchResult {
    conversation: Conversation
    matchedMessages: number[]
}
