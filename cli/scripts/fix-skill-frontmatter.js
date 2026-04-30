#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const ALLOWED_TOP = new Set([
  'name', 'description', 'argument-hint', 'compatibility',
  'disable-model-invocation', 'license', 'user-invokable', 'metadata'
])

function findSkillFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findSkillFiles(full))
    } else if (entry.name === 'SKILL.md') {
      results.push(full)
    }
  }
  return results
}

function fixFrontmatter(filepath) {
  const content = fs.readFileSync(filepath, 'utf8')
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) {
    console.log(`SKIP no frontmatter: ${filepath}`)
    return false
  }
  const [, fm, body] = m
  const folderName = path.basename(path.dirname(filepath))

  const lines = fm.split('\n')
  const topLines = []
  const metaLines = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const keyMatch = line.match(/^([a-zA-Z_-]+):(.*)$/)
    if (keyMatch) {
      const [, key] = keyMatch
      if (key === 'name') {
        topLines.push(`name: ${folderName}`)
        i++
        continue
      }
      if (ALLOWED_TOP.has(key)) {
        // copy this line and any following indented lines
        topLines.push(line)
        i++
        while (i < lines.length && /^[\s]/.test(lines[i])) {
          topLines.push(lines[i])
          i++
        }
        continue
      }
      // unknown key → move to metadata
      metaLines.push(`  ${line}`)
      i++
      while (i < lines.length && /^[\s]/.test(lines[i])) {
        metaLines.push(`  ${lines[i]}`)
        i++
      }
      continue
    }
    // non-key line at top level — skip empty
    if (line.trim() === '') {
      i++
      continue
    }
    topLines.push(line)
    i++
  }

  let newFm = topLines.join('\n')
  if (metaLines.length > 0) {
    newFm += '\nmetadata:\n' + metaLines.join('\n')
  }

  const newContent = `---\n${newFm}\n---\n${body}`
  fs.writeFileSync(filepath, newContent)
  console.log(`FIXED: ${filepath}`)
  return true
}

const root = process.argv[2] || path.join(__dirname, '..', '..', 'claude', 'skills')
const files = findSkillFiles(root)
console.log(`Found ${files.length} SKILL.md files`)
let count = 0
for (const f of files) {
  if (fixFrontmatter(f)) count++
}
console.log(`Done. Fixed ${count} files.`)
