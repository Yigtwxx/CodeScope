# 🔭 CodeScope

CodeScope is a privacy-first, fully local RAG (Retrieval-Augmented Generation) application that allows you to "chat" with your codebase. It uses local LLMs via Ollama and ChromaDB for vector storage, ensuring no data leaves your machine.

## Features
- **Privacy First:** 100% local execution. No cloud APIs.
- **RAG Architecture:** Chat with your code using vector embeddings.
- **Modern UI:** Built with Next.js, Tailwind CSS, and Shadcn UI.
- **Streaming Responses:** Real-time AI generation.

## Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **Ollama:** [Download Ollama](https://ollama.com/) and pull a model (e.g., `ollama pull llama3`).

## Setup & Running

### 1. Start Ollama
Ensure Ollama is running in the background.
```bash
ollama serve
```

### 2. Backend Setup
Exposed on `http://localhost:8000`.

```bash
# From the project root
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

*Note: The first run might take a moment to download the embedding model.*

### 3. Frontend Setup
Exposed on `http://localhost:3000`.

```bash
# From the project root
cd frontend

# Install dependencies (if not already done)
npm install

# Run the development server
npm run dev
```

## Usage
1. Open `http://localhost:3000` in your browser.
2. Click the **Settings** icon (gear) in the top right.
3. Enter the absolute path to a local repository you want to chat with (e.g., `C:/Users/Name/Projects/MyRepo`).
4. Click **Ingest Repository**. This will filter code files, chunk them, embed them, and store them in ChromaDB.
5. Once complete, type your question in the chat bar!
---
## Tech Stack
- **Backend:** Python, FastAPI, LangChain, ChromaDB, HuggingFace Embeddings.
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, Shadcn UI.
- **AI:** Ollama (Llama 3/Mistral).