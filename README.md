# fis-ai-kit-cli

Public CLI for **FIS AI Kit** — installs the FIS hybrid SDLC kit (BA/SA/DEV/QA artifact-as-contract workflow with Three Amigos consultation gates) into your project.

The kit content (skills, agents, templates, hooks) lives in a **separate private repo** and is fetched on demand via git clone.

## Quick start

```bash
# Zero config — works in any project:
npx fis-ai-kit-cli setup --kit-url https://gitlab.fis.vn/fis-ai-first/fis-ai-kit.git
```

That's it. The wizard scaffolds `artifacts/`, fetches the private kit content (with `FIS_KIT_TOKEN` env if HTTPS), runs doctor.

## Prerequisites

- Node.js ≥ 18
- Git
- Access to private kit repo (set `FIS_KIT_TOKEN` env for HTTPS clone, or use SSH URL)

## Commands

| Command | Purpose |
|---|---|
| `setup` | Interactive wizard: configure source, init + install |
| `init` | Scaffold project artifact directories |
| `install --from <git-url>` | Fetch + install kit content from private repo |
| `update` | Re-fetch from recorded source |
| `skills [query]` | List/search installed skills |
| `doctor` | Health check installed kit |
| `reconcile [--fix]` | Detect SDLC artifact status drift |

## Manual install (no wizard)

```bash
export FIS_KIT_TOKEN=glpat_xxx   # GitLab PAT with read_repository scope
mkdir my-project && cd my-project
npx fis-ai-kit-cli init
npx fis-ai-kit-cli install --from https://gitlab.fis.vn/fis-ai-first/fis-ai-kit.git
npx fis-ai-kit-cli doctor
# Expect: 51 pass / 0 warnings / 0 failures
```

## Auth modes for private kit

- **HTTPS**: set `FIS_KIT_TOKEN` env (GitLab PAT with `read_repository`, or GitHub PAT with `repo` scope). CLI injects as `oauth2:<token>@`.
- **SSH**: use SSH key on disk (no token), pass `git@host:path.git` as URL.

## License

MIT — covers the CLI binary only. Kit content distributed via private repos retains its own license per repository.
