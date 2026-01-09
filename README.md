# 🔭 CodeScope

> **Your Privacy-First, Fully Local AI Coding Assistant.**
> Chat with your codebase using local LLMs (Ollama) and ChromaDB. No data ever leaves your machine.

---

## 📖 Overview

**CodeScope** is a powerful Retrieval-Augmented Generation (RAG) tool designed for developers who want to leverage AI for code understanding without compromising privacy. By running everything locally—from the Large Language Model (LLM) to the Vector Database—CodeScope ensures your proprietary code stays secure.

It indexes your local repositories, embeds the code using state-of-the-art sentence transformers, and allows you to chat naturally with your project. Ask questions like *"How does the authentication flow work?"* or *"Where is the user validation logic?"* and get context-aware answers instantly.

## ✨ Features

- **🔒 100% Private & Local**: Zero external API calls. Your code is processed and stored entirely on your device.
- **⚡ Real-Time Streaming**: Get instant, streaming responses from your local LLM (powered by Ollama).
- **🧠 Smart Context Retrieval**: Uses `ChromaDB` and `all-MiniLM-L6-v2` embeddings to find the most relevant code chunks for your query.
- **📂 One-Click Ingestion**: detailed support for clearing old indexes and re-ingesting new repositories seamlessly.
- **🎨 Modern Developer UI**: A sleek, responsive interface built with **Next.js 14**, **React 19**, and **Tailwind CSS**.
- **🛠 Multi-Language Support**: Out-of-the-box support for Python, JavaScript, TypeScript, Java, Go, C++, Rust, and many more.

---

## 🛠 Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Library**: React 19
- **Styling**: Tailwind CSS, Shadcn/UI
- **Icons**: Lucide React
- **Syntax Highlighting**: React Syntax Highlighter

### Backend
- **Framework**: FastAPI (Python)
- **Server**: Uvicorn
- **AI Orchestration**: LangChain
- **Vector Database**: ChromaDB (Persistent local storage)
- **Embeddings**: SentenceTransformers (`all-MiniLM-L6-v2`)
- **LLM Provider**: Ollama (Llama 3, Mistral, etc.)

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

## ⚙️ Configuration

### Supported File Extensions
CodeScope automatically indexes the following file types:
`.py`, `.js`, `.ts`, `.tsx`, `.jsx`, `.md`, `.txt`, `.java`, `.go`, `.cpp`, `.c`, `.h`, `.cs`, `.php`, `.rb`, `.rs`, `.swift`, `.kt`

### Changing the LLM Model
By default, CodeScope uses `llama3`. To use a different model (e.g., `mistral` or `codellama`):

1.  Pull the model in Ollama: `ollama pull mistral`
2.  Open `backend/app/core/config.py`.
3.  Update the `OLLAMA_MODEL` variable:
    ```python
    OLLAMA_MODEL: str = "mistral"
    ```
4.  Restart the backend server.

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