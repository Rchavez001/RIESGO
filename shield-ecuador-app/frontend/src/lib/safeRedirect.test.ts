import { safeLocalPath } from './safeRedirect'

test.each([
  ['/dojos', '/dojos'],
  ['/dojo/passwords?x=1#a', '/dojo/passwords?x=1#a'],
  ['/kata/K1', '/kata/K1'],
])('keeps the in-app path %s', (input, expected) => {
  expect(safeLocalPath(input)).toBe(expected)
})

const BS = String.fromCharCode(92) // backslash, spelled out to avoid escape ambiguity

test.each([
  ['//evil.com'],
  ['/' + BS + 'evil.com'],
  ['/' + BS + '/evil.com'],
  ['https://evil.com/x'],
  ['javascript:alert(1)'],
  ['/ok' + String.fromCharCode(0) + '/../..'],
  ['/login'],
  ['/auth/callback?next=/x'],
  [''],
  [null],
  [undefined],
])('falls back for %p', (input) => {
  expect(safeLocalPath(input as string | null | undefined)).toBe('/dashboard')
})

test('custom fallback', () => {
  expect(safeLocalPath('//evil.com', '/dojos')).toBe('/dojos')
})
