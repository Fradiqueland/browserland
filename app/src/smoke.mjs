import {environmentValue} from './branding.mjs';
import {runAuthorSocialSmoke} from './author-social-smoke.mjs';
import {capturePage} from './capture-page.mjs';
import {portableDirectory} from './platform.mjs';
import {decryptBundle} from './core.mjs';
import {session,BrowserWindow} from 'electron';
import {extensionPath} from './portable-extensions.mjs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {writeFileSync,mkdirSync,readFileSync,renameSync,cpSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {bounded,closeWindow,closeHTTPServer,until} from './operations.mjs';
import assert from 'node:assert/strict';
export async function runSmoke({app,store,manager,sessionFor,openProfile,browsers,nativeBrowsers,root,dataRoot,trace,actions,dialog,addTab,quitApplication}){
 let proxyServer,bundledChromium;
 const originals={save:dialog.showSaveDialog,open:dialog.showOpenDialog,message:dialog.showMessageBox};
 const results=[];const check=(name,ok)=>{assert.ok(ok,name);results.push({name,ok:true});trace('PASS: '+name);};
 const server=createServer((_req,res)=>{if(_req.url==='/portable-worker.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end("let blocked=false;try{new OffscreenCanvas(1,1).getContext('2d').getImageData(0,0,1,1)}catch{blocked=true}const first={blocked,language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,node:typeof require,ipc:typeof self.desktop};self.addEventListener('install',e=>e.waitUntil(caches.open('portable-worker-cache').then(c=>c.put('/offline-probe',new Response('portable-cache-ok'))).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('message',e=>e.waitUntil(caches.open('portable-worker-cache').then(c=>c.match('/offline-probe')).then(r=>r.text()).then(cache=>e.ports[0].postMessage({...first,cache}))));");return;}if(_req.url==='/download'){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="teste-download.txt"','Content-Length':4096});res.end(Buffer.alloc(4096,65));return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Teste de isolamento</title><h1>Browserland local</h1><a href="/next" target="_blank">Abrir separador</a>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';
 async function loaded(wc){if(wc.getURL()&&!wc.isLoading())return;await Promise.race([once(wc,'did-finish-load'),new Promise((_,reject)=>setTimeout(()=>reject(Error('Pagina nao carregou')),15000))]);}
 try{
 await loaded(manager.webContents);
 await runAuthorSocialSmoke({manager,store,actions,dataRoot,check});
 if(process.argv.includes('--social-links-only')){
  writeFileSync(join(dataRoot,'smoke-result.json'),JSON.stringify({ok:true,engine:process.versions.electron,scope:'author-social-links',tests:results},null,2));
  return;
 }
 check('Gestor com preload seguro',await manager.webContents.executeJavaScript("document.querySelector('h1').textContent==='Browser profiles' && document.documentElement.lang==='en' && typeof window.desktop.request==='function' && typeof require==='undefined'"));
 check('Idiomas pedidos incluidos no seletor',await manager.webContents.executeJavaScript("['en','pt','es','fr','hi','ar','zh','bn','ru','id'].every(id=>[...document.querySelector('#ui-language').options].some(o=>o.value===id))"));
 check('Fotografia e autoria incluidas no pacote',await manager.webContents.executeJavaScript("document.querySelector('#author-photo').complete && document.querySelector('#author-photo').naturalWidth===1024 && document.querySelector('#author-name').textContent==='Antonio Fradique' && document.querySelector('#author-products').getAttribute('href')==='https://AntonioFradique.net'"));
 const p1=store.upsert({name:'Trabalho Norte',group:'Trabalho',startURL:url,timezone:'Europe/Lisbon',locale:'pt-PT',privacy:{canvas:true,webgl:true,audio:true,webrtc:true,fonts:true},emulateScreen:true});
 const p2=store.upsert({name:'Pessoal',group:'Pessoal',startURL:url,timezone:'America/New_York',locale:'en-US'});
 trace('Abrir perfil A');const a=await bounded(openProfile(p1.id),'abrir perfil A',40000);trace('Abrir perfil B');const b=await bounded(openProfile(p2.id),'abrir perfil B',40000);const aw=a.tabs[0].view.webContents,bw=b.tabs[0].view.webContents;
 await Promise.all([loaded(aw),loaded(bw)]);trace('Testar armazenamento e cookies');
 await bounded(aw.executeJavaScript("localStorage.setItem('isolation','perfil-A');document.cookie='isolation=perfil-A;path=/';new Promise((resolve,reject)=>{const r=indexedDB.open('private-data',1);r.onupgradeneeded=()=>r.result.createObjectStore('values');r.onsuccess=()=>{r.result.close();resolve(true)};r.onerror=()=>reject(r.error);})"),"gravar IndexedDB do perfil A",10000);
 check('Cookies e LocalStorage separados',await bw.executeJavaScript("localStorage.getItem('isolation')===null && !document.cookie.includes('perfil-A')"));
 check('IndexedDB separado',await bw.executeJavaScript("indexedDB.databases().then(d=>!d.some(x=>x.name==='private-data'))"));
 check('Fusos horarios por perfil',(await aw.executeJavaScript("Intl.DateTimeFormat().resolvedOptions().timeZone"))==='Europe/Lisbon'&&(await bw.executeJavaScript("Intl.DateTimeFormat().resolvedOptions().timeZone"))==='America/New_York');
 check('Paginas externas sem Node ou IPC',await aw.executeJavaScript("typeof require==='undefined' && typeof window.desktop==='undefined'"));
 check('Sessoes Chromium distintas',aw.session!==bw.session);
 check('Restricoes de canvas e WebGL aplicadas na pagina',await aw.executeJavaScript("(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;let blocked=false;try{c.toDataURL()}catch{blocked=true}return blocked&&c.getContext('webgl')===null})()"));
 check('AudioContext e WebRTC bloqueados no perfil selecionado',await aw.executeJavaScript("(()=>{let a=false,r=false;try{new OfflineAudioContext(1,256,44100)}catch{a=true}try{new RTCPeerConnection()}catch{r=true}return a&&r})()"));
 check('Perfil sem restricoes conserva as APIs nativas',await bw.executeJavaScript("(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;const audio=new OfflineAudioContext(1,256,44100);const rtc=new RTCPeerConnection();rtc.close();return c.toDataURL().startsWith('data:image/')&&!!audio})()"));
 check('Resolucao exposta ao site corresponde ao perfil',await aw.executeJavaScript("screen.width===1280&&screen.height===800"));

 const tab=await addTab(a,url+'next');await loaded(tab.view.webContents);check('Novos separadores reutilizam a sessao do perfil',tab.view.webContents.session===aw.session);
 const count=store.state.profiles.length;
 await manager.webContents.executeJavaScript("window.desktop.request('save',{name:'Perfil do formulario',locale:'pt-PT'}).then(()=>true)");
 check('Guardar por IPC autorizado',store.state.profiles.length===count+1);
 await manager.webContents.executeJavaScript("window.desktop.request('save',{name:'<script>alert(1)</script>',locale:'pt-PT'}).then(()=>true)");
 await new Promise(r=>setTimeout(r,250));
 check('Nomes apresentados como texto',await manager.webContents.executeJavaScript("document.querySelector('tbody').textContent.includes('<script>alert(1)</script>') && document.querySelector('tbody script')===null"));
 aw.downloadURL(url+'download');
 await bounded(new Promise(resolve=>{const poll=setInterval(()=>{if(store.state.downloads?.some(d=>d.state==='completed')){clearInterval(poll);resolve();}},50);setTimeout(()=>clearInterval(poll),11000); }),'transferencia HTTP local',10000);
 check('Transferencia real registada e guardada no perfil',store.state.downloads.some(d=>d.profileId===p1.id&&d.state==='completed'&&readFileSync(d.path).length===4096));
 trace('Capturar interface');const shot=await bounded(capturePage(manager.webContents),'capturar interface',10000);mkdirSync(join(dataRoot,'captures'),{recursive:true});writeFileSync(join(dataRoot,'captures','manager.png'),shot.toPNG());
 await Promise.all([closeWindow(a.window,'fechar perfil A'),closeWindow(b.window,'fechar perfil B')]);
 const sa=await sessionFor(p1),sb=await sessionFor(p2);await sa.cookies.flushStore();
 check('Cookies conservados apenas no perfil correto',(await sa.cookies.get({name:'isolation'})).length===1&&(await sb.cookies.get({name:'isolation'})).length===0);
 await sb.cookies.set({url,name:'only-b',value:'B'});await sa.clearStorageData();check('Limpar um perfil nao afeta o outro',(await sb.cookies.get({name:'only-b'})).length===1);
 trace('Testar proxy HTTP autenticado em loopback');
 let authenticatedRequests=0;
 proxyServer=createServer((req,res)=>{
  const expected='Basic '+Buffer.from('teste:password-local').toString('base64');
  if(req.headers['proxy-authorization']!==expected){res.writeHead(407,{'Proxy-Authenticate':'Basic realm="BrowserlandTest"'});res.end();return;}
  authenticatedRequests++;res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Proxy local validado</title><h1>Proxy autenticado</h1>');
 });
 await new Promise(resolve=>proxyServer.listen(0,'127.0.0.1',resolve));
 const proxyProfile=await actions.save({name:'Proxy local',proxy:'http://127.0.0.1:'+proxyServer.address().port,proxyUser:'teste',proxyPassword:'password-local',startURL:'http://browserland-test.invalid/'});
 check('Credenciais de proxy nao ficam em texto simples',!readFileSync(join(dataRoot,'workspace.json'),'utf8').includes('password-local'));
 const proxyBrowser=await bounded(openProfile(proxyProfile.id),'abrir proxy autenticado',30000);
 const proxyContents=proxyBrowser.tabs[0].view.webContents;await loaded(proxyContents);
 check('Proxy HTTP autentica e encaminha navegacao real',authenticatedRequests>0&&await proxyContents.executeJavaScript("document.querySelector('h1')?.textContent==='Proxy autenticado'"));
 await closeWindow(proxyBrowser.window,'fechar perfil do proxy');
 trace('Testar operacoes de gestao e CSV');
 actions.groupSave({name:'Grupo de teste',description:'Descricao verificada'});store.get(p1.id).group='Grupo de teste';store.get(p1.id).groups=['Grupo de teste'];actions.groupSave({previous:'Grupo de teste',name:'Grupo renomeado',description:'Descricao editada'});
 check('Edicao de grupos conserva associacoes',store.get(p1.id).group==='Grupo renomeado'&&store.state.groupDetails['Grupo renomeado'].description==='Descricao editada');
 actions.pin({id:p1.id});check('Fixacao persistida',store.get(p1.id).pinned===true);
 const csvPath=join(dataRoot,'export-test.csv');dialog.showSaveDialog=async()=>({canceled:false,filePath:csvPath});
 await actions.export({format:'csv',ids:[p1.id]});const csv=readFileSync(csvPath,'utf8');check('Exportacao CSV selecionada nao inclui segredos',csv.includes('Trabalho Norte')&&!csv.includes('proxySecret'));
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[csvPath]});const importedCSV=await actions.import({});check('Importacao CSV real conserva parametros',importedCSV.imported===1&&store.state.profiles.at(-1).privacy.canvas===true);
 const sharePath=join(dataRoot,'encrypted-session.json');dialog.showSaveDialog=async()=>({canceled:false,filePath:sharePath});
 await sa.cookies.set({url,name:'shared-session',value:'cookie-confidencial'});
 await actions.export({id:p1.id,cookies:true,password:'palavra-passe-de-teste'});
 check('Sessao partilhada fica encriptada no disco',!readFileSync(sharePath,'utf8').includes('cookie-confidencial'));
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[sharePath]});
 const pending=await actions.import({});check('Importacao pede palavra-passe apenas para ficheiro encriptado',pending.needsPassword===true);
 const imported=await actions.import({token:pending.token,password:'palavra-passe-de-teste'});const restored=await sessionFor(store.state.profiles.at(-1));
 check('Importacao encriptada restaura cookies noutro perfil',imported.imported===1&&(await restored.cookies.get({name:'shared-session'}))[0]?.value==='cookie-confidencial');
 trace('Testar favoritos, arranque e limpeza seletiva');
 const startProfile=await actions.save({name:'Arranque multipagina',startupMode:'pages',startupPages:[url+'one',url+'two']});
 const startBrowser=await openProfile(startProfile.id);await Promise.all(startBrowser.tabs.map(t=>loaded(t.view.webContents)));
 check('Arranque abre todas as paginas configuradas',startBrowser.tabs.length===2&&startBrowser.tabs.every(t=>t.view.webContents.getURL().startsWith(url)));
 await startBrowser.window.webContents.executeJavaScript("window.desktop.request('bookmark')");
 const favorite=store.state.bookmarks.find(x=>x.profileId===startProfile.id);check('Botao de favoritos guarda URL do separador ativo',!!favorite&&favorite.url===url+'two');
 actions.editBookmark({id:favorite.id,title:'Favorito editado',url:url+'editado',notes:'Notas do favorito'});
 check('Edicao de favoritos persiste titulo endereco e notas',favorite.title==='Favorito editado'&&favorite.url===url+'editado'&&favorite.notes==='Notas do favorito');
 trace('Fechar perfil antes de alterar o arranque');
 await actions.stop({id:startProfile.id});
 check('Fecho confirmado antes de editar o perfil',!browsers.has(startProfile.id)&&startBrowser.window.isDestroyed());
 const startSaved=store.get(startProfile.id);await actions.save({...startSaved,startupMode:'restore'});
 const resumedBrowser=await openProfile(startProfile.id);await Promise.all(resumedBrowser.tabs.map(t=>loaded(t.view.webContents)));
 check('Continuar onde ficou restaura os separadores do perfil',resumedBrowser.tabs.length===2&&resumedBrowser.tabs[0].view.webContents.getURL()===url+'one'&&resumedBrowser.tabs[1].view.webContents.getURL()===url+'two');
 await closeWindow(resumedBrowser.window,'fechar perfil restaurado');
 dialog.showMessageBox=async()=>({response:1});
 store.state.history.push({profileId:p2.id,url:url+'antigo',title:'Antigo',at:new Date(Date.now()-48*3600000).toISOString()});
 const historyBefore=store.state.history.filter(h=>h.profileId!==p2.id).length;
 await actions.clearSelectedData({id:p2.id,history:true,hours:24});
 check('Limpar historico por periodo conserva cookies e outros perfis',(await sb.cookies.get({name:'only-b'})).length===1&&store.state.history.some(h=>h.profileId===p2.id&&h.url===url+'antigo')&&store.state.history.filter(h=>h.profileId!==p2.id).length===historyBefore);
 await actions.clearSelectedData({id:p2.id,siteData:true,hours:0});
 check('Limpar dados de sites remove cookies apenas do perfil escolhido',(await sb.cookies.get({name:'only-b'})).length===0&&(await sa.cookies.get({name:'shared-session'})).length===1);
 const extensionDir=join(dataRoot,'extension-fixture');mkdirSync(extensionDir,{recursive:true});
 writeFileSync(join(extensionDir,'manifest.json'),JSON.stringify({name:'Extensao de teste',version:'1.0.0',manifest_version:3,permissions:['storage'],content_scripts:[{matches:['http://127.0.0.1/*'],js:['content.js']}]}));
 writeFileSync(join(extensionDir,'content.js'),"chrome.storage.local.set({probe:'portable-ok'}).then(()=>chrome.storage.local.get('probe')).then(v=>document.documentElement.dataset.extensionPortable=v.probe);");
 const extensionProfile=store.state.profiles.at(-1);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[extensionDir]});
 await actions.extension({id:extensionProfile.id});const extension=extensionProfile.extensions.at(-1);
 check('Extensao local carregada apenas na sessao do perfil',!!(await sessionFor(extensionProfile)).extensions.getExtension(extension.id)&&!sa.extensions.getExtension(extension.id));
 const managed=extensionPath(dataRoot,extensionProfile.id,extension);
 check('Extensao instalada usa copia local sem guardar caminho externo',!!extension.directory&&!extension.path&&managed!==extensionDir&&existsSync(join(managed,'content.js')));
 renameSync(extensionDir,extensionDir+'-moved');const ses=await sessionFor(extensionProfile);ses.extensions.removeExtension(extension.id);await actions.save({...extensionProfile,latitude:extensionProfile.geolocation?.latitude,longitude:extensionProfile.geolocation?.longitude});await sessionFor(extensionProfile);
 check('Extensao recarrega depois de mover a pasta original',!!ses.extensions.getExtension(extension.id));
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[managed]});await assert.rejects(actions.extension({id:extensionProfile.id}),/already added/);
 check('Duplicar a mesma extensao nao substitui nem remove a instalada',store.get(extensionProfile.id).extensions.length===1&&!!ses.extensions.getExtension(extension.id)&&existsSync(managed));
 const movedRoot=join(dataRoot,'relocated-extension-data'),movedPath=extensionPath(movedRoot,extensionProfile.id,extension);mkdirSync(dirname(movedPath),{recursive:true});cpSync(managed,movedPath,{recursive:true});
 const relocatedSession=session.fromPath(join(movedRoot,'browser-session')),relocatedExtension=await relocatedSession.extensions.loadExtension(movedPath,{allowFileAccess:false});
 check('Mover os dados conserva o identificador da extensao',relocatedExtension.id===extension.id);
 const probe=new BrowserWindow({show:false,webPreferences:{session:relocatedSession,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 try{await probe.loadURL(url);await until(async()=>await probe.webContents.executeJavaScript('document.documentElement.dataset.extensionPortable')==='portable-ok','extensao transportada e chrome.storage.local',10000);check('Extensao transportada executa content script e armazenamento real',true);}finally{await closeWindow(probe,'fechar teste da extensao transportada');relocatedSession.extensions.removeExtension(relocatedExtension.id);}
 await actions.removeExtension({id:extensionProfile.id,extensionId:extension.id});check('Remover extensao atualiza a sessao e configuracao',store.get(extensionProfile.id).extensions.length===0&&!existsSync(managed)&&existsSync(extensionDir+'-moved')&&!(await sessionFor(extensionProfile)).extensions.getExtension(extension.id));
 const disposable=store.upsert({name:'Perfil descartavel'});dialog.showMessageBox=async()=>({response:1});
 const deleted=await actions.deleteSelected({ids:[disposable.id]});check('Eliminacao em lote afeta apenas selecao',deleted.deleted===1&&store.state.profiles.some(p=>p.id===p1.id));
 await actions.deleteGroups({names:['Grupo renomeado']});check('Eliminar grupo conserva os perfis',store.get(p1.id).group===''&&store.state.profiles.some(p=>p.id===p1.id));
 actions.bulkCreate({names:Array.from({length:12},(_,i)=>'Lote '+i),group:'Paginacao'});
 check('Criacao em lote regista o grupo e conserva associacoes',store.state.groups.includes('Paginacao')&&store.state.profiles.filter(p=>p.group==='Paginacao').length===12);
 await new Promise(r=>setTimeout(r,250));
 check('Paginacao real limita linhas e permite avancar',await manager.webContents.executeJavaScript("(()=>{const size=document.querySelector('#page-size');size.value='10';size.dispatchEvent(new Event('change'));const first=document.querySelector('tbody').textContent;document.querySelector('#next-page').click();return document.querySelectorAll('tbody tr').length<=10&&document.querySelector('tbody').textContent!==first})()"));
 await manager.webContents.executeJavaScript("document.querySelector('#previous-page').click();document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));");
 for(const section of ['groups','downloads','extensions','settings','profiles']){
  await manager.webContents.executeJavaScript("document.querySelector('[data-page="+section+"]').click()");
  await new Promise(r=>setTimeout(r,80));
  check('Menu '+section+' abre a secao correta',await manager.webContents.executeJavaScript("!document.querySelector('#"+section+"').classList.contains('hidden')"));
 }
 trace('Verificar Chromium incluido sem depender do Chrome ou Edge instalados');
 if(environmentValue('PORTABLE_TEST')==='1')check('Pacote funciona com descoberta de navegadores instalados desativada',nativeBrowsers.available().length===1&&nativeBrowsers.available()[0].id==='chromium');
 const bundledProfile=store.upsert({name:'Chromium incluido',engine:'chromium',locale:'pt-PT',timezone:'Asia/Tokyo',privacy:{canvas:true},startupPages:[url]});
 const nativeRecord=await nativeBrowsers.open(bundledProfile,{headless:true}),nativeExit=nativeRecord.exited;
 const expectedExecutable=resolve(app.isPackaged?portableDirectory():root,'.runtime','chromium',...(process.platform==='darwin'?['Chromium.app','Contents','MacOS','Chromium']:['chrome.exe']));
 check('Motor incluido usa o seu executavel e pipe privado',resolve(nativeRecord.engine.path)===expectedExecutable&&nativeRecord.child.spawnargs.includes('--remote-debugging-pipe')&&!nativeRecord.child.spawnargs.some(arg=>arg.startsWith('--remote-debugging-port')));
 let nativePage;await until(async()=>{nativePage=[...nativeRecord.targets.values()].find(t=>t.url===url);if(!nativePage)return false;const result=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"document.readyState==='complete'&&navigator.language==='pt-PT'&&typeof require==='undefined'&&typeof window.desktop==='undefined'",returnByValue:true},nativePage.sessionId);return result.result?.value===true;},'pagina HTTP no Chromium incluido',15000);
 check('Motor incluido carrega HTTP com idioma e isolamento reais',true);
 const workerResult=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"new Promise((resolve,reject)=>{const objectURL=URL.createObjectURL(new Blob([\"let blocked=false;try{new OffscreenCanvas(1,1).getContext('2d').getImageData(0,0,1,1)}catch{blocked=true}postMessage({blocked,language:navigator.language,zone:Intl.DateTimeFormat().resolvedOptions().timeZone,node:typeof require,ipc:typeof self.desktop});\"],{type:'text/javascript'})),worker=new Worker(objectURL);const cleanup=()=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(objectURL)},timer=setTimeout(()=>{cleanup();reject(Error('Worker timeout'))},10000);worker.onmessage=e=>{cleanup();resolve(e.data)};worker.onerror=e=>{cleanup();reject(Error(e.message))}})",awaitPromise:true,returnByValue:true},nativePage.sessionId);
 check('Worker do Chromium incluido aplica controlos antes do primeiro script',workerResult.result.value?.blocked===true&&workerResult.result.value.language==='pt-PT'&&workerResult.result.value.zone==='Asia/Tokyo');
 check('Worker nativo nao recebe Node nem a ponte do gestor',workerResult.result.value?.node==='undefined'&&workerResult.result.value.ipc==='undefined');
 const serviceResult=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"(async()=>{const r=await navigator.serviceWorker.register('/portable-worker.js');const w=r.installing||r.waiting||r.active;if(w.state!=='activated')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Service worker activation timeout')),10000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(timer);resolve()}else if(w.state==='redundant'){clearTimeout(timer);reject(Error('Service worker failed'))}})});return await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('Service worker response timeout')),10000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data)};r.active.postMessage('probe',[channel.port2])})})()",awaitPromise:true,returnByValue:true},nativePage.sessionId);
 check('Service worker incluido aplica identidade e privacidade antes do primeiro script',serviceResult.result.value?.blocked===true&&serviceResult.result.value.language==='pt-PT'&&serviceResult.result.value.zone==='Asia/Tokyo');
 check('Cache do service worker funciona dentro dos dados portateis',serviceResult.result.value?.cache==='portable-cache-ok'&&existsSync(join(nativeRecord.directory,'Default','Service Worker','CacheStorage')));
 check('Service worker incluido nao recebe Node nem IPC',serviceResult.result.value?.node==='undefined'&&serviceResult.result.value.ipc==='undefined');
 await nativeRecord.cdp.send('Runtime.evaluate',{expression:"navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister())))",awaitPromise:true,returnByValue:true},nativePage.sessionId);
 const {targetId:initialBlank}=await nativeRecord.cdp.send('Target.createTarget',{url:'about:blank'});
 await until(()=>nativeRecord.targets.get(initialBlank)?.sessionId,'pagina vazia inicial nativa',15000);const blankNativeSession=nativeRecord.targets.get(initialBlank).sessionId;await nativeRecord.sessions.get(blankNativeSession);
 const blankNative=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"(()=>{let blocked=false;try{document.createElement('canvas').toDataURL()}catch{blocked=true}return blocked&&navigator.language==='pt-PT'&&Intl.DateTimeFormat().resolvedOptions().timeZone==='Asia/Tokyo'})()",returnByValue:true},blankNativeSession);
 check('Pagina vazia nativa aplica controlos sem segunda navegacao',blankNative.result.value===true);await nativeRecord.cdp.send('Target.closeTarget',{targetId:initialBlank});
 const {targetId:newNativeTab}=await nativeRecord.cdp.send('Target.createTarget',{url:'chrome://newtab/'});
 await until(()=>nativeRecord.targets.get(newNativeTab)?.sessionId,'novo separador nativo',15000);const newNativeSession=nativeRecord.targets.get(newNativeTab).sessionId;await nativeRecord.sessions.get(newNativeSession);
 await until(async()=>{const r=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"document.readyState==='complete'",returnByValue:true},newNativeSession);return r.result.value;},'pagina interna nativa',15000);
 const nativeCanvas=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"document.createElement('canvas').toDataURL().startsWith('data:')",returnByValue:true},newNativeSession);
 check('Novo separador nativo conserva canvas com restricoes no perfil',nativeCanvas.result.value===true);
 await nativeRecord.cdp.send('Page.navigate',{url:url+'native-newtab'},newNativeSession);
 await until(async()=>{const r=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"location.pathname==='/native-newtab'&&document.querySelector('h1')?.textContent==='Browserland local'",returnByValue:true},newNativeSession);return r.result.value;},'site no separador criado pelo navegador',15000);
 const nativeIdentity=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"(()=>{let blocked=false;try{document.createElement('canvas').toDataURL()}catch{blocked=true}return blocked&&navigator.language==='pt-PT'&&Intl.DateTimeFormat().resolvedOptions().timeZone==='Asia/Tokyo'})()",returnByValue:true},newNativeSession);
 check('Site aberto do novo separador nativo aplica identidade e privacidade',nativeIdentity.result.value===true);await nativeRecord.cdp.send('Target.closeTarget',{targetId:newNativeTab});

 const extensionPage=await nativeBrowsers.page(bundledProfile,'extensions');await until(async()=>{const result=await nativeRecord.cdp.send('Runtime.evaluate',{expression:"!!document.querySelector('extensions-manager')",returnByValue:true},extensionPage.sessionId);return result.result?.value===true;},'gestor de extensoes incluido',15000);
 check('Gestor de extensoes do motor incluido carrega realmente',true);
 await nativeRecord.cdp.send('Storage.setCookies',{cookies:[{name:'portable-partition',value:'isolated-value',url:'https://cookie.example.test/',secure:true,path:'/',sameSite:'None',expires:Math.floor(Date.now()/1000)+3600,partitionKey:{topLevelSite:'https://first.example',hasCrossSiteAncestor:true}}]});
 bundledChromium={version:nativeRecord.version.product,executable:nativeRecord.engine.path,privatePipe:true};await nativeBrowsers.stop(bundledProfile.id);check('Motor incluido termina normalmente com codigo zero',(await nativeExit).code===0);
 const partitionFile=join(dataRoot,'partitioned-session.json');dialog.showSaveDialog=async()=>({canceled:false,filePath:partitionFile});
 await actions.export({id:bundledProfile.id,cookies:true,password:'portable-partition-password'});const partitionBundle=decryptBundle(readFileSync(partitionFile,'utf8'),'portable-partition-password');
 check('Partilha encriptada versionada conserva a chave de particao',partitionBundle.version===2&&partitionBundle.cookies.find(c=>c.name==='portable-partition')?.partitionKey?.topLevelSite==='https://first.example'&&!readFileSync(partitionFile,'utf8').includes('isolated-value'));
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[partitionFile]});const partitionImport=await actions.import({password:'portable-partition-password'}),partitionProfile=store.state.profiles.at(-1),partitionCookies=await nativeBrowsers.cookies(partitionProfile);
 check('Importacao real restaura cookie particionado num perfil independente',partitionImport.imported===1&&partitionProfile.id!==bundledProfile.id&&partitionCookies.some(c=>c.name==='portable-partition'&&c.value==='isolated-value'&&c.partitionKey?.topLevelSite==='https://first.example'&&c.partitionKey.hasCrossSiteAncestor===true));

 trace('Testar importacao concorrente sem publicar perfis incompletos');
 const originalImportCookies=nativeBrowsers.importCookies;
 try{
  for(const fail of [true,false]){
   let entered,release,stagedProfile;const started=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
   nativeBrowsers.importCookies=async function(profile,cookies){stagedProfile=profile;entered();await hold;if(fail)throw Error('Falha de importacao injetada pelo teste');return originalImportCookies.call(this,profile,cookies);};
   const job=actions.import({password:'portable-partition-password'});const outcome=job.then(value=>({value}),error=>({error}));
   await bounded(started,'pausar importacao para verificar concorrencia',15000);
   try{
    check('Perfil em preparacao fica invisivel '+(fail?'antes da falha':'antes do sucesso'),!store.state.profiles.some(p=>p.id===stagedProfile.id)&&!(await manager.webContents.executeJavaScript("window.desktop.request('state')")).profiles.some(p=>p.id===stagedProfile.id));
    const concurrent=await actions.save({name:'Criado durante importacao '+fail});
    const active=store.get(p1.id);active.notes='Edicao concorrente '+fail;store.save();
    check('Guardar durante importacao nao persiste perfil incompleto '+fail,!JSON.parse(readFileSync(store.file,'utf8')).profiles.some(p=>p.id===stagedProfile.id));
    release();const result=await outcome;
    check('Importacao '+(fail?'falhada':'concluida')+' conserva alteracoes concorrentes',store.get(concurrent.id).name===concurrent.name&&store.get(p1.id)===active&&active.notes==='Edicao concorrente '+fail&&JSON.parse(readFileSync(store.file,'utf8')).profiles.some(p=>p.id===concurrent.id));
    if(fail)check('Falha nao publica a identidade temporaria',result.error?.message.includes('injetada')&&!store.state.profiles.some(p=>p.id===stagedProfile.id));
    else{const restoredCookies=await nativeBrowsers.cookies(store.get(stagedProfile.id));check('Commit de importacao inclui cookies reais prontos a utilizar',result.value?.imported===1&&restoredCookies.some(c=>c.name==='portable-partition'&&c.partitionKey?.topLevelSite==='https://first.example'));}
   }finally{release();await outcome;}
  }
 }finally{nativeBrowsers.importCookies=originalImportCookies;}
 
 const portProfile=await actions.save({name:'Navegacao localhost com porta',startupMode:'blank'}),portBrowser=await openProfile(portProfile.id);
 const typedAddress='localhost:'+server.address().port+'/typed-address';
 await portBrowser.window.webContents.executeJavaScript("window.desktop.request('navigate',{url:"+JSON.stringify(typedAddress)+"})");
 const typedContents=portBrowser.tabs[0].view.webContents;
 check('Barra navega realmente para localhost com porta sem exigir esquema',typedContents.getURL()==='http://'+typedAddress&&await typedContents.executeJavaScript("document.querySelector('h1')?.textContent==='Browserland local'"));
 check('Navegacao local conserva isolamento sem Node e IPC',await typedContents.executeJavaScript("typeof require==='undefined'&&typeof window.desktop==='undefined'"));
 await actions.stop({id:portProfile.id});
 await manager.webContents.executeJavaScript("document.querySelector('#new-profile').click();");
 const modalShot=await bounded(capturePage(manager.webContents),'capturar formulario',10000);writeFileSync(join(dataRoot,'captures','profile-dialog.png'),modalShot.toPNG());
 const beforeForm=store.state.profiles.length;
 await manager.webContents.executeJavaScript("(()=>{const f=document.querySelector('#profile-form');f.elements.name.value='Perfil criado no formulario';f.elements.privacy_canvas.checked=true;f.elements.privacy_audio.checked=true;f.elements.emulateScreen.checked=true;f.requestSubmit();})()");
 await new Promise(r=>setTimeout(r,300));
 check('Formulario real guarda opcoes de privacidade',store.state.profiles.length===beforeForm+1&&store.state.profiles.at(-1).privacy.canvas&&store.state.profiles.at(-1).privacy.audio&&store.state.profiles.at(-1).emulateScreen);
 await manager.webContents.executeJavaScript("document.querySelector('[data-page=groups]').click();document.querySelector('#add-group').click()");
 const groupShot=await bounded(capturePage(manager.webContents),'capturar grupo',10000);writeFileSync(join(dataRoot,'captures','group-dialog.png'),groupShot.toPNG());
 await manager.webContents.executeJavaScript("document.querySelector('#group-dialog').close();document.querySelector('[data-page=profiles]').click()");
 const latestShot=await bounded(capturePage(manager.webContents),'capturar interface final',10000);writeFileSync(join(dataRoot,'captures','manager.png'),latestShot.toPNG());
 const precise=await actions.save({name:'Precisao GPS persistida',latitude:38.7,longitude:-9.1,geolocationAccuracy:4.5});
 await actions.save({...store.get(precise.id),name:'Precisao conservada na edicao'});
 check('Edicao real conserva precisao de localizacao importada',store.get(precise.id).geolocation.accuracy===4.5);
 const preciseCopy=actions.duplicate({id:precise.id});check('Duplicacao conserva precisao e cria identidade independente',preciseCopy.id!==precise.id&&store.get(preciseCopy.id).geolocation.accuracy===4.5);
 check('Precisao da localizacao fica persistida no ficheiro',JSON.parse(readFileSync(store.file,'utf8')).profiles.find(p=>p.id===precise.id).geolocation.accuracy===4.5);
 // Exercise actual manager actions while a destructive confirmation is pending.
 const reservationProfile=await actions.save({name:'Reserva de manutencao',startupMode:'blank'});
 const originalReservationMessage=dialog.showMessageBox;let enterReservation,releaseReservation;
 const reservationEntered=new Promise(r=>enterReservation=r),reservationAnswer=new Promise(r=>releaseReservation=r);
 dialog.showMessageBox=async()=>{enterReservation();return reservationAnswer;};
 const pendingDelete=actions.delete({id:reservationProfile.id});
 try{
  await bounded(reservationEntered,'aguardar confirmacao reservada',5000);
  check('Perfil reservado aparece ocupado durante a confirmacao',actions.state().profiles.find(p=>p.id===reservationProfile.id).busy===true&&actions.state().profiles.find(p=>p.id===reservationProfile.id).running===false);
  await assert.rejects(actions.open({id:reservationProfile.id}),/operação deste perfil/);await assert.rejects(actions.save({...store.get(reservationProfile.id),name:'Nao deve guardar'}),/operação deste perfil/);
  check('Confirmacao pendente impede abrir e alterar o mesmo perfil',store.get(reservationProfile.id).name===reservationProfile.name);
  await manager.webContents.executeJavaScript("document.querySelector('#search').value='Reserva de manutencao';document.querySelector('#status-filter').value='busy';document.querySelector('#search').dispatchEvent(new Event('input'))");
  await until(()=>manager.webContents.executeJavaScript("document.querySelector('#profile-rows tr')?.dataset.busy==='true'"),'estado ocupado visivel',5000);
  check('Interface mostra Ocupado com abertura edicao e menu desativados',await manager.webContents.executeJavaScript("(()=>{const row=document.querySelector('#profile-rows tr');return row.querySelector('.status').textContent==='Busy'&&[...row.querySelectorAll('.profile-open-cell button,.row-actions button')].filter(b=>!b.closest('.profile-pin-cell')).every(b=>b.disabled)})()"));
  const independent=await actions.save({name:'Perfil independente durante confirmacao'});check('Reserva permite continuar a gerir outros perfis',!!store.get(independent.id));
 }finally{releaseReservation({response:0});await pendingDelete;dialog.showMessageBox=originalReservationMessage;}
 await manager.webContents.executeJavaScript("document.querySelector('#search').value='';document.querySelector('#status-filter').value='';document.querySelector('#search').dispatchEvent(new Event('input'))");
 check('Cancelar a confirmacao liberta o perfil e conserva os dados',!actions.state().profiles.find(p=>p.id===reservationProfile.id).busy&&!!store.get(reservationProfile.id));
 const reservationSession=await sessionFor(store.get(reservationProfile.id)),originalClear=reservationSession.clearStorageData;
 try{dialog.showMessageBox=async()=>({response:1});reservationSession.clearStorageData=async()=>{throw Error('Falha de limpeza controlada');};await assert.rejects(actions.clear({id:reservationProfile.id}),/Falha de limpeza controlada/);}
 finally{reservationSession.clearStorageData=originalClear;dialog.showMessageBox=originalReservationMessage;}
 check('Falha de limpeza liberta a reserva para nova tentativa',!actions.state().profiles.find(p=>p.id===reservationProfile.id).busy);
 const afterReservation=await openProfile(reservationProfile.id);await actions.stop({id:reservationProfile.id});check('Perfil volta a abrir normalmente depois da falha',afterReservation.window.isDestroyed());
 // A failed shutdown must leave the actual manager usable and permit the runner's final retry.
 const originalStop=nativeBrowsers.stop;let shutdownFailures=0;
 const retryProfile=store.upsert({name:'Recuperar encerramento',engine:'chromium',startupMode:'blank'});
 await nativeBrowsers.open(retryProfile,{headless:true});
 try{
  nativeBrowsers.stop=async function(id){if(id===retryProfile.id&&shutdownFailures++===0)throw Error('Falha controlada de fecho');return originalStop.call(this,id);};
  let enteredImport,releaseImport,shutdownProfile;const startedImport=new Promise(r=>enteredImport=r),heldImport=new Promise(r=>releaseImport=r);
  nativeBrowsers.importCookies=async function(profile,cookies){shutdownProfile=profile;enteredImport();await heldImport;return originalImportCookies.call(this,profile,cookies);};
  const pendingImport=actions.import({password:'portable-partition-password'});const pendingOutcome=pendingImport.then(value=>({value}),error=>({error}));
  await bounded(startedImport,'preparar importacao durante encerramento',15000);
  let quitSettled=false;const quitOutcome=quitApplication().then(()=>{quitSettled=true;return null;},error=>{quitSettled=true;return error;});
  try{await new Promise(resolve=>setImmediate(resolve));check('Encerramento aguarda a importacao sem fechar os recursos prematuramente',!quitSettled&&shutdownFailures===0&&!manager.isDestroyed());}
  finally{releaseImport();}
  const completedImport=await pendingOutcome;assert.ifError(completedImport.error);const quitError=await quitOutcome;assert.match(quitError?.message||'',/Falha controlada de fecho/);
  check('Importacao pendente fica guardada antes de iniciar o fecho dos perfis',completedImport.value?.imported===1&&JSON.parse(readFileSync(store.file,'utf8')).profiles.some(p=>p.id===shutdownProfile.id));
  nativeBrowsers.importCookies=originalImportCookies;
  check('Falha no fecho conserva o gestor e permite pedidos autorizados',!manager.isDestroyed()&&(await manager.webContents.executeJavaScript("window.desktop.request('state').then(s=>s.profiles.length>0)")));
  await actions.stopAll();check('Nova tentativa fecha normalmente o motor que tinha falhado',!nativeBrowsers.has(retryProfile.id));
 }finally{nativeBrowsers.stop=originalStop;nativeBrowsers.importCookies=originalImportCookies;}
 }finally{dialog.showSaveDialog=originals.save;dialog.showOpenDialog=originals.open;dialog.showMessageBox=originals.message;trace('Fechar recursos de teste: '+browsers.size+' janelas');const cleanup=await Promise.allSettled([...browsers.values()].map(b=>closeWindow(b.window,'fechar janela do teste')).concat(nativeBrowsers.stopAll()));for(const result of cleanup)if(result.status==='rejected')trace('Falha ao fechar janela do teste: '+result.reason.message);trace('Fechar servidores HTTP de teste');await Promise.all([closeHTTPServer(server,'fechar servidor HTTP local'),closeHTTPServer(proxyServer,'fechar proxy de teste')]);const failure=cleanup.find(result=>result.status==='rejected');if(failure)throw failure.reason;trace('Recursos de teste fechados');}
 const report={ok:true,engine:process.versions.electron,bundledChromium,tests:results};writeFileSync(join(dataRoot,'smoke-result.json'),JSON.stringify(report,null,2));trace('Relatorio final de integracoes guardado: '+results.length+' verificacoes');

}
