"""Exercise the deployed RPCs with an isolated temporary account; log no tokens."""
import json
import subprocess
import uuid
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
REF = (ROOT / 'supabase/.temp/project-ref').read_text().strip()
BASE = f'https://{REF}.supabase.co'
CLI = str(Path.home() / 'scoop/shims/supabase.exe')
keys = json.loads(subprocess.run([CLI, 'projects', 'api-keys', '--project-ref', REF, '-o', 'json'], check=True, capture_output=True, text=True).stdout)
service = next(k['api_key'] for k in keys if k['name'] == 'service_role')
anon = next(k['api_key'] for k in keys if k['name'] == 'anon')
bank = json.loads((ROOT / 'Banco de preguntas/optimizado/banco_700_preguntas_300_casos.json').read_text(encoding='utf-8'))
by_id = {q['id']: q for q in bank['items']}


def call(path, payload=None, token=None, key=None, method=None):
    req = Request(BASE + path, data=json.dumps(payload).encode() if payload is not None else None,
                  headers={'apikey': key or service, 'Authorization': 'Bearer ' + (token or service), 'Content-Type': 'application/json'},
                  method=method or ('POST' if payload is not None else 'GET'))
    try:
        with urlopen(req, timeout=45) as response:
            body = response.read()
            return json.loads(body) if body else None
    except HTTPError as error:
        # Error payloads may include operational details; expose only status here.
        data = json.loads(error.read() or '{}')
        raise RuntimeError(f'HTTP {error.code}: {data.get("message", data.get("msg", "request failed"))}') from None


uid = None
try:
    email = f'learning-deploy-test-{uuid.uuid4().hex}@example.invalid'
    password = uuid.uuid4().hex + '-Aa9!'
    account = call('/auth/v1/admin/users', {'email': email, 'password': password, 'email_confirm': True})
    uid = account['id']
    existing = call('/rest/v1/users?id=eq.' + uid + '&select=id')
    if not existing:
        call('/rest/v1/users', {'id': uid, 'email': email, 'full_name': 'Prueba temporal de despliegue', 'role': 'user', 'belt': 'white', 'total_points': 0})
    session = call('/auth/v1/token?grant_type=password', {'email': email, 'password': password}, key=anon, token=anon)
    token = session['access_token']
    def rpc(name, args=None):
        return call('/rest/v1/rpc/' + name, args or {}, token=token, key=anon)
    overview = rpc('learning_overview')
    assert len(overview) == 7 and overview[0]['unlocked'] and not overview[1]['unlocked']
    try:
        rpc('learning_start_exam', {'p_code': 'EXAM_BLANCO_AMARILLO'})
        raise AssertionError('Exam opened without training')
    except RuntimeError as e:
        assert '30' in str(e), str(e)
    state = rpc('learning_state', {'p_dojo': 'passwords'})
    for i in range(30):
        q = state['question']
        state = rpc('learning_answer', {'p_dojo': 'passwords', 'p_question': q['id'], 'p_answer': (q['correct'] + 1) % 4})
        if i in (0, 16):
            assert rpc('learning_state', {'p_dojo': 'passwords'}) == state
        if i < 29:
            state = rpc('learning_next', {'p_dojo': 'passwords', 'p_question': q['id']})
    assert state['complete'] and state['answered'] == 30
    exam = rpc('learning_start_exam', {'p_code': 'EXAM_BLANCO_AMARILLO'})
    assert len(exam['cases']) == 5 and exam['cases'][4]['sublevel'] == 3
    assert all('correct' not in q and 'feedback_correct' not in q for q in exam['cases'])
    for i in range(5):
        q = exam['cases'][i]
        answer = by_id[q['id']]['correct']
        exam = rpc('learning_exam_answer', {'p_attempt': exam['id'], 'p_case': q['id'], 'p_answer': answer if i < 4 else (answer + 1) % 4})
    assert exam['finished'] and exam['passed'] and exam['score'] == 4
    assert exam['cases'][4]['explanation']
    profile = call('/rest/v1/users?id=eq.' + uid + '&select=belt,total_points')[0]
    assert profile == {'belt': 'yellow', 'total_points': 250}, profile
    assert rpc('learning_overview')[1]['unlocked']
    print('PASS online: seven dojos, exam prerequisite, 30 saved answers, resume, private five-case exam, 4/5 pass, yellow belt and 250 points.')
finally:
    if uid:
        # Delete only the exact account created by this run; never other learners.
        call('/rest/v1/users?id=eq.' + uid, method='DELETE')
        call('/auth/v1/admin/users/' + uid, method='DELETE')
        print('Temporary test account removed.')
