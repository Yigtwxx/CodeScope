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
    retriever = vector_store.as_retriever(search_kwargs={"k": 5})
    
    llm = get_llm()

    # Prompt template for RAG responses
    template = """You are CodeScope, an intelligent coding assistant.
Use the following codebase context to answer the user's question.
If the context doesn't contain the answer, say so clearly, but you may provide general knowledge if helpful.
Always use Markdown formatting (code blocks, bold, lists).

IMPORTANT: Detect the language of the user's question and respond in the SAME language.
- If the question is in Turkish, respond in Turkish.
- If the question is in English, respond in English.
- Match the language naturally and fluently.

Context:
{context}

Question:
{question}

Answer:
"""
    
    prompt = PromptTemplate(
        template=template,
        input_variables=["context", "question"]
    )

    # Retrieve relevant documents and stream LLM response
    docs = await retriever.ainvoke(query)
    context_text = "\n\n".join([doc.page_content for doc in docs])
    
    formatted_prompt = prompt.format(context=context_text, question=query)
    
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

