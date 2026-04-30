/**
 * fis skills — List or search skills available in the installed kit.
 *
 * Reads claude/skills/<name>/SKILL.md frontmatter to extract name + description,
 * groups by pack (ba/sa/dev/qa/cross/utility), prints filterable table.
 *
 * Usage:
 *   fis skills                    # list all (grouped by pack)
 *   fis skills <query>            # filter by substring in name or description
 *   fis skills --pack ba          # only one pack
 *   fis skills --json             # machine-readable
 */

import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

interface SkillEntry {
  name: string
  description: string
  pack: string  // ba | sa | dev | qa | cross | (top-level utility folder name)
  path: string  // relative to claude/skills/
}

function parseFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const km = line.match(/^([a-zA-Z_-]+):\s*(.+)$/)
    if (km) fm[km[1]] = km[2].trim().replace(/^["']|["']$/g, '')
  }
  return fm
}

function walkSkills(skillsDir: string): SkillEntry[] {
  const entries: SkillEntry[] = []
  if (!existsSync(skillsDir)) return entries

  // Look at top-level skill folders + role-pack subfolders
  for (const top of readdirSync(skillsDir)) {
    const topPath = join(skillsDir, top)
    if (!lstatSync(topPath).isDirectory()) continue
    if (top.startsWith('.') || top.startsWith('_')) continue

    // Role packs ba/, sa/, dev/, qa/, cross/ have skills inside
    const isPack = ['ba', 'sa', 'dev', 'qa', 'cross'].includes(top)
    if (isPack) {
      for (const skillDir of readdirSync(topPath)) {
        const skillPath = join(topPath, skillDir, 'SKILL.md')
        if (existsSync(skillPath)) {
          const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'))
          if (fm.name) {
            entries.push({
              name: fm.name,
              description: (fm.description || '').slice(0, 120),
              pack: top,
              path: `${top}/${skillDir}`,
            })
          }
        }
      }
    } else {
      // Top-level utility skill (cook, fix, debug, etc.)
      const skillPath = join(topPath, 'SKILL.md')
      if (existsSync(skillPath)) {
        const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'))
        if (fm.name) {
          entries.push({
            name: fm.name,
            description: (fm.description || '').slice(0, 120),
            pack: 'utility',
            path: top,
          })
        }
      }
    }
  }
  return entries
}

function printTable(entries: SkillEntry[]) {
  const groups = new Map<string, SkillEntry[]>()
  for (const e of entries) {
    if (!groups.has(e.pack)) groups.set(e.pack, [])
    groups.get(e.pack)!.push(e)
  }
  const order = ['ba', 'sa', 'dev', 'qa', 'cross', 'utility']
  for (const pack of order) {
    const items = groups.get(pack)
    if (!items || items.length === 0) continue
    console.log(`\n[${pack}] (${items.length})`)
    for (const e of items.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  /fis:${pack === 'utility' ? '' : `${pack}:`}${e.name.padEnd(26)} ${e.description}`)
    }
  }
}

export async function skillsCommand(args: string[]): Promise<void> {
  const target = process.cwd()
  const skillsDir = join(target, 'claude', 'skills')

  if (!existsSync(skillsDir)) {
    console.error('❌ claude/skills/ not found in current project.')
    console.error('   Run `fis install --from <git-url>` first.')
    process.exit(1)
  }

  let query: string | null = null
  let packFilter: string | null = null
  let asJson = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--pack' && args[i + 1]) { packFilter = args[++i] }
    else if (a === '--json') { asJson = true }
    else if (!a.startsWith('--')) { query = a }
  }

  let entries = walkSkills(skillsDir)
  if (packFilter) entries = entries.filter((e) => e.pack === packFilter)
  if (query) {
    const q = query.toLowerCase()
    entries = entries.filter(
      (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    )
  }

  if (asJson) {
    console.log(JSON.stringify(entries, null, 2))
    return
  }

  if (entries.length === 0) {
    console.log('No skills match the filter.')
    return
  }

  console.log(`Found ${entries.length} skill(s):`)
  printTable(entries)
}
