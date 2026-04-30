# @hiro-pna/fis-ai-kit-cli

Public CLI binary for **FIS AI Kit** — installs the FIS hybrid SDLC kit (BA/SA/DEV/QA artifact-as-contract workflow with Three Amigos consultation gates) into your project.

The kit content (skills, agents, templates, hooks) lives in a **separate private repo** and is fetched on demand via git clone.

## Install

```bash
# Configure GitHub Packages registry once per developer:
echo "@hiro-pna:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=\${GITHUB_TOKEN}" >> ~/.npmrc
export GITHUB_TOKEN=ghp_xxx   # PAT with read:packages scope

# Now in any project:
npx @hiro-pna/fis-ai-kit-cli --help
```

## Usage

```bash
# Interactive setup (recommended first run):
npx @hiro-pna/fis-ai-kit-cli setup

# Manual:
npx @hiro-pna/fis-ai-kit-cli init
npx @hiro-pna/fis-ai-kit-cli install --from <git-url> --ref main
npx @hiro-pna/fis-ai-kit-cli doctor
```

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

## Auth for private kit content

CLI clones private kit content via git. Two auth modes:
- **HTTPS**: set `FIS_KIT_TOKEN` env (GitLab PAT with `read_repository`, or GitHub PAT with `repo` scope)
- **SSH**: use SSH key on disk (no token), pass `git@host:path.git` as URL

## License

MIT — covers the CLI binary only. Kit content distributed separately retains its own license.
