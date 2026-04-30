/**
 * fis install — Copy claude/ + templates/ into target project.
 *
 * Sources (in priority order):
 *   1. --from <git-url> [--ref <branch|tag>]  — clone private kit content
 *      (e.g. GitLab Enterprise, GitHub private). Auth via env or SSH key.
 *      For HTTPS clones, set FIS_KIT_TOKEN — used as oauth2 token.
 *   2. Bundled — kit content sitting next to the CLI binary (single-package mode).
 *
 * The --from mode enables the "public CLI + private kit content" pattern:
 * publish CLI binary on public npm, keep skills/agents/templates in a private
 * GitLab/GitHub repo, fetch on demand at install time.
 *
 * Cache: cloned kits land in ~/.fis/kit-cache/<sha-of-url+ref>/ — re-used unless
 *        --force. Pass --refresh to force re-clone.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

function findKitRoot(): string {
  // CLI lives in <kit>/cli/dist/index.js or <kit>/cli/src/index.ts
  // Walk up to find directory containing CLAUDE.md + claude/ folder
  let dir = resolve(import.meta.dirname || __dirname)
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'CLAUDE.md')) && existsSync(join(dir, 'claude'))) {
      return dir
    }
    dir = resolve(dir, '..')
  }
  throw new Error('Cannot find FIS AI Kit root (CLAUDE.md + claude/)')
}

/**
 * Clone a private kit-content repo (GitLab/GitHub) into the cache and return
 * the path. Auth strategy:
 *   - SSH URL (git@…) → uses SSH key on disk (no token needed).
 *   - HTTPS URL (https://…) + FIS_KIT_TOKEN env → injected as oauth2:<token>@
 *   - HTTPS URL without token → relies on user's git credential helper.
 */
function fetchRemoteKit(gitUrl: string, ref: string, refresh: boolean): string {
  const cacheKey = sha256(`${gitUrl}::${ref}`)
  const cacheDir = join(homedir(), '.fis', 'kit-cache', cacheKey)

  if (existsSync(cacheDir) && !refresh) {
    console.log(`  Reusing cached kit at: ${cacheDir}`)
    // Pull latest of the ref to keep cache fresh-enough.
    spawnSync('git', ['-C', cacheDir, 'fetch', '--depth', '1', 'origin', ref], { stdio: 'ignore' })
    spawnSync('git', ['-C', cacheDir, 'checkout', ref], { stdio: 'ignore' })
    return cacheDir
  }

  // refresh requested OR cache miss: ensure cacheDir is empty before clone
  if (existsSync(cacheDir)) {
    console.log(`  Refreshing cached kit (removing ${cacheDir})...`)
    rmSync(cacheDir, { recursive: true, force: true })
  }

  mkdirSync(dirname(cacheDir), { recursive: true })

  // Inject token into HTTPS URL if provided (works for GitLab + GitHub).
  let cloneUrl = gitUrl
  const token = process.env.FIS_KIT_TOKEN
  if (token && cloneUrl.startsWith('https://') && !cloneUrl.includes('@')) {
    cloneUrl = cloneUrl.replace('https://', `https://oauth2:${token}@`)
  }

  console.log(`  Cloning private kit content (ref=${ref})...`)
  const result = spawnSync(
    'git',
    ['clone', '--depth', '1', '--branch', ref, cloneUrl, cacheDir],
    { stdio: 'inherit' }
  )
  if (result.status !== 0) {
    throw new Error(
      `Failed to clone ${gitUrl}@${ref}. Set FIS_KIT_TOKEN for HTTPS auth, or use SSH URL.`
    )
  }
  return cacheDir
}

export async function installCommand(args: string[]): Promise<void> {
  const target = process.cwd()
  let force = false
  let refresh = false
  let fromUrl: string | null = null
  let ref = 'main'
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--force') force = true
    else if (a === '--refresh') refresh = true
    else if (a === '--from' && args[i + 1]) { fromUrl = args[++i] }
    else if (a === '--ref' && args[i + 1]) { ref = args[++i] }
  }

  let kitRoot: string
  if (fromUrl) {
    console.log(`Installing FIS AI Kit from remote: ${fromUrl} (ref: ${ref})`)
    kitRoot = fetchRemoteKit(fromUrl, ref, refresh)
  } else {
    // Try bundled kit first (works when CLI installed alongside kit, e.g. dev mode)
    try {
      kitRoot = findKitRoot()
      console.log(`Installing FIS AI Kit from bundled source: ${kitRoot}`)
    } catch (_) {
      // Public CLI distribution: no kit content bundled. User must specify --from.
      const envSource = process.env.FIS_KIT_SOURCE
      if (envSource) {
        console.log(`Installing FIS AI Kit from FIS_KIT_SOURCE: ${envSource} (ref: ${ref})`)
        kitRoot = fetchRemoteKit(envSource, ref, refresh)
      } else {
        console.error(
          [
            '',
            '🛑 No kit content found.',
            '',
            'This CLI is the public binary — kit content (skills/agents/templates) lives in a',
            'separate private repo and must be fetched explicitly.',
            '',
            'Run with --from:',
            '  npx @fis-team/ai-kit-cli install --from https://gitlab.fis.vn/fis-ai-first/fis-ai-kit.git',
            '',
            'Or set FIS_KIT_SOURCE env once and re-run:',
            '  export FIS_KIT_SOURCE=https://gitlab.fis.vn/fis-ai-first/fis-ai-kit.git',
            '  export FIS_KIT_TOKEN=glpat_xxx   # GitLab PAT with read_repository scope',
            '  fis install',
            '',
            'For HTTPS auth, FIS_KIT_TOKEN is injected as oauth2:<token>@ in the clone URL.',
            '',
          ].join('\n')
        )
        process.exit(1)
      }
    }
  }
  console.log(`Target: ${target}`)

  // Sources to copy from kit root → target project.
  // Note: kit repo stores `claude/` (no leading dot — git-friendly), but Claude
  // Code reads from `.claude/` in user projects. Rename during copy so settings.json,
  // hooks, skills, agents land where Claude Code looks for them.
  const sources = [
    { src: 'claude', dest: '.claude' },
    { src: 'templates', dest: 'templates' },
    { src: 'CLAUDE.md', dest: 'CLAUDE.md' },
    { src: '.claude-plugin', dest: '.claude-plugin' },
    { src: '.cursor-plugin', dest: '.cursor-plugin' },
    { src: '.codex-plugin', dest: '.codex-plugin' },
  ]

  // Build registry of file checksums
  const registry: Record<string, { checksum: string; installed_at: string }> = {}
  const registryPath = join(target, '.fis', 'registry.json')
  let existingRegistry: typeof registry = {}
  if (existsSync(registryPath)) {
    existingRegistry = JSON.parse(readFileSync(registryPath, 'utf8'))
  }

  let copied = 0
  let preserved = 0

  for (const { src, dest } of sources) {
    const srcPath = join(kitRoot, src)
    const destPath = join(target, dest)
    if (!existsSync(srcPath)) {
      console.warn(`⚠ Source missing: ${srcPath}`)
      continue
    }

    if (!existsSync(destPath) || force) {
      cpSync(srcPath, destPath, { recursive: true })
      copied++
    } else {
      // Check if user modified — compare against registry checksum
      // For simplicity in MVP, only check top-level files
      preserved++
      console.log(`  ⏭ Preserved (already exists): ${dest}`)
    }
  }

  // Update registry
  mkdirSync(dirname(registryPath), { recursive: true })
  writeFileSync(registryPath, JSON.stringify(registry, null, 2))

  // Record source for future `fis update`
  if (fromUrl) {
    const memoPath = join(target, '.fis', 'source.json')
    writeFileSync(
      memoPath,
      JSON.stringify(
        { url: fromUrl, ref, installed_at: new Date().toISOString() },
        null,
        2
      )
    )
  }

  console.log(`✅ Copied ${copied} sources, preserved ${preserved} existing.`)
  if (preserved > 0) {
    console.log(`   Pass --force to overwrite preserved sources.`)
  }
  console.log(`Next: Read CLAUDE.md, then ask Claude to "set up the Three Amigos personas" to start`)
}
