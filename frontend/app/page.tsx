"use client"

import { useState, useRef, useEffect } from "react"
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Settings, Send, Sparkles, Code as CodeIcon, Zap, MessageSquare, X, Search as SearchIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChatMessage } from "./components/chat-message"
import { SettingsModal } from "./components/settings-modal"
import { FileTree } from "./components/file-tree"
import { SearchResults } from "./components/search-results"
import { ExportMenu } from "./components/export-menu"

// Mesaj veri yapısı
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

// Arama sonucu veri yapısı (search-results.tsx ile uyumlu olmalı)
interface SearchResult {
  file: string
  line_number: number
  line_content: string
  context_before: string[]
  context_after: string[]
}

// Dosya uzantısına göre sözdizimi vurgulama dili döndürür
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
  // Mesaj durumu ve başlangıç mesajı
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am CodeScope. Set a repository in settings and ask me anything about your code.', timestamp: Date.now() }
  ])
  const [input, setInput] = useState("")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // IDE özelliklerini yöneten durumlar (state)
  const [repoPath, setRepoPath] = useState<string>("")
  const [activeTab, setActiveTab] = useState("chat")
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>("")
  const [isLoadingFile, setIsLoadingFile] = useState(false)

  // Arama modu durumu
  const [searchMode, setSearchMode] = useState<'rag' | 'regex' | 'fuzzy'>('rag')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [totalMatches, setTotalMatches] = useState<number>(0)
  const [isSearching, setIsSearching] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Sayfa yüklendiğinde localStorage'dan mesajları yükle
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('codescope_messages')
      if (saved) {
        try {
          setMessages(JSON.parse(saved))
        } catch (e) {
          console.error('Failed to load messages:', e)
        }
      }
    }
  }, [])

  // Mesajları localStorage'a otomatik kaydet
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      localStorage.setItem('codescope_messages', JSON.stringify(messages))
    }
  }, [messages])

  // Yeni mesaj geldiğinde otomatik aşağı kaydır
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Mesaj gönderme işlemi
  const handleSend = async () => {
    if (!input.trim() || isGenerating || isSearching) return

    const userMessage = input.trim()
    setInput("")

    // Farklı arama modlarını yönet
    if (searchMode === 'regex' || searchMode === 'fuzzy') {
      handleSearch(userMessage)
      return
    }

    // RAG modu (standart sohbet)
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

      // Stream yanıtını parça parça oku
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

  // Arama işlemini yürüten fonksiyon (Regex veya Fuzzy)
  const handleSearch = async (query: string) => {
    if (!repoPath) {
      alert("Please set a repository path first in Settings")
      return
    }

    console.log(`[Search] Starting ${searchMode} search for: `, query)
    console.log(`[Search] Repository path: `, repoPath)

    setIsSearching(true)
    setSearchQuery(query)
    setActiveTab("search")

    try {
      const endpoint = searchMode === 'regex'
        ? 'http://localhost:8000/api/search/regex'
        : 'http://localhost:8000/api/search/fuzzy'

      console.log(`[Search] Calling endpoint: `, endpoint)

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          repo_path: repoPath,
          threshold: 70 // Fuzzy arama için eşik değeri
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error(`[Search] API error: `, error)
        throw new Error(error.detail || 'Search failed')
      }

      const data = await response.json()
      console.log(`[Search] Received ${data.total_matches} matches`)
      console.log(`[Search] Results: `, data.results)

      setSearchResults(data.results || [])
      setTotalMatches(data.total_matches || 0)
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('[Search] Error:', error)
      alert(`Search failed: ${error.message} `)
      setSearchResults([])
      setTotalMatches(0)
    } finally {
      setIsSearching(false)
    }
  }

  // Depo yükleme (ingestion) başarılı olduğunda çalışır
  const handleIngestSuccess = (path: string) => {
    setRepoPath(path)

    // Bildirim izni iste
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }

    // Sohbette başarı mesajı göster
    const successMsg: Message = {
      role: 'assistant',
      content: `✅ **Repository açıldı!** Indexing arka planda devam ediyor.\n\n📍 **Repo:** ${path}\n\n⏳ **Ne yapmalısınız:**\n1. Settings modal'deki progress mesajlarını takip edin\n2. "🎉 INGESTION COMPLETE!" mesajını görene kadar bekleyin\n3. Tamamlandığında bildirim alacaksınız!\n4. Sonra sorularınızı sorun 🚀`,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, successMsg])
  }

  // Dosya ağacından bir dosya seçildiğinde çalışır
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
        setFileContent(`Error loading file content: ${err.detail || response.statusText} `)
      }
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      setFileContent(`Error loading file content: ${e.message} `)
    } finally {
      setIsLoadingFile(false)
    }
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {/* Ana Uygulama Konteyneri - Tam Ekran */}
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#0a0a0a]">

        {/* Üst Başlık Çubuğu (Mac benzeri kontrollerle) */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0a0a0a] relative">
          {/* Mac Pencere Kontrolleri (Görsel) */}
          <div className="flex items-center gap-2 absolute left-4">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
          </div>

          {/* Ortalanmış Başlık */}
          <h1 className="text-xl font-bold tracking-tight absolute left-1/2 transform -translate-x-1/2">CodeScope</h1>

          {/* Ayarlar Butonu */}
          <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="ml-auto">
            <Settings className="h-5 w-5" />
          </Button>
        </header>

        {/* Ana İçerik Alanı - Dosya Gezgini + Sekmeli İçerik */}
        <div className="flex-1 flex flex-row overflow-hidden">
          {/* Yan Çubuk - Dosya Gezgini */}
          <aside className={`w-60 bg-[#0a0a0a] border-r border-white/10 flex flex-col transition-all duration-300 ${!repoPath ? 'opacity-50 pointer-events-none' : ''}`}>
            <FileTree rootPath={repoPath} onSelectFile={handleFileSelect} />
          </aside>

          {/* Ana İçerik Sütunu */}
          <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0a0a0a]">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              {/* Sekme Başlıkları ve Dışa Aktar/Temizle Butonları */}
              <div className="px-4 pt-4 flex items-center justify-between">
                <TabsList className="grid w-[300px] grid-cols-3 bg-white/5">
                  <TabsTrigger
                    value="chat"
                    className="cursor-pointer data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/50 hover:bg-purple-500/10 hover:text-purple-200 transition-all"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" /> Chat
                  </TabsTrigger>
                  <TabsTrigger
                    value="search"
                    className="cursor-pointer data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300 data-[state=active]:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-200 transition-all"
                  >
                    <SearchIcon className="w-4 h-4 mr-2" /> Search
                  </TabsTrigger>
                  <TabsTrigger
                    value="code"
                    className="cursor-pointer data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300 data-[state=active]:border-green-500/50 hover:bg-green-500/10 hover:text-green-200 transition-all"
                  >
                    <CodeIcon className="w-4 h-4 mr-2" /> Code
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <ExportMenu conversation={{
                    id: 'current',
                    title: repoPath ? `Chat - ${repoPath.split(/[\\\/]/).pop()}` : 'CodeScope Chat',
                    messages: messages.map(m => ({ ...m, timestamp: m.timestamp || Date.now() })),
                    createdAt: messages[0]?.timestamp || Date.now(),
                    updatedAt: messages[messages.length - 1]?.timestamp || Date.now(),
                    repoPath
                  }} />
                  <button
                    onClick={() => {
                      if (confirm('Clear all chat messages?')) {
                        setMessages([{ role: 'assistant', content: 'Hello! I am CodeScope. Set a repository in settings and ask me anything about your code.', timestamp: Date.now() }])
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-red-500/20 transition-all cursor-pointer group"
                    title="Clear Chat"
                  >
                    <Trash2 className="h-5 w-5 text-white/70 group-hover:text-red-400 transition-colors" />
                  </button>
                </div>
              </div>

              <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 data-[state=active]:flex mt-0">
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, index) => (
                      <ChatMessage key={index} role={msg.role} content={msg.content} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-4 border-t border-white/10 space-y-3">
                    {/* Arama Modu Seçici */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs text-white/40 mr-2">Mode:</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSearchMode('rag')}
                          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${searchMode === 'rag'
                            ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30 shadow-lg shadow-purple-500/10'
                            : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70 hover:border-white/20'
                            }`}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          RAG
                        </button>

                        <button
                          type="button"
                          onClick={() => setSearchMode('regex')}
                          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${searchMode === 'regex'
                            ? 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-500/10'
                            : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70 hover:border-white/20'
                            }`}
                        >
                          <CodeIcon className="h-3.5 w-3.5" />
                          Regex
                        </button>

                        <button
                          type="button"
                          onClick={() => setSearchMode('fuzzy')}
                          className={`px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer ${searchMode === 'fuzzy'
                            ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-300 border border-orange-500/30 shadow-lg shadow-orange-500/10'
                            : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70 hover:border-white/20'
                            }`}
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Fuzzy
                        </button>
                      </div>
                    </div>

                    {/* Mesaj/Sorgu Giriş Alanı */}
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
                        placeholder={
                          searchMode === 'rag'
                            ? "Ask a question about your codebase..."
                            : searchMode === 'regex'
                              ? "Enter regex pattern (e.g., class.*Manager)..."
                              : "Search with typo tolerance (e.g., authentiction)..."
                        }
                        disabled={isGenerating || isSearching}
                        className="flex-1 bg-[#0f0f0f] border-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/20"
                      />
                      <Button
                        type="submit"
                        disabled={isGenerating || isSearching || !input.trim()}
                        className="bg-white text-black hover:bg-white/90"
                      >
                        {isSearching ? (
                          <div className="h-4 w-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </form>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="search" className="flex-1 min-h-0 data-[state=active]:flex flex-col mt-0">
                <div className="flex-1 overflow-hidden flex flex-col">
                  <SearchResults
                    results={searchResults}
                    total={totalMatches}
                    query={searchQuery}
                    searchType={searchMode === 'regex' ? 'regex' : 'fuzzy'}
                    onFileClick={handleFileSelect}
                  />
                </div>
              </TabsContent>

              <TabsContent value="code" className="flex-1 min-h-0 data-[state=active]:flex flex-col mt-0">
                <div className="flex-1 overflow-hidden flex flex-col">
                  {selectedFile ? (
                    <>
                      <div className="w-[280px] border-r border-white/10 flex-shrink-0 bg-black/40 overflow-hidden flex flex-col">
                        <span className="text-sm font-mono truncate">{selectedFile}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-500/20 hover:text-red-400 transition-colors" onClick={() => setActiveTab("chat")}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
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


