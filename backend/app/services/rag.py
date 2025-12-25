from typing import AsyncIterable
from langchain_community.llms import Ollama
# from langchain.chains import RetrievalQA
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

    # Custom prompt template to include context
    template = """
    You are an intelligent coding assistant named CodeScope.
    Use the following pieces of context from the codebase to answer the user's question.
    If the context doesn't contain the answer, say "I couldn't find the answer in the provided codebase context,"
    but you can still try to help based on your general knowledge if appropriate, but clarify that it's general knowledge.
    Always structure your answer with Markdown (code blocks, bold text, lists).

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

    # We use a custom chain setup for streaming
    # Ideally, we retrieve docs first, then stream the LLM generation
    
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

