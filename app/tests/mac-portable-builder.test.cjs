'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const base=path.resolve(__dirname,'..'),builder=path.join(base,'.cache','builder-compat-2.6.5');
const apps=require(path.join(builder,'src/shared/portable-app.js'));
const runtime=require(path.join(builder,'src/shared/portable-runtime.js'));
const version=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8')).version;
const source=process.env.BROWSERLAND_MAC_PORTABLE||process.env.MULTIBROWSER_MAC_PORTABLE||path.join(base,'dist',version,'Mac-Portable');
const testing=fs.mkdtempSync(path.join(base,'.cache/mac-portable-builder-test-'));
const assetsDir=path.join(testing,'assets');fs.mkdirSync(assetsDir);
const checks=[];const ok=(label)=>{checks.push(label);console.log('PASS '+label);};
function digest(file){const hash=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));}finally{fs.closeSync(fd)}return hash.digest('hex');}
(async()=>{
 const scan=apps.scanPortableFolder(source);
 assert.equal(scan.candidates.length,1);assert.equal(scan.candidates[0].path,'Browserland.app');
 assert.equal(scan.candidates[0].kind,'app');assert.deepEqual(scan.candidates[0].architectures,['x64','arm64']);
 assert(scan.candidates[0].executable&&scan.hasSymlinks);
 ok('Builder 2.6.5 detects one universal Mac application from Windows');
 const data=apps.importPortableProject({sourcePath:source,assetsDir,entries:{windows:null,mac:'Browserland.app'},allowWine:false});
 const target=apps.assertPortableTarget({data,assetsDir,target:'mac'});
 assert.equal(target.requiresWine,false);assert.equal(target.launchKind,'app');assert.deepEqual(target.architectures,['x64','arm64']);
 ok('Actual portable import and Mac-target validation succeed without Wine');
 const metadata=JSON.parse(fs.readFileSync(path.join(source,'mac-portable-metadata.json'),'utf8'));
 let modes=0,links=0,requiredLaunchers=0;
 for(const entry of metadata.entries){
  const file=path.join(target.rootPath,...entry.path.split('/'));
  if(entry.kind==='file'){
   assert.equal(digest(file),entry.sha256,entry.path);
   const stat=fs.lstatSync(file);const mode=apps.portableFileMode(file,stat);
   if(mode===0o755){modes++;assert(mode&0o111);}
   if(/\/Contents\/MacOS\/[^/]+$/.test(entry.path)){assert(mode&0o111,'Mac application executable needs execute bits: '+entry.path);requiredLaunchers++;}
  }else if(entry.kind==='symlink'){
   assert(fs.lstatSync(file).isSymbolicLink());assert.equal(fs.readlinkSync(file).replace(/\\/g,'/'),entry.target);links++;
  }
 }
 assert.equal(links,38);assert(requiredLaunchers>=5,'Outer launcher and both Electron/Chromium entrypoints must be executable');
 ok('All imported payload hashes and 38 internal symlinks match');
 ok('Windows export identifies native Mach-O execution modes');
 const storageDir=path.join(testing,'persistent-working-copy');const launches=[];
 function execFileImpl(executable,args,options,callback){
  assert.equal(executable,'/usr/bin/open');assert.deepEqual(args.slice(0,2),['-n','-a']);
  assert(args[2].endsWith(path.sep+'Browserland.app'));assert(fs.statSync(args[2]).isDirectory());
  assert.equal(options.shell,false);launches.push(args[2]);queueMicrotask(()=>callback(null));
  return {kill(){}};
 }
 function spawnImpl(){throw Error('Unexpected Wine or Windows process request');}
 for(const arch of ['x64','arm64']){
  const result=await runtime.launchPortableProject({data,assetsDir,storageDir,platform:'darwin',arch,execFileImpl,spawnImpl});
  assert.equal(result.via,'native');
  const marker=path.join(path.dirname(launches[launches.length-1]),'builder-persistence-test.txt');
  if(arch==='x64')fs.writeFileSync(marker,'preserved');
  else assert.equal(fs.readFileSync(marker,'utf8'),'preserved');
 }
 assert.equal(launches[0],launches[1]);
 ok('Both Mac architectures dispatch to the bundled app through LaunchServices');
 ok('Builder working folder persists across repeated module openings');
 const result={ok:true,checks:checks.length,labels:checks,builderVersion:'2.6.5',builderSource:'read from supplied Mac-Software-Builder-2.6.5.dmg',
  builderSourceHashes:Object.fromEntries(['portable-app.js','portable-runtime.js'].map(name=>[name,digest(path.join(builder,'src/shared',name))])),
  folder:source,workingCopy:testing,importedSymlinks:links,macExecutableModes:modes,macExecutionVerified:false,
  limitation:'Import/copy are real Windows operations; macOS open is a verified dispatch stub, not a real Mac execution test.'};
 fs.writeFileSync(path.join(base,'reference','mac-portable-builder-'+version+'.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
