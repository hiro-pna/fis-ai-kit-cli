/**
 * fis reconcile — Wrap status-drift-detector.cjs hook in CLI command.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export async function reconcileCommand(args: string[]): Promise<void> {
  const target = process.cwd()
  const hook = join(target, 'claude', 'hooks', 'status-drift-detector.cjs')

  if (!existsSync(hook)) {
    console.error('❌ Hook not found:', hook)
    console.error('   Run: fis install')
    process.exit(1)
  }

  const fix = args.includes('--fix')
  const planWaves = args.includes('--plan-waves')

  if (planWaves) {
    console.log('TODO: --plan-waves analyse Story file_ownership')
    return
  }

  console.log('Running status drift detection...\n')
  const result = spawnSync('node', [hook], {
    stdio: 'inherit',
    env: { ...process.env, FIS_PROJECT_ROOT: target },
  })

  if (result.status === 0) {
    console.log('\n✅ No errors. Project artifacts coherent.')
  } else {
    console.log('\n⚠ Errors detected. See report in artifacts/reports/.')
    if (fix) {
      console.log('Guided fix mode (TODO: implement interactive prompt)')
    } else {
      console.log('Pass --fix for guided remediation.')
    }
  }
}
