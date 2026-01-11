from typing import AsyncIterable
from langchain_community.llms import Ollama
from langchain_core.prompts import PromptTemplate
from app.db.chroma import get_vector_store
from app.core.config import settings
from app.services.hybrid_search import hybrid_search

def get_llm():
    return Ollama(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL
    )

async def chat_stream(query: str) -> AsyncIterable[str]:
    """
    Generates a streaming response for the given query using RAG.
    """
    vector_store = get_vector_store()
    llm = get_llm()

    # Prompt template for RAG responses
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

    # Retrieve relevant documents (top 8) using hybrid search
    try:
        # Try hybrid search first (semantic + BM25)
        try:
            docs = hybrid_search(query, vector_store, k=8)
            print(f"📊 Hybrid Search Retrieved: {len(docs)} chunks")
        except Exception as hybrid_err:
            # Fallback to semantic-only if hybrid fails
            print(f"⚠️  Hybrid search failed, using semantic-only: {hybrid_err}")
            docs = vector_store.similarity_search(query, k=8)
            print(f"📊 Semantic Search Retrieved: {len(docs)} chunks")
        
        if len(docs) == 0:
            print("⚠️  WARNING: No relevant chunks found!")
            print("─"*60 + "\n")
            yield "⚠️ **ChromaDB boş! Lütfen Settings'den repo'yu açın (Open Repository).**\n\n"
            yield "Repository açtıktan sonra:\n"
            yield "1. Backend terminal'de '🎉 INGESTION COMPLETE!' mesajını bekleyin\n"
            yield "2. Daha sonra sorularınızı sorun\n"
            return
            
        print(f"📚 Using {len(docs)} code chunks as context")
        print("─"*60 + "\n")
        
        # Show sources BEFORE generating answer (like ChatGPT/Gemini)
        yield "\n **Araştırılan Dosyalar:**\n\n"
        
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
    
    # Prepare context from retrieved documents
    context = "\n\n".join([doc.page_content for doc in docs])
    
    # Create the RAG chain
    chain = prompt | llm
    
    # Stream the response
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

