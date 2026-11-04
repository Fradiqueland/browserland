// Real Chromium renderer checks. Electron's OS opener is represented by a local
// IPC fixture; this does not replace an unsandboxed-host Electron execution test.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,open} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
import {AUTHOR_SOCIAL_LINKS} from '../src/author-social.mjs';
import {LANGUAGES} from '../src/languages.mjs';
const root=resolve(import.meta.dirname,'..');
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const run=await mkdtemp(join(root,'.cache/social-render-'));
const chrome=(process.env.BROWSERLAND_TEST_CHROMIUM||process.env.MULTIBROWSER_TEST_CHROMIUM)||join(root,'.runtime/chromium/chrome.exe');
const state={schema:2,profiles:[],groups:['Personal','Work'],groupDetails:{},history:[],bookmarks:[],downloads:[],errors:[],settings:{theme:'dark',language:'en',appearance:'modern'},runtime:{version,electron:'44.9.3',chromium:'158',nativeEngines:[]}};
const fixture=`const state=${JSON.stringify(state)},links=${JSON.stringify(AUTHOR_SOCIAL_LINKS)};let notify=()=>{};window.fixture={opened:[],set(settings){Object.assign(state.settings,settings);notify(structuredClone(state));}};window.desktop={subscribe(fn){notify=fn;return()=>{}},async request(action,data={}){if(action==='authorSocial'){const link=links.find(link=>link.id===data.id);if(!link)throw Error('Unknown social network.');window.fixture.opened.push({id:link.id,url:link.url});return {opened:true}}if(action==='state')return structuredClone(state);if(['language','appearance','theme'].includes(action)){Object.assign(state.settings,data);notify(structuredClone(state));return structuredClone(state)}throw Error('Unexpected fixture action: '+action)}};`;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/fixture.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(fixture);return;}
  const path=decodeURIComponent(url.pathname),file=resolve(root,'.'+path);
  if(!['/src/','/ui/'].some(prefix=>path.startsWith(prefix))||!file.startsWith(root+'\\')&&!file.startsWith(root+'/')){res.writeHead(404);res.end();return;}
  let data=await readFile(file);
  if(path==='/ui/index.html')data=Buffer.from(data.toString().replace('<script type="module" src="app.js">','<script src="/fixture.js"></script><script type="module" src="app.js">'));
  const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'}[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const log=await open(join(run,'chromium.log'),'w');
const child=spawn(chrome,['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+join(run,'profile'),'--window-size=1280,900','about:blank'],{stdio:['ignore',log.fd,log.fd],windowsHide:true});
child.on('error',error=>console.error(error));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate,label){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await predicate())return;await wait(30)}throw Error('Timeout: '+label)}
let socket;const checks=[];
function check(label,condition=true){assert.ok(condition,label);checks.push(label);console.log('PASS '+label)}
try{
 let port;
 await until(async()=>{try{port=Number((await readFile(join(run,'profile/DevToolsActivePort'),'utf8')).split('\n')[0]);return port>0}catch{return false}},'start isolated Chromium');
 const target=await (await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
 let serial=0;const requests=new Map();const errors=[];
 socket.onmessage=({data})=>{const result=JSON.parse(data);if(result.id){const task=requests.get(result.id);requests.delete(result.id);if(result.error)task.reject(Error(result.error.message));else task.resolve(result.result)}else if(result.method==='Runtime.exceptionThrown')errors.push(result.params.exceptionDetails.exception?.description||result.params.exceptionDetails.text)};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/ui/index.html'});
 await until(()=>evaluate(`document.querySelector('#application-version')?.textContent.includes(${JSON.stringify(version)})`),'render application');
 const links=await evaluate("[...document.querySelectorAll('#author-socials a')].map(a=>({id:a.dataset.social,url:a.href,name:a.title,aria:a.getAttribute('aria-label'),icon:a.querySelector('svg').getAttribute('viewBox')}))");
 assert.deepEqual(links,AUTHOR_SOCIAL_LINKS.map(link=>({id:link.id,url:link.url,name:link.name,aria:link.name,icon:'0 0 24 24'})));check('Nine SVG icons have exact destinations and accessible labels');
 for(const link of AUTHOR_SOCIAL_LINKS)await evaluate(`document.querySelector('[data-social="${link.id}"]').click()`);
 assert.deepEqual(await evaluate('window.fixture.opened'),AUTHOR_SOCIAL_LINKS.map(link=>({id:link.id,url:link.url})));check('Nine real renderer click handlers dispatch the expected identifiers');
 await evaluate("document.querySelector('[data-social=instagram]').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await until(()=>evaluate('window.fixture.opened.length===10'),'activate social link with Enter');check('Keyboard Enter activates the focused social link');
 for(const theme of ['dark','light'])for(const appearance of ['modern','classic'])for(const {id:language} of LANGUAGES){
  await evaluate(`window.fixture.set(${JSON.stringify({theme,appearance,language})})`);
  assert.ok(await evaluate("[...document.querySelectorAll('#author-socials a')].every(a=>a.getBoundingClientRect().width===44&&a.getBoundingClientRect().height===44&&a.getAttribute('aria-label')===a.title)"));
  assert.equal(await evaluate('document.documentElement.lang'),language);
  assert.ok(await evaluate("document.querySelector('#author-socials').getBoundingClientRect().width<=document.querySelector('aside').clientWidth"));
  if((language==='en'&&theme==='light'&&appearance==='modern')||(language==='ar'&&theme==='dark'&&appearance==='classic')){
   await evaluate("document.querySelector('#author-socials').scrollIntoView({block:'end'})");await wait(100);
   const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(run,`social-menu-${language}-${theme}-${appearance}.png`),Buffer.from(screenshot.data,'base64'));
  }
 }
 check('44 language/theme/style combinations retain 44px controls without sidebar overflow');
 assert.deepEqual(errors,[]);check('Application renderer completes without JavaScript errors');
 const report={ok:true,version,run,checks,combinations:44,renderer:'bundled Chromium with local IPC fixture',electronExecutionVerified:false,macExecutionVerified:false,diagnosticBrowserSandboxDisabled:true};
 await writeFile(join(root,'reference',`author-social-render-${version}.json`),JSON.stringify(report,null,2));console.log('SOCIAL_RENDER_OK '+run);
 await send('Browser.close').catch(()=>{});
}finally{
 socket?.close();if(child.exitCode===null)child.kill();await new Promise(resolve=>server.close(resolve));await log.close();
}
