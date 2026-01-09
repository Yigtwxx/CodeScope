# 🔭 CodeScope

> **Your Privacy-First, Fully Local AI Coding Assistant.**
> Chat with your codebase using local LLMs (Ollama) and ChromaDB. No data ever leaves your machine.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Ollama](https://img.shields.io/badge/Ollama-Local%20LLM-orange)

---

## 📖 Project Vision

In an era where proprietary codebases are the most valuable assets of a company, uploading code to cloud-based LLMs poses a significant security risk. **CodeScope** was born from a simple necessity: **High-quality code assistance without the privacy trade-off.**

Unlike browser-based tools or plugins that send your snippets to remote servers, CodeScope runs the entire RAG (Retrieval-Augmented Generation) pipeline locally on your machine. From the database that stores your code's mathematical representations to the LLM that generates the answer—**you own the entire stack.**

---

## 🏗️ Architecture & Technology Stack

We carefully selected every component of CodeScope to balance performance, developer experience, and the "local-first" philosophy. Here is a deep dive into our choices:

### 🧠 The Backend Core (Python)

#### **FastAPI** (The API Framework)
**Why we chose it:** Speed and Concurrency.
FastAPI is one of the fastest Python frameworks available, built on top of Starlette and Pydantic.
- **Async by Design:** CodeScope relies heavily on streaming responses (sending chunks of text as the AI generates them). FastAPI's native `async/await` support is crucial for managing these websocket-like streams without blocking the server.
- **Type Safety:** It uses Python type hints for data validation, ensuring that data flowing between the frontend and the LLM is always structured correctly.

#### **LangChain** (The Orchestrator)
**Why we chose it:** Modular RAG Pipelines.
LangChain provides the abstraction layer that connects our data sources to the LLM. It handles the complex logic of:
- **Prompt Engineering:** Structuring the context and question in a way the LLM understands best.
- **Document Loading:** Unified interfaces for reading `.py`, `.ts`, `.md`, and other files.
- **Chain Management:** Connecting the "Retrieval" step with the "Generation" step seamlessly.

#### **ChromaDB** (The Vector Database)
**Why we chose it:** Embedded & Serverless.
Most vector databases (Pinecone, Milvus, Weaviate) require complex Docker setups or cloud subscriptions.
- **Fully Embedded:** Chroma runs directly inside our Python process. It saves data to a simple local folder (`/chroma_db`).
- **Ease of Use:** It automates the tokenization and embedding process, making it invisible to the user.
- **Zero Overhead:** No background services or daemon processes are required when the app isn't running.

#### **Ollama** (The LLM Runtime)
**Why we chose it:** The "Docker" for LLMs.
Running raw model weights (GGUF, PyTorch) is difficult and hardware-dependent. Ollama abstracts the GPU/CPU offloading, quantization, and model management. It provides a stable REST API that our backend consumes, allowing users to switch between `Llama 3`, `Mistral`, or `CodeLlama` with a single command.

---

### 🎨 The Frontend Experience (TypeScript)

#### **Next.js 14** (The Framework)
**Why we chose it:** The standard for React applications.
We utilize the **App Router** for a robust file-system based routing mechanism. Next.js handles the API proxying and static asset serving efficiently, ensuring the UI loads instantly.

#### **React 19** (The Library)
**Why we chose it:** Cutting-edge User Interfaces.
We are early adopters of React 19 to leverage the latest improvements in state management and DOM rendering performance.

#### **Tailwind CSS & Shadcn/UI** (The Design System)
**Why we chose it:** Aesthetic Minimalism & Customizability.
- **Shadcn/UI** gives us accessible, high-quality components (Dialogs, Tabs, Inputs) that live inside our codebase, not as a black-box library.
- **Tailwind** allows us to rapidly style these components to create a "Dark Mode" native application that feels like a professional IDE.

---

## ⚙️ How It Works (Under the Hood)

### 1. Ingestion Pipeline
When you click **"Ingest Repository"**, a complex workflow triggers:
1.  **File Crawling**: The system walks through your directory, respecting `.gitignore` files to skip junk data.
2.  **Validation**: A filter layer checks extensions (e.g., `user_controller.rb`, `App.tsx`) to ensure only text-based code files are processed.
3.  **Chunking**: Large files are split into smaller segments (e.g., 1000 characters) with a 200-character "overlap". This ensures that context isn't lost at the cut points (e.g., a function definition isn't separated from its body).
4.  **Embedding**: These chunks are passed to `sentence-transformers/all-MiniLM-L6-v2`. This model converts text into a 384-dimensional vector (a list of numbers representing meaning).
5.  **Storage**: These vectors are saved into ChromaDB.

### 2. Retrieval & Generation (RAG)
When you ask **"How does login work?"**:
1.  **Query Embedding**: Your question is converted into the same 384-dimensional vector format.
2.  **Similarity Search**: ChromaDB calculates the "Cosine Similarity" between your question's vector and the thousands of code vectors. It finds the top 5 most similar chunks of code.
3.  **Context Injection**: These 5 chunks are pasted into a hidden "System Prompt" sent to the LLM:
    > "You are a helpful coding assistant. Use the following code snippets to answer the user's question..."
4.  **Streaming**: The LLM (Ollama) generates the answer token by token, which flows through FastAPI to your UI in real-time.

---

## 🚀 Prerequisites

Before you begin, ensure you have the following installed:

1.  **Python 3.10+**: [Download Python](https://www.python.org/downloads/)
2.  **Node.js 18+**: [Download Node.js](https://nodejs.org/)
3.  **Ollama**: [Download Ollama](https://ollama.com/)
    - After installing, pull the default model (Llama 3):
      ```bash
      ollama pull llama3
      ```

---

## 💿 Installation & Setup

### Option A: Quick Start (Windows Only) ⚡

If you are on Windows, you can use the included batch script to start everything at once.

1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/CodeScope.git
    cd CodeScope
    ```
2.  **First Time Setup**: You must install dependencies manually once.
    - **Backend**:
      ```bash
      cd backend
      python -m venv .venv
      .venv\Scripts\activate
      pip install -r requirements.txt
      cd ..
      ```
    - **Frontend**:
      ```bash
      cd frontend
      npm install
      cd ..
      ```
3.  **Run**: Double-click `run_app.bat` or run it from the command line. This will start both the backend and frontend.

### Option B: Manual Setup (All OS) 🛠

#### 1. Backend Setup
The backend handles code ingestion and the RAG pipeline.

```bash
cd backend

# Create and activate virtual environment
# Windows:
python -m venv .venv
.venv\Scripts\activate
# Mac/Linux:
# python3 -m venv .venv
# source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Start the API Server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
*The backend runs on `http://localhost:8000`.*

#### 2. Frontend Setup
The frontend provides the chat interface.

Open a new terminal window:
```bash
cd frontend

# Install Node dependencies
npm install

# Start the Development Server
npm run dev
```
*The frontend runs on `http://localhost:3000`.*

---

## 🕹 Usage Guide

1.  **Start the App**: Ensure Ollama, Backend, and Frontend are all running.
2.  **Open URL**: Go to `http://localhost:3000` in your browser.
3.  **Select Repository**:
    - Click the **Settings (Gear Icon)** in the top right corner.
    - Enter the **Absolute Path** to the local folder you want to chat with.
      - *Example (Windows)*: `C:\Users\Name\Projects\MyAwesomeApp`
      - *Example (Mac/Linux)*: `/Users/name/projects/my-awesome-app`
    - Click **Ingest Repository**.
4.  **Wait for Ingestion**: The system will:
    - 🧹 Clear any previous index from the database.
    - 📄 Scan compatible files (ignoring `.git`, `node_modules`, etc.).
    - 🧩 Chunk code into manageable pieces (1000 chars w/ overlap).
    - 💾 Store embeddings in local ChromaDB.
5.  **Start Chatting**: Close the modal and ask questions about your code!

---

## 📂 Project Structure

```
CodeScope/
├── backend/                 # FastAPI Application
│   ├── app/
│   │   ├── api/             # API Routes
│   │   ├── core/            # Config & Settings
│   │   ├── db/              # Database Connection (ChromaDB)
│   │   ├── services/        # Business Logic (Ingestion, RAG)
│   │   └── main.py          # Entry Point
│   ├── chroma_db/           # Local Vector Database Storage
│   └── requirements.txt     # Python Dependencies
├── frontend/                # Next.js Application
│   ├── app/                 # App Router Pages & Layouts
│   ├── components/          # Reusable UI Components
│   └── package.json         # Node Dependencies
└── run_app.bat              # Windows Startup Script
```

---

## 🤝 Contributing

Contributions are welcome! If you'd like to improve CodeScope, feel free to fork the repository and submit a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.