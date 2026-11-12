from pathlib import Path
import json

def write(name,text):
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
write('scripts/build-pwa.mjs',r'''import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=(await readdir('dist/assets')).map(name=>`/assets/${name}`).sort();
const urls=['/index.html','/manifest.json','/logo.jpg',...assets];
const hash=createHash('sha256');for(const url of urls)hash.update(await readFile('dist'+url));
const version=hash.digest('hex').slice(0,20);
const sw=`/* Generated static-only offline shell. Never caches auth/API/user data. */
const CACHE='fitnutricion-shell-${version}';
const FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('fitnutricion-shell-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='ACTIVATE_UPDATE')return;
 event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(clients.length>1){event.source?.postMessage({type:'UPDATE_BLOCKED'});return;}
  await self.skipWaiting();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||request.headers.has('Authorization'))return;
 if(request.mode==='navigate'){
  event.respondWith(caches.open(CACHE).then(async cache=>await cache.match('/index.html')||fetch(request)));return;
 }
 if(!FILES.includes(url.pathname)||url.search)return;
 event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(url.pathname)||fetch(request)));
});
`;
await writeFile('dist/sw.js',sw);console.log(`Offline shell ${version}: ${urls.length} public resources`);
''')
write('src/components/navigation/PwaStatus.tsx',r'''import {useEffect,useRef,useState} from 'react';
import {useNutritionStore} from '../../store/useNutritionStore';
export function PwaStatus(){
 const [waiting,setWaiting]=useState<ServiceWorker|null>(null),[notice,setNotice]=useState('');
 const accepting=useRef(false);const activeWorkout=useNutritionStore(s=>s.activeWorkoutDraft);
 useEffect(()=>{
  if(!import.meta.env.PROD||!('serviceWorker'in navigator))return;
  let alive=true;let registration:ServiceWorkerRegistration|undefined;
  const check=()=>{if(alive&&registration?.waiting)setWaiting(registration.waiting);};
  const change=()=>{if(accepting.current)window.location.reload();};
  const message=(event:MessageEvent)=>{if(event.data?.type==='UPDATE_BLOCKED'){accepting.current=false;setNotice('Cierra las otras pestañas de FitNutrición antes de actualizar.');}};
  navigator.serviceWorker.addEventListener('controllerchange',change);navigator.serviceWorker.addEventListener('message',message);
  void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>{
   registration=r;check();r.addEventListener('updatefound',()=>r.installing?.addEventListener('statechange',check));
  }).catch(()=>{if(alive)setNotice('No se pudo preparar la apertura sin conexión. Tus datos locales no se borraron.');});
  return ()=>{alive=false;navigator.serviceWorker.removeEventListener('controllerchange',change);navigator.serviceWorker.removeEventListener('message',message);};
 },[]);
 if(!waiting&&!notice)return null;
 return <aside className="border-b bg-amber-50 p-3 text-sm" role="status">{notice||'Hay una versión nueva disponible.'}{waiting&&<button type="button" disabled={!!activeWorkout} className="ml-3 underline" onClick={()=>{accepting.current=true;waiting.postMessage({type:'ACTIVATE_UPDATE'});}}>Actualizar y recargar</button>}{waiting&&activeWorkout&&<span> Finaliza o guarda tu entrenamiento antes de actualizar.</span>}</aside>;
}
''')
p=Path('src/App.tsx');s="import { PwaStatus } from './components/navigation/PwaStatus';\n"+p.read_text();s=s.replace('      {/* ====================================================================\n          BARRA SUPERIOR','      <PwaStatus/>\n      {/* ====================================================================\n          BARRA SUPERIOR');s=s.replace('return <AuthScreen />;','return <><PwaStatus/><AuthScreen /></>;');p.write_text(s)
p=Path('package.json');data=json.loads(p.read_text());data['scripts'].update({'build':'tsc -b && vite build && node scripts/build-pwa.mjs','lint':'eslint src scripts tests *.ts *.mjs --no-warn-ignored','format':'prettier --write src scripts tests *.ts *.mjs *.json *.md docs .github','format:check':'prettier --check src scripts tests *.ts *.mjs *.json *.md docs .github','test':'vitest run','test:e2e':'playwright test','seed:generate':'node scripts/generate-seed.mjs','typecheck':'tsc -b','audit':'npm audit --audit-level=high'});p.write_text(json.dumps(data,indent=2)+'\n')
write('vitest.config.ts',"import {defineConfig} from 'vitest/config';\nexport default defineConfig({test:{include:['src/**/*.test.ts'],restoreMocks:true}});\n")
write('playwright.config.ts',"import {defineConfig,devices} from '@playwright/test';\nexport default defineConfig({testDir:'./tests/e2e',fullyParallel:true,retries:process.env.CI?1:0,reporter:'list',use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',timezoneId:'America/Argentina/Mendoza'},projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI}});\n")
write('eslint.config.mjs',r'''import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
export default tseslint.config(
 {ignores:['dist/**','node_modules/**','src/data/**','.review/**','scripts/organize-imports.cjs']},
 js.configs.recommended,...tseslint.configs.recommended,
 {languageOptions:{globals:{...globals.browser,...globals.node}},rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'@typescript-eslint/no-explicit-any':'warn','no-empty':['error',{allowEmptyCatch:true}]}},
 {files:['src/**/*.tsx'],plugins:{'react-hooks':hooks,'jsx-a11y':a11y},rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','jsx-a11y/alt-text':'error','jsx-a11y/label-has-associated-control':'error'}},
 {files:['src/services/legacyCloudReader.ts','scripts/ingest-opengym.ts'],rules:{'@typescript-eslint/no-explicit-any':'off'}},
);
''')
write('.prettierrc.json',json.dumps({'singleQuote':True,'trailingComma':'all','printWidth':100},indent=2)+'\n')
write('.prettierignore','node_modules\ndist\npackage-lock.json\nsupabase/seed.sql\n.review\n')
p=Path('.gitignore');p.write_text(p.read_text()+'\nplaywright-report/\ntest-results/\n')
p=Path('vercel.json');data=json.loads(p.read_text());data['rewrites']=[{'source':'/((?!assets/|exercises/|logo.*\\.jpg|manifest\\.json|sw\\.js).*)','destination':'/index.html'}]
csp="default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://raw.githubusercontent.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://world.openfoodfacts.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
data['headers'][0]['headers'].append({'key':'Content-Security-Policy','value':csp})
data['headers'].extend([{'source':'/sw.js','headers':[{'key':'Cache-Control','value':'no-cache'},{'key':'Service-Worker-Allowed','value':'/'}]},{'source':'/index.html','headers':[{'key':'Cache-Control','value':'no-cache'}]},{'source':'/manifest.json','headers':[{'key':'Cache-Control','value':'no-cache'}]}]);p.write_text(json.dumps(data,indent=2)+'\n')
write('tests/e2e/app.spec.ts',r'''import {test,expect,type Page} from '@playwright/test';
async function register(page:Page){
 await page.goto('/');await page.getByRole('button',{name:'Crear Cuenta',exact:true}).click();
 await page.getByLabel('Tu nombre',{exact:true}).fill('Prueba Local');
 await page.getByLabel('Correo electrónico',{exact:true}).fill('qa@example.test');
 await page.getByLabel('Contraseña',{exact:true}).fill('Testing12345!');
 await page.getByLabel('Repetir contraseña',{exact:true}).fill('Testing12345!');
 await page.getByRole('button',{name:'Crear mi cuenta segura'}).click();
 await expect(page.getByRole('button',{name:'Cerrar sesión',exact:true})).toBeVisible();
}
test('local registration, accessible labels and persistent draft survive reload',async({page})=>{
 await register(page);
 const date=page.locator('input[type="date"]').first();await date.fill('1995-06-15');
 await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('fitnutricion-user-data-v2:')))).toBe(true);
 await page.reload();await expect(page.locator('input[type="date"]').first()).toHaveValue('1995-06-15');
});
test('mobile logout and confirmed device wipe remove health copies',async({page})=>{
 await page.setViewportSize({width:390,height:844});await register(page);
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Salir y borrar datos del dispositivo'}).click();
 await expect(page.getByRole('button',{name:'Entrar a mi cuenta'})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fitnutricion-user-data-')||k.startsWith('fitnutricion-sync-')))).toEqual([]);
});
test('static shell reloads offline without caching authentication or health requests',async({page,context})=>{
 await page.goto('/');await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const requests=await page.evaluate(async()=>{const urls:string[]=[];for(const name of await caches.keys()){const c=await caches.open(name);urls.push(...(await c.keys()).map(r=>new URL(r.url).pathname));}return urls;});
 expect(requests).toContain('/index.html');expect(requests.every(p=>p.startsWith('/assets/')||['/index.html','/logo.jpg','/manifest.json'].includes(p))).toBe(true);
 await context.setOffline(true);await page.reload();await expect(page.getByRole('button',{name:'Entrar a mi cuenta'})).toBeVisible();
});
''')
