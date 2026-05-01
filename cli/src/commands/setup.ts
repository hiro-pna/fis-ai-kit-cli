/**
 * fis setup — Interactive wizard. Print banner, capture project context,
 * configure kit source, write .fisrc.json + optional .npmrc, run init + install.
 *
 * Non-interactive (CI / scripted): pass flags to skip prompts:
 *   fis setup --kit-url <git-url> --kit-ref main \
 *             --project-mode greenfield|brownfield \
 *             --tech-stack java-spring|csharp-dotnet|react|other \
 *             --skip-token
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { initCommand } from './init.js'
import { installCommand } from './install.js'
import { printBanner } from '../lib/banner.js'

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
  const ans = await ask('Choice (number or name)', defValue)
  // Allow numeric or value
  const byNum = parseInt(ans, 10)
  if (!isNaN(byNum) && byNum >= 1 && byNum <= choices.length) {
    return choices[byNum - 1].value
  }
  const byValue = choices.find((c) => c.value === ans)
  return byValue ? byValue.value : defValue
}

interface SetupArgs {
  kitUrl?: string
  kitRef?: string
  projectMode?: string
  techStack?: string
  projectName?: string
  registryProjectId?: string
  registryHost?: string
  skipToken?: boolean
  yes?: boolean
}

function parseArgs(args: string[]): SetupArgs {
  const out: SetupArgs = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--kit-url' && args[i + 1]) out.kitUrl = args[++i]
    else if (a === '--kit-ref' && args[i + 1]) out.kitRef = args[++i]
    else if (a === '--project-mode' && args[i + 1]) out.projectMode = args[++i]
    else if (a === '--tech-stack' && args[i + 1]) out.techStack = args[++i]
    else if (a === '--project-name' && args[i + 1]) out.projectName = args[++i]
    else if (a === '--registry-project-id' && args[i + 1]) out.registryProjectId = args[++i]
    else if (a === '--registry-host' && args[i + 1]) out.registryHost = args[++i]
    else if (a === '--skip-token') out.skipToken = true
    else if (a === '--yes' || a === '-y') out.yes = true
  }
  return out
}

interface FisrcConfig {
  version: string
  project: {
    name: string
    mode: 'greenfield' | 'brownfield'
    tech_stack: string
    created: string
  }
  kit: {
    source: string
    ref: string
  }
  handoff_gate: { enabled: boolean }
  three_amigos: {
    team_size: number              // 1 = solo mode (auto-sign all 3 amigos); ≥2 = real team
    mode: 'auto' | 'sync' | 'async'
    async_sla_hours: number
  }
  automation: {
    auto_chain: boolean             // skill end auto-prompts next skill
    auto_detect_id: boolean         // skip --id arg if only 1 candidate
    auto_approve_solo: boolean      // team_size=1 → auto-sign Three Amigos
  }
}

function writeFisrc(target: string, cfg: FisrcConfig): void {
  const path = join(target, '.fisrc.json')
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n')
  console.log(`  ✅ .fisrc.json written → ${path}`)
}

export async function setupCommand(args: string[]): Promise<void> {
  const target = process.cwd()
  const flags = parseArgs(args)
  // Non-interactive iff --yes OR all required flags supplied
  const interactive = !flags.yes && !(flags.kitUrl && flags.projectMode)

  printBanner()
  console.log('Interactive setup — let me know your project context.\n')

  // 1. Project name
  const defaultName = basename(target).replace(/[^\w-]/g, '-')
  const projectName =
    flags.projectName ??
    (interactive ? await ask('Project name', defaultName) : defaultName)

  // 2. Project mode (greenfield vs brownfield)
  const projectMode =
    flags.projectMode ??
    (interactive
      ? await askChoice(
          'Is this a new project (greenfield) or existing codebase (brownfield)?',
          [
            { value: 'greenfield', label: 'Greenfield — start from PRD, no code yet' },
            { value: 'brownfield', label: 'Brownfield — existing code, reverse-engineer specs' },
          ],
          'greenfield'
        )
      : 'greenfield')

  // 3. Tech stack
  const techStack =
    flags.techStack ??
    (interactive
      ? await askChoice(
          'Primary tech stack?',
          [
            { value: 'java-spring', label: 'Java + Spring Boot' },
            { value: 'csharp-dotnet', label: 'C# + .NET 8' },
            { value: 'react', label: 'React (frontend or full-stack)' },
            { value: 'mixed', label: 'Mixed / multiple stacks' },
            { value: 'other', label: 'Other' },
          ],
          'java-spring'
        )
      : 'java-spring')

  // 4. Kit source URL + ref
  const kitUrl =
    flags.kitUrl ??
    (await ask(
      'Private kit Git URL (HTTPS or SSH)',
      'https://gitlab.fis.vn/fis-ai-first/fis-ai-kit.git'
    ))
  const kitRef = flags.kitRef ?? (interactive ? await ask('Kit branch/tag', 'main') : 'main')

  // 5. Optional .npmrc (only relevant if user wants `npx @fis-team/...` updates from GitLab)
  let writeNpmrc = false
  let registryHost = flags.registryHost
  let projectId = flags.registryProjectId
  if (interactive && !flags.yes) {
    writeNpmrc = await askYesNo(
      'Configure .npmrc to consume CLI updates from GitLab Package Registry? (skip for npmjs)',
      false
    )
  } else if (flags.registryProjectId) {
    writeNpmrc = true
  }

  if (writeNpmrc) {
    if (!registryHost && interactive) {
      registryHost = await ask('GitLab host', 'gitlab.fis.vn')
    }
    if (!projectId && interactive) {
      projectId = await ask('GitLab project ID (numeric — see Settings → General)')
    }
    if (registryHost && projectId) {
      const npmrcPath = join(target, '.npmrc')
      const npmrc = [
        `@fis-team:registry=https://${registryHost}/api/v4/projects/${projectId}/packages/npm/`,
        `//${registryHost}/api/v4/projects/${projectId}/packages/npm/:_authToken=\${GITLAB_TOKEN}`,
        'always-auth=true',
        '',
      ].join('\n')
      if (existsSync(npmrcPath)) {
        console.log(`  ⏭ .npmrc already exists, skipping.`)
      } else {
        writeFileSync(npmrcPath, npmrc)
        console.log(`  ✅ .npmrc written → ${npmrcPath}`)
      }
      const gitignorePath = join(target, '.gitignore')
      const gitignoreContent = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
      if (!gitignoreContent.split('\n').some((l) => l.trim() === '.npmrc')) {
        appendFileSync(gitignorePath, '\n# FIS AI Kit\n.npmrc\n')
        console.log('  ✅ .npmrc added to .gitignore')
      }
    }
  }

  // 6. Token check (informational)
  if (!flags.skipToken && !process.env.FIS_KIT_TOKEN && !process.env.GITLAB_TOKEN) {
    console.log(
      '\n⚠  No FIS_KIT_TOKEN or GITLAB_TOKEN in env.\n' +
        '   For HTTPS clones, export one before next step:\n' +
        '     export FIS_KIT_TOKEN=glpat_xxx     # GitLab PAT scope read_repository\n' +
        '   (SSH URLs use SSH key on disk — no token needed.)\n'
    )
  }

  // 7. Recap (so user knows what's about to happen)
  console.log('\n' + '─'.repeat(60))
  console.log('Configuration summary:')
  console.log(`  Project name : ${projectName}`)
  console.log(`  Mode         : ${projectMode}`)
  console.log(`  Tech stack   : ${techStack}`)
  console.log(`  Kit source   : ${kitUrl}`)
  console.log(`  Kit ref      : ${kitRef}`)
  console.log('─'.repeat(60) + '\n')

  if (interactive && !flags.yes) {
    const proceed = await askYesNo('Proceed with init + install?', true)
    if (!proceed) {
      console.log('Aborted.')
      return
    }
  }

  // 8. Run init + install
  console.log('\nRunning init + install...\n')
  await initCommand([])
  await installCommand(['--from', kitUrl, '--ref', kitRef])

  // 9. Write enriched .fisrc.json (overrides init's basic version)
  // Default to solo mode (team_size=1) — most projects start solo.
  // User can edit .fisrc.json later to bump team_size for real team workflow.
  writeFisrc(target, {
    version: '0.2.5',
    project: {
      name: projectName,
      mode: projectMode as 'greenfield' | 'brownfield',
      tech_stack: techStack,
      created: new Date().toISOString().slice(0, 10),
    },
    kit: { source: kitUrl, ref: kitRef },
    handoff_gate: { enabled: true },
    three_amigos: {
      team_size: 1,
      mode: 'auto',
      async_sla_hours: 24,
    },
    automation: {
      auto_chain: true,
      auto_detect_id: true,
      auto_approve_solo: true,
    },
  })

  // 10. Mode-specific next steps
  console.log('\n' + '═'.repeat(60))
  console.log('✅ Setup complete.')
  console.log('═'.repeat(60))
  console.log('\nNext steps:')
  console.log('  fis doctor                          # verify install')
  console.log('  fis skills                          # browse available skills\n')

  console.log('How to use the kit:')
  console.log('  Skills load automatically from .claude/skills/ via SKILL.md frontmatter.')
  console.log('  Open Claude Code in this directory and ask in natural language —')
  console.log('  Claude will activate the matching FIS skill based on your request.\n')

  if (projectMode === 'greenfield') {
    console.log('Greenfield workflow (Create mode) — example prompts:')
    console.log('  "Help me set up the Three Amigos team and stakeholders"        → manage-personas')
    console.log('  "Create a PRD for [feature X]"                                  → create-prd')
    console.log('  "Run Three Amigos review on PRD-0001"                           → three-amigos review')
    console.log('  "Approve PRD-0001"                                              → approve-prd')
    console.log('  "Design the TRD for PRD-0001"                                   → design-trd')
    console.log('  ... continue BA → SA → DEV → QA chain')
  } else {
    console.log('Brownfield workflow (Generate mode) — example prompts:')
    console.log('  "Reverse-engineer a TRD from the codebase at ./src"             → generate-trd')
    console.log('  "Derive a PRD from TRD-0001 and the source"                     → generate-prd')
    console.log('  "Extract a test spec for story US-XXXX from existing tests"     → generate-test-spec')
    console.log('  ⚠ Brownfield Approve requires contract test 100% pass')
  }

  if (techStack === 'java-spring') {
    console.log('\nStack helper: ask Claude to "use the java-spring stack skill" during planning.')
  } else if (techStack === 'csharp-dotnet') {
    console.log('\nStack helper: ask Claude to "use the csharp-dotnet stack skill" during planning.')
  } else if (techStack === 'react') {
    console.log('\nStack helper: ask Claude to "use the react stack skill" during planning.')
  }
  console.log('\nNote: `/fis:*` slash-command syntax requires installing the kit as a')
  console.log('Claude Code plugin via /plugin marketplace. File-based install (this flow)')
  console.log('uses skill auto-discovery — natural language prompts work best.\n')
}
