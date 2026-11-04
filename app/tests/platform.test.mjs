import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationDataDirectory,portableDirectory,discoverEngines,engineCandidates} from '../src/platform.mjs';
import {primaryShortcut} from '../ui/shortcuts.mjs';
test('Dados portateis ficam fora do bundle Mac e mantem o caminho Windows',()=>{
 assert.equal(applicationDataDirectory({platform:'win32',packaged:true,execPath:'D:/Portable/Browserland.exe'}),'D:\\Portable\\data');
 for(const arch of ['Intel','Apple Silicon'])assert.equal(applicationDataDirectory({platform:'darwin',packaged:true,execPath:'/Volumes/'+arch+'/Browserland.app/Contents/MacOS/Electron'}),'/Volumes/'+arch+'/data');
 assert.equal(portableDirectory({platform:'darwin',execPath:'/Applications/Outer.app/Apps/Browserland.app/Contents/MacOS/Electron'}),'/Applications/Outer.app/Apps');
 assert.equal(applicationDataDirectory({platform:'darwin',packaged:false,appRoot:'/work/app',execPath:'/runtime/Electron.app/Contents/MacOS/Electron'}),'/work/app/data');
 assert.equal(applicationDataDirectory({platform:'darwin',packaged:true,execPath:'/Applications/Browserland.app/Contents/MacOS/Electron',override:'/Volumes/USB/Sessions'}),'/Volumes/USB/Sessions');
});
test('Chromium Mac incluido tem prioridade, manifesto externo e fallback por utilizador',()=>{
 const options={platform:'darwin',execPath:'/portable/Browserland.app/Contents/MacOS/Electron',home:'/Users/test',env:{}};
 const candidates=engineCandidates('/portable/Browserland.app/Contents/Resources/app',options);
 const paths=new Set(['/portable/.runtime/chromium/Chromium.app/Contents/MacOS/Chromium','/Users/test/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']);
 const result=discoverEngines('/portable/Browserland.app/Contents/Resources/app',{...options,exists:path=>paths.has(path)});
 assert.deepEqual(result.map(x=>x.id),['chromium','edge','chrome']);
 assert.equal(result[0].manifestPath,'/portable/.runtime/chromium/browserland-runtime.json');
 assert.equal(candidates.some(x=>x.path.endsWith('.exe')),false);
 assert.deepEqual(discoverEngines('/work',{...options,exists:()=>false}),[]);
});
test('Edge Windows x64 e candidatos duplicados nao dependem da pasta corrente',()=>{
 const options={platform:'win32',execPath:'D:/portable/Browserland.exe',home:'C:/Users/test',env:{PROGRAMFILES:'C:/Programs','PROGRAMFILES(X86)':'C:/Programs32',LOCALAPPDATA:'C:/Users/test/Local'}};
 const result=discoverEngines('D:/source/app',{...options,exists:()=>true});
 assert.deepEqual(result.map(x=>x.id),['chromium','chrome','edge']);
 assert.equal(result[2].path,'C:\\Programs\\Microsoft\\Edge\\Application\\msedge.exe');
 const only=discoverEngines('D:/source/app',{...options,exists:path=>path.includes('Programs32')});assert.equal(only.length,1);assert.equal(only[0].id,'edge');
});
test('Command no Mac, Control no Windows, sem capturar AltGr ou teclas normais',()=>{
 for(const dom of [true,false]){
  const ctrl=dom?{ctrlKey:true}:{control:true},meta=dom?{metaKey:true}:{meta:true},alt=dom?{altKey:true}:{alt:true};
  assert.equal(primaryShortcut(meta,'darwin'),true);assert.equal(primaryShortcut(ctrl,'darwin'),false);
  assert.equal(primaryShortcut(ctrl,'win32'),true);assert.equal(primaryShortcut(meta,'win32'),false);
  assert.equal(primaryShortcut({...ctrl,...alt},'win32'),false);assert.equal(primaryShortcut({...meta,...alt},'darwin'),false);
 }
 assert.equal(primaryShortcut({},'darwin'),false);
});
