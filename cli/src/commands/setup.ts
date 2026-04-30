/**
 * fis setup — Interactive wizard. Configure kit source, write .npmrc + .fisrc,
 * append .gitignore, run init + install.
 *
 * Non-interactive (CI / scripted): pass all required flags:
 *   fis setup --kit-url <git-url> --kit-ref main --skip-token
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { initCommand } from './init.js'
import { installCommand } from './install.js'

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

interface SetupArgs {
  kitUrl?: string
  kitRef?: string
  registryProjectId?: string
  registryHost?: string
  skipToken?: boolean
}

function parseArgs(args: string[]): SetupArgs {
  const out: SetupArgs = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--kit-url' && args[i + 1]) out.kitUrl = args[++i]
    else if (a === '--kit-ref' && args[i + 1]) out.kitRef = args[++i]
    else if (a === '--registry-project-id' && args[i + 1]) out.registryProjectId = args[++i]
    else if (a === '--registry-host' && args[i + 1]) out.registryHost = args[++i]
    else if (a === '--skip-token') out.skipToken = true
  }
  return out
}

export async function setupCommand(args: string[]): Promise<void> {
  const target = process.cwd()
  const flags = parseArgs(args)
  const interactive = !flags.kitUrl // if --kit-url provided, skip prompts

  console.log('FIS AI Kit — interactive setup\n')

  const kitUrl =
    flags.kitUrl ??
    (await ask(
      'Private kit Git URL (HTTPS or SSH)',
      'https://gitlab.fis.vn/fis-ai-first/fis-ai-kit.git'
    ))
  const kitRef = flags.kitRef ?? (interactive ? await ask('Kit branch/tag', 'main') : 'main')

  // Optional: write .npmrc for GitLab Package Registry consumption
  const writeNpmrc = interactive
    ? await askYesNo('Configure .npmrc to install CLI updates from GitLab Package Registry?', false)
    : Boolean(flags.registryProjectId)
  let registryHost = flags.registryHost
  let projectId = flags.registryProjectId
  if (writeNpmrc) {
    if (!registryHost && interactive) {
      registryHost = await ask('GitLab host', 'gitlab.fis.vn')
    }
    if (!projectId && interactive) {
      projectId = await ask('GitLab project ID (numeric)')
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
        console.log(`  ⏭ .npmrc already exists, skipping (review manually if needed).`)
      } else {
        writeFileSync(npmrcPath, npmrc)
        console.log(`  ✅ .npmrc written → ${npmrcPath}`)
      }

      // Ensure .npmrc is gitignored (it references token via env var)
      const gitignorePath = join(target, '.gitignore')
      const gitignoreContent = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
      if (!gitignoreContent.split('\n').some((l) => l.trim() === '.npmrc')) {
        appendFileSync(gitignorePath, '\n# FIS AI Kit\n.npmrc\n')
        console.log('  ✅ .npmrc added to .gitignore')
      }
    }
  }

  // Token check (informational only — CLI install reads env at runtime)
  if (!flags.skipToken && !process.env.FIS_KIT_TOKEN && !process.env.GITLAB_TOKEN) {
    console.log(
      '\n⚠  No FIS_KIT_TOKEN or GITLAB_TOKEN in env.\n' +
        '   For HTTPS clones of private kit, export one before running install:\n' +
        '     export FIS_KIT_TOKEN=glpat_xxx\n' +
        '   (SSH URLs use SSH key on disk — no token needed.)'
    )
  }

  console.log('\nRunning init + install...\n')
  await initCommand([])
  await installCommand(['--from', kitUrl, '--ref', kitRef])

  console.log('\n✅ Setup complete.')
  console.log('   Next:')
  console.log('     fis doctor                       # verify install')
  console.log('     /fis:ba:manage-personas          # define team')
  console.log('     /fis:ba:create-prd "Feature X"   # start SDLC')
}
