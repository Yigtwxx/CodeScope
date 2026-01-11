from typing import AsyncIterable
from langchain_community.llms import Ollama
from langchain_core.prompts import PromptTemplate
from app.db.chroma import get_vector_store
from app.core.config import settings
from app.services.hybrid_search import hybrid_search

def get_llm():
    """Ollama LLM örneğini döndürür."""
    return Ollama(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL
    )

async def chat_stream(query: str) -> AsyncIterable[str]:
    """
    RAG (Retrieval-Augmented Generation) kullanarak sorgu için canlı (streaming) bir cevap üretir.
    """
    vector_store = get_vector_store()
    llm = get_llm()

    # RAG cevapları için şablon (Prompt Template)
    # Modelin aynı dilde cevap vermesini zorlayan kurallar içerir
    template = """You are CodeScope, an intelligent bilingual coding assistant.

Use the following codebase context to answer the user's question.

**CRITICAL LANGUAGE RULE - READ CAREFULLY:**
1. DETECT the question language FIRST
2. Use ONLY that language for the ENTIRE response
3. If question is in Turkish → ENTIRE answer in Turkish (no English mixing!)
4. If question is in English → ENTIRE answer in English (no Turkish mixing!)
5. NEVER switch languages mid-response
6. ALL technical terms, code explanations, examples MUST be in the detected language

**Examples:**
- Turkish question: "Bu kod ne yapar?" → Answer fully in Turkish
- English question: "What does this code do?" → Answer fully in English

**Response Structure:**
- Start with a summary in detected language
- Provide detailed explanation in detected language
- Add code examples with comments in detected language
- Use proper formatting (headings, code blocks, lists)

Context from codebase:
{context}

Question:
{question}

Your detailed answer (in the SAME language as question, NO language mixing):
"""
    
    prompt = PromptTemplate(
        template=template,
        input_variables=["context", "question"]
    )

    # Öncelikle ChromaDB'de herhangi bir belge olup olmadığını kontrol et
    try:
        all_docs = vector_store.get()
        total_docs = len(all_docs.get('ids', []))
        
        if total_docs == 0:
            print("⚠️  WARNING: ChromaDB is empty! No repository loaded.")
            print("─"*60 + "\n")
            yield "⚠️ **Henüz bir repository açılmadı!**\n\n"
            yield "📍 **Lütfen şu adımları takip edin:**\n\n"
            yield "1. Sağ üstteki **⚙️ Settings** butonuna tıklayın\n"
            yield "2. **'Open Repository'** butonuna tıklayın\n"
            yield "3. Analiz etmek istediğiniz kod klasörünü seçin\n"
            yield "4. Backend terminal'de **'🎉 INGESTION COMPLETE!'** mesajını bekleyin\n"
            yield "5. Tamamlandıktan sonra sorularınızı sorun! 🚀\n"
            return
        
        print(f"✓ ChromaDB ready: {total_docs} chunks available")
    except Exception as e:
        print(f"❌ ERROR checking ChromaDB: {e}")
        print("─"*60 + "\n")
        yield "❌ **Veritabanı Hatası!**\n\n"
        yield "Lütfen Settings'den repository açmayı deneyin.\n"
        return

    # İlgili belgeleri (ilk 8 parça) hibrit arama ile getir
    try:
        # Önce hibrit aramayı dene (anlamsal + BM25)
        try:
            docs = hybrid_search(query, vector_store, k=8)
            print(f"📊 Hybrid Search Retrieved: {len(docs)} chunks")
        except Exception as hybrid_err:
            # Hibrit başarısız olursa sadece anlamsal aramaya dön
            print(f"⚠️  Hybrid search failed, using semantic-only: {hybrid_err}")
            docs = vector_store.similarity_search(query, k=8)
            print(f"📊 Semantic Search Retrieved: {len(docs)} chunks")
        
        if len(docs) == 0:
            print("⚠️  WARNING: No relevant chunks found!")
            print("─"*60 + "\n")
            yield "⚠️ **Bu sorguyla ilgili sonuç bulunamadı!**\n\n"
            yield "Farklı bir soru sormayı deneyin veya repository'nizin doğru yüklendiğinden emin olun.\n"
            return
            
        print(f"📚 Using {len(docs)} code chunks as context")
        print("─"*60 + "\n")
        
        # Cevabı üretmeden önce kullanılan kaynak dosyaları göster
        yield "\n📚 **Araştırılan Dosyalar:**\n\n"
        
        unique_sources = {}
        for doc in docs:
            filename = doc.metadata.get('filename', 'Unknown')
            rel_path = doc.metadata.get('relative_path', filename)
            language = doc.metadata.get('language', 'unknown')
            
            if rel_path not in unique_sources:
                unique_sources[rel_path] = {
                    'filename': filename,
                    'language': language,
                    'path': rel_path
                }
        
        for idx, (path, info) in enumerate(unique_sources.items(), 1):
            yield f"{idx}. 📄 `{info['filename']}` ({info['language']})\n"
            yield f"   └─ {path}\n"
        
        yield "\n💭 **Cevap hazırlanıyor...**\n\n"
        
    except Exception as e:
        print(f"❌ ERROR during retrieval: {e}")
        print("─"*60 + "\n")
        yield f"❌ **Arama Hatası:** {str(e)}\n\nLütfen Settings'den repo'yu tekrar açın."
        return
    
    # Getirilen belgelerden içeriği hazırla
    context = "\n\n".join([doc.page_content for doc in docs])
    
    # RAG zincirini (chain) oluştur
    chain = prompt | llm
    
    # Cevabı stream (parça parça) olarak döndür
    try:
        for chunk in chain.stream({"context": context, "question": query}):
            yield chunk
    except Exception as e:
        error_msg = str(e)
        if "Cannot connect to host" in error_msg or "Connection refused" in error_msg:
            yield "🔴 **Error: Ollama is not running.**\n\n"
            yield "To use CodeScope, you need a local LLM running via Ollama.\n"
            yield "1. Download Ollama from [ollama.com](https://ollama.com).\n"
            yield "2. Install and run it.\n"
            yield f"3. Pull the model: `ollama pull {settings.OLLAMA_MODEL}`\n"
            yield "4. Restart CodeScope."
        else:
            yield f"🔴 **An error occurred:** {error_msg}"


