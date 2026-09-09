"""Stage the already-tested static build without source credentials or local files."""
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
stage = root / '.deploy' / 'cyberdojo-learning-30'
stage.mkdir(parents=True, exist_ok=True)
shutil.copytree(root / 'frontend/build', stage / 'build', dirs_exist_ok=True)
shutil.copy2(root / 'frontend/static-server.js', stage / 'static-server.js')
(stage / 'Dockerfile').write_text('FROM node:22-alpine\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --chown=node:node build ./build\nCOPY --chown=node:node static-server.js ./static-server.js\nUSER node\nEXPOSE 8080\nCMD ["node", "static-server.js"]\n', encoding='utf-8')
(stage / '.gcloudignore').write_text('.git\n.env*\nnode_modules/\n', encoding='utf-8')
(stage / 'build/release.json').write_text(json.dumps({'release': 'learning-30-v3', 'questions': 700, 'cases': 300, 'questions_per_dojo': 30, 'cases_per_exam': 5}), encoding='utf-8')
print(str(stage))
