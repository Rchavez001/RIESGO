import { campaignImageUrl, safeHttpUrl } from './safeUrl'

const SUPA = 'https://abc.supabase.co'

test('un enlace solo es válido si es http(s)', () => {
  expect(safeHttpUrl('https://ejemplo.com/a?b=1')).toBe('https://ejemplo.com/a?b=1')
  expect(safeHttpUrl('http://ejemplo.com')).toBe('http://ejemplo.com/')
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd', '//evil.com', 'not a url', '', null, undefined]) {
    expect(safeHttpUrl(bad)).toBeNull()
  }
})

test('una imagen de campaña solo se acepta si es de nuestro bucket público por https', () => {
  expect(campaignImageUrl(`${SUPA}/storage/v1/object/public/campaign-ads/1-abc.png`, SUPA)).toBe(`${SUPA}/storage/v1/object/public/campaign-ads/1-abc.png`)
  for (const bad of [
    'https://evil.example/pixel.gif',                                        // otro servidor
    `${SUPA}/storage/v1/object/public/otro-bucket/x.png`,                    // otro bucket
    `http://abc.supabase.co/storage/v1/object/public/campaign-ads/x.png`,    // sin https
    'https://other.supabase.co/storage/v1/object/public/campaign-ads/x.png', // otro proyecto
    'javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', '',
  ]) expect(campaignImageUrl(bad, SUPA)).toBeNull()
})
