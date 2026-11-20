const CACHE='devrefract-shell-v3';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/login','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('devrefract-shell-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(url.pathname.startsWith('/_next/static/')){event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;}));return;}
  if(request.mode==='navigate')event.respondWith(fetch(request).then(async response=>{if(response.ok&&url.pathname==='/')await (await caches.open(CACHE)).put('/',response.clone());return response;}).catch(async()=>await caches.match('/')||await caches.match('/login')));
});
