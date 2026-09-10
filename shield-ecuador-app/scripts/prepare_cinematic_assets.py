"""Copy supplied artwork without altering it; stage the separate practice demo."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'frontend/public/cinematic'
DEST.mkdir(parents=True, exist_ok=True)
for name in ('sensei.jpg', 'kira.jpg', 'aria.jpg', 'hacker.jpg', 'victory.jpg', 'duel.jpg', 'sensei.mp4', 'sensei-poster.jpg'):
    shutil.copy2(ROOT / 'proposal/assets' / name, DEST / name)
shutil.copy2(ROOT / 'imagen/56d85ecf-e627-4bce-8bdd-afe672b9bf45.webp', DEST / 'doggoteka.webp')
source = ROOT / 'videos/ejemplos/cyber_dojo_combate_completo_con_personajes (2)'
for name, avatar, fiche in [
    ('kai','avatar_sensei_kai_cinturon_negro.jpg','01_ficha_sensei_kai_cinturon_negro.png'),
    ('phishing','avatar_phishing_te_enganan.jpg','02_ficha_phishing_te_enganan_para_robarte.png'),
    ('aria','avatar_aria_cinturon_amarillo.jpg','04_ficha_aria_karate_cinturon_amarillo.png'),
    ('malware','avatar_malware_infecta_dispositivos.jpg','05_ficha_malware_infecta_tus_dispositivos.png'),
    ('sensei','avatar_sensei_ren.jpg','07_ficha_sensei_ren_karate.png'),
    ('hacker','avatar_el_hacker.jpg','08_ficha_el_hacker_roban_tus_datos.png'),
    ('kira','avatar_kira_sensei.jpg','10_ficha_kira_cyber_sensei.png'),
    ('virus','avatar_virus_corruptor.jpg','11_ficha_virus_crimson_blade.png'),
]:
    shutil.copy2(source / 'avatares' / avatar, DEST / (name + '.jpg'))
    shutil.copy2(source / fiche, DEST / (name + '-ficha.png'))

demo = ROOT / 'frontend/public/demo'
demo.mkdir(parents=True, exist_ok=True)
for name in ('index.html','app.js','style.css'):
    text = (ROOT / 'proposal' / name).read_text(encoding='utf-8-sig')
    text = text.replace('/assets/', '/cinematic/').replace("'/bank.json'", "'/demo/bank.json'")
    text = text.replace('href="/style.css"', 'href="/demo/style.css"').replace('src="/app.js"', 'src="/demo/app.js"')
    if name == 'app.js':
        text = """try { const savedRoute = localStorage.getItem('ciberdojo-demo-route'); if (!location.hash && /^#(?:inicio|camino|guias|dojo\\/[a-z-]+|kata\\/[a-z-]+)$/.test(savedRoute || '')) location.hash = savedRoute; } catch {}
window.addEventListener('hashchange', () => { try { localStorage.setItem('ciberdojo-demo-route', location.hash); } catch {} });
""" + text
    (demo / name).write_text(text, encoding='utf-8')
shutil.copy2(ROOT / 'Banco de preguntas/optimizado/banco_700_preguntas_300_casos.json', demo / 'bank.json')
print('Supplied character artwork and isolated practice demo staged.')
