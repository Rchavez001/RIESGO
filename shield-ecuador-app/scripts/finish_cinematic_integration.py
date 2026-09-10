from pathlib import Path
import shutil
ROOT = Path(__file__).resolve().parents[1]

app = ROOT / 'proposal/app.js'
s = app.read_text(encoding='utf-8')
s = s.replace("mentor:'sensei'", "mentor:'doggoteka'")
s = s.replace("const mentorNames={sensei:", "const mentorNames={doggoteka:'DoggoTeka',sensei:")
s = s.replace("/assets/${state.mentor}.jpg", "/assets/${state.mentor==='doggoteka'?'doggoteka.webp':state.mentor+'.jpg'}")
s = s.replace("/assets/${id}.jpg", "/assets/${id==='doggoteka'?'doggoteka.webp':id+'.jpg'}")
s = s.replace("[['sensei','Sensei Ren'", "[['doggoteka','DoggoTeka','Nuestra mascota y tu compañero especial: pausa, revisa y sigue con confianza.'],['sensei','Sensei Ren'")
s = s.replace('<h1>La calma también<br>es una <em>defensa.</em></h1>', '<h1 class="new-headline"><small>APRENDE GRATIS A</small>DEFENDERTE<small>DE LOS</small><em>CIBERATAQUES</em></h1>')
s = s.replace('${beltTrack()}<div class="section-head">', '${beltTrack()}<a class="demo-doggo" href="/personajes/doggoteka" target="_parent"><img src="/assets/doggoteka.webp" alt="DoggoTeka, mascota del dojo"><div><span class="eyebrow">TU COMPAÑERO ESPECIAL</span><h2>DoggoTeka</h2><p>¡Pausa, revisa y sigue con confianza!</p><span>Conocer mi ficha ↗</span></div></a><div class="section-head">')
app.write_text(s, encoding='utf-8')
shutil.copy2(ROOT/'imagen/56d85ecf-e627-4bce-8bdd-afe672b9bf45.webp', ROOT/'proposal/assets/doggoteka.webp')
css = ROOT / 'proposal/style.css'
s = css.read_text(encoding='utf-8-sig')
if '.demo-doggo{' not in s:
    s += '''
.hero .new-headline{font-size:clamp(32px,4.2vw,65px)}.new-headline small{display:block;font:14px 'Trebuchet MS';letter-spacing:3px;margin:14px 0}.new-headline em{display:block}.demo-doggo{display:grid;grid-template-columns:160px 1fr;gap:26px;align-items:center;padding:24px;background:#1d261e;border:1px solid #81704666;margin-top:35px}.demo-doggo>img{width:160px;height:100px;object-fit:cover;object-position:top}.demo-doggo h2{font-size:32px;margin:10px 0}.demo-doggo p{font-size:14px;color:#c2ccb4}.demo-doggo span:last-child{color:var(--gold);font-size:12px}.guides{grid-template-columns:repeat(4,1fr)}
@media(max-width:700px){.hero .new-headline{font-size:8.5vw}.demo-doggo{grid-template-columns:90px 1fr;padding:18px;gap:15px}.demo-doggo>img{width:90px;height:100px}.demo-doggo h2{font-size:28px}.guides{grid-template-columns:1fr}}
'''
css.write_text(s,encoding='utf-8')

# Remove the now unused rotating threat decoration from the shared shell.
p=ROOT/'frontend/src/components/CyberBushido.tsx'
s=p.read_text(encoding='utf-8')
start=s.find('const THREAT_IMAGES = [')
if start>=0:
    end=s.index('] as const',start)+len('] as const')
    s=s[:start]+s[end:]
start=s.find('// Isolated so the 1.5s image cycle')
if start>=0:
    end=s.index('export function DojoShell',start)
    s=s[:start]+s[end:]
s=s.replace('<span>NIVEL DE CHI</span>','<span>PUNTOS DE APRENDIZAJE</span>')
p.write_text(s,encoding='utf-8')
print('Demo, mascot and shared navigation updated.')
