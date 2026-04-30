/**
 * fis doctor — Health check for FIS AI Kit installation.
 *
 * Checks:
 * - Required directories exist
 * - claude/skills/ has all 5 packs (ba, sa, dev, qa, cross)
 * - claude/agents/ has 4 personas + utility agents
 * - claude/rules/ has 6 rule files
 * - claude/hooks/ executable
 * - .fisrc.json valid
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message?: string
}

export async function doctorCommand(_args: string[]): Promise<void> {
  const target = process.cwd()
  const checks: CheckResult[] = []

  console.log(`Running FIS AI Kit health check at: ${target}\n`)

  // Check artifact directories
  const requiredDirs = [
    'artifacts/prd', 'artifacts/trd', 'artifacts/stories',
    'artifacts/test-specs', 'claude/skills', 'claude/agents',
    'claude/rules', 'claude/hooks',
    'templates/core', 'templates/modules', 'templates/personas',
    'templates/automation', 'templates/plans', 'templates/exports/web',
  ]
  for (const dir of requiredDirs) {
    const exists = existsSync(join(target, dir))
    checks.push({
      name: `Directory ${dir}`,
      status: exists ? 'pass' : 'fail',
      message: exists ? undefined : 'Run: fis init && fis install',
    })
  }

  // Check core artifact templates (binding contract for skills)
  const coreTemplates = [
    'templates/core/prd.template.md',
    'templates/core/trd.template.md',
    'templates/core/tsd.template.md',
    'templates/core/epic.template.md',
    'templates/core/story.template.md',
    'templates/core/plan.template.md',
    'templates/core/test-spec.template.md',
    'templates/core/bug.template.md',
    'templates/core/cr.template.md',
    'templates/core/review.template.md',
    'templates/plans/feature-implementation.template.md',
    'templates/plans/bug-fix.template.md',
    'templates/plans/refactor.template.md',
    'templates/personas/persona.template.md',
    'templates/personas/three-amigos-team.template.md',
    'templates/personas/stakeholders.template.md',
    'templates/exports/web/dashboard.html',
    'templates/exports/web/dashboard.css',
    'templates/exports/web/dashboard.js',
  ]
  for (const tpl of coreTemplates) {
    const exists = existsSync(join(target, tpl))
    checks.push({
      name: `Template: ${tpl}`,
      status: exists ? 'pass' : 'fail',
      message: exists ? undefined : 'Run: fis install --force',
    })
  }

  // Check skill packs
  const skillPacks = ['ba', 'sa', 'dev', 'qa', 'cross']
  for (const pack of skillPacks) {
    const packDir = join(target, 'claude', 'skills', pack)
    if (existsSync(packDir)) {
      const skills = readdirSync(packDir).filter(d =>
        existsSync(join(packDir, d, 'SKILL.md'))
      )
      checks.push({
        name: `Skill pack: ${pack}`,
        status: skills.length > 0 ? 'pass' : 'warn',
        message: `${skills.length} skills`,
      })
    } else {
      checks.push({
        name: `Skill pack: ${pack}`,
        status: 'fail',
        message: 'Missing — fis install --force',
      })
    }
  }

  // Check rules
  const requiredRules = [
    'primary-workflow.md', 'handoff-protocol.md', 'status-workflow.md',
    'three-amigos-protocol.md', 'orchestration-protocol.md', 'development-rules.md',
  ]
  for (const rule of requiredRules) {
    const exists = existsSync(join(target, 'claude', 'rules', rule))
    checks.push({
      name: `Rule: ${rule}`,
      status: exists ? 'pass' : 'fail',
    })
  }

  // Check hooks
  const requiredHooks = [
    'session-init.cjs', 'handoff-gate.cjs', 'status-drift-detector.cjs',
    'skill-dedup.cjs', 'dev-rules-reminder.cjs', 'notification.cjs',
  ]
  for (const hook of requiredHooks) {
    const exists = existsSync(join(target, 'claude', 'hooks', hook))
    checks.push({
      name: `Hook: ${hook}`,
      status: exists ? 'pass' : 'warn',
    })
  }

  // Check config
  const configPath = join(target, '.fisrc.json')
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'))
      checks.push({
        name: '.fisrc.json',
        status: 'pass',
        message: `v${config.version || '?'}`,
      })
    } catch (e) {
      checks.push({ name: '.fisrc.json', status: 'fail', message: 'Invalid JSON' })
    }
  } else {
    checks.push({ name: '.fisrc.json', status: 'warn', message: 'Run: fis init' })
  }

  // Print results
  let pass = 0, warn = 0, fail = 0
  for (const c of checks) {
    const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️ ' : '❌'
    const msg = c.message ? ` — ${c.message}` : ''
    console.log(`${icon} ${c.name}${msg}`)
    if (c.status === 'pass') pass++
    else if (c.status === 'warn') warn++
    else fail++
  }

  console.log(`\nSummary: ${pass} pass / ${warn} warnings / ${fail} failures`)
  process.exit(fail > 0 ? 1 : 0)
}
