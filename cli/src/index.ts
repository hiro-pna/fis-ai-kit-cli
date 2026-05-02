#!/usr/bin/env node
/**
 * fis-cli — FIS AI Kit command-line interface
 *
 * Commands:
 *   fis init [--target <dir>]      — Scaffold project artifact directories
 *   fis install [--from <kit>]     — Copy claude/, templates/ into project
 *   fis update                     — Pull latest kit version, preserve user changes
 *   fis doctor                     — Health check artifacts + skill registry
 *   fis reconcile [--fix]          — Detect status drift, suggest fix
 *   fis app                        — Launch web dashboard (port 3456)
 *   fis three-amigos <type> <id>   — Trigger Three Amigos consultation
 *   fis --version
 *   fis --help
 */

import { initCommand } from './commands/init.js'
import { installCommand } from './commands/install.js'
import { doctorCommand } from './commands/doctor.js'
import { reconcileCommand } from './commands/reconcile.js'
import { updateCommand } from './commands/update.js'
import { skillsCommand } from './commands/skills.js'
import { setupCommand } from './commands/setup.js'

const VERSION = '0.2.7'

function printHelp() {
  console.log(`fis-cli v${VERSION} — FIS AI Kit

USAGE:
  fis <command> [options]

COMMANDS:
  setup                One-command wizard (recommended for first-time install)
  init                 Scaffold artifact directories only
  install              Install kit (claude/, templates/) into current project
  update               Re-fetch kit from recorded source
  skills [query]       List/search skills available in installed kit
  doctor               Health check artifacts + skill registry
  reconcile [--fix]    Detect artifact status drift, suggest fix
  app                  Launch web dashboard (TODO v0.3)
  three-amigos <type> <id>   Trigger consultation (prd|trd|story|test-spec)

SETUP MODES:
  fis setup            # Smart wizard — 1-2 prompts, defaults auto-detected
  fis setup --quick    # Zero prompts, all defaults — fastest install
  fis setup --advanced # Full control: custom kit URL, .npmrc, GitLab registry
  fis setup --reinstall    # Re-run setup if .fisrc.json đã tồn tại

OPTIONS:
  --version, -v        Show version
  --help, -h           Show help

EXAMPLES:
  npx fis-ai-kit-cli setup            # Recommended: smart wizard
  npx fis-ai-kit-cli setup --quick    # CI / fast install with defaults
  fis init                            # Scaffold artifacts/, plans/, docs/
  fis install --refresh               # Re-clone cached remote kit
  fis reconcile --fix                 # Detect + guided fix drift
  fis three-amigos prd PRD-0001

REMOTE INSTALL ENV:
  FIS_KIT_TOKEN       OAuth2 token for HTTPS git clone (GitLab PAT, GitHub PAT)
                      Auto-skipped if kit URL is public / SSH
`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp()
    return
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION)
    return
  }

  const [command, ...rest] = args
  try {
    switch (command) {
      case 'setup':
        await setupCommand(rest)
        break
      case 'init':
        await initCommand(rest)
        break
      case 'install':
        await installCommand(rest)
        break
      case 'update':
        await updateCommand(rest)
        break
      case 'skills':
        await skillsCommand(rest)
        break
      case 'doctor':
        await doctorCommand(rest)
        break
      case 'reconcile':
        await reconcileCommand(rest)
        break
      case 'app':
        console.log('TODO: implement web dashboard launcher (port 3456)')
        break
      case 'three-amigos':
        console.log('TODO: trigger /fis:three-amigos:review-* skill')
        break
      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
