'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Code as CodeIcon,
  MessageSquare,
  Search as SearchIcon,
  Settings,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatPanel } from './components/chat-panel'
import { CodeViewer } from './components/code-viewer'
import { ExportMenu } from './components/export-menu'
import { SearchResults } from './components/search-results'
import { SettingsModal } from './components/settings-modal'
import { SidePanel } from './components/side-panel'
import { useChat } from './hooks/use-chat'
import { useCodeSearch } from './hooks/use-code-search'
import { useConversations } from './hooks/use-conversations'
import { useFileViewer } from './hooks/use-file-viewer'
import { readString, StorageKeys, writeString } from './lib/storage'
import type { SearchMode } from './lib/api'
import type { Conversation } from './types/conversations'

export default function Home() {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<SearchMode>('rag')
  const [activeTab, setActiveTab] = useState('chat')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [repoPath, setRepoPath] = useState('')
  const isHydrated = useRef(false)

  const conversations = useConversations()
  const chat = useChat(conversations.setMessages)
  const search = useCodeSearch(repoPath)
  const viewer = useFileViewer()

  // The indexed repository is global rather than per conversation: the backend
  // holds one index at a time.
  useEffect(() => {
    const stored = readString(StorageKeys.repoPath)
    // One-shot hydration from localStorage; see the note in use-conversations.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration
    if (stored) setRepoPath(stored)
    isHydrated.current = true
  }, [])

  useEffect(() => {
    if (isHydrated.current) writeString(StorageKeys.repoPath, repoPath)
  }, [repoPath])

  const openFile = useCallback(
    (absolutePath: string) => {
      setActiveTab('code')
      void viewer.open(absolutePath)
    },
    [viewer]
  )

  const handleSubmit = useCallback(() => {
    const value = input.trim()
    if (!value || chat.isGenerating || search.isSearching) return

    setInput('')
    if (mode === 'rag') {
      search.setError(undefined)
      void chat.send(value)
      return
    }
    // Only move to the results tab once there is something to show; a failed
    // search leaves its message next to the input the user is looking at.
    void search.search(value, mode).then((ok) => {
      if (ok) setActiveTab('search')
    })
  }, [chat, input, mode, search])

  const handleIngestSuccess = useCallback(
    (path: string) => {
      setRepoPath(path)
      conversations.setRepoPath(path)
      viewer.close()
      search.reset()
      conversations.setMessages((previous) => [
        ...previous,
        {
          role: 'assistant',
          content: `Indexed \`${path}\`. Ask me anything about it.`,
          timestamp: Date.now(),
        },
      ])
    },
    [conversations, search, viewer]
  )

  const handleClearConversation = useCallback(() => {
    if (!window.confirm('Clear this conversation?')) return
    conversations.resetActiveConversation()
  }, [conversations])

  // Export needs a conversation even before the list has hydrated.
  const exportable: Conversation = conversations.activeConversation ?? {
    id: 'empty',
    title: 'CodeScope',
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0a0a0a]">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-6 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight">CodeScope</h1>
          <p className="truncate text-xs text-white/40">{repoPath || 'No repository indexed'}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsSettingsOpen(true)}
          aria-label="Open repository settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <aside className="w-64 flex-shrink-0 border-r border-white/10">
          <SidePanel
            conversations={conversations.conversations}
            activeConversationId={conversations.activeId}
            onSelectConversation={conversations.selectConversation}
            onDeleteConversation={conversations.deleteConversation}
            onRenameConversation={conversations.renameConversation}
            onNewConversation={conversations.newConversation}
            repoPath={repoPath}
            onSelectFile={openFile}
            selectedFilePath={viewer.path}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
            <div className="flex flex-shrink-0 items-center justify-between px-4 pt-4">
              <TabsList className="grid w-[300px] grid-cols-3 bg-white/5">
                <TabsTrigger
                  value="chat"
                  className="cursor-pointer data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300"
                >
                  <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" /> Chat
                </TabsTrigger>
                <TabsTrigger
                  value="search"
                  className="cursor-pointer data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300"
                >
                  <SearchIcon className="mr-2 h-4 w-4" aria-hidden="true" /> Search
                </TabsTrigger>
                <TabsTrigger
                  value="code"
                  className="cursor-pointer data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300"
                >
                  <CodeIcon className="mr-2 h-4 w-4" aria-hidden="true" /> Code
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <ExportMenu conversation={exportable} />
                <button
                  type="button"
                  onClick={handleClearConversation}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                  className="group cursor-pointer rounded-lg p-2 transition-colors hover:bg-red-500/20"
                >
                  <Trash2 className="h-5 w-5 text-white/70 transition-colors group-hover:text-red-400" />
                </button>
              </div>
            </div>

            <TabsContent
              value="chat"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex"
            >
              <ChatPanel
                messages={conversations.messages}
                isGenerating={chat.isGenerating}
                isSearching={search.isSearching}
                mode={mode}
                onModeChange={setMode}
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                onStop={chat.stop}
                onSelectSource={openFile}
                notice={search.error}
              />
            </TabsContent>

            <TabsContent
              value="search"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex"
            >
              <SearchResults
                results={search.results}
                total={search.results.length}
                query={search.query}
                searchType={mode === 'fuzzy' ? 'fuzzy' : 'regex'}
                truncated={search.truncated}
                isSearching={search.isSearching}
                onOpenFile={openFile}
              />
            </TabsContent>

            <TabsContent
              value="code"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=active]:flex"
            >
              <CodeViewer
                path={viewer.path}
                content={viewer.content}
                isLoading={viewer.isLoading}
                error={viewer.error}
                onClose={viewer.close}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        onIngestSuccess={handleIngestSuccess}
        initialPath={repoPath}
      />
    </main>
  )
}
