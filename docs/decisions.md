# Design decisions

Short notes on the choices that were not obvious, and what each one costs.

## Hybrid retrieval instead of pure vector search

Dense embeddings are good at "how does authentication work?" and bad at
`UserRepositoryImpl`. A 384-dimensional MiniLM vector captures the *gist* of a
chunk, which is exactly the wrong property when a developer types an identifier
they already know the name of. BM25 has the opposite profile.

CodeScope runs both over the same corpus and fuses the normalised scores,
weighted 0.7 dense / 0.3 keyword (`SEMANTIC_WEIGHT` / `BM25_WEIGHT`).

**Cost.** The BM25 index has to be built over every chunk, which takes a second
or two on a large repository. It is cached and invalidated on re-ingest, keyed
by a signature of the corpus, so it is paid once rather than per query.

**Alternative considered.** A reranker model would likely beat weighted fusion,
but it is a second model to download and a second forward pass per query — a
poor trade for a tool whose selling point is that it runs on a laptop.

## Documents are keyed by content fingerprint, not object identity

The first version of the fusion step keyed scores on `id(document)`. ChromaDB
constructs fresh `Document` objects per query, so a chunk returned by *both*
searches landed in two separate buckets and its scores were never combined —
the hybrid search silently degraded to two independent result lists.

Chunks are now keyed on `sha1(page_content) + source`. Content is the thing that
identifies a chunk; the Python object holding it is an implementation detail.

## The BM25 tokenizer splits identifiers

Splitting on whitespace turns `def authenticate(user, password):` into tokens
like `authenticate(user,` — which no query ever matches. Tokens are extracted as
runs of word characters, and identifiers are additionally split on `snake_case`
and `camelCase` boundaries, so `get_user_by_id` also indexes `get`, `user`, `by`
and `id`.

**Cost.** A larger vocabulary and slightly diluted IDF weights. In practice
being able to match `getUserById` against `get_user_by_id` is worth far more.

## Context is capped at 12,000 characters

Local models have small context windows, and exceeding one does not produce a
clean error — it produces a truncated prompt and a confidently wrong answer.
Retrieved chunks are appended until the budget is spent and the rest are
dropped, whole chunks at a time so no snippet is ever cut mid-function.

**Cost.** On a question that genuinely needs ten files, the tail is lost. The
citation block still lists what was retrieved, so the omission is visible rather
than silent.

## `WORKSPACE_ROOT` is a hard boundary, not a convenience

The API reads files from paths supplied by the client — that is the entire
point of the file explorer. Without a boundary, `POST /api/files/content` with
`../../../../etc/passwd` reads whatever the server process can read.

Every path is normalised with `resolve()` (which collapses `..` *before* the
check) and rejected unless it lands inside `WORKSPACE_ROOT`, defaulting to the
user's home directory. Widening it is a deliberate act.

**Cost.** Repositories outside the root need a config change. That friction is
the feature.

## User-supplied regular expressions are validated, not just compiled

Regex search compiles a pattern from the client. `(a+)+$` against a long line is
catastrophic backtracking — one request pins a CPU core indefinitely. Patterns
are length-capped and rejected when they contain a nested quantifier.

This is a heuristic, not a proof. A bounded-time regex engine (RE2) would be the
real fix; it is a heavier dependency than this tool warrants, and the failure
mode here is a hung local process rather than a service outage.

## The vector store holds one repository at a time

Indexing replaces the previous index rather than adding to it. Multi-repository
indexing means either a collection per repository (and a repository selector
threaded through every query) or a metadata filter on every search (and careful
handling when the filter matches nothing).

Neither is hard; both add surface area for a feature that a single-user local
tool rarely needs. The limitation is stated in the README instead of being
half-implemented.

## The embedding model is multilingual, not code-specialised

The obvious choice for a code search tool is a code-specialised encoder. Measured
on this repository — 256 chunks from 37 files, 28 labelled queries, 20 English
and 8 Turkish — that turns out to be the wrong call:

| Model | Params | Dim | MRR | Recall@5 | chunks/s (RTX 4070) |
| --- | ---: | ---: | ---: | ---: | ---: |
| `Qwen/Qwen3-Embedding-0.6B` | 596M | 1024 | **0.818** | **1.00** | 39 |
| **`intfloat/multilingual-e5-base`** | 278M | 768 | 0.743 | 0.86 | 154 |
| `jinaai/jina-embeddings-v2-base-code` | 161M | 768 | 0.660 | 0.79 | 138 |
| `intfloat/multilingual-e5-small` | 118M | 384 | 0.654 | 0.86 | 304 |
| `sentence-transformers/all-MiniLM-L6-v2` | 22M | 384 | 0.638 | 0.79 | 484 |
| `nomic-ai/CodeRankEmbed` | 137M | 768 | 0.637 | 0.71 | 104 |

The two code-specialised models — CodeRankEmbed and jina-code — are trained on
English query/code pairs, and they fail outright on non-English questions: both
missed five or more of the eight Turkish queries, returning an unrelated file as
the top hit. A question about a codebase is not always asked in English, and BM25
already covers the case a code encoder is best at, matching identifiers
literally.

`multilingual-e5-base` is the default rather than the top scorer because of
memory, not quality. On an 8 GB GPU a 9B chat model already occupies ~6.6 GB;
`Qwen3-Embedding-0.6B` needs ~2.4 GB more and does not fit beside it, whereas
e5-base needs ~1.1 GB and does. Where VRAM allows, `Qwen3-Embedding-0.6B` is the
better retriever and a one-line change.

**Cost.** e5-base is roughly 3x slower to encode than the old MiniLM default and
its vectors are twice as wide, so the index is larger. It also requires the
`query: ` / `passage: ` prefixes, which is why the prompts are configurable.

## Switching embedding models invalidates the index

Chroma stores raw vectors. Vectors from two different models are neither the
same width nor comparable, and Chroma's own failure for that is a dimensionality
error thrown several layers down, which tells the user nothing.

The model name is stamped into a file beside the collection. When it no longer
matches, the persisted index is discarded with a log line naming both models and
asking for a re-index. The index is a derived cache, so rebuilding it is cheap
compared with leaving the user to debug a shape mismatch.

## The default chat model is a 9B, not the largest one that runs

`llama3` was the original default and answered a Turkish question in English no
matter what the prompt asked, which makes citations harder to trust in any
non-English session. `qwen3.5:9b` follows the language instruction and fits
entirely in 8 GB of VRAM, so it answers at GPU speed rather than spilling into
system RAM.

Bigger local models are better at explaining code — `qwen3-coder:30b` noticeably
so — but a 19 GB model on an 8 GB card runs mostly on the CPU. The default is
the one that stays fast on ordinary hardware; `OLLAMA_MODEL` changes it.

## The context window and reply length are set explicitly

Ollama gives a model a 4096-token window unless told otherwise, whatever the
model itself supports, and does not bound the reply. A grounded prompt here runs
to roughly 2,000 tokens, so the model would answer until prompt plus reply hit
exactly 4096 and then stop — mid-word, with `done_reason: length`. It looked
like the model losing its train of thought rather than a configuration default.

`OLLAMA_NUM_CTX` is now 8192 and `OLLAMA_NUM_PREDICT` 1024, which keeps the
worst case (a full 12,000-character context plus a maximum reply) comfortably
inside the window.

**Cost.** A larger window means a larger KV cache and so more VRAM. On an 8 GB
card this is the difference between a 9B model sitting entirely in VRAM and
spilling about 12% to the CPU.

## Reasoning is turned off

`qwen3.5` is a hybrid reasoning model: it can emit a chain of thought on a
separate channel before answering. LangChain surfaces that channel separately
from the message content, and the UI only renders content — so a question could
stream 900 tokens, take half a minute, and arrive completely blank.

`reasoning=False` makes the model answer directly. `OLLAMA_REASONING` can turn
it back on for anyone who wants to inspect the raw stream.

## Embedding device is resolved at runtime, never hardcoded

The same checkout runs on an Apple Silicon laptop and a Windows box with an
NVIDIA card. `resolve_device()` prefers CUDA, then MPS, then CPU, and honours an
explicit `EMBEDDING_DEVICE` override — logging a warning and falling back when
the pinned device is not actually available, rather than crashing at import
time.

## Citations are a delimited block, not prose

Asking the model to "list your sources at the end" produces a different format
every time and cannot be parsed reliably. The backend emits the sources itself,
before the answer, as delimited rows the frontend splits on. The model never
sees the block and cannot get it wrong.

**Cost.** The markers are a contract between two files in different languages.
Both sides have tests that fail if either drifts.

## The embedding model and vector store are process-wide singletons

`HuggingFaceEmbeddings` loads a sentence-transformers model — roughly 90 MB and
a second or two of startup. Constructing it per request meant every question
paid that cost. Both are now `@lru_cache`d.

**Cost.** Changing `EMBEDDING_MODEL_NAME` requires a restart. That is the right
trade for a setting nobody changes at runtime.

## Errors are streamed as readable text

By the time generation fails, the HTTP response has already started; there is no
status code left to set. Rather than dropping the connection, the backend
recognises the common failures — Ollama unreachable, model not pulled — and
streams actionable instructions into the answer body.

**Cost.** A failure reads as content rather than an error to a machine consumer.
For a browser UI driven by a human, guidance beats a broken socket.
