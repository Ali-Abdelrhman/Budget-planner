// Fails the build if UI source contains banned copy: em dashes, "unleash" or "leverage".
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const banned = [
  { re: /—/, label: 'em dash' },
  { re: /\bunleash/i, label: '"unleash"' },
  { re: /\bleverag/i, label: '"leverage"' },
]
const roots = ['src', 'index.html']
const problems = []

function walk(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) walk(join(path, entry))
    return
  }
  if (!/\.(tsx?|css|html|json|md)$/.test(path)) return
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const b of banned) if (b.re.test(line)) problems.push(`${path}:${i + 1}  ${b.label}`)
    })
}

roots.forEach(walk)

if (problems.length) {
  console.error('Banned copy found:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('Copy check passed.')
