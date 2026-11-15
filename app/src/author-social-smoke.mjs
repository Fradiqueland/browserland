import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {shell} from 'electron';
import {AUTHOR_SOCIAL_LINKS} from './author-social.mjs';
import {LANGUAGES} from './languages.mjs';
import {t} from '../ui/i18n.mjs';
import {until} from './operations.mjs';
import {capturePage} from './capture-page.mjs';

export async function runAuthorSocialSmoke({manager,store,actions,dataRoot,check}){
 const previous={...store.state.settings},originalOpen=shell.openExternal,opened=[];
 shell.openExternal=async url=>{opened.push(url);};
 try{
  manager.show();manager.focus();
  const links=await manager.webContents.executeJavaScript("[...document.querySelectorAll('#author-socials a')].map(a=>({id:a.dataset.social,name:a.getAttribute('aria-label'),url:a.href,icon:a.querySelector('svg').getAttribute('viewBox')}))");
  assert.deepEqual(links,AUTHOR_SOCIAL_LINKS.map(link=>({id:link.id,name:link.name,url:link.url,icon:'0 0 24 24'})));
  check('Nove icones sociais locais com nomes e enderecos corretos',true);
  for(const link of AUTHOR_SOCIAL_LINKS){
   const count=opened.length;
   await manager.webContents.executeJavaScript(`document.querySelector('[data-social="${link.id}"]').click()`);
   await until(()=>opened.length>count,'abrir '+link.name,5000);
   assert.equal(opened.length,count+1);assert.equal(opened.at(-1),link.url);
  }
  check('Os nove cliques reais usam o redirecionamento externo autorizado',true);
  await manager.webContents.executeJavaScript("document.querySelector('[data-social=instagram]').focus()");
  manager.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});manager.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await until(()=>opened.length===10,'ativar rede social pelo teclado',5000);
  assert.equal(opened.at(-1),AUTHOR_SOCIAL_LINKS[0].url);
  check('Atalhos sociais funcionam com teclado',true);
  await assert.rejects(manager.webContents.executeJavaScript("window.desktop.request('authorSocial',{id:'https://example.org'})"),/Unknown social network/);
  assert.equal(opened.length,10);check('IPC social recusa URLs ou identificadores nao autorizados',true);
  await manager.webContents.executeJavaScript("document.querySelector('#pdf-tutorial').click()");
  await until(()=>opened.length===11,'abrir tutorial PDF',5000);
  assert.equal(opened.at(-1),'https://antoniofradique.net/browserland-pdf-tutorial');
  check('Tutorial PDF abre o endereco externo correto',true);
  for(const theme of ['dark','light'])for(const appearance of ['modern','classic'])for(const {id:language} of LANGUAGES){
   await actions.theme({theme});await actions.appearance({appearance});await actions.language({language});
   await until(()=>manager.webContents.executeJavaScript(`document.documentElement.lang===${JSON.stringify(language)}&&document.body.classList.contains('classic')===${appearance==='classic'}`),'aplicar aspeto e idioma',5000);
   const tutorial=await manager.webContents.executeJavaScript("(()=>{const b=document.querySelector('#pdf-tutorial'),r=b.getBoundingClientRect();return {label:b.textContent.trim(),width:r.width,height:r.height,sidebar:document.querySelector('aside').clientWidth}})()");
   assert.equal(tutorial.label,t('Download do Tutorial em PDF',language));
   assert.ok(tutorial.width<=tutorial.sidebar&&tutorial.height>=44);
   assert.ok(await manager.webContents.executeJavaScript("[...document.querySelectorAll('#author-socials a')].length===9&&[...document.querySelectorAll('#author-socials a')].every(a=>a.getBoundingClientRect().width>=44&&a.getBoundingClientRect().height>=44&&a.title===a.getAttribute('aria-label'))"));
   if((language==='en'&&theme==='light'&&appearance==='modern')||(language==='ar'&&theme==='dark'&&appearance==='classic')){
    await manager.webContents.executeJavaScript("document.querySelector('#author-socials').scrollIntoView({block:'end'})");
    writeFileSync(join(dataRoot,`social-menu-${language}-${theme}-${appearance}.png`),(await capturePage(manager.webContents)).toPNG());
   }
  }
  check('Grelha social acessivel nos onze idiomas, dois temas e dois estilos',true);
  check('Tutorial PDF traduzido e acessivel nos onze idiomas, temas e estilos',true);
 }finally{
  shell.openExternal=originalOpen;
  await actions.theme({theme:previous.theme});await actions.appearance({appearance:previous.appearance});await actions.language({language:previous.language});
  await manager.webContents.executeJavaScript("document.querySelector('aside').scrollTop=0");
 }
}
