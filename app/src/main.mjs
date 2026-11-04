import {environmentValue,APPLICATION_NAME,APPLICATION_ID,encryptionApplicationName,isBundleFormat} from './branding.mjs';
import {authorSocialURL} from './author-social.mjs';
import {startupProgress} from './startup-progress.mjs';
import {ProfileTasks} from './profile-tasks.mjs';
import {commitProfileImport,stageProfileImport} from './profile-import.mjs';
import {applicationDataDirectory} from './platform.mjs';
import {primaryShortcut} from '../ui/shortcuts.mjs';
import {prepareEmbeddedPage,navigatePreparedPage} from './embedded-page.mjs';
import {extensionPath,installPortableExtension,removePortableExtension} from './portable-extensions.mjs';
import {profileGroups,ensureProfileGroups,groupRecords,validateGroupRecords,mergeGroups,removeGroups} from './groups.mjs';
import {t as translate,validLanguage,normalizeLanguage} from '../ui/i18n.mjs';
import {app,BrowserWindow,WebContentsView,session,ipcMain,dialog,safeStorage,Menu,shell,nativeTheme,net,clipboard} from 'electron';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdirSync,readFileSync,writeFileSync,appendFileSync,existsSync,statSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {csvImport,csvText,selectedProfiles,saveGroup,takeCSVPassword} from './workspace.mjs';
import {bounded,closeWindow,closeWebContents,openProfileBatch,settleOperations} from './operations.mjs';
import {NativeBrowsers} from './native-browser.mjs';
import {CLOSE_STANDARD} from './standard-browser.mjs';
import {pageContextItems,editingItems,webLink} from './page-context-menu.mjs';
import {Store,validateProfile,safeURL,text,encryptBundle,decryptBundle,configurationBundle,configurationInputs,importProfileConfiguration,cookieForImport,startupURLs,clearPlan,matchesProxyAuthority} from './core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const applicationVersion=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const dataRoot=applicationDataDirectory({appRoot:root,packaged:app.isPackaged,override:environmentValue('DATA')});
mkdirSync(dataRoot,{recursive:true});mkdirSync(join(dataRoot,'engine'),{recursive:true});app.setPath('userData',join(dataRoot,'engine'));app.setName(encryptionApplicationName(dataRoot));app.setAboutPanelOptions({applicationName:APPLICATION_NAME,applicationVersion});if(process.platform==='win32')app.setAppUserModelId(APPLICATION_ID);
const isTest=process.argv.includes('--self-test');
if(isTest&&!environmentValue('DATA'))throw Error('O teste exige uma pasta BROWSERLAND_DATA isolada. Utilize scripts/verify-desktop.ps1.');
const openingProfiles=new Map();
const pendingImports=new Map();
const importJobs=new Set();
const profileTasks=new ProfileTasks(()=>{if(store)broadcast();});
const bookmarkEditors=new Map();
const downloads=new Map();
function trace(stage){if(isTest){appendFileSync(join(dataRoot,'progress.log'),new Date().toISOString()+' '+stage+'\n');}}
if(!app.requestSingleInstanceLock()){app.quit();}else{app.on('second-instance',()=>{manager?.show();manager?.focus();});}
let manager,store,quitting=false,quitPromise,closingManager=false,quitPrompt=false;const profileClosures=new Map();
const nativeBrowsers=new NativeBrowsers({appRoot:root,dataRoot,headlessByDefault:process.argv.includes('--native-ui-tests'),decrypt:secret=>safeStorage.decryptString(Buffer.from(secret,'base64')),changed:()=>{if(store){store.save();broadcast();}},history:(id,url,title)=>{store.history(id,url,title);broadcast();},error:report});
const browsers=new Map(),sessions=new Map(),trusted=new Set(),webOwners=new Map(),errors=[];
function profilePath(id){if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Identificador inválido.');return join(dataRoot,'profiles',id);}
function publicProfile(p){const {proxySecret,...value}=p;return {...value,hasProxyPassword:!!proxySecret,engine:p.engine||'embedded',standardRunning:nativeBrowsers.isStandard(p.id),busy:profileTasks.has(p.id),running:browsers.has(p.id)||nativeBrowsers.has(p.id)||profileClosures.has(p.id)};}
function state(){return {...store.state,profiles:store.state.profiles.map(publicProfile),runtime:{version:applicationVersion,electron:process.versions.electron,chromium:process.versions.chrome,nativeEngines:nativeBrowsers.available()},errors:errors.slice(-10)};}
function broadcast(){if(manager&&!manager.isDestroyed())manager.webContents.send('workspace-changed',state());for(const b of browsers.values())update(b);}
function uiText(key){return translate(key,store?.state.settings.language||'en');}
function uiMessage(key,values){return uiText(key).replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??''));}
function report(e){errors.push({at:new Date().toISOString(),message:String(e.message||e)});broadcast();}
function failIfRunning(id){profileTasks.assertAvailable(id);if(store.state.downloads.some(d=>d.profileId===id&&downloads.has(d.id)))throw Error('Termine ou cancele as transferencias deste perfil antes de o alterar.');if(browsers.has(id)||openingProfiles.has(id)||nativeBrowsers.has(id)||profileClosures.has(id))throw Error('Feche este perfil antes de alterar a configuração.');}
function securePreferences(extra={}){return {contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:!(isTest||process.argv.includes('--ui-suite')),...extra};}
function createShell(file,options={}){
 const w=new BrowserWindow({width:1240,height:840,minWidth:900,minHeight:620,backgroundColor:'#10121c',icon:join(root,'ui','assets','app-icon.png'),autoHideMenuBar:true,show:!isTest,...options,webPreferences:securePreferences({preload:join(root,'src','preload.cjs')})});
 trusted.add(w.webContents.id);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 w.webContents.on('will-navigate',e=>e.preventDefault());w.webContents.on('will-redirect',e=>e.preventDefault());
 w.webContents.on('destroyed',()=>trusted.delete(w.webContents.id));
 w.webContents.on('context-menu',(_event,params)=>{const wc=w.webContents,run=action=>{if(!wc.isDestroyed())action();};const items=editingItems(wc,params,uiText,run);if(items.length)Menu.buildFromTemplate(items).popup({window:w});});
 w.loadFile(join(root,'ui',file));return w;
}
async function sessionFor(p){
 trace('Sessao: '+p.name);
 if(sessions.has(p.id))return sessions.get(p.id);
 const ses=session.fromPath(profilePath(p.id));
 await bounded(ses.setProxy(p.proxy?{mode:'fixed_servers',proxyRules:p.proxy,proxyBypassRules:'<-loopback>'}:{mode:'direct'}),'configurar proxy de '+p.name,10000);
 trace('Proxy configurado: '+p.name);
 const ua=p.userAgent||session.defaultSession.getUserAgent().replace(/ (?:Browserland|Multi-Browser)\/[^\s]+/g,'').replace(/ Electron\/[^\s]+/g,'');
 ses.setUserAgent(ua,p.locale);await bounded(ses.closeAllConnections(),'fechar ligacoes antigas de '+p.name,10000);
 trace('Ligacoes preparadas: '+p.name);
 const permissionChoices=new Map();
 ses.setPermissionCheckHandler((_wc,permission,origin)=>permission==='geolocation'&&!!store.get(p.id).geolocation&&store.get(p.id).geolocationEnabled!==false&&/^https?:\/\//.test(origin)||permissionChoices.get(permission+'|'+origin)===true);
 ses.setPermissionRequestHandler(async(wc,permission,callback,details)=>{
  let origin;try{origin=new URL(details.requestingUrl||wc.getURL()).origin;}catch{callback(false);return;}
  if(!/^https?:\/\//.test(origin)){callback(false);return;}
  if(permission==='geolocation'&&store.get(p.id).geolocation&&store.get(p.id).geolocationEnabled!==false){callback(true);return;}
  if(!['media','notifications','fullscreen','clipboard-sanitized-write','geolocation'].includes(permission)){callback(false);return;}
  const key=permission+'|'+origin;
  if(permissionChoices.has(key)){callback(permissionChoices.get(key));return;}
  const owner=browsers.get(p.id)?.window;
  if(!owner||owner.isDestroyed()){callback(false);return;}
  try{const answer=await dialog.showMessageBox(owner,{type:'question',title:uiText('Permissão do site'),message:uiMessage('{origin} pede {permission}',{origin,permission}),buttons:['Recusar','Permitir'].map(uiText),defaultId:0,cancelId:0});const allowed=answer.response===1;permissionChoices.set(key,allowed);callback(allowed);}catch{callback(false);}
 });
 ses.removeAllListeners('will-download');
 ses.on('will-download',(_event,item)=>{
  const downloadId=randomUUID();
  const record={id:downloadId,profileId:p.id,name:item.getFilename(),url:item.getURL(),state:'progressing',received:0,total:item.getTotalBytes(),at:new Date().toISOString(),path:''};
  store.state.downloads??=[];store.state.downloads.unshift(record);store.state.downloads=store.state.downloads.slice(0,500);downloads.set(downloadId,item);
  let lastUpdate=0;item.on('updated',(_event,state)=>{record.state=item.isPaused()?'paused':state;record.received=item.getReceivedBytes();record.total=item.getTotalBytes();if(Date.now()-lastUpdate>250||state!=='progressing'){lastUpdate=Date.now();broadcast();}});
  item.on('done',(_event,state)=>{record.state=state;record.received=item.getReceivedBytes();record.path=state==='completed'?item.getSavePath():'';downloads.delete(downloadId);store.save();broadcast();});
  store.save();broadcast();
  if(isTest)item.setSavePath(join(dataRoot,'download-'+downloadId+'.txt'));
  else item.setSaveDialogOptions({title:uiText('Guardar ficheiro')+' · '+p.name,defaultPath:item.getFilename()});
  item.on('done',(_event,result)=>{if(result!=='completed')report(Error('Download '+result+': '+item.getFilename()));});
 });
 for(const extension of p.extensions){try{if(!ses.extensions.getExtension(extension.id))await ses.extensions.loadExtension(extensionPath(dataRoot,p.id,extension),{allowFileAccess:false});}catch(e){report(Error('Extensão '+extension.name+': '+e.message));}}
 sessions.set(p.id,ses);return ses;
}
function browserState(record){return {platform:process.platform,theme:store.state.settings.theme,language:store.state.settings.language,appearance:store.state.settings.appearance,bookmarks:store.state.bookmarks.filter(b=>b.profileId===record.profile.id),showBookmarks:record.showBookmarks??true,profile:publicProfile(record.profile),activeId:record.activeId,fullscreen:record.window.isFullScreen(),tabs:record.tabs.filter(t=>!t.view.webContents.isDestroyed()).map(t=>{const wc=t.view.webContents;return {id:t.id,title:t.title||'Novo separador',url:wc.getURL(),loading:wc.isLoading(),canGoBack:wc.navigationHistory.canGoBack(),canGoForward:wc.navigationHistory.canGoForward(),zoom:wc.getZoomFactor(),muted:wc.isAudioMuted(),find:{query:t.findQuery||'',...t.findResult},error:t.error||''};})};}
function openBookmarkEditor(record){
 const existing=[...bookmarkEditors.values()].find(e=>e.record===record);if(existing){existing.window.show();existing.window.focus();return {opened:true};}
 const wc=record.tabs.find(t=>t.id===record.activeId)?.view.webContents,url=safeURL(wc?.getURL());if(url==='about:blank')throw Error('Este separador não tem endereço.');
 const bookmark=store.state.bookmarks.find(b=>b.profileId===record.profile.id&&b.url===url);
 const window=createShell('bookmark.html',{parent:record.window,modal:true,width:560,height:490,minWidth:460,minHeight:460,resizable:true,show:false,title:uiText('Editar favorito')});
 const editor={record,window,bookmark:bookmark?{...bookmark}:{title:wc.getTitle()||url,url,notes:''}};const editorId=window.webContents.id;bookmarkEditors.set(editorId,editor);
 window.once('ready-to-show',()=>window.show());window.once('closed',()=>bookmarkEditors.delete(editorId));return {opened:true};
}

function update(record){if(!record.window.isDestroyed())record.window.webContents.send('workspace-changed',browserState(record));}
function activate(record,id,focus=false){
 const tab=record.tabs.find(t=>t.id===id);if(!tab)throw Error('Separador não encontrado.');
 record.activeId=id;
 for(const item of record.tabs)item.view.setVisible(item===tab);
 record.window.contentView.addChildView(tab.view);
 resize(record);update(record);if(focus)tab.view.webContents.focus();
}
function saveTabState(record){if(record.window.isDestroyed())return;record.profile.lastTabs=record.tabs.filter(t=>!t.view.webContents.isDestroyed()).map(t=>t.view.webContents.getURL()).filter(url=>url==='about:blank'||/^https?:/.test(url)).slice(0,30);store.save();}
function resize(record){const [width,height]=record.window.getContentSize();const top=record.showBookmarks===false?100:130;for(const t of record.tabs){t.view.setBounds({x:0,y:top,width,height:Math.max(1,height-top)});if(record.profile.emulateScreen&&t.view.webContents.debugger.isAttached())t.view.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width,height:Math.max(1,height-top),deviceScaleFactor:1,mobile:false,screenWidth:record.profile.width,screenHeight:record.profile.height}).catch(report);}}
function stopTabLoading(tab){if(!tab)return;tab.stopped=true;if(tab.pendingNavigation)tab.pendingNavigation.cancelled=true;tab.view.webContents.stop();}
const navigateTab=navigatePreparedPage;
async function addTab(record,url='about:blank',{background=false}={}){
 if(record.tabs.length>=30)throw Error('Limite de 30 separadores por janela.');
 const ses=await sessionFor(record.profile);
 if(record.window.isDestroyed()||profileClosures.has(record.profile.id))throw Error('O perfil está a fechar.');
 if(record.tabs.length>=30)throw Error('Limite de 30 separadores por janela.');
 const view=new WebContentsView({webPreferences:securePreferences({session:ses})});view.setBackgroundColor('#11131e');
 const wc=view.webContents,tab={id:randomUUID(),view,title:'Novo separador'};
 webOwners.set(wc.id,record.profile.id);record.tabs.push(tab);view.setVisible(false);if(!background||!record.activeId)activate(record,tab.id);else{resize(record);update(record);}
 wc.setWebRTCIPHandlingPolicy(record.profile.blockWebRTC?'disable_non_proxied_udp':'default');
 wc.setWindowOpenHandler(({url,disposition})=>{const target=webLink(url);if(target)newBrowserTab(record,{url:target,background:disposition==='background-tab'}).catch(report);return {action:'deny'};});
 wc.on('will-navigate',(e,url)=>{if(!/^https?:\/\//.test(url)&&url!=='about:blank')e.preventDefault();});
 wc.on('will-redirect',(e,url)=>{if(!/^https?:\/\//.test(url))e.preventDefault();});
 wc.on('before-input-event',(event,input)=>{
  if(input.type!=='keyDown')return;
  const primary=primaryShortcut(input,process.platform);
  if(input.key==='F11'){event.preventDefault();toggleFullscreen(record);return;}
  if(input.key==='F6'){event.preventDefault();focusAddress(record);return;}
  if(input.control&&!input.alt&&['Tab','PageUp','PageDown'].includes(input.key)){event.preventDefault();stepTab(record,input.key==='PageUp'||(input.key==='Tab'&&input.shift)?-1:1);return;}
  if(primary&&/^[1-9]$/.test(input.key)){event.preventDefault();selectTabNumber(record,Number(input.key));return;}
  if(input.key==='F3'){event.preventDefault();record.window.webContents.send('workspace-changed',{type:'find-next',forward:!input.shift});return;}
  if(input.key==='F5'){event.preventDefault();if(input.shift)wc.reloadIgnoringCache();else wc.reload();return;}
  if(input.key==='Escape'){if(wc.isLoading())stopTabLoading(tab);record.window.webContents.send('workspace-changed',{type:'find-close'});return;}
  if(input.alt&&['ArrowLeft','ArrowRight','Left','Right'].includes(input.key)){event.preventDefault();if(/Left$/.test(input.key)&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();else if(/Right$/.test(input.key)&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();return;}
  if(!primary)return;
  if(input.shift&&input.key.toLowerCase()==='b'){event.preventDefault();toggleBookmarkBar(record);}
  if(input.key.toLowerCase()==='s'){event.preventDefault();saveCurrentPage(record).catch(report);}
  if(input.key.toLowerCase()==='r'){event.preventDefault();if(input.shift)wc.reloadIgnoringCache();else wc.reload();}
  if(['0','+','=','-'].includes(input.key)){event.preventDefault();wc.setZoomFactor(input.key==='0'?1:Math.max(.5,Math.min(2,wc.getZoomFactor()+(input.key==='-'?-.1:.1))));update(record);}
  if(input.key.toLowerCase()==='d'){event.preventDefault();setImmediate(()=>{if(record.window.isDestroyed())return;try{openBookmarkEditor(record);}catch(error){report(error);}});}

  if(input.key.toLowerCase()==='l'){event.preventDefault();record.window.webContents.focus();record.window.webContents.send('workspace-changed',{type:'focus-address'});}
  if(input.key.toLowerCase()==='t'){event.preventDefault();newBrowserTab(record,{reopen:input.shift}).catch(report);}
  if(input.key.toLowerCase()==='p'){event.preventDefault();wc.print({silent:false});}
  if(input.key.toLowerCase()==='f'){event.preventDefault();record.window.webContents.focus();record.window.webContents.send('workspace-changed',{type:'find'});}
  if(input.key.toLowerCase()==='w'){event.preventDefault();if(input.shift)record.window.close();else closeTab(record,tab.id);}
 });
 wc.on('found-in-page',(_event,result)=>{if(tab.findRequestId!==result.requestId)return;tab.findResult={matches:result.matches,ordinal:result.activeMatchOrdinal};if(record.activeId===tab.id&&!record.window.isDestroyed())record.window.webContents.send('workspace-changed',{type:'find-result',...tab.findResult});});
 wc.on('page-title-updated',(_e,title)=>{tab.title=text(title,120);store.history(record.profile.id,wc.getURL(),title);update(record);});
 wc.on('did-navigate',(_e,url)=>{tab.error='';tab.findQuery='';tab.findRequestId=null;tab.findResult={matches:0,ordinal:0};store.history(record.profile.id,url,wc.getTitle());saveTabState(record);update(record);});
 wc.on('did-navigate-in-page',()=>{saveTabState(record);update(record);});
 wc.on('did-start-loading',()=>{tab.stopped=false;update(record);});wc.on('did-stop-loading',()=>update(record));
 wc.on('did-fail-load',(_e,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3&&!tab.stopped){tab.error=description;update(record);}});
 wc.on('render-process-gone',(_e,details)=>{tab.error='Processo de navegação terminou: '+details.reason;update(record);});
 wc.on('destroyed',()=>webOwners.delete(wc.id));
 wc.on('did-start-navigation',(event,_url,_inPlace,isMainFrame)=>{if(event.isMainFrame??isMainFrame){tab.documentVersion=(tab.documentVersion||0)+1;if(record.activeId===tab.id&&!record.window.isDestroyed())record.window.webContents.send('workspace-changed',{type:'link-target',tabId:tab.id,url:''});}});
 wc.on('update-target-url',(_event,url)=>{if(record.activeId===tab.id&&!record.window.isDestroyed())record.window.webContents.send('workspace-changed',{type:'link-target',tabId:tab.id,url:webLink(url)||''});});
 wc.on('context-menu',(_event,params)=>{
  const version=tab.documentVersion||0;const items=pageContextItems({wc,params,isCurrent:()=>version===(tab.documentVersion||0),t:uiText,openTab:(url,background)=>newBrowserTab(record,{url,background}),savePage:()=>saveCurrentPage(record,tab),clipboard,report});
  if(items.length)Menu.buildFromTemplate(items).popup({window:record.window});
 });
 try{
  trace('Preparar pagina isolada: '+record.profile.name);
  tab.ready=prepareEmbeddedPage(wc,record.profile,view.getBounds(),{trace:stage=>trace('Inicializacao '+stage+': '+record.profile.name)});
  await tab.ready;
 }catch(e){if(wc.isDestroyed()||record.window.isDestroyed()||!record.tabs.includes(tab))return tab;closeTab(record,tab.id);throw Error('Não foi possível aplicar os parâmetros do perfil: '+e.message);}
 if(wc.isDestroyed()||record.window.isDestroyed()||!record.tabs.includes(tab))return tab;
 trace('Abrir pagina do perfil: '+record.profile.name);
 if(!tab.pendingNavigation)navigateTab(tab,safeURL(url)).catch(e=>{if(!wc.isDestroyed()&&e.code!=='ERR_ABORTED'&&e.errno!==-3){tab.error=e.message;update(record);}});
 return tab;
}
function closeTab(record,id){
 const index=record.tabs.findIndex(t=>t.id===id);if(index<0)return;
 const [tab]=record.tabs.splice(index,1);if(/^https?:/.test(tab.view.webContents.getURL()))record.closedTabs.push(tab.view.webContents.getURL());record.closedTabs=record.closedTabs.slice(-20);if(record.window.contentView.children.includes(tab.view))record.window.contentView.removeChildView(tab.view);
 const pending=closeWebContents(tab.view.webContents,'fechar separador');record.pendingContents.add(pending);pending.finally(()=>record.pendingContents.delete(pending)).catch(report);
 if(!record.tabs.length){record.window.close();return;}
 saveTabState(record);if(record.activeId===id)activate(record,record.tabs[Math.max(0,index-1)].id,true);else update(record);
}
function focusAddress(record){record.window.webContents.focus();record.window.webContents.send('workspace-changed',{type:'focus-address'});}
function toggleFullscreen(record){record.window.setFullScreen(!record.window.isFullScreen());update(record);}
function stepTab(record,delta){if(![-1,1].includes(delta))throw Error('Direcao de separador invalida.');const index=record.tabs.findIndex(t=>t.id===record.activeId),next=record.tabs[(index+delta+record.tabs.length)%record.tabs.length];if(next)activate(record,next.id,true);}
function selectTabNumber(record,number){if(!Number.isInteger(number)||number<1||number>9)throw Error('Numero de separador invalido.');const tab=number===9?record.tabs.at(-1):record.tabs[number-1];if(tab)activate(record,tab.id,true);}
async function newBrowserTab(record,{reopen=false,url,background=false}={}){if(reopen){url=record.closedTabs.pop();if(!url)return;}const tab=await addTab(record,url,{background});if(!background&&!tab.view.webContents.isDestroyed()&&record.activeId===tab.id){if(!url||url==='about:blank')focusAddress(record);else tab.view.webContents.focus();}return tab;}
async function tabCommand(record,id,command){
 const index=record.tabs.findIndex(t=>t.id===id),tab=record.tabs[index];if(!tab)throw Error('Separador nao encontrado.');const wc=tab.view.webContents;
 if(command==='duplicate')return newBrowserTab(record,{url:safeURL(wc.getURL())});
 if(command==='reload'){wc.reload();return;}
 if(command==='mute'){wc.setAudioMuted(!wc.isAudioMuted());update(record);return;}
 if(command==='left'||command==='right'){const next=index+(command==='left'?-1:1);if(next>=0&&next<record.tabs.length){record.tabs.splice(index,1);record.tabs.splice(next,0,tab);saveTabState(record);update(record);}return;}
 if(command==='close'){closeTab(record,id);return;}
 if(command==='others'||command==='after'){const ids=record.tabs.filter((other,i)=>command==='others'?other.id!==id:i>index).map(t=>t.id);for(const otherId of ids)closeTab(record,otherId);return;}
 throw Error('Comando de separador invalido.');
}
function tabMenu(record,id){
 const index=record.tabs.findIndex(t=>t.id===id),tab=record.tabs[index];if(!tab)throw Error('Separador nao encontrado.');
 const item=(label,command,enabled=true)=>({label:uiText(label),enabled,click:()=>tabCommand(record,id,command).catch(report)});
 Menu.buildFromTemplate([item('Duplicar separador','duplicate'),item('Recarregar','reload'),{label:uiText('Silenciar separador'),type:'checkbox',checked:tab.view.webContents.isAudioMuted(),click:()=>tabCommand(record,id,'mute').catch(report)},{type:'separator'},item('Mover para a esquerda','left',index>0),item('Mover para a direita','right',index<record.tabs.length-1),{type:'separator'},item('Fechar separador','close'),item('Fechar outros separadores','others',record.tabs.length>1),item('Fechar separadores à direita','after',index<record.tabs.length-1)]).popup({window:record.window});
}
async function openProfileInner(id,options={}){
 const configured=store.get(id);if(configured.engine&&configured.engine!=='embedded'){const record=await nativeBrowsers.open(configured,options);configured.lastOpened=new Date().toISOString();configured.useCount=(configured.useCount||0)+1;store.save();broadcast();return record;}
 if(browsers.has(id)){const b=browsers.get(id);if(!isTest){b.window.show();b.window.focus();}return b;}
 const p=store.get(id);await sessionFor(p);
 const window=createShell('browser.html',{width:p.width,height:p.height,title:p.name+' · Browserland',minWidth:320,minHeight:240});
 const record={profile:p,window,tabs:[],closedTabs:[],pendingContents:new Set(),activeId:null};browsers.set(id,record);
 window.on('resize',()=>resize(record));for(const name of ['enter-full-screen','leave-full-screen'])window.on(name,()=>{resize(record);update(record);});window.on('close',()=>saveTabState(record));
 window.webContents.on('did-finish-load',()=>update(record));
 window.on('closed',()=>{
  const closing=Promise.all([...record.pendingContents,...record.tabs.map(t=>closeWebContents(t.view.webContents,'fechar documento do perfil'))]).then(async()=>{const ses=sessions.get(id);if(ses){ses.flushStorageData();await bounded(ses.cookies.flushStore(),'guardar cookies do perfil',10000);}}).finally(()=>{profileClosures.delete(id);browsers.delete(id);broadcast();});
  profileClosures.set(id,closing);closing.catch(report);
 });
 try{const urls=startupURLs(p);for(const url of urls)await addTab(record,url);p.lastOpened=new Date().toISOString();p.useCount=(p.useCount||0)+1;store.save();broadcast();}catch(e){if(!window.isDestroyed())window.close();throw e;}
 return record;
}
async function openProfile(id,options={}){
 profileTasks.assertIdle(id);
 if(quitting)throw Error('A aplicacao esta a encerrar.');
 if(profileClosures.has(id))await profileClosures.get(id);
 if(quitting)throw Error('A aplicacao esta a encerrar.');
 if(openingProfiles.has(id))return openingProfiles.get(id);
 const opening=openProfileInner(id,options);openingProfiles.set(id,opening);
 try{return await opening;}finally{openingProfiles.delete(id);}
}

async function stopProfile(id){
 if(openingProfiles.has(id))await openingProfiles.get(id).catch(()=>{});
 if(nativeBrowsers.has(id)){await nativeBrowsers.stop(id);return;}
 await closeWindow(browsers.get(id)?.window,'fechar perfil');
 await profileClosures.get(id);
}
async function stopAllProfiles(){
 if(store.state.profiles.some(p=>nativeBrowsers.isStandard(p.id)))throw Error(CLOSE_STANDARD);
 const ids=new Set([...browsers.keys(),...openingProfiles.keys(),...nativeBrowsers.records.keys(),...nativeBrowsers.opening.keys(),...profileClosures.keys()]);
 await settleOperations([...ids].map(id=>()=>stopProfile(id)),'Fechar perfis');
}
export function quitApplication(code=0){
 if(quitPromise)return quitPromise;
 quitting=true;process.exitCode=code;
 quitPromise=(async()=>{
  try{
   trace('Guardar perfis e encerrar documentos');
   await bounded(Promise.allSettled([...importJobs]),'concluir importacoes antes de sair',60000);
   await bounded(profileTasks.settle(),'concluir operacoes de perfis antes de sair',60000);
   await stopAllProfiles();
   await settleOperations([...sessions.values()].map(ses=>async()=>{ses.flushStorageData();await bounded(ses.cookies.flushStore(),'guardar cookies antes de sair',10000);await bounded(ses.closeAllConnections(),'fechar ligacoes antes de sair',10000);}), 'Guardar sessoes');
   await settleOperations(BrowserWindow.getAllWindows().filter(w=>w!==manager).map(w=>()=>closeWindow(w,'fechar janela da aplicacao')),'Fechar janelas');
   closingManager=true;await closeWindow(manager,'fechar gestor');
   trace('Janelas e documentos fechados; app.quit');
   if(code)app.exit(code);else app.quit();
  }catch(error){quitting=false;closingManager=false;quitPromise=null;process.exitCode=undefined;trace('Encerramento interrompido; nova tentativa permitida: '+error.message);throw error;}
 })();
 return quitPromise;
}
async function removeProfileData(p){
 for(const extension of p.extensions||[])removePortableExtension(dataRoot,p.id,extension);
 nativeBrowsers.removeData({...p,engine:p.engine||'embedded'});
 if(sessions.has(p.id)||existsSync(profilePath(p.id))){const ses=await sessionFor(p);await ses.clearStorageData();await ses.clearCache();sessions.delete(p.id);}
}

function saveSecret(profile,password){
 if(password===undefined||password==='')return;
 if(password===null){profile.proxySecret='';return;}
 if(!safeStorage.isEncryptionAvailable())throw Error('Proteção de credenciais do sistema indisponível.');
 if(!profile.proxy)throw Error('Configure o servidor proxy antes de guardar credenciais.');
 profile.proxySecret=safeStorage.encryptString(String(password)).toString('base64');
}
async function pickSave(value,name,encrypted=false){
 const {canceled,filePath}=await dialog.showSaveDialog(manager,{title:uiText(encrypted?'Exportação encriptada':'Exportar configurações'),defaultPath:name,filters:[{name:name.endsWith('.csv')?'CSV':'Browserland',extensions:[name.endsWith('.csv')?'csv':'json']}]});
 if(canceled)return {cancelled:true};
 writeFileSync(filePath,value,{mode:0o600});return {saved:true};
}
async function exportProfiles(data){
 const profiles=data.id?[store.get(data.id)]:selectedProfiles(store,data.ids);
 const exportedGroups=groupRecords(store.state,data.id||data.ids?[...new Set(profiles.flatMap(profileGroups))]:store.state.groups);
 if(data.format==='csv')return pickSave(csvText(profiles,exportedGroups),'browserland-perfis.csv');
 if(!data.cookies)return pickSave(JSON.stringify(configurationBundle(profiles,exportedGroups),null,2),'browserland-perfis.json');
 if(profiles.length!==1)throw Error('Selecione um perfil para partilhar cookies.');
 const p=profiles[0];failIfRunning(p.id);
 const cookies=p.engine&&p.engine!=='embedded'?await nativeBrowsers.cookies(p):await (await sessionFor(p)).cookies.get({});
 const siteStorage=p.engine&&p.engine!=='embedded'?await nativeBrowsers.exportStorage(p):undefined;
 const encrypted=encryptBundle({format:'browserland-session',version:cookies.some(c=>c.partitionKey)?2:1,profile:configurationBundle([p]).profiles[0],groups:exportedGroups,cookies,siteStorage},data.password);
 if(Buffer.byteLength(encrypted)>30*1024*1024)throw Error('Sessao demasiado grande para partilha (limite: 30 MiB).');
 return pickSave(encrypted,'browserland-sessao-encriptada.json',true);
}
function importProfiles(data){
 if(quitting)return Promise.reject(Error('A aplicacao esta a encerrar.'));
 const job=performProfileImport(data);importJobs.add(job);
 job.then(()=>importJobs.delete(job),()=>importJobs.delete(job));return job;
}
async function performProfileImport(data){
 let raw,token=data.token;
 if(token){
  const pending=pendingImports.get(token);
  if(!pending||pending.expires<Date.now())throw Error('Importacao expirada. Selecione novamente o ficheiro.');
  raw=pending.raw;
 }else{
  const {canceled,filePaths}=await dialog.showOpenDialog(manager,{title:uiText('Importar perfis JSON ou CSV'),properties:['openFile'],filters:[{name:uiText('Perfis'),extensions:['json','csv']}]});if(canceled)return {cancelled:true};
  if(statSync(filePaths[0]).size>30*1024*1024)throw Error('Ficheiro demasiado grande.');
  raw=readFileSync(filePaths[0],'utf8').replace(/^\uFEFF/,'');
  if(filePaths[0].toLowerCase().endsWith('.csv')){
   const {profiles,groups}=csvImport(raw);for(const p of profiles)saveSecret(p,takeCSVPassword(p));if(store.state.profiles.length+profiles.length>1000)throw Error('Limite de 1000 perfis.');
   commitProfileImport(store,profiles,groups);
   broadcast();return {imported:profiles.length,importedGroups:groups.length};
  }
 }
 let bundle=JSON.parse(raw);
 if(isBundleFormat(bundle.format,'encrypted')){
  if(!data.password){pendingImports.clear();token=randomUUID();pendingImports.set(token,{raw,expires:Date.now()+300000});return {needsPassword:true,token};}
  bundle=decryptBundle(raw,data.password);
 }
 if(token)pendingImports.delete(token);
 const inputs=configurationInputs(bundle);
 if(inputs.length>1000||store.state.profiles.length+inputs.length>1000)throw Error('Limite de 1000 perfis.');
 const clean=inputs.map(importProfileConfiguration),importedGroups=validateGroupRecords(bundle.groups??[]);
 if((bundle.cookies||bundle.siteStorage)&&clean.some(p=>p.launchMode==='plain'))throw Error('Neste perfil, utilize os menus do navegador para gerir cookies e sessões.');
 const importedCookies=bundle.cookies?.map(cookie=>cookieForImport(cookie,{partitioned:clean[0]?.engine!=='embedded'}));
 if(importedCookies?.length>10000)throw Error('Demasiados cookies.');
 await stageProfileImport({store,profiles:clean,groups:importedGroups,prepare:async()=>{
  if(bundle.siteStorage){if(clean[0].engine==='embedded')throw Error('Esta sessao exige um motor Chromium completo.');await nativeBrowsers.importStorage(clean[0],bundle.siteStorage);}
  if(importedCookies){if(clean[0].engine!=='embedded')await nativeBrowsers.importCookies(clean[0],importedCookies);else{const ses=await sessionFor(clean[0]);for(const cookie of importedCookies)await ses.cookies.set(cookie);await ses.cookies.flushStore();}}
 },discard:async p=>{
  const ses=sessions.get(p.id);
  try{if(ses){await ses.clearStorageData();await ses.clearCache();}}finally{sessions.delete(p.id);}
  nativeBrowsers.removeData(p);
 }});
 broadcast();return {imported:clean.length,importedGroups:importedGroups.length,cookies:importedCookies?.length??0};
}
function showManagerPage(page,profileId){if(!isTest){manager.show();manager.focus();}manager.webContents.send('workspace-changed',{type:'page',page,profileId});}
function toggleBookmarkBar(record){record.showBookmarks=record.showBookmarks===false;resize(record);update(record);}
async function saveCurrentPage(record,tab=record.tabs.find(t=>t.id===record.activeId)){const wc=tab?.view.webContents;if(!wc)return;const result=await dialog.showSaveDialog(record.window,{defaultPath:'pagina.html',filters:[{name:uiText('Página HTML'),extensions:['html']}]});if(!result.canceled)await wc.savePage(result.filePath,'HTMLComplete');}
function browserMenu(record){
 const uiText=key=>translate(key,store.state.settings.language);
 const wc=record.tabs.find(t=>t.id===record.activeId)?.view.webContents;
 Menu.buildFromTemplate([
  {label:uiText('Novo separador'),accelerator:'CommandOrControl+T',click:()=>newBrowserTab(record).catch(report)},
  {label:uiText('Reabrir separador fechado'),enabled:!!record.closedTabs.length,click:()=>newBrowserTab(record,{reopen:true}).catch(report)},
  {type:'separator'},
  {label:uiText('Favoritos'),submenu:[{label:uiText('Mostrar barra de favoritos'),type:'checkbox',checked:record.showBookmarks!==false,click:()=>toggleBookmarkBar(record)},{label:uiText('Gerir favoritos'),click:()=>showManagerPage('bookmarks',record.profile.id)},...store.state.bookmarks.filter(b=>b.profileId===record.profile.id).slice(0,30).map(b=>({label:b.title||b.url,click:()=>wc?.loadURL(safeURL(b.url)).catch(report)}))]},
  {label:uiText('Historico'),click:()=>showManagerPage('history',record.profile.id)},
  {label:uiText('Transferencias'),click:()=>showManagerPage('downloads',record.profile.id)},
  {label:uiText('Extensoes'),click:()=>showManagerPage('extensions',record.profile.id)},
  {type:'separator'},
  {label:uiText('Aumentar zoom'),click:()=>{wc?.setZoomFactor(Math.min(2,wc.getZoomFactor()+.1));update(record);}},
  {label:uiText('Repor zoom'),click:()=>{wc?.setZoomFactor(1);update(record);}},
  {label:uiText('Diminuir zoom'),click:()=>{wc?.setZoomFactor(Math.max(.5,wc.getZoomFactor()-.1));update(record);}},
  {label:uiText('Ecrã inteiro'),type:'checkbox',checked:record.window.isFullScreen(),accelerator:'F11',click:()=>toggleFullscreen(record)},
  {label:uiText('Procurar na pagina'),accelerator:'CommandOrControl+F',click:()=>record.window.webContents.send('workspace-changed',{type:'find'})},
  {label:uiText('Imprimir'),accelerator:'CommandOrControl+P',click:()=>wc?.print({silent:false})},
  {label:uiText('Guardar pagina'),click:()=>saveCurrentPage(record).catch(report)},
  {label:uiText('Copiar endereco'),click:()=>clipboard.writeText(wc?.getURL()||'')},
  {label:uiText('Definicoes'),click:()=>showManagerPage('settings',record.profile.id)},
  {type:'separator'},
  {label:uiText('Fechar janela'),click:()=>record.window.close()}
 ]).popup({window:record.window});
}
const actions={
 appearance:d=>{if(!['modern','classic'].includes(d.appearance))throw Error('Estilo de interface invalido.');store.state.settings.appearance=d.appearance;store.save();broadcast();return state();},
 authorWebsite:async()=>{await shell.openExternal('https://AntonioFradique.net');return {opened:true};},
 authorSocial:async d=>{await shell.openExternal(authorSocialURL(d.id));return {opened:true};},
 language:d=>{if(!validLanguage(d.language))throw Error('Idioma da interface invalido.');store.state.settings.language=normalizeLanguage(d.language);store.save();broadcast();return state();},
 nativePage:async d=>{profileTasks.assertIdle(d.id);const p=store.get(d.id);if(!p.engine||p.engine==='embedded')throw Error('Escolha um motor Chromium completo neste perfil.');if(d.page==='store')await nativeBrowsers.extensionStore(p);else await nativeBrowsers.page(p,d.page);return {opened:true};},
 downloadAction:d=>{const item=downloads.get(d.id);if(d.action==='reveal'){const record=store.state.downloads.find(x=>x.id===d.id);if(record?.path)shell.showItemInFolder(record.path);return {ok:true};}if(!item)throw Error('Transferencia terminada.');if(d.action==='cancel')item.cancel();else if(d.action==='pause')item.pause();else if(d.action==='resume'&&(item.isPaused()||item.canResume()))item.resume();return {ok:true};},
 clearDownloads:()=>{store.state.downloads=store.state.downloads.filter(d=>downloads.has(d.id));store.save();broadcast();return state();},

 pin:d=>{const p=store.get(d.id);p.pinned=!p.pinned;store.save();broadcast();return publicProfile(p);},
 defaultUserAgent:()=>session.defaultSession.getUserAgent().replace(/ Electron\/[^\s]+/g,'').replace(/ (?:Browserland|Multi-Browser)\/[^\s]+/g,''),
 sampleCSV:()=>pickSave(csvText([validateProfile({name:'Exemplo',notes:'Descricao do perfil',group:'Trabalho',proxy:'',locale:'pt-PT'})]),'modelo-perfis.csv'),
 deleteSelected:async d=>{
  const profiles=selectedProfiles(store,d.ids);for(const p of profiles)failIfRunning(p.id);
  const answer=await dialog.showMessageBox(manager,{type:'warning',message:uiMessage('Eliminar {n} perfis e respetivos dados de navegação?',{n:profiles.length}),buttons:['Cancelar','Eliminar'].map(uiText),defaultId:0,cancelId:0});if(answer.response!==1)return {cancelled:true};
  for(const p of profiles){await removeProfileData(p);store.remove(p.id);}
  broadcast();return {deleted:profiles.length};
 },
 groupSave:d=>{const previous=structuredClone(store.state);try{saveGroup(store,d);store.save();}catch(e){store.state=previous;throw e;}broadcast();return state();},
 deleteGroups:async d=>{
  if(!Array.isArray(d.names)||!d.names.length||d.names.some(g=>!store.state.groups.includes(g)))throw Error('Selecao de grupos invalida.');
  const answer=await dialog.showMessageBox(manager,{type:'warning',message:uiMessage('Remover {n} grupos? Os perfis e as outras associações serão conservados.',{n:d.names.length}),buttons:['Cancelar','Remover'].map(uiText),defaultId:0,cancelId:0});if(answer.response!==1)return {cancelled:true};
  removeGroups(store.state,d.names);
  for(const g of d.names)delete store.state.groupDetails[g];store.save();broadcast();return state();
 },

 bulkCreate:d=>{
  if(!Array.isArray(d.names)||!d.names.length||d.names.length>100||store.state.profiles.length+d.names.length>1000)throw Error('Crie entre 1 e 100 perfis por lote, até um total de 1000.');
  const engine=d.engine??'embedded';
  const profiles=d.names.map(name=>validateProfile({name,engine,launchMode:engine==='embedded'?'managed':'plain',...(d.groups!==undefined?{groups:d.groups}:{group:d.group||''}),locale:'pt-PT'}));
  const previous=structuredClone(store.state);
  try{store.state.profiles.push(...profiles);ensureProfileGroups(store.state,profiles);store.save();}catch(e){store.state=previous;throw e;}
  broadcast();return {created:profiles.length};
 },
 openGroup:async d=>{
  const profiles=d.ids?selectedProfiles(store,d.ids):store.state.profiles.filter(p=>!d.group||profileGroups(p).includes(d.group));
  return openProfileBatch(profiles,openProfile);
 },
 state:()=>state(),
 save:async d=>{if(d.id)failIfRunning(d.id);if(!d.id&&store.state.profiles.length>=1000)throw Error('Limite de 1000 perfis.');const previousProfile=d.id?store.get(d.id):{};const p=validateProfile(d,previousProfile);if(previousProfile.proxy!==p.proxy)p.proxySecret='';saveSecret(p,d.proxyPassword);const previous=structuredClone(store.state);try{const i=store.state.profiles.findIndex(x=>x.id===p.id);if(i<0)store.state.profiles.push(p);else store.state.profiles[i]=p;ensureProfileGroups(store.state,[p]);store.save();sessions.delete(p.id);}catch(e){store.state=previous;throw e;}broadcast();return publicProfile(p);},
 open:async d=>{await openProfile(d.id);if(d.url){const p=store.get(d.id);if(p.engine&&p.engine!=='embedded')await nativeBrowsers.navigate(p,d.url);else await addTab(browsers.get(d.id),safeURL(d.url));}return {opened:true};},
 stop:async d=>{await stopProfile(d.id);return {stopped:true};},
 stopAll:async()=>{await stopAllProfiles();return {stopped:true};},
 duplicate:d=>{if(store.state.profiles.length>=1000)throw Error('Limite de 1000 perfis.');const p=store.get(d.id);const copy=validateProfile({...p,name:p.name+' · cópia',latitude:p.geolocation?.latitude,longitude:p.geolocation?.longitude,geolocationAccuracy:p.geolocation?.accuracy});copy.proxySecret=p.proxySecret;store.state.profiles.push(copy);store.save();broadcast();return publicProfile(copy);},
 delete:async d=>{failIfRunning(d.id);const p=store.get(d.id);const answer=await dialog.showMessageBox(manager,{type:'warning',message:uiMessage('Eliminar “{name}” e os respetivos dados de navegação?',{name:p.name}),buttons:['Cancelar','Eliminar'].map(uiText),defaultId:0,cancelId:0});if(answer.response!==1)return {cancelled:true};await removeProfileData(p);store.remove(p.id);broadcast();return {deleted:true};},
 clearSelectedData:async d=>{
  failIfRunning(d.id);const p=store.get(d.id),plan=clearPlan(d);
  if(p.engine&&p.engine!=='embedded'){await nativeBrowsers.page(p,'settings/clearBrowserData');return {native:true,opened:true};}
  const answer=await dialog.showMessageBox(manager,{type:'warning',message:uiMessage('Limpar os dados selecionados de {name}? O período aplica-se ao histórico; dados dos sites e cache são limpos integralmente.',{name:p.name}),buttons:['Cancelar','Limpar'].map(uiText),defaultId:0,cancelId:0});if(answer.response!==1)return {cancelled:true};
  if(plan.dataTypes.length)await bounded((await sessionFor(p)).clearData({dataTypes:plan.dataTypes}),'limpar dados selecionados',30000);
  if(plan.history)store.state.history=store.state.history.filter(h=>h.profileId!==p.id||(plan.since&&Date.parse(h.at)<plan.since));store.save();broadcast();return {cleared:true};
 },
 editBookmark:d=>{const b=store.state.bookmarks.find(b=>b.id===d.id);if(!b)throw Error('Favorito nao encontrado.');const title=text(d.title,200),url=safeURL(d.url);if(!title||url==='about:blank')throw Error('Indique titulo e endereco validos.');if(store.state.bookmarks.some(other=>other.id!==b.id&&other.profileId===b.profileId&&other.url===url))throw Error('Já existe um favorito com este endereço neste perfil.');b.title=title;b.url=url;b.notes=text(d.notes,2000);store.save();broadcast();return state();},
 clear:async d=>{failIfRunning(d.id);const nativeProfile=store.get(d.id);if(nativeProfile.engine&&nativeProfile.engine!=='embedded'){await nativeBrowsers.page(nativeProfile,'settings/clearBrowserData');return {native:true,opened:true};}const answer=await dialog.showMessageBox(manager,{type:'warning',message:uiText('Limpar cookies, sessões e cache deste perfil? Os sites vão terminar a sessão.'),buttons:['Cancelar','Limpar'].map(uiText),defaultId:0,cancelId:0});if(answer.response!==1)return {cancelled:true};const ses=await sessionFor(store.get(d.id));await ses.clearStorageData();await ses.clearCache();return {cleared:true};},
 groups:d=>{const name=text(d.name,60);if(!name)throw Error('Indique o nome do grupo.');if(!store.state.groups.includes(name))store.state.groups.push(name);store.save();broadcast();return state();},
 removeGroup:d=>{removeGroups(store.state,[d.name]);store.save();broadcast();return state();},
 theme:d=>{store.state.settings.theme=d.theme==='light'?'light':'dark';nativeTheme.themeSource=store.state.settings.theme;store.save();broadcast();return state();},
 history:()=>store.state.history.slice().reverse(),
 clearHistory:d=>{if(d.id)store.get(d.id);const ids=Object.hasOwn(d,'ids')?d.ids:store.state.history.filter(h=>!d.id||h.profileId===d.id).map(h=>h.id);const removed=store.removeHistory(ids);broadcast();return {cleared:true,removed};},
 removeHistory:d=>{const removed=store.removeHistory(d.ids);broadcast();return {removed};},
 bookmarks:()=>store.state.bookmarks,
 bookmark:d=>{const url=safeURL(d.url);if(url==='about:blank')throw Error('Este separador não tem endereço.');store.get(d.profileId);if(!store.state.bookmarks.some(b=>b.profileId===d.profileId&&b.url===url))store.state.bookmarks.push({id:randomUUID(),profileId:d.profileId,url,title:text(d.title,200),at:new Date().toISOString()});store.save();broadcast();return {saved:true};},
 removeBookmark:d=>{store.state.bookmarks=store.state.bookmarks.filter(b=>b.id!==d.id);store.save();broadcast();return state();},
 exportGroups:d=>{const names=d.names??store.state.groups;if(!Array.isArray(names)||names.some(name=>!store.state.groups.includes(name)))throw Error('Seleção de grupos inválida.');const groups=groupRecords(store.state,names);return d.format==='json'?pickSave(JSON.stringify(configurationBundle([],groups),null,2),'browserland-grupos.json'):pickSave(csvText([],groups),'browserland-grupos.csv');},
 export:exportProfiles, import:importProfiles,
 extension:async d=>{const p=store.get(d.id);if(p.engine&&p.engine!=='embedded'){await nativeBrowsers.page(p,'extensions');return {native:true,opened:true};}failIfRunning(d.id);const result=await dialog.showOpenDialog(manager,{title:uiText('Selecionar extensão descompactada com manifest.json'),properties:['openDirectory']});if(result.canceled)return {cancelled:true};const ses=await sessionFor(p),installed=installPortableExtension(dataRoot,p.id,result.filePaths[0]);let ext;try{if(p.extensions.some(e=>e.id===installed.id))throw Error('Extension already added to this profile.');ext=await ses.extensions.loadExtension(installed.path,{allowFileAccess:false});p.extensions.push({id:ext.id,name:ext.name,directory:installed.directory});store.save();}catch(error){p.extensions=p.extensions.filter(e=>e.directory!==installed.directory);if(ext&&!p.extensions.some(e=>e.id===ext.id))ses.extensions.removeExtension(ext.id);removePortableExtension(dataRoot,p.id,installed);throw error;}broadcast();return {name:ext.name};},
 removeExtension:async d=>{failIfRunning(d.id);const p=store.get(d.id),ses=await sessionFor(p);const extension=p.extensions.find(x=>x.id===d.extensionId);if(!extension)throw Error('Extension not found.');ses.extensions.removeExtension(d.extensionId);removePortableExtension(dataRoot,p.id,extension);p.extensions=p.extensions.filter(x=>x.id!==d.extensionId);store.save();broadcast();return state();},
 proxyTest:async d=>{
  const p=store.get(d.id);if(!p.proxy)throw Error('Este perfil não tem proxy.');
  const ses=await sessionFor(p);
  return new Promise((resolve,reject)=>{
   const request=net.request({session:ses,url:'https://api.ipify.org?format=json',redirect:'error',useSessionCookies:false});
   const timer=setTimeout(()=>{request.abort();reject(Error('O proxy não respondeu em 15 segundos.'));},15000);
   let attempts=0;
   request.on('login',(auth,callback)=>{if(!auth.isProxy||!matchesProxyAuthority(auth.host,auth.port,p.proxy)||!p.proxyUser||!p.proxySecret||++attempts>1){callback();return;}try{callback(p.proxyUser,safeStorage.decryptString(Buffer.from(p.proxySecret,'base64')));}catch{callback();}});
   request.on('response',response=>{let body='';response.on('data',chunk=>{body+=chunk.toString();if(body.length>4096){request.abort();clearTimeout(timer);reject(Error('Resposta de IP inválida.'));}});response.on('end',()=>{clearTimeout(timer);try{if(response.statusCode!==200)throw Error('Proxy: HTTP '+response.statusCode);resolve({ip:text(JSON.parse(body).ip,100)});}catch(e){reject(e);}});response.on('error',e=>{clearTimeout(timer);reject(e);});});
   request.on('error',e=>{clearTimeout(timer);reject(e);});request.end();
  });
 },

};
const browserActions=new Set(['browserState','tabNew','tabClose','tabSelect','navigate','back','forward','reload','bookmark','zoom','find','downloads','menu','bookmarkNavigate','bookmarkEditor','stopLoading','print','savePage','toggleBookmarks','fullscreen','tabStep','tabNumber','tabMenu','tabCommand','closeBrowserWindow']);
// Reserve every selected profile before yielding to a dialog or filesystem work.
for(const name of ['delete','deleteSelected','clear','clearSelectedData','extension','removeExtension','export']){
 const action=actions[name];actions[name]=data=>{
  if(quitting)return Promise.reject(Error('A aplicacao esta a encerrar.'));
  if(name==='export'&&(!data.cookies||data.format==='csv'))return action(data);
  const profiles=name==='deleteSelected'?selectedProfiles(store,data.ids):name==='export'?(data.id?[store.get(data.id)]:selectedProfiles(store,data.ids)):[store.get(data.id)];
  for(const p of profiles)profileTasks.assertIdle(p.id);
  if(['clear','clearSelectedData','extension'].includes(name)&&profiles[0].engine&&profiles[0].engine!=='embedded')return action(data);
  for(const p of profiles)failIfRunning(p.id);
  return profileTasks.run(profiles.map(p=>p.id),()=>action(data));
 };
}
ipcMain.handle('browserland',async(event,action,data={})=>{
 if(!trusted.has(event.sender.id)||event.senderFrame!==event.sender.mainFrame)throw Error('Origem não autorizada.');
 if(typeof action!=='string'||!data||typeof data!=='object')throw Error('Pedido inválido.');
 if(quitting)throw Error('A aplicacao esta a encerrar.');
 const editor=bookmarkEditors.get(event.sender.id);
 if(editor){
  if(action==='bookmarkEditorState')return {bookmark:editor.bookmark,language:store.state.settings.language,theme:store.state.settings.theme,profileName:editor.record.profile.name};
  if(action==='bookmarkEditorClose'){editor.window.close();return {closed:true};}
  if(action==='bookmarkEditorSave'){
   const existing=editor.bookmark.id&&store.state.bookmarks.find(b=>b.id===editor.bookmark.id&&b.profileId===editor.record.profile.id);if(editor.bookmark.id&&!existing)throw Error('Favorito nao encontrado.');
   const url=safeURL(data.url),title=text(data.title,200),notes=text(data.notes,2000);if(!title||url==='about:blank')throw Error('Indique titulo e endereco validos.');
   if(store.state.bookmarks.some(b=>b!==existing&&b.profileId===editor.record.profile.id&&b.url===url))throw Error('Já existe um favorito com este endereço neste perfil.');
   if(existing)Object.assign(existing,{url,title,notes});else store.state.bookmarks.push({id:randomUUID(),profileId:editor.record.profile.id,url,title,notes,at:new Date().toISOString()});store.save();broadcast();return {saved:true};
  }
  if(action==='bookmarkEditorRemove'){const id=editor.bookmark.id;if(!id)throw Error('Favorito nao encontrado.');store.state.bookmarks=store.state.bookmarks.filter(b=>!(b.id===id&&b.profileId===editor.record.profile.id));store.save();broadcast();return {removed:true};}
  throw Error('Ação não autorizada nesta janela.');
 }
 const record=[...browsers.values()].find(b=>!b.window.isDestroyed()&&b.window.webContents.id===event.sender.id);
 if(record){
  if(!browserActions.has(action))throw Error('Ação não autorizada nesta janela.');
  const tab=record.tabs.find(t=>t.id===record.activeId),wc=tab?.view.webContents;
  switch(action){
   case 'browserState':return browserState(record);
   case 'tabNew':await newBrowserTab(record,data);break;
   case 'closeBrowserWindow':record.window.close();return {ok:true};
   case 'fullscreen':toggleFullscreen(record);return {fullscreen:record.window.isFullScreen()};
   case 'tabStep':stepTab(record,data.delta);break;
   case 'tabNumber':selectTabNumber(record,data.number);break;
   case 'tabMenu':tabMenu(record,data.id);break;
   case 'tabCommand':await tabCommand(record,data.id,data.command);break;
   case 'tabClose':closeTab(record,data.id);break;
   case 'tabSelect':activate(record,data.id,true);break;
   case 'navigate':if(tab){await navigateTab(tab,safeURL(data.url));if(!wc.isDestroyed()&&record.activeId===tab.id)wc.focus();}break;
   case 'back':if(wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();break;
   case 'forward':if(wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();break;
   case 'reload':if(data.ignoreCache)wc?.reloadIgnoringCache();else wc?.reload();break;
   case 'stopLoading':stopTabLoading(tab);break;
   case 'bookmarkEditor':return openBookmarkEditor(record);
   case 'print':wc?.print({silent:false});return {started:true};
   case 'savePage':await saveCurrentPage(record);return {ok:true};
   case 'toggleBookmarks':toggleBookmarkBar(record);return {ok:true};
   case 'bookmark':return actions.bookmark({profileId:record.profile.id,url:wc?.getURL(),title:wc?.getTitle()});
   case 'zoom':if(wc){const delta=Number(data.delta??0);if(!Number.isFinite(delta)||Math.abs(delta)>.5)throw Error('Zoom invalido.');wc.setZoomFactor(data.reset===true?1:Math.max(.5,Math.min(2,wc.getZoomFactor()+delta)));update(record);}break;
   case 'find':if(wc){if(data.query){const query=text(data.query,200),continuation=data.findNext===true&&tab.findQuery===query;tab.findQuery=query;tab.findRequestId=wc.findInPage(query,{forward:data.forward!==false,findNext:!continuation});}else{tab.findQuery='';tab.findRequestId=null;tab.findResult={matches:0,ordinal:0};wc.stopFindInPage('clearSelection');record.window.webContents.send('workspace-changed',{type:'find-result',matches:0,ordinal:0});}}break;
   case 'downloads':showManagerPage('downloads',record.profile.id);return {ok:true};
   case 'menu':browserMenu(record);return {ok:true};
   case 'bookmarkNavigate':{const b=store.state.bookmarks.find(b=>b.id===data.id&&b.profileId===record.profile.id);if(b)await navigateTab(tab,safeURL(b.url));break;}
  }return {ok:true};
 }
 if(event.sender.id!==manager?.webContents.id||!Object.hasOwn(actions,action))throw Error('Ação não autorizada.');
 return actions[action](data);
});
app.on('login',(event,wc,request,auth,callback)=>{
 if(!auth.isProxy||!wc||!webOwners.has(wc.id))return;event.preventDefault();
 const id=webOwners.get(wc?.id),p=id&&store.get(id);
 if(!p?.proxyUser||!p.proxySecret){callback();return;}
 if(!matchesProxyAuthority(auth.host,auth.port,p.proxy)){callback();return;}
 try{callback(p.proxyUser,safeStorage.decryptString(Buffer.from(p.proxySecret,'base64')));}catch{callback();}
});
app.on('web-contents-created',(_e,wc)=>{wc.on('will-attach-webview',e=>e.preventDefault());});
app.on('before-quit',event=>{if(!closingManager&&manager&&!manager.isDestroyed()){event.preventDefault();manager.close();}});
app.on('window-all-closed',()=>{if(!quitting&&!nativeBrowsers.records.size)app.quit();});
app.on('will-quit',()=>trace('Evento will-quit'));app.on('quit',(_event,code)=>trace('Evento quit: '+code));
app.whenReady().then(async()=>{
 const startup=await startupProgress({root,isTest});startup.update(45,'Loading saved settings');
 if(process.platform==='darwin')app.dock?.setIcon(join(root,'ui','assets','app-icon.png'));
 store=new Store(dataRoot);for(const d of store.state.downloads||[])if(['progressing','paused'].includes(d.state))d.state='interrupted';nativeTheme.themeSource=store.state.settings.theme;
 Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{label:'Browserland',submenu:[{role:'about',label:'About Browserland'},{type:'separator'},{role:'hide',label:'Hide Browserland'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'Quit Browserland',accelerator:'Command+Q',click:()=>manager?.close()}]},{role:'editMenu'},{role:'windowMenu'}]):null);startup.update(80,'Opening your workspace');manager=createShell('index.html',{show:false,title:'Browserland'});
 manager.on('close',event=>{
  if(closingManager)return;event.preventDefault();
  if(quitting||quitPrompt)return;
  if((browsers.size||nativeBrowsers.records.size||openingProfiles.size)&&!isTest){quitPrompt=true;dialog.showMessageBox(manager,{type:'question',message:uiText('Fechar o gestor e todas as janelas de navegação?'),buttons:['Cancelar','Fechar tudo'].map(uiText),defaultId:0,cancelId:0}).then(async({response})=>{if(response===1)await quitApplication();}).catch(report).finally(()=>{quitPrompt=false;});}
  else quitApplication().catch(report);
 });
 manager.webContents.on('did-finish-load',()=>broadcast());
 await startup.complete(manager);
 if(isTest){trace('Iniciar teste desktop');try{const {runSmoke}=await import('./smoke.mjs');await bounded(runSmoke({app,store,manager,sessionFor,openProfile,browsers,nativeBrowsers,root,dataRoot,trace,actions,dialog,addTab,quitApplication}),'teste desktop completo',120000);trace('Integracoes concluidas; iniciar encerramento normal');await quitApplication(0);}catch(e){trace('FAIL: '+String(e.message||e));writeFileSync(join(dataRoot,'smoke-error.log'),e.stack||String(e));console.error(e);await quitApplication(1);}}
}).catch(e=>{console.error(e);app.exit(1);});
