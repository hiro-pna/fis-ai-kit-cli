/**
 * fis update — Refresh kit content from its source.
 *
 * Two modes:
 *   1. Bundled (dev): runs git pull on the kit root if it's a git working tree.
 *   2. Remote: re-runs install with --refresh against the same source previously used,
 *      tracked via .fis/source.json (written by install on --from).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { installCommand } from './install.js'

interface SourceMemo {
  url: string
  ref: string
  installed_at: string
}

export async function updateCommand(args: string[]): Promise<void> {
  const target = process.cwd()
  const memoPath = join(target, '.fis', 'source.json')

  if (existsSync(memoPath)) {
    try {
      const memo: SourceMemo = JSON.parse(readFileSync(memoPath, 'utf8'))
      console.log(`Updating from recorded source: ${memo.url} (ref: ${memo.ref})`)
      await installCommand(['--from', memo.url, '--ref', memo.ref, '--refresh', '--force'])
      return
    } catch (e) {
      console.warn(`⚠ Could not read ${memoPath}, falling back to git pull.`)
    }
  }

  // Fallback: try git pull on current project (assumes monorepo dev mode)
  if (existsSync(join(target, '.git'))) {
    console.log('No remote source recorded. Running git pull on current project...')
    const result = spawnSync('git', ['pull', '--ff-only'], { stdio: 'inherit', cwd: target })
    if (result.status !== 0) {
      console.error('❌ git pull failed. If using public CLI + private kit, run:')
      console.error('  fis install --from <git-url> --refresh')
      process.exit(1)
    }
    console.log('✅ Kit updated.')
    return
  }

  console.error('❌ No update source found.')
  console.error('  Run `fis install --from <git-url>` first to install kit content.')
  process.exit(1)
}
