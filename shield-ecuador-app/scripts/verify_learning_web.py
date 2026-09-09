"""Confirm a public deployment serves the exact locally-tested JavaScript."""
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

base = sys.argv[1].rstrip('/')
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'frontend/build/asset-manifest.json').read_text())
asset = manifest['files']['main.js']

def get(path):
    with urlopen(Request(base + path, headers={'Cache-Control': 'no-cache'}), timeout=45) as response:
        assert response.status == 200
        return response.read()

release = json.loads(get('/release.json'))
assert release['release'] == 'learning-30-v3'
for route in ('/', '/login', '/dojos'):
    assert asset.encode() in get(route), route
expected = (root / 'frontend/build' / asset.lstrip('/')).read_bytes()
assert hashlib.sha256(get(asset)).digest() == hashlib.sha256(expected).digest()
print('PASS public web:', base, '| release learning-30-v3 | routes and JavaScript match the tested build')
