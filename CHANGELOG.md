# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-28

### Changed — models

- **Default embedding model is now `intfloat/multilingual-e5-base`** instead of
  `all-MiniLM-L6-v2`. Measured on this repository across 28 labelled queries,
  MRR goes from 0.638 to 0.743; the previous default missed three of the eight
  non-English queries entirely. Code-specialised encoders were benchmarked too
  and are deliberately not the default — they score no better on English and
  collapse on everything else. The numbers are in
  [docs/decisions.md](docs/decisions.md).
- **Default chat model is now `qwen3.5:9b`** instead of `llama3`, which answered
  non-English questions in English regardless of the prompt.
- Query and document prompt prefixes are configurable
  (`EMBEDDING_QUERY_PROMPT` / `EMBEDDING_DOCUMENT_PROMPT`), which
  instruction-tuned encoders such as the e5 family require.
- Switching embedding models now discards the persisted index instead of
  letting Chroma fail on a dimension mismatch several layers down. The model
  name is stamped beside the collection.

### Fixed — generation

- **Answers were truncated mid-sentence.** Ollama defaults to a 4096-token
  window regardless of the model, and a grounded prompt plus its reply ran past
  it. `OLLAMA_NUM_CTX` and `OLLAMA_NUM_PREDICT` are now set explicitly.
- **Some answers arrived completely blank.** `qwen3.5` is a hybrid reasoning
  model and streamed hundreds of tokens on a channel the interface does not
  render. Reasoning is now off by default (`OLLAMA_REASONING`).
- **The model invented file links** such as `[proje.py](file:///home/user/...)`.
  The prompt now requires citations as inline code and forbids constructing
  paths or URLs.

### Added

- **Conversation history.** Multiple chat threads, auto-titled from the first
  question, with search, rename and delete. A pre-0.3 single-thread history is
  migrated into the list on first load rather than discarded.
- **`docker compose up`** brings up Ollama, the backend and the frontend
  together. The embedding model is baked into the backend image so the first
  request does not stall on a download, and the workspace is mounted read-only.
  Every published port is overridable (`FRONTEND_PORT`, `BACKEND_PORT`,
  `OLLAMA_PORT`) for hosts already running something on 3000/8000/11434.
- **Code intelligence for Go, Rust, Java and C#**, alongside the existing
  Python, JavaScript and TypeScript support. Go structs and interfaces are
  distinguished by inspecting the node the shared `type_spec` wraps.
- **Coverage gates.** `pytest` and `vitest` both fail below a configured floor,
  and CI uploads reports to Codecov.
- [`docs/architecture.md`](docs/architecture.md) with Mermaid component and
  sequence diagrams, and [`docs/decisions.md`](docs/decisions.md) recording the
  non-obvious design choices and what each one costs.
- Screenshots in the README, and `docs/social-preview.png` (1280x640) for the
  repository's social-preview setting.

### Changed

- `page.tsx` split from a 520-line component into `useChat`, `useCodeSearch`,
  `useFileViewer` and `useConversations` hooks plus presentational components.
  The hooks are unit-tested in isolation, which was not previously possible.
- The sidebar is now a two-tab panel: conversations and the file explorer.
- A search that fails no longer switches away from the input the message
  appears next to.
- Stopping generation before the first token no longer leaves an empty
  assistant bubble behind.
- The chat no longer stops short of the newest message. Each streamed token
  restarted a smooth scroll that never settled; scrolling is instant while
  tokens arrive and smooth once generation ends.
- Opening a second file while the first is still loading cancels the first
  request, so a slow read cannot overwrite a newer selection.
- `next.config.ts` emits a standalone build for the Docker runtime stage.

### Removed

- Emoji used as interface elements: the `export.ts` role markers (which the PDF
  font could not render anyway), the `ErrorBoundary` glyph, and the `SECURITY.md`
  support table.
- Unmodified `create-next-app` assets (`vercel.svg`, `next.svg`, `file.svg`,
  `globe.svg`, `window.svg`) and the default favicon, replaced by an inline
  `app/icon.svg`.
- The `stale` workflow, which auto-closed issues on a single-maintainer project.

### Fixed

- The frontend `dev:backend` script hardcoded a Windows virtualenv path, so it
  only worked on one platform. `run_app.bat` now activates the environment
  instead.
- Export filenames replaced every non-ASCII character with an underscore, so a
  Turkish conversation title became a row of underscores. Letters and digits
  from any script are kept.
- Turkish comments in `conversation-card.tsx`, `conversation-list.tsx` and
  `ErrorBoundary.tsx`, in an otherwise English codebase.
- `tsconfig.tsbuildinfo` was not ignored.

## [0.2.0] - 2026-07-28

A correctness and quality pass across the whole project.

### Fixed

- **Hybrid search never actually fused its two signals.** Scores were keyed on
  `id(document)`, the CPython object address. ChromaDB returns freshly built
  `Document` objects per query, so a chunk found by both vector search and BM25
  landed in two separate buckets and their scores were never combined. Documents
  are now keyed by a stable content fingerprint.
- **BM25 tokenisation split on whitespace only**, so source text produced tokens
  like `authenticate(user,` that no query could match. Tokens are now extracted
  as word characters and identifiers are additionally split on `snake_case` and
  `camelCase` boundaries.
- **Source citations never rendered.** The frontend parser looked for a heading
  the backend does not emit, and its inner regular expression contained stray
  whitespace that prevented any match. Citations now use an explicit delimited
  block with a parser and tests on both sides.
- **Clicking a search result always failed.** Results carried only a repository
  relative path while the file endpoint requires an absolute one. Matches now
  return both.
- **Pressing Enter in the settings dialog reloaded the page.** The form's submit
  handler never called `preventDefault()`.
- **The code viewer rendered its filename header and close button twice.**
- **`HTTPException`s raised inside the file endpoints were caught by a bare
  `except Exception` and re-raised as 500s**, so 404 and 400 responses were lost.
- **Tailwind v4 read no theme tokens.** The project shipped a v3-style
  `tailwind.config.ts` that v4 ignores, so `bg-background`,
  `text-muted-foreground` and every other shadcn token generated no CSS. Tokens
  are now declared in an `@theme` block.
- **The font CSS variables set by `next/font` did not match the ones the theme
  read** (`--font-geist-sans` versus `--font-sans`).
- Streamed answers mutated React state in place, which could skip re-renders.
- `requirements.txt` pinned LangChain 0.3 and ChromaDB 0.6 while the project
  actually runs on LangChain 1.x and ChromaDB 1.5; a clean install did not match
  a working environment.

### Added

- Filesystem sandbox (`WORKSPACE_ROOT`): every user-supplied path is normalised
  and constrained, rejecting traversal outside the configured root.
- ReDoS protection on user-supplied regular expressions.
- Typed, `.env`-driven settings for CORS, chunking, retrieval, embeddings and
  Ollama, with `.env.example` for both services.
- Automatic embedding device selection: CUDA → MPS → CPU.
- 59 backend tests (pytest) and 27 frontend tests (vitest).
- `ruff` and `prettier` configuration, plus a typed API client on the frontend.
- Request cancellation for streaming chat and ingestion.
- Response models for every endpoint, so `/docs` documents real schemas.
- `run_app.sh` for macOS and Linux.

### Changed

- Migrated to `langchain-chroma` and `langchain-ollama`; chat now streams
  asynchronously instead of blocking the event loop.
- The embedding model and vector store are cached process-wide. They were
  previously reconstructed on every request, reloading a sentence-transformers
  model each time.
- The vector store is no longer wiped on startup; set `RESET_DB_ON_STARTUP=true`
  to restore the old behaviour.
- CORS defaults to the local frontend origins instead of `*`.
- `print` calls replaced with structured logging throughout the backend.
- Code intelligence attaches only the declarations that appear in a given chunk,
  rather than every symbol in the file.
- Repository crawling prunes ignored directories during the walk and skips
  binaries and lock files.
- All comments and user-facing strings are now in English.
- CI runs lint, format, typecheck, tests and build for both services, and fails
  on error. `next.config.ts` no longer suppresses ESLint and TypeScript errors.

### Removed

- Committed lint artefacts (`lint.json`, `lint_results.json`, `parse_lint.py`).
- `app/declarations.d.ts`, which overrode real types with `any`.
- Unused UI components and their dependencies (dialog, label, textarea, card,
  circuit-board, `tailwindcss-animate`, `html2canvas`).
- The `pre-commit` workflow, whose configuration file had already been deleted.

## [0.1.0] - 2026-01-11

### Added

- Initial release of CodeScope
- FastAPI backend with RAG pipeline
- Next.js frontend with React 19
- ChromaDB vector database integration
- Ollama LLM support
- File explorer with syntax highlighting
- Real-time chat interface
- Repository ingestion with progress tracking
- Dark mode UI
- Multi-language code support

[0.3.0]: https://github.com/Yigtwxx/CodeScope/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Yigtwxx/CodeScope/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Yigtwxx/CodeScope/releases/tag/v0.1.0
