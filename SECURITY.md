# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.3.x   | Yes       |
| < 0.3   | No        |

## Threat model

CodeScope is a **local developer tool**. It binds to `localhost`, has no
authentication, and is not designed to be exposed to a network or shared between
users. Do not run it on a host reachable by anyone you would not give a shell to.

Two capabilities deserve particular care:

- **Filesystem reads.** The API reads files and directories from paths supplied
  by the client. Every path is normalised and constrained to `WORKSPACE_ROOT`
  (your home directory by default). Widening that setting widens what the API can
  read — set it to the narrowest directory that contains your repositories.
- **User-supplied regular expressions.** Search patterns are compiled from client
  input. Patterns containing nested quantifiers such as `(a+)+` are rejected, and
  pattern length is capped, to limit catastrophic backtracking.

CORS defaults to the local frontend origins only. Do not set `ALLOWED_ORIGINS`
to `*`.

## What stays local

CodeScope makes no outbound requests to third-party services. Source code,
embeddings and conversations never leave the machine. Traffic is limited to the
browser, the backend on port 8000, and Ollama on port 11434.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue:

- Email: **yigiterdogan023@gmail.com**
- Or open a [private security advisory](https://github.com/Yigtwxx/CodeScope/security/advisories/new)

Please include the affected version, reproduction steps, and the impact you
observed.

**What to expect**

- Acknowledgement within 5 working days.
- An assessment and a plan within 14 days of acknowledgement.
- Credit in the release notes when a report leads to a fix, unless you prefer
  otherwise.

Reports about running CodeScope in a deliberately exposed configuration
(bound to a public interface, `ALLOWED_ORIGINS=*`, or `WORKSPACE_ROOT` set to a
filesystem root) fall outside the threat model described above.
