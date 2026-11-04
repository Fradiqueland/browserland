import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Store} from '../src/core.mjs';
import {LANGUAGES,DEFAULT_LANGUAGE,normalizeLanguage,validLanguage,languageDirection} from '../src/languages.mjs';
import {t,setLanguage,f,MESSAGES} from '../ui/i18n.mjs';
import {EXTRA_TRANSLATIONS} from '../ui/locales.mjs';
mkdirSync(join(import.meta.dirname,'../test-results'),{recursive:true});
const root=join(import.meta.dirname,'../test-results');
const tokens=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
test('Idiomas pedidos disponiveis, ingles inicial e portugues antigo compativel',()=>{
 for(const id of ['en','pt','es','fr','hi','ar','zh','bn','ru','id'])assert.ok(LANGUAGES.some(x=>x.id===id));
 assert.equal(DEFAULT_LANGUAGE,'en');assert.equal(normalizeLanguage('pt-PT'),'pt');assert.equal(validLanguage('pt-PT'),true);assert.equal(normalizeLanguage('invalid'),'en');assert.equal(languageDirection('ar'),'rtl');for(const {id} of LANGUAGES.filter(x=>x.id!=='ar'))assert.equal(languageDirection(id),'ltr');
 const store=new Store(mkdtempSync(join(root,'locale-default-')));assert.equal(store.state.settings.language,'en');assert.deepEqual(store.state.groups,['Personal','Work']);
});
test('Todos os textos do catalogo tem seis novas traducoes e preservam parametros',()=>{
 const seen=new Set();for(const row of MESSAGES){if(seen.has(row[1]))continue;seen.add(row[1]);const translated=EXTRA_TRANSLATIONS[row[1]];assert.equal(translated?.length,6,row[1]);for(const text of translated){assert.equal(typeof text,'string');assert.ok(text.trim()&&!text.includes('�'),row[1]);assert.deepEqual(tokens(text),tokens(row[1]),row[1]);}}
 for(const {id} of LANGUAGES)for(const row of MESSAGES){assert.ok(t(row[0],id).trim());assert.deepEqual(tokens(t(row[0],id)),tokens(row[0]),id+' '+row[0]);}
});
test('Escritas, substituicoes e mudanca de idioma nao alteram texto do utilizador',()=>{
 const scripts={hi:/\p{Script=Devanagari}/u,ar:/\p{Script=Arabic}/u,zh:/\p{Script=Han}/u,bn:/\p{Script=Bengali}/u,ru:/\p{Script=Cyrillic}/u};for(const [id,pattern] of Object.entries(scripts)){setLanguage(id);assert.match(t('Perfis de navegação'),pattern);const count=f('{n} perfil(s) e {g} grupo(s) importado(s).',{n:12,g:3});assert.ok(count.includes('12')&&count.includes('3')&&!count.includes('{'));assert.equal(t('Antonio Fradique'),'Antonio Fradique');}
 setLanguage('id');assert.equal(t('Perfis de navegação'),'Profil browser');setLanguage('pt-PT');assert.equal(t('Definições'),'Definições');setLanguage('invalid');assert.equal(t('Definições'),'Settings');
});
test('Preferencias guardadas e nomes dos grupos resistem a migracao de idioma',()=>{
 const dir=mkdtempSync(join(root,'locale-migration-')),store=new Store(dir);store.state.groups=['Nome pessoal'];store.state.settings.language='pt-PT';store.save();const migrated=new Store(dir);assert.equal(migrated.state.settings.language,'pt');assert.deepEqual(migrated.state.groups,['Nome pessoal']);assert.equal(JSON.parse(readFileSync(migrated.file)).settings.language,'pt-PT');
 for(const {id} of LANGUAGES){migrated.state.settings.language=id;migrated.save();assert.equal(new Store(dir).state.settings.language,id);}
 const previous=JSON.parse(readFileSync(migrated.file));delete previous.settings.language;writeFileSync(migrated.file,JSON.stringify(previous));assert.equal(new Store(dir).state.settings.language,'en');
});

test('Textos estaticos das paginas estao no catalogo ou sao marcas e dados tecnicos',()=>{
 const known=new Set(MESSAGES.map(row=>row[0].toLocaleLowerCase('pt-PT'))),literal=new Set(['Browserland','B','Browser','land','Antonio Fradique','https://AntonioFradique.net','HTTP','HTTPS','SOCKS4','SOCKS5','User-Agent','https://exemplo.pt','pt-PT','http://servidor:8080','proxy.exemplo.pt']);
 for(const file of ['index.html','browser.html','bookmark.html']){const html=readFileSync(join(import.meta.dirname,'../ui',file),'utf8');const values=[...[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1]),...[...html.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)].map(m=>m[1])];for(const value of values){const key=value.trim().replace(/^[^\p{L}\p{N}]+/u,'');if(!/\p{L}/u.test(key)||literal.has(value.trim()))continue;assert.ok(known.has(key.toLocaleLowerCase('pt-PT')),file+': '+value);}}
});

// A clean source checkout does not contain generated test output folders.
