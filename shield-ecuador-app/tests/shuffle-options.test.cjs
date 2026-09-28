// Unit test for shuffleOptions/buildOptions in supabase/functions/_shared/news-agent-core.ts —
// Moodle rule #7 (the correct answer shouldn't fall in the same position every time). The rest of
// that file imports Deno-only modules (createClient, mammoth, pdf.js) that can't load in Node, so
// this pulls out just the two functions under test by source range and evals them in isolation,
// the same way tests/url-guard.test.cjs isolates its own pure functions.
// Run: node tests/shuffle-options.test.cjs
const fs = require('fs')
const path = require('path')
const ts = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'typescript'))

const srcPath = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'news-agent-core.ts')
const src = fs.readFileSync(srcPath, 'utf8')

function extract(fnStartMarker) {
  const start = src.indexOf(fnStartMarker)
  if (start === -1) throw new Error(`marker not found: ${fnStartMarker}`)
  let depth = 0
  let i = src.indexOf('{', start)
  const bodyStart = i
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break } }
  }
  return src.slice(start, i)
}

const shuffleSrc = extract('export function shuffleOptions')
const buildSrc = extract('export function buildOptions')

const transpiled = ts.transpileModule(
  shuffleSrc.replace('export function', 'function') + '\n' + buildSrc.replace('export function', 'function') + '\nmodule.exports = { shuffleOptions, buildOptions }',
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } },
).outputText

const mod = { exports: {} }
new Function('module', 'exports', transpiled)(mod, mod.exports)
const { shuffleOptions, buildOptions } = mod.exports

let failures = 0
function check(name, condition) {
  if (!condition) { failures++; console.error('FAIL:', name) } else { console.log('ok:', name) }
}

// shuffleOptions: same elements, none lost or duplicated, order eventually varies.
{
  const input = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }]
  const out = shuffleOptions(input)
  check('shuffleOptions returns all 4 elements', out.length === 4)
  check('shuffleOptions preserves the set of values', [...out].map((o) => o.v).sort().join(',') === '1,2,3,4')
  check('shuffleOptions does not mutate the input array', input[0].v === 1 && input[3].v === 4)

  const positions = new Set()
  for (let i = 0; i < 200; i++) {
    const shuffled = shuffleOptions([{ id: 'correct' }, { id: 'a' }, { id: 'b' }, { id: 'c' }])
    positions.add(shuffled.findIndex((o) => o.id === 'correct'))
  }
  check('shuffleOptions puts the first element in more than one position over 200 runs', positions.size > 1)
}

// buildOptions: exactly one correct option, all 4 letters used, correct answer not always "A".
{
  let alwaysA = true
  for (let i = 0; i < 200; i++) {
    const options = buildOptions('La correcta', ['Mala 1', 'Mala 2', 'Mala 3'])
    check3(options)
    if (options.find((o) => o.correcta).valor !== 'A') alwaysA = false
  }
  check('buildOptions: the correct answer is not always in position A over 200 runs', !alwaysA)

  function check3(options) {
    if (options.length !== 4) { failures++; console.error('FAIL: buildOptions returns 4 options, got', options.length) }
    const correctCount = options.filter((o) => o.correcta).length
    if (correctCount !== 1) { failures++; console.error('FAIL: buildOptions marks exactly one option correct, got', correctCount) }
    const letters = options.map((o) => o.valor).sort().join(',')
    if (letters !== 'A,B,C,D') { failures++; console.error('FAIL: buildOptions uses letters A-D exactly once, got', letters) }
    const correct = options.find((o) => o.correcta)
    if (!correct || correct.texto !== 'La correcta') { failures++; console.error('FAIL: buildOptions keeps the given correct answer text') }
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll checks passed.')
