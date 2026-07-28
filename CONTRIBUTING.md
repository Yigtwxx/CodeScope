# Contributing to CodeScope

Thanks for taking the time to contribute.

## Getting set up

Follow the [Setup section of the README](README.md#setup), then install the
development dependencies:

```bash
pip install -r backend/requirements-dev.txt
cd frontend && npm install
```

## Before you open a pull request

Every one of these must pass. CI runs the same commands and blocks on failure.

```bash
# Backend
cd backend
ruff check .
ruff format --check .
pytest -q

# Frontend
cd frontend
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

Both suites enforce a coverage floor (`fail_under` in `backend/pyproject.toml`,
`thresholds` in `frontend/vitest.config.ts`). If a change lowers coverage below
it, add tests rather than lowering the threshold.

## Conventions

**Language.** All code, identifiers, comments and user-facing strings are in
English.

**Python.** Type annotations are required. `ruff` handles formatting and import
order; do not hand-format. Prefer `X | None` over `Optional[X]`.

**TypeScript.** `strict` mode is on and `any` is not permitted — use `unknown`
and narrow. Prefer `undefined` over `null`. `prettier` handles formatting.

**Hardware.** Any code that selects a compute device must go through
`app.core.device.resolve_device()`, which resolves CUDA → MPS → CPU. Never
hardcode `"cuda"`.

**Secrets.** No credentials, tokens or API keys in source or in commits. Read
configuration from the environment via `app.core.config.settings`.

## Tests

Add tests for behaviour changes. Bug fixes should come with a regression test
that fails without the fix — see `backend/tests/test_hybrid_search.py` for the
pattern.

- Backend tests live in `backend/tests/` and are named `test_*.py`. Shared
  fixtures belong in `backend/tests/conftest.py`, not in individual test files.
- Frontend tests live in `frontend/tests/` and are named `*.test.ts(x)`.

Tests must not load models or contact Ollama. Stub those boundaries; the existing
fixtures show how.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

<optional body explaining why the change was made>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Keep the subject under
72 characters and use the imperative mood ("add", not "added").

## Reporting bugs

Please include the CodeScope version, your OS, Python and Node versions, the
output of `GET /health`, and the steps to reproduce.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a
public issue.
