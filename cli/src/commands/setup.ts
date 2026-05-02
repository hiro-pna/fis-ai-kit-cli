/**
 * fis setup — One-command wizard. Sensible defaults, minimal prompts.
 *
 * Modes:
 *   fis setup            # Smart wizard: 1-2 prompts only
 *   fis setup --quick    # Zero prompts, all defaults — for CI / fast install
 *   fis setup --advanced # Full control: kit URL, .npmrc, GitLab registry
 *
 * Common flags:
 *   -q, --quick            Zero-prompt install with auto-detected defaults
 *   -y, --yes              Accept defaults but show summary
 *   --advanced             Show all advanced options (kit URL, .npmrc, etc.)
 *   --reinstall            Re-run even if .fisrc.json exists
 *   --project-mode <m>     greenfield | brownfield
 *   --tech-stack <s>       java-spring | csharp-dotnet | react | mixed | other
 *   --project-name <n>     Project name (default: cwd basename)
 *   --kit-url <url>        Kit Git URL (advanced)
 *   --kit-ref <ref>        Kit branch/tag (advanced, default: main)
 *   --skip-token           Suppress token warning even on private URL
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { spawnSync } from 'node:child_process'
import { initCommand } from './init.js'
import { installCommand } from './install.js'
import { doctorCommand } from './doctor.js'
import { printBanner } from '../lib/banner.js'

const DEFAULT_KIT_URL = process.env.FIS_KIT_SOURCE || ''
const DEFAULT_KIT_REF = process.env.FIS_KIT_REF || 'main'
const FISRC_VERSION = '0.2.7'

// ── Prompt helpers ──────────────────────────────────────────────────────────

async function ask(q: string, def?: string): Promise<string> {
  const rl = createInterface({ input, output })
  const prompt = def ? `${q} [${def}]: ` : `${q}: `
  const ans = (await rl.question(prompt)).trim()
  rl.close()
  return ans || def || ''
}
async function askYesNo(q: string, def: boolean): Promise<boolean> {
  const ans = await ask(`${q} (y/n)`, def ? 'y' : 'n')
  return ans.toLowerCase().startsWith('y')
}
async function askChoice(
  q: string,
  choices: { value: string; label: string }[],
  defValue: string
): Promise<string> {
  console.log(`\n${q}`)
  choices.forEach((c, i) => {
    const marker = c.value === defValue ? '▸' : ' '
    console.log(`  ${marker} ${i + 1}) ${c.label}`)
  })
  const ans = await ask('Choice', defValue)
  const byNum = parseInt(ans, 10)
  if (!isNaN(byNum) && byNum >= 1 && byNum <= choices.length) return choices[byNum - 1].value
  const byValue = choices.find((c) => c.value === ans)
  return byValue ? byValue.value : defValue
}

// ── Smart defaults (auto-detection) ─────────────────────────────────────────

interface DetectedDefaults {
  projectName: string
  techStack: string
  projectMode: string
  hasGit: boolean
  hasFisrc: boolean
}

function detectDefaults(target: string): DetectedDefaults {
  const projectName = basename(target).replace(/[^\w-]/g, '-') || 'fis-project'
  const hasGit = existsSync(join(target, '.git'))
  const hasFisrc = existsSync(join(target, '.fisrc.json'))

  // Tech stack heuristics — read manifest files
  let techStack = 'other'
  if (existsSync(join(target, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.react || deps['react-dom'] || deps.next || deps.vite) techStack = 'react'
      else techStack = 'mixed'
    } catch {
      techStack = 'mixed'
    }
  } else if (existsSync(join(target, 'pom.xml')) || existsSync(join(target, 'build.gradle')) || existsSync(join(target, 'build.gradle.kts'))) {
    techStack = 'java-spring'
  } else if (
    ['', 'src', '.'].some((d) => {
      try {
        const dir = join(target, d)
        return existsSync(dir) && readDirSafe(dir).some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))
      } catch {
        return false
      }
    })
  ) {
    techStack = 'csharp-dotnet'
  }

  // Project mode heuristic: existing src/ or commits → brownfield; else greenfield
  let projectMode = 'greenfield'
  const hasSourceCode =
    existsSync(join(target, 'src')) ||
    existsSync(join(target, 'lib')) ||
    existsSync(join(target, 'app')) ||
    existsSync(join(target, 'main'))
  if (hasGit) {
    const log = spawnSync('git', ['-C', target, 'log', '--oneline', '-1'], { stdio: 'pipe' })
    if (log.status === 0 && log.stdout.length > 0 && hasSourceCode) projectMode = 'brownfield'
  } else if (hasSourceCode) {
    projectMode = 'brownfield'
  }

  return { projectName, techStack, projectMode, hasGit, hasFisrc }
}

function readDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

// ── Args parsing ────────────────────────────────────────────────────────────

interface SetupArgs {
  quick?: boolean
  advanced?: boolean
  yes?: boolean
  reinstall?: boolean
  kitUrl?: string
  kitRef?: string
  projectMode?: string
  techStack?: string
  projectName?: string
  registryProjectId?: string
  registryHost?: string
  skipToken?: boolean
}

function parseArgs(args: string[]): SetupArgs {
  const out: SetupArgs = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--quick' || a === '-q') out.quick = true
    else if (a === '--advanced') out.advanced = true
    else if (a === '--yes' || a === '-y') out.yes = true
    else if (a === '--reinstall') out.reinstall = true
    else if (a === '--skip-token') out.skipToken = true
    else if (a === '--kit-url' && args[i + 1]) out.kitUrl = args[++i]
    else if (a === '--kit-ref' && args[i + 1]) out.kitRef = args[++i]
    else if (a === '--project-mode' && args[i + 1]) out.projectMode = args[++i]
    else if (a === '--tech-stack' && args[i + 1]) out.techStack = args[++i]
    else if (a === '--project-name' && args[i + 1]) out.projectName = args[++i]
    else if (a === '--registry-project-id' && args[i + 1]) out.registryProjectId = args[++i]
    else if (a === '--registry-host' && args[i + 1]) out.registryHost = args[++i]
  }
  return out
}

// ── .fisrc.json shape ───────────────────────────────────────────────────────

interface FisrcConfig {
  version: string
  project: { name: string; mode: 'greenfield' | 'brownfield'; tech_stack: string; created: string }
  kit: { source: string; ref: string }
  handoff_gate: { enabled: boolean }
  three_amigos: { team_size: number; mode: 'auto' | 'sync' | 'async'; async_sla_hours: number }
  automation: { auto_chain: boolean; auto_detect_id: boolean; auto_approve_solo: boolean }
}

function writeFisrc(target: string, cfg: FisrcConfig): void {
  writeFileSync(join(target, '.fisrc.json'), JSON.stringify(cfg, null, 2) + '\n')
}

// ── Token detection ─────────────────────────────────────────────────────────

function isPrivateKitUrl(url: string): boolean {
  // Heuristic: HTTPS to non-public hosts → likely needs auth
  if (url.startsWith('git@')) return false // SSH uses key, no token needed
  if (!url.startsWith('https://')) return false
  // Public hosts that don't need auth for read
  const publicHosts = ['github.com/public', 'raw.githubusercontent.com']
  return !publicHosts.some((h) => url.includes(h))
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function setupCommand(args: string[]): Promise<void> {
  const target = process.cwd()
  const flags = parseArgs(args)
  const detected = detectDefaults(target)

  // Existing install detection — short-circuit unless --reinstall
  if (detected.hasFisrc && !flags.reinstall) {
    console.log('ℹ  .fisrc.json already exists in this directory.')
    console.log('   Use --reinstall to re-run setup, or run `fis update` to refresh kit content.\n')
    return
  }

  printBanner()

  // Quick mode: zero prompts, all defaults
  const quick = flags.quick === true
  // Yes mode: minimal prompts, show summary, default everything
  const yes = flags.yes === true
  // Advanced: show all advanced prompts
  const advanced = flags.advanced === true
  // Interactive: full wizard (default)
  const interactive = !quick && !yes

  if (quick) {
    console.log('Quick install — using auto-detected defaults.\n')
  } else if (interactive) {
    console.log("Setup wizard — câu hỏi tối thiểu, defaults thông minh.\n")
    console.log(`  ▸ Tech stack auto-detected: ${detected.techStack}`)
    console.log(`  ▸ Project mode heuristic:   ${detected.projectMode}`)
    if (!detected.hasGit) console.log(`  ⚠ Không phải git repo (artifacts vẫn track được, nhưng nên git init).`)
    console.log('')
  }

  // 1. Project name (default: cwd basename)
  const projectName = flags.projectName ?? detected.projectName

  // 2. Project mode — most important question for newcomers
  let projectMode = flags.projectMode ?? detected.projectMode
  if (interactive && !flags.projectMode) {
    projectMode = await askChoice(
      'Project type?',
      [
        { value: 'greenfield', label: 'Greenfield — dự án mới, bắt đầu từ PRD' },
        { value: 'brownfield', label: 'Brownfield — codebase có sẵn, reverse-engineer spec' },
      ],
      detected.projectMode
    )
  }

  // 3. Tech stack — auto-detected by default, only ask if ambiguous
  let techStack = flags.techStack ?? detected.techStack
  if (interactive && !flags.techStack && (techStack === 'other' || techStack === 'mixed')) {
    techStack = await askChoice(
      'Primary tech stack? (auto-detect không chắc)',
      [
        { value: 'java-spring', label: 'Java + Spring Boot' },
        { value: 'csharp-dotnet', label: 'C# + .NET 8' },
        { value: 'react', label: 'React (frontend or full-stack)' },
        { value: 'mixed', label: 'Mixed / multiple stacks' },
        { value: 'other', label: 'Other' },
      ],
      techStack
    )
  }

  // 4. Kit source — required. Resolve in priority: flag → env (FIS_KIT_SOURCE) → prompt.
  let kitUrl = flags.kitUrl ?? DEFAULT_KIT_URL
  if (!kitUrl) {
    if (quick) {
      console.error(
        '\n❌ Kit URL không có. Cấp 1 trong các cách:\n' +
          '   1) Pass --kit-url <git-url>\n' +
          '   2) Export FIS_KIT_SOURCE=<git-url> trước khi chạy setup\n' +
          '   3) Drop --quick để wizard hỏi tương tác\n'
      )
      process.exit(1)
    }
    kitUrl = await ask('Kit Git URL (HTTPS hoặc SSH)')
    if (!kitUrl) {
      console.error('Kit URL bắt buộc. Aborted.')
      process.exit(1)
    }
  }
  let kitRef = flags.kitRef ?? DEFAULT_KIT_REF
  if (advanced && !flags.kitRef) {
    kitRef = await ask('Kit branch/tag', kitRef) || kitRef
  }

  // 5. .npmrc — only in --advanced mode
  if (advanced && !quick) {
    const writeNpmrc = await askYesNo(
      'Configure .npmrc cho GitLab Package Registry? (skip nếu npmjs)',
      false
    )
    if (writeNpmrc) await maybeWriteNpmrc(target, flags)
  }

  // 6. Token check — only warn if kit URL needs auth + no token set
  if (
    !flags.skipToken &&
    isPrivateKitUrl(kitUrl) &&
    !process.env.FIS_KIT_TOKEN &&
    !process.env.GITLAB_TOKEN
  ) {
    console.log(
      '\n⚠  Kit URL có vẻ private nhưng không có FIS_KIT_TOKEN trong env.\n' +
        '   Set token trước khi chạy install:\n' +
        '     export FIS_KIT_TOKEN=<your-token>     # GitLab/GitHub PAT scope read_repository\n' +
        '   (SSH URL git@... không cần token, dùng SSH key trên máy.)\n'
    )
  }

  // 7. Recap (skip in quick mode)
  if (!quick) {
    console.log('\n' + '─'.repeat(60))
    console.log('Configuration:')
    console.log(`  Project name : ${projectName}`)
    console.log(`  Mode         : ${projectMode}`)
    console.log(`  Tech stack   : ${techStack}`)
    if (advanced) {
      console.log(`  Kit source   : ${kitUrl}`)
      console.log(`  Kit ref      : ${kitRef}`)
    }
    console.log('─'.repeat(60) + '\n')
    if (interactive) {
      const proceed = await askYesNo('Proceed install?', true)
      if (!proceed) {
        console.log('Aborted.')
        return
      }
    }
  }

  // 8. Run init + install
  console.log('▸ Scaffolding artifact directories...')
  await initCommand([])
  console.log('\n▸ Fetching kit content...')
  await installCommand(['--from', kitUrl, '--ref', kitRef])

  // 9. Write enriched .fisrc.json (overrides init's basic version)
  writeFisrc(target, {
    version: FISRC_VERSION,
    project: {
      name: projectName,
      mode: projectMode as 'greenfield' | 'brownfield',
      tech_stack: techStack,
      created: new Date().toISOString().slice(0, 10),
    },
    kit: { source: kitUrl, ref: kitRef },
    handoff_gate: { enabled: true },
    three_amigos: { team_size: 1, mode: 'auto', async_sla_hours: 24 },
    automation: { auto_chain: true, auto_detect_id: true, auto_approve_solo: true },
  })
  console.log(`✓ Wrote .fisrc.json`)

  // 10. Auto-doctor (verify install)
  console.log('\n▸ Verifying install...')
  try {
    await doctorCommand([])
  } catch (e) {
    console.log(`⚠  Doctor check encountered issue: ${e instanceof Error ? e.message : e}`)
    console.log('   Continue with manual setup, or re-run: fis doctor')
  }

  // 11. Final hint — minimal, action-oriented
  console.log('\n' + '═'.repeat(60))
  console.log('✅ Setup complete.')
  console.log('═'.repeat(60))

  console.log('\nMở Claude Code trong thư mục này:')
  console.log(`    cd ${target}`)
  console.log('    claude   # hoặc cursor . / codex')

  console.log('\nThử ngay 1 prompt natural language:')
  if (projectMode === 'greenfield') {
    console.log('    "Tạo PRD cho [tên feature của bạn]"')
    console.log('    → Kit auto-route sang skill /fis:ba:create-prd')
  } else {
    console.log('    "Reverse-engineer TRD từ codebase ./src"')
    console.log('    → Kit auto-route sang skill /fis:sa:generate-trd')
  }

  console.log('\nMore:')
  console.log('    fis skills        # browse 74+ skills')
  console.log('    fis doctor        # health check anytime')
  console.log('    fis reconcile     # detect artifact status drift')
  console.log('')
}

// ── Optional .npmrc helper (advanced mode only) ─────────────────────────────

async function maybeWriteNpmrc(target: string, flags: SetupArgs): Promise<void> {
  const registryHost = flags.registryHost ?? (await ask('GitLab host (vd gitlab.example.com)'))
  const projectId = flags.registryProjectId ?? (await ask('GitLab project ID (Settings → General)'))
  if (!registryHost || !projectId) {
    console.log('  ⏭ Missing host or project ID, skipping .npmrc.')
    return
  }
  const npmrcPath = join(target, '.npmrc')
  const npmrc = [
    `@fis-team:registry=https://${registryHost}/api/v4/projects/${projectId}/packages/npm/`,
    `//${registryHost}/api/v4/projects/${projectId}/packages/npm/:_authToken=\${GITLAB_TOKEN}`,
    'always-auth=true',
    '',
  ].join('\n')
  if (existsSync(npmrcPath)) {
    console.log(`  ⏭ .npmrc đã tồn tại, skipping.`)
  } else {
    writeFileSync(npmrcPath, npmrc)
    console.log(`  ✓ Wrote .npmrc`)
  }
  const gitignorePath = join(target, '.gitignore')
  const gitignoreContent = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
  if (!gitignoreContent.split('\n').some((l) => l.trim() === '.npmrc')) {
    appendFileSync(gitignorePath, '\n# FIS AI Kit\n.npmrc\n')
    console.log('  ✓ Added .npmrc to .gitignore')
  }
}
