from typing import AsyncIterable
from langchain_community.llms import Ollama
from langchain_core.prompts import PromptTemplate
from app.db.chroma import get_vector_store
from app.core.config import settings

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
    retriever = vector_store.as_retriever(search_kwargs={"k": 8})
    
    llm = get_llm()

    # Prompt template for RAG responses
    template = """You are CodeScope, an expert coding assistant with deep knowledge of software development.

**Your Mission:**
Provide comprehensive, detailed, and professional responses using the codebase context below.

**Response Guidelines:**
1. **Language Matching**: CRITICAL - Detect the user's question language and respond in the EXACT SAME language
   - Turkish question → Detailed Turkish response  
   - English question → Detailed English response
   - Use natural, fluent, professional language

2. **Response Quality:**
   - Give thorough, well-structured explanations
   - Include relevant code examples when helpful
   - Explain the "why" and "how", not just the "what"
   - Add practical usage examples if applicable
   - If files are referenced, explain their purpose and relationships

3. **Formatting:**
   - Use clear headings and sections
   - Use code blocks with proper language tags (```python, ```javascript, etc.)
   - Use bullet points for lists
   - Use **bold** for important terms
   - Use tables when comparing multiple items

4. **Context Handling:**
   - If context fully answers the question: Give a detailed, comprehensive response
   - If context partially answers: Use context + your knowledge, clearly distinguishing both
   - If context doesn't answer: Clearly state this, then provide helpful general guidance if relevant

5. **Turkish Responses:** 
   - Use professional, technical Turkish
   - Maintain clarity and precision
   - Avoid overly casual language
   - Provide detailed explanations, not brief summaries

**Codebase Context:**
{context}

**User Question:**
{question}

**Your Detailed Response:**
"""
    
    prompt = PromptTemplate(
        template=template,
        input_variables=["context", "question"]
    )

    # Retrieve relevant documents with similarity scores
    print("\n" + "─"*60)
    print("🤖 RAG QUERY")
    print("─"*60)
    print(f"💬 Query: {query}")
    print(f"🔍 Searching ChromaDB...")
    
    # Use simple similarity search (ChromaDB distance scores can be negative)
    # So we just take top-k without threshold filtering
    docs = vector_store.similarity_search(query, k=8)
    
    print(f"📊 Retrieved: {len(docs)} chunks")
    
    # Try to get scores for debugging (may not always work)
    try:
        docs_with_scores = vector_store.similarity_search_with_relevance_scores(query, k=8)
        if docs_with_scores:
            top_scores = [f"{score:.3f}" for _, score in docs_with_scores[:5]]
            print(f"📈 Scores: {', '.join(top_scores)}")
    except Exception as e:
        print(f"⚠️  Score calculation failed: {e}")
    
    print("─"*60)
    
    # Handle case where no chunks found
    if not docs:
        print("❌ WARNING: No chunks found in ChromaDB!")
        print("💡 Tip: Make sure repository was ingested successfully")
        yield "⚠️ **ChromaDB boş! Lütfen Settings'den repo'yu açın (Open Repository).**\n\n"
        yield "Genel bilgimle cevaplıyorum:\n\n"
        # Continue with empty context
    else:
        print(f"📚 Using {len(docs)} code chunks as context")
    
    # Generate source citations (ChatGPT-style)
    if docs:
        yield "\n**📚 Kullanılan Kaynaklar:**\n\n"
        
        unique_sources = {}
        for idx, doc in enumerate(docs, 1):
            filename = doc.metadata.get('filename', 'Unknown')
            rel_path = doc.metadata.get('relative_path', filename)
            language = doc.metadata.get('language', 'unknown')
            
            # Deduplicate by filename
            if filename not in unique_sources:
                unique_sources[filename] = {
                    'index': idx,
                    'path': rel_path,
                    'language': language
                }
                yield f"**[{idx}]** `{filename}` "
                yield f"*({language})* - {rel_path}\n\n"
        
        yield "---\n\n"
    
    # Prepare context for LLM
    context_text = "\n\n".join([doc.page_content for doc in docs])
    
    formatted_prompt = prompt.format(context=context_text, question=query)
    
    # Stream the response from Ollama
    
    # Stream the response from Ollama
    try:
        async for chunk in llm.astream(formatted_prompt):
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

