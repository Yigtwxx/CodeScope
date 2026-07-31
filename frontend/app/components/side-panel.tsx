'use client'

import { FolderOpen, MessagesSquare } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConversationList } from './conversation-list'
import { FileTree } from './file-tree'
import type { Conversation } from '../types/conversations'

interface SidePanelProps {
  conversations: Conversation[]
  activeConversationId?: string | undefined
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onNewConversation: () => void
  repoPath: string
  onSelectFile: (path: string) => void
  selectedFilePath?: string | undefined
}

export function SidePanel({
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onNewConversation,
  repoPath,
  onSelectFile,
  selectedFilePath,
}: SidePanelProps) {
  return (
    <Tabs defaultValue="chats" className="flex h-full flex-col">
      <TabsList className="grid w-full flex-shrink-0 grid-cols-2 rounded-none border-b border-white/10 bg-transparent p-0">
        <TabsTrigger
          value="chats"
          className="cursor-pointer rounded-none py-2.5 text-xs data-[state=active]:bg-white/5 data-[state=active]:text-purple-300"
        >
          <MessagesSquare className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Chats
        </TabsTrigger>
        <TabsTrigger
          value="files"
          className="cursor-pointer rounded-none py-2.5 text-xs data-[state=active]:bg-white/5 data-[state=active]:text-blue-300"
        >
          <FolderOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Files
        </TabsTrigger>
      </TabsList>

      <TabsContent value="chats" className="mt-0 min-h-0 flex-1 data-[state=active]:flex">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelectConversation}
          onDelete={onDeleteConversation}
          onRename={onRenameConversation}
          onNewConversation={onNewConversation}
        />
      </TabsContent>

      <TabsContent value="files" className="mt-0 min-h-0 flex-1 data-[state=active]:flex">
        <FileTree rootPath={repoPath} onSelectFile={onSelectFile} selectedPath={selectedFilePath} />
      </TabsContent>
    </Tabs>
  )
}
