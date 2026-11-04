import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {Store,validateProfile,configurationBundle,importProfileConfiguration} from '../src/core.mjs';
import {profileGroups,setProfileGroups,groupRecords,mergeGroups,removeGroups,validateGroupRecords} from '../src/groups.mjs';
import {saveGroup,csvText,csvImport,parseCSV} from '../src/workspace.mjs';
import {profilePage,groupPage} from '../src/query.mjs';
mkdirSync(join(import.meta.dirname,'../test-results'),{recursive:true});
const root=join(import.meta.dirname,'../test-results');
const store=()=>new Store(mkdtempSync(join(root,'groups-')));

test('Migracao de grupo unico conserva identidade, sessoes e ficheiro antigo ate guardar',()=>{
 const s=store(),p=validateProfile({name:'Legado',group:'Trabalho'});delete p.groups;p.lastTabs=['https://example.org/private'];const data={...s.state,schema:1,profiles:[p]};writeFileSync(s.file,JSON.stringify(data));const marker=join(s.directory,'profiles',p.id);mkdirSync(marker,{recursive:true});writeFileSync(join(marker,'session-marker'),'unchanged');
 const loaded=new Store(s.directory);assert.equal(loaded.state.schema,2);assert.deepEqual(loaded.get(p.id).groups,['Trabalho']);assert.deepEqual(loaded.get(p.id).lastTabs,p.lastTabs);assert.equal(JSON.parse(readFileSync(s.file)).schema,1);loaded.save();assert.equal(new Store(s.directory).get(p.id).id,p.id);assert.equal(readFileSync(join(marker,'session-marker'),'utf8'),'unchanged');assert.equal(JSON.parse(readFileSync(s.file+'.backup')).schema,1);
});
test('Renomear e remover um grupo conserva as outras associacoes e o perfil',()=>{
 const s=store(),p=s.upsert({name:'A',groups:['Norte','Projetos','Norte']}),id=p.id;assert.deepEqual(p.groups,['Norte','Projetos']);saveGroup(s,{previous:'Norte',name:'Norte novo',description:'Descrição'});assert.deepEqual(profileGroups(p),['Norte novo','Projetos']);removeGroups(s.state,['Norte novo']);assert.deepEqual(p.groups,['Projetos']);assert.equal(p.group,'Projetos');assert.equal(p.id,id);assert.equal(s.state.profiles.length,1);s.save();assert.deepEqual(new Store(s.directory).get(id).groups,['Projetos']);
});
test('Filtros pesquisa e contagem incluem todos os grupos sem duplicar linhas',()=>{
 const p=validateProfile({name:'A',groups:['Primeiro','Segundo']}),other=validateProfile({name:'B',group:'Segundo'});assert.equal(profilePage([p,other],{group:'Segundo'}).total,2);assert.equal(profilePage([p,other],{query:'Primeiro'}).total,1);const counted=groupPage(['Primeiro','Segundo'],{},[p,other]);assert.equal(counted.items.find(g=>g.name==='Segundo').count,2);assert.equal(counted.items.find(g=>g.name==='Primeiro').count,1);
});
function configured(name){const p=validateProfile({name,notes:'=texto, "com aspas"\nSegunda linha',groups:['Cliente, "Norte"','__proto__',"'Especial"],proxy:'http://127.0.0.1:8080',proxyUser:'=utilizador',locale:'fr-FR',timezone:'Europe/Lisbon',timezoneEnabled:false,latitude:0,longitude:-9.1,geolocationEnabled:false,userAgent:'Custom UA',width:1920,height:1080,startURL:'https://example.org/start',startupMode:'restore',startupPages:['https://example.org/a?q=1','about:blank'],color:'#123abc',emulateScreen:true,blockWebRTC:false,privacy:{canvas:true,webgl:false,fonts:true,audio:true,webrtc:true}});Object.assign(p,{pinned:true,createdAt:'2020-01-02T03:04:05.000Z',updatedAt:'2024-05-06T07:08:09.000Z',lastOpened:'2026-01-02T03:04:05.000Z',useCount:42});p.geolocation.accuracy=25;return p;}
test('CSV exportado e reimportado conserva todas as configuracoes e metadados exportados',()=>{
 for(const name of ['=SUM(1,2)',"'=Nome literal",'@nome','-nome','Nome, "áé"']){const p=configured(name);p.proxySecret='DO-NOT-EXPORT';p.extensions=[{id:'x',path:'C:/private-extension'}];p.lastTabs=['https://private.invalid'];const groups=[{name:'Vazio',description:'=descricao\ncom vírgula, e "aspas"'},...p.groups.map(name=>({name,description:'Desc '+name}))];const text=csvText([p],groups),copy=csvImport(text);assert.equal(copy.profiles.length,1);assert.notEqual(copy.profiles[0].id,p.id);assert.deepEqual(configurationBundle(copy.profiles).profiles,configurationBundle([p]).profiles);assert.deepEqual(copy.groups,groups);assert.ok(!text.includes('DO-NOT-EXPORT')&&!text.includes('private-extension')&&!text.includes('private.invalid'));assert.equal(parseCSV(text)[0].name.startsWith("'"),/^[=+@'-]/.test(name));}
});
test('CSV autonomo conserva grupos vazios e descricoes sem criar perfis',()=>{
 const groups=[{name:'Sem perfis',description:'Descrição\ncom aspas " e vírgula,'},{name:'__proto__',description:'Seguro'}],copy=csvImport(csvText([],groups));assert.deepEqual(copy,{profiles:[],groups});const s=store();mergeGroups(s.state,copy.groups);assert.equal(Object.getPrototypeOf(s.state.groupDetails),Object.prototype);assert.equal(s.state.groupDetails.__proto__.description,'Seguro');assert.equal(s.state.profiles.length,0);
});
test('JSON versionado conserva grupos, fixacao, datas e configuracoes',()=>{
 const original=configured('Configuração'),groups=[{name:'Vazio',description:'Sem perfis'}],bundle=JSON.parse(JSON.stringify(configurationBundle([original],groups)));assert.equal(bundle.version,2);assert.deepEqual(configurationBundle(bundle.profiles.map(importProfileConfiguration),bundle.groups),bundle);
});
test('Importacao antiga continua a aceitar grupo unico e CSV Logii',()=>{
 const p=csvImport('name,group,proxy,disableWebrtc,disableWebRTC\r\nAntigo,Trabalho,,true,false').profiles[0];assert.deepEqual(p.groups,['Trabalho']);assert.equal(p.blockWebRTC,true);assert.equal(p.privacy.webrtc,false);const old=importProfileConfiguration({name:'Antigo JSON',group:'Equipa'});assert.deepEqual(old.groups,['Equipa']);
});
test('Grupos importados atualizam descricoes e conservam grupos nao incluidos',()=>{
 const s=store();mergeGroups(s.state,[{name:'Pessoal',description:'Antiga'},{name:'Fora',description:'Conservar'}]);mergeGroups(s.state,[{name:'Pessoal',description:'Nova'},{name:'Vazio',description:''}]);assert.equal(s.state.groupDetails.Pessoal.description,'Nova');assert.equal(s.state.groupDetails.Fora.description,'Conservar');assert.deepEqual(groupRecords(s.state,['Vazio']),[{name:'Vazio',description:''}]);
});
test('Dados de grupos e versoes invalidas sao recusados antes de importar',()=>{
 assert.throws(()=>validateProfile({name:'A',groups:'a,b'}));assert.throws(()=>validateGroupRecords([{name:'A'},{name:'A'}]));assert.throws(()=>validateGroupRecords([{name:'A',description:123}]));assert.throws(()=>csvImport('name,fileFormat,recordType\nA,browserland-csv/99,profile'));assert.throws(()=>csvImport('name,fileFormat,recordType,groups\nA,browserland-csv/2,profile,not-json'));assert.throws(()=>importProfileConfiguration({...configured('A'),useCount:-1}));
});

// A clean source checkout does not contain generated test output folders.
