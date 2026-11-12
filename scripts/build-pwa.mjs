import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const assets = (await readdir('dist/assets')).map((name) => `/assets/${name}`).sort();
const urls = ['/index.html', '/manifest.json', '/logo.jpg', ...assets];
const hash = createHash('sha256');
for (const url of urls) hash.update(await readFile('dist' + url));
const version = hash.digest('hex').slice(0, 20);
const sw = `/* Generated static-only offline shell. Never caches auth/API/user data. */
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
await writeFile('dist/sw.js', sw);
console.log(`Offline shell ${version}: ${urls.length} public resources`);
