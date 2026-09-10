// Browser integration with isolated API fixtures. Never creates or alters real accounts.
const {chromium}=require('@playwright/test')
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const base='http://localhost:3001',out=path.resolve(__dirname,'../test-results/cinematic')
fs.mkdirSync(out,{recursive:true})
const bank=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../Banco de preguntas/optimizado/banco_700_preguntas_300_casos.json'),'utf8'))
const all=Object.fromEntries(bank.items.map(q=>[q.id,q])),dojo=bank.dojos[0]
const uid='11111111-1111-4111-8111-111111111111'
async function fixture(context,loggedIn=false){
  const calls=[];let cursor=0;const answers=[];let exam=null
  if(loggedIn)await context.addInitScript(({uid})=>{
    const encode=o=>btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
    const now=Math.floor(Date.now()/1000)
    const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:now+86400,iat:now,role:'authenticated',aud:'authenticated',email:'prueba@example.invalid'})+'.test'
    if(!localStorage.getItem('sb-wbbcjiqzbzswxsmwjqlw-auth-token'))localStorage.setItem('sb-wbbcjiqzbzswxsmwjqlw-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:now+86400,expires_in:86400,token_type:'bearer',user:{id:uid,email:'prueba@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}}))
  },{uid})
  const state=()=>({dojo:dojo.id,cursor,answered:answers.length,total:30,complete:answers.length===30,selected:answers[cursor]??null,question:all[dojo.question_ids[cursor]],version:'3.0.0'})
  await context.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.hostname==='localhost'||u.hostname==='127.0.0.1')return route.continue()
    if(!u.hostname.endsWith('.supabase.co'))return route.abort()
    const p=u.pathname,body=route.request().postDataJSON()||{};calls.push(p)
    let data=[]
    if(p.endsWith('get-private-profile'))data={id:uid,full_name:'Aprendiz de prueba',email:'prueba@example.invalid',role:'user',belt:'white',total_points:0,business_type:'Comerciante'}
    else if(p.endsWith('get-ranking'))data={ranking:[]}
    else if(p.endsWith('get_next_campaign_for_user'))data=null
    else if(p.endsWith('learning_overview'))data=bank.dojos.map((d,i)=>({id:d.id,unlocked:i===0,answered:i===0?answers.length:0,passed:false}))
    else if(p.endsWith('learning_state'))data=state()
    else if(p.endsWith('learning_answer')){answers[cursor]=body.p_answer;data=state()}
    else if(p.endsWith('learning_next')){cursor++;data=state()}
    else if(p.endsWith('learning_start_exam')){
      if(answers.length<30)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Primero responde las 30 preguntas.'})})
      if(!exam){const used=new Set(),cases=[1,1,2,2,3].map(level=>{const q=bank.items.find(q=>q.kind==='case'&&q.belt===dojo.belt&&q.sublevel===level&&!used.has(q.family));used.add(q.family);return q});exam={id:'fixture-exam',dojo:dojo.id,belt:'blanco',cases,answers:{},finished:false,score:null,passed:null}}
      data=exam
    }else if(p.endsWith('learning_exam_answer')){exam.answers[body.p_case]=body.p_answer;if(Object.keys(exam.answers).length===5){exam.finished=true;exam.score=exam.cases.filter(q=>exam.answers[q.id]===q.correct).length;exam.passed=exam.score>=4}data=exam}
    else if(p.endsWith('ask-sensei'))data={consultation_id:'fixture-consult',is_cybersecurity:true,validation_reason:'Explicación de prueba',answer:'No compartas ese código. Abre tú la aplicación del banco para verificar.',ask_more_prompt:'¿Quieres otro ejemplo?'}
    else if(p.endsWith('/auth/v1/user'))data={id:uid,email:'prueba@example.invalid'}
    else if(p.endsWith('/auth/v1/logout'))data={}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  return {calls,getExam:()=>exam}
}
;(async()=>{const browser=await chromium.launch({headless:true});try{
  const guest=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  await fixture(guest);const page=await guest.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base);await page.getByRole('heading',{name:/APRENDE GRATIS A/}).waitFor()
  assert.equal(await page.locator('.real-karate-belt').count(),7)
  await page.screenshot({path:path.join(out,'home-desktop.png'),fullPage:true})
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'home-mobile.png'),fullPage:true})
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Landing mobile overflow')
  await page.goto(base+'/personajes/doggoteka');await page.getByRole('heading',{name:'DoggoTeka',exact:true}).waitFor()
  await page.screenshot({path:path.join(out,'doggoteka-mobile.png'),fullPage:true})
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'doggoteka-desktop.png'),fullPage:true})
  await page.locator('.character-sheet').screenshot({path:path.join(out,'Ficha-DoggoTeka.png')})
  await page.pdf({path:path.join(out,'Ficha-DoggoTeka.pdf'),format:'A4',printBackground:true,margin:{top:'15mm',bottom:'15mm',left:'15mm',right:'15mm'}})
  await page.goto(base+'/personajes/kira');await page.getByRole('button',{name:'Elegir como compañero'}).click();await page.reload();await page.getByRole('button',{name:'Es mi compañero ✓'}).waitFor()
  await page.goto(base+'/personajes');await page.getByRole('button',{name:'Adversarios',exact:true}).click();assert.equal(await page.locator('.character-card').count(),4)
  await page.getByRole('button',{name:'Aliados',exact:true}).click();assert.equal(await page.locator('.character-card').count(),5)
  await page.goto(base+'/login?mode=register');await page.locator('.auth-card').waitFor();await page.screenshot({path:path.join(out,'register.png'),fullPage:true})
  await page.goto(base+'/sensei');await page.waitForURL('**/login');assert(await page.locator('.auth-card').isVisible(),'Guest routes remain protected')
  await page.goto(base+'/practica');const demo=page.frameLocator('iframe');await demo.getByRole('heading',{name:/APRENDE GRATIS A/}).waitFor();await demo.locator('[data-action="train"]').first().click();await demo.locator('[data-action="answer:passwords:0"]').click();await demo.locator('.feedback').waitFor();await page.reload();await demo.locator('.feedback').waitFor()
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS public: headline, 7 belts, DoggoTeka, 9 fiches, persisted companion, PDF, protected routes, isolated practice, mobile.')
  if(process.argv.includes('--public-only'))return
  const auth=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),api=await fixture(auth,true)
  const app=await auth.newPage();app.on('pageerror',e=>errors.push(e.message))
  await app.goto(base+'/dashboard');await app.getByRole('heading',{name:'Hoy entrenas para la vida real.'}).waitFor();await app.locator('.dashboard-current').waitFor()
  assert((await app.locator('.dojo-sidebar .train-now').boundingBox()).height>=44,'Sidebar training action remains readable')
  await app.screenshot({path:path.join(out,'dashboard.png'),fullPage:true})
  await app.goto(base+'/perfil');await app.getByLabel('Mi compañero de aprendizaje').selectOption('kira');await app.reload();assert.equal(await app.getByLabel('Mi compañero de aprendizaje').inputValue(),'kira')
  await app.goto(base+'/dojos');await app.getByText('0 de 30 preguntas respondidas').first().waitFor();assert(await app.getByRole('button',{name:'Kata · 5 casos'}).first().isDisabled())
  await app.goto(base+'/dojo/passwords');await app.locator('.answer-option').first().waitFor();assert.equal(await app.getByLabel('Mi compañero de aprendizaje').inputValue(),'kira')
  await app.locator('.answer-option').first().click();await app.locator('.combat-feedback').waitFor();await app.reload();await app.locator('.combat-feedback').waitFor()
  await app.screenshot({path:path.join(out,'question.png'),fullPage:true})
  await app.setViewportSize({width:390,height:844});await app.screenshot({path:path.join(out,'question-mobile.png'),fullPage:true});assert(await app.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Question mobile overflow')
  await app.setViewportSize({width:1440,height:1000})
  for(let i=1;i<30;i++){await app.getByRole('button',{name:/Ya leí la explicación/}).click();await app.locator('.answer-option').first().click();await app.locator('.combat-feedback').waitFor()}
  await app.getByRole('button',{name:'Presentar mi examen'}).click();await app.getByText('Caso 1 de 5',{exact:true}).waitFor()
  await app.screenshot({path:path.join(out,'kata.png'),fullPage:true})
  for(let i=0;i<5;i++){const q=api.getExam().cases[i];await app.locator('.answer-option').nth(q.correct).click();await app.getByRole('button',{name:i===4?'Enviar y ver resultado':'Enviar y continuar',exact:true}).click();if(i<4)await app.getByText(new RegExp(`Caso ${i+2} de 5`)).waitFor()}
  await app.getByRole('heading',{name:'¡Aprobaste tu kata!'}).waitFor();assert(api.getExam().passed);assert.equal(await app.locator('.learning-review').count(),5)
  await app.goto(base+'/sensei');await app.getByLabel('Tu pregunta para el sensei').fill('¿Comparto el código que me pidió un mensaje?');await app.getByRole('button',{name:'Preguntar',exact:true}).click();await app.getByText(/No compartas ese código/).waitFor();await app.screenshot({path:path.join(out,'sensei.png'),fullPage:true})
  await app.goto(base+'/ranking');await app.getByText(/Aun no hay guerreros/).waitFor();await app.screenshot({path:path.join(out,'ranking.png'),fullPage:true})
  await app.goto(base+'/escaner');await app.getByRole('button',{name:/INICIAR DIAGNÓSTICO/}).click();await app.getByRole('button',{name:/Comenzar escaneo/}).click();await app.getByRole('button',{name:/Descargar reporte/}).waitFor({timeout:30000});await app.screenshot({path:path.join(out,'scanner.png'),fullPage:true});const download=app.waitForEvent('download');await app.getByRole('button',{name:/Descargar reporte/}).click();assert((await download).suggestedFilename().endsWith('.txt'))
  await app.goto(base+'/dashboard');await app.locator('.dojo-sidebar').getByRole('button',{name:'Desafiando al Sensei'}).click();await app.getByRole('dialog',{name:'Desafiando al Sensei'}).waitFor();await app.screenshot({path:path.join(out,'challenge.png'),fullPage:true});await app.getByRole('button',{name:'Cerrar',exact:true}).click()
  await app.locator('.dojo-sidebar').getByRole('button',{name:'Salir de la aplicacion'}).click();await app.waitForURL('**/login')
  assert.equal(errors.length,0,errors.join('\n'));assert(api.calls.some(p=>p.endsWith('learning_exam_answer')));assert(api.calls.some(p=>p.endsWith('ask-sensei')))
  console.log('PASS application with API fixtures: account shell, real RPC wiring, 30 questions, resume, 5-case kata, reviews, companion, chat, ranking, scanner/download, challenge, sign-out. No production writes.')
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1})
