"use client"

import { useState, useRef, useEffect } from "react"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Send, Settings, Code, MessageSquare, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChatMessage } from "./components/chat-message"
import { SettingsModal } from "./components/settings-modal"
import { FileTree } from "./components/file-tree"

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const getLanguageFromPath = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'js': return 'javascript'
    case 'jsx': return 'jsx'
    case 'ts': return 'typescript'
    case 'tsx': return 'tsx'
    case 'py': return 'python'
    case 'html': return 'html'
    case 'css': return 'css'
    case 'json': return 'json'
    case 'md': return 'markdown'
    default: return 'text'
  }
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am CodeScope. Set a repository in settings and ask me anything about your code.' }
  ])
  const [input, setInput] = useState("")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // State for IDE features
  const [repoPath, setRepoPath] = useState<string>("")
  const [activeTab, setActiveTab] = useState("chat")
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>("")
  const [isLoadingFile, setIsLoadingFile] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return

    const userMessage = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsGenerating(true)

    setMessages(prev => [...prev, { role: 'assistant', content: "" }])

    try {
      const response = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      })

      if (!response.ok) throw new Error("Chat failed")

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) return

      let accumulatedContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulatedContent += chunk

        setMessages(prev => {
          const newMessages = [...prev]
          const lastMsg = newMessages[newMessages.length - 1]
          if (lastMsg.role === 'assistant') {
            lastMsg.content = accumulatedContent
          }
          return newMessages
        })
      }
    } catch (error) {
      console.error(error)
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong." }])
    } finally {
      setIsGenerating(false)
    }
  }

  const handleIngestSuccess = (path: string) => {
    setRepoPath(path)
    setMessages(prev => [...prev, { role: 'assistant', content: "Repository ingested successfully! I'm ready to answer your questions." }])
    setIsSettingsOpen(false)
  }

  const handleFileSelect = async (path: string) => {
    setSelectedFile(path)
    setIsLoadingFile(true)
    setActiveTab("code")

    try {
      const response = await fetch("http://localhost:8000/api/files/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: path })
      })
      if (response.ok) {
        const data = await response.json()
        setFileContent(data.content)
      } else {
        const err = await response.json()
        setFileContent(`Error loading file content: ${err.detail || response.statusText}`)
      }
    } catch (e: any) {
      setFileContent(`Error loading file content: ${e.message}`)
    } finally {
      setIsLoadingFile(false)
    }
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {/* Main App Container - Full Screen */}
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">

        {/* Top Title Bar with Mac Controls */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0a0a0a] relative">
          {/* Mac Window Controls */}
          <div className="flex items-center gap-2 absolute left-4">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
          </div>

          {/* Centered Title */}
          <h1 className="text-xl font-bold tracking-tight absolute left-1/2 transform -translate-x-1/2">CodeScope</h1>

          {/* Settings Button */}
          <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="ml-auto">
            <Settings className="h-5 w-5" />
          </Button>
        </header>

        {/* Main Content Area - Explorer + Content */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* Sidebar - File Explorer */}
          <aside className={`w-60 bg-[#0a0a0a] border-r border-white/10 flex flex-col transition-all duration-300 ${!repoPath ? 'opacity-50 pointer-events-none' : ''}`}>
            <FileTree rootPath={repoPath} onSelectFile={handleFileSelect} />
          </aside>

          {/* Main Content Column */}
          <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0a0a0a]">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="px-4 pt-4">
                <TabsList className="grid w-[200px] grid-cols-2">
                  <TabsTrigger value="chat"><MessageSquare className="w-4 h-4 mr-2" /> Chat</TabsTrigger>
                  <TabsTrigger value="code"><Code className="w-4 h-4 mr-2" /> Code</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 data-[state=active]:flex mt-0">
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                      <ChatMessage key={index} role={msg.role} content={msg.content} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-4 border-t border-white/10">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleSend()
                      }}
                      className="flex space-x-2"
                    >
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question about your codebase..."
                        disabled={isGenerating}
                        className="flex-1 bg-[#0f0f0f] border-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/20"
                      />
                      <Button type="submit" disabled={isGenerating || !input.trim()} className="bg-white text-black hover:bg-white/90">
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 min-h-0 data-[state=active]:flex flex-col mt-0">
                <div className="flex-1 overflow-hidden flex flex-col">
                  {selectedFile ? (
                    <>
                      <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
                        <span className="text-sm font-mono truncate">{selectedFile}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400 transition-colors" onClick={() => setActiveTab("chat")}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex-1 overflow-auto">
                        {isLoadingFile ? (
                          <div className="flex items-center justify-center h-full text-white/50 animate-pulse">Loading content...</div>
                        ) : (
                          <SyntaxHighlighter
                            language={selectedFile ? getLanguageFromPath(selectedFile) : 'text'}
                            style={vscDarkPlus}
                            customStyle={{ margin: 0, borderRadius: 0, height: '100%', fontSize: '0.875rem', background: 'transparent' }}
                            showLineNumbers={true}
                          >
                            {fileContent}
                          </SyntaxHighlighter>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-white/40 select-none">
                      Select a file from the explorer to view its content
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        onIngestSuccess={handleIngestSuccess}
      />
    </main >
  )
}
