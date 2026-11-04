import {mountSocialLinks} from './social-links.mjs';
import {profileGroups,groupNames} from '../src/groups.mjs';
import {t,f,localizeDocument,LANGUAGES,DEFAULT_LANGUAGE} from './i18n.mjs';
import {profilePage,recordPage,groupPage,normalizeSearch} from '../src/query.mjs';
const $=s=>document.querySelector(s);
$('#ui-language').replaceChildren(...LANGUAGES.map(({id,name})=>new Option(name,id)));
const applyLanguage=localizeDocument(document);applyLanguage(DEFAULT_LANGUAGE);
$('#author-products').onclick=event=>{event.preventDefault();run('authorWebsite');};
mountSocialLinks($('#author-socials'),id=>run('authorSocial',{id}));
$('#ui-language').onchange=()=>run('language',{language:$('#ui-language').value});
const actionSource=document.querySelector('#profiles .section-head'),profileActions=document.querySelector('#profiles .actions'),headerActions=document.querySelector('header .header-actions');
const groupActionSource=$('#groups .section-head'),groupDeleteSource=$('#groups .group-tools');
function positionActions(){
 for(const [section,id] of [['profiles','profile-action-bar'],['groups','group-action-bar']]){const bar=$('#'+id),container=$('#'+section);if(!document.body.classList.contains('classic')){bar.style.left='';bar.style.width='';container.style.paddingBottom='';continue;}if(container.classList.contains('hidden'))continue;const bounds=container.getBoundingClientRect();bar.style.left=bounds.left+'px';bar.style.width=bounds.width+'px';container.style.paddingBottom=bar.offsetHeight+'px';}
}
window.addEventListener('resize',positionActions);const actionObserver=new ResizeObserver(()=>requestAnimationFrame(positionActions));for(const id of ['profile-action-bar','group-action-bar'])actionObserver.observe($('#'+id));
function appearance(value){const classic=value==='classic';document.body.classList.toggle('classic',classic);$('#ui-appearance').value=classic?'classic':'modern';const parent=classic?$('#profile-action-bar'):actionSource;if(profileActions.parentElement!==parent)parent.append(profileActions);const newParent=classic?$('#profile-action-bar'):headerActions;if($('#new-profile').parentElement!==newParent){if(classic)newParent.prepend($('#new-profile'));else newParent.append($('#new-profile'));}
 for(const [id,parent] of [['add-group',groupActionSource],['delete-groups',groupDeleteSource],['export-groups-csv',groupDeleteSource],['export-groups-json',groupDeleteSource],['import-groups',groupDeleteSource]]){const target=classic?$('#group-action-bar'):parent;if($('#'+id).parentElement!==target)target.append($('#'+id));}positionActions();}
$('#ui-appearance').onchange=()=>run('appearance',{appearance:$('#ui-appearance').value});
let workspace={profiles:[],groups:[],history:[],bookmarks:[],settings:{}},page='profiles',textResolve;
let selectedIds=new Set(),selectedGroups=new Set(),currentPage=1,currentItems=[],currentGroupPage=1;
const recordPages={history:1,bookmarks:1};
function groupsResult(){return groupPage(workspace.groups,workspace.groupDetails,workspace.profiles,{query:$('#group-search').value,sort:$('#group-sort').value,page:currentGroupPage,pageSize:$('#group-page-size').value});}
function collection(section){const prefix=section==='history'?'history':'bookmark';return recordPage(section==='history'?workspace.history:workspace.bookmarks,{query:$('#'+prefix+'-search').value,profileId:$('#'+prefix+'-profile-filter').value,sort:$('#'+prefix+'-sort').value,page:recordPages[section],pageSize:$('#'+prefix+'-page-size').value},workspace.profiles);}
function toast(message){$('#toast').textContent=String(message).replace(/^Error invoking remote method.*Error: /,'');$('#toast').textContent=t($('#toast').textContent);$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',5500);}
async function request(action,data={}){return window.desktop.request(action,data);}
async function run(action,data={}){try{const result=await request(action,data);if(result?.cancelled)return;return result;}catch(e){toast(e.message);}}
function button(label,handler,className='secondary'){const b=document.createElement('button');b.type='button';b.textContent=t(label);b.className=className;b.onclick=handler;return b;}
function el(tag,content,className){const element=document.createElement(tag);if(content!==undefined)element.textContent=content;if(className)element.className=className;return element;}
function ask(title,description,{password=false,value=''}={}){
 $('#text-title').textContent=t(title);$('#text-description').textContent=t(description);$('#text-input').type=password?'password':'text';$('#text-input').value=value;$('#text-input').minLength=password?1:1;$('#text-dialog').showModal();$('#text-input').focus();return new Promise(resolve=>textResolve=resolve);
}
$('#text-form').onsubmit=e=>{e.preventDefault();const value=$('#text-input').value;$('#text-dialog').close();textResolve?.(value);textResolve=null;};
$('#text-dialog').addEventListener('close',()=>{textResolve?.(null);textResolve=null;});
for(const close of document.querySelectorAll('.close-dialog'))close.onclick=()=>close.closest('dialog').close();
let previousProxyMode='url';
function proxyMode(){
 const form=$('#profile-form'),parts=form.elements.proxyFormat.value==='parts';
 $('#proxy-parts').classList.toggle('hidden',!parts);$('#proxy-url-label').classList.toggle('hidden',parts);
 if(!parts&&previousProxyMode==='parts'){const host=form.elements.proxyHost.value.trim(),port=form.elements.proxyPort.value;form.elements.proxy.value=host?form.elements.proxyProtocol.value+'://'+(host.includes(':')&&!host.startsWith('[')?'['+host+']':host)+(port?':'+port:''):'';}
 previousProxyMode=parts?'parts':'url';
 if(parts&&form.elements.proxy.value){try{const url=new URL(form.elements.proxy.value);if(url.username||url.password){form.elements.proxyUser.value=decodeURIComponent(url.username);form.elements.proxyPassword.value=decodeURIComponent(url.password);url.username='';url.password='';form.elements.proxy.value=url.href;}form.elements.proxyProtocol.value=url.protocol.slice(0,-1);form.elements.proxyHost.value=url.hostname;form.elements.proxyPort.value=url.port||'8080';}catch{}}
}
let editingStartupIndex=null;
const startupPages=()=>$('#profile-form').elements.startupPages.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
function resetStartupEditor(){editingStartupIndex=null;$('#startup-url').value='';$('#startup-error').textContent='';$('#startup-cancel').hidden=true;$('#startup-add').textContent=t('Adicionar página');}
function renderStartupPages(){
 const pages=startupPages(),list=$('#startup-page-list');list.replaceChildren();
 pages.forEach((url,index)=>{const row=el('div',undefined,'startup-item'),address=el('span',url);address.title=url;row.append(address,button('Editar',()=>{editingStartupIndex=index;$('#startup-add').disabled=false;$('#startup-url').value=url;$('#startup-add').textContent=t('Guardar página');$('#startup-cancel').hidden=false;$('#startup-url').focus();}),button('Remover',()=>{pages.splice(index,1);$('#profile-form').elements.startupPages.value=pages.join('\n');resetStartupEditor();renderStartupPages();}));list.append(row);});
 $('#startup-add').disabled=pages.length>=10&&editingStartupIndex===null;
}
function applyStartupPage(){
 try{const raw=$('#startup-url').value.trim();if(!raw)throw Error('Indique um endereço para a página de arranque.');let normalized;
 if(raw==='about:blank')normalized=raw;else{const url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw)?raw:'https://'+raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Utilize um endereço HTTP ou HTTPS sem credenciais.');normalized=url.href;}
 const pages=startupPages();if(editingStartupIndex===null){if(pages.length>=10)throw Error('Máximo de 10 páginas de arranque.');pages.push(normalized);}else pages[editingStartupIndex]=normalized;
 $('#profile-form').elements.startupPages.value=pages.join('\n');resetStartupEditor();renderStartupPages();return true;
 }catch(error){$('#startup-error').textContent=t(error.message==='Invalid URL'?'Indique um endereço para a página de arranque.':error.message);return false;}
}
$('#startup-add').onclick=applyStartupPage;$('#startup-cancel').onclick=()=>{resetStartupEditor();renderStartupPages();};
$('#startup-url').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();applyStartupPage();}if(event.key==='Escape'&&editingStartupIndex!==null){event.preventDefault();event.stopPropagation();resetStartupEditor();renderStartupPages();}};
$('#profile-form').elements.startupPages.oninput=()=>{resetStartupEditor();renderStartupPages();};
function startupMode(){$('#startup-pages-label').classList.toggle('hidden',$('#profile-form').elements.startupMode.value!=='pages');}
$('#profile-form').elements.startupMode.onchange=startupMode;
for(const radio of document.querySelectorAll('[name=proxyFormat]'))radio.onchange=proxyMode;
$('#default-ua').onclick=async()=>{if($('#profile-form').elements.engine.value!=='embedded'){$('#profile-form').elements.userAgent.value='';toast('Será utilizado o User-Agent nativo deste navegador.');return;}const ua=await run('defaultUserAgent');if(ua)$('#profile-form').elements.userAgent.value=ua;};
for(const zone of Intl.supportedValuesOf('timeZone')){const option=el('option');option.value=zone;$('#timezones').append(option);}
function environmentFields(){const form=$('#profile-form'),plain=form.dataset.launchMode==='plain';form.elements.timezone.disabled=plain||!form.elements.timezoneEnabled.checked;form.elements.timezone.required=!plain&&form.elements.timezoneEnabled.checked;for(const key of ['latitude','longitude']){form.elements[key].disabled=plain||!form.elements.geolocationEnabled.checked;form.elements[key].required=!plain&&form.elements.geolocationEnabled.checked;}}
for(const name of ['timezoneEnabled','geolocationEnabled'])$('#profile-form').elements[name].onchange=environmentFields;
function engineHint(){if($('#profile-form').dataset.launchMode==='plain'){$('#engine-hint').textContent=t('A navegação normal usa dados separados e as definições nativas do navegador. Os dados do modo personalizado são conservados. O proxy configurado é mantido; as alterações de identidade e de APIs do Browserland não são aplicadas.');return;}const native=$('#profile-form').elements.engine.value!=='embedded';$('#engine-hint').textContent=t(native?'Navegador completo numa janela própria, com extensões, loja e definições nativas. Os dados são exclusivos deste perfil. Mudar de motor não migra sessões existentes.':'Navegador integrado. Suporte parcial de extensões Chromium.');if($('#profile-form').elements.engine.value==='chromium')$('#engine-hint').textContent+=' '+t('Chromium portátil incluído. Revisão experimental; atualizações manuais.');}
function launchModeFields(){
 const form=$('#profile-form'),native=form.elements.engine.value!=='embedded';form.elements.launchMode.querySelector('[value="plain"]').disabled=!native;
 if(!native)form.elements.launchMode.value='managed';const plain=form.elements.launchMode.value==='plain';form.dataset.launchMode=plain?'plain':'managed';
 for(const name of ['locale','userAgent','timezoneEnabled','timezone','geolocationEnabled','latitude','longitude','width','height','emulateScreen','blockWebRTC','privacy_canvas','privacy_webgl','privacy_audio','privacy_fonts','privacy_webrtc'])form.elements[name].disabled=plain;
 for(const name of ['proxy','proxyUser','proxyPassword','forgetProxyPassword','proxyProtocol','proxyHost','proxyPort'])form.elements[name].disabled=false;
 for(const field of form.querySelectorAll('[name="proxyFormat"]'))field.disabled=false;
 form.elements.engine.disabled=false;form.elements.launchMode.disabled=!native;$('#default-ua').disabled=plain;
 proxyMode();environmentFields();engineHint();
}
$('#engine').onchange=()=>{const form=$('#profile-form');if(!form.elements.id.value&&form.elements.engine.value!=='embedded')form.elements.launchMode.value='plain';launchModeFields();};
$('#profile-form').elements.launchMode.onchange=()=>launchModeFields();
let selectedProfileGroups=new Set();
function renderProfileGroups(){
 const list=$('#profile-group-choices');list.replaceChildren();for(const name of new Set([...workspace.groups,...selectedProfileGroups])){const label=el('label',undefined,'check'),input=el('input');input.type='checkbox';input.value=name;input.checked=selectedProfileGroups.has(name);input.onchange=()=>{if(input.checked)selectedProfileGroups.add(name);else selectedProfileGroups.delete(name);};label.append(input,document.createTextNode(name));list.append(label);}
}
function addProfileGroup(){try{const value=$('#profile-form').elements.group.value,name=groupNames([value])[0];if(name)selectedProfileGroups.add(name);$('#profile-form').elements.group.value='';$('#profile-group-error').textContent='';renderProfileGroups();return true;}catch(error){$('#profile-group-error').textContent=t(error.message);return false;}}
$('#profile-group-add').onclick=addProfileGroup;$('#profile-form').elements.group.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();addProfileGroup();}};
function editProfile(id){
 const p=workspace.profiles.find(p=>p.id===id);
 if(p?.busy){toast('Aguarde que a operação deste perfil termine.');return;}
 if(p?.running){toast('Feche o perfil antes de o editar.');return;}
 const form=$('#profile-form');form.reset();form.dataset.launchMode=p?.launchMode||'managed';for(const field of form.querySelectorAll('input,select,textarea'))if(field.name)field.disabled=false;form.elements.engine.replaceChildren(new Option(t('Integrado (Electron)'),'embedded'),...(workspace.runtime?.nativeEngines||[]).map(e=>new Option(t(e.name)+' '+t('completo'),e.id)));if(p?.engine&&!Array.from(form.elements.engine.options).some(o=>o.value===p.engine))form.elements.engine.add(new Option(p.engine+' ('+t('indisponível')+')',p.engine));previousProxyMode='url';$('#form-error').textContent='';
 for(const field of form.elements){if(!field.name)continue;const value=p?.[field.name];if(field.name==='blockWebRTC')field.checked=value!==false;else if(value!==undefined&&field.name!=='proxyPassword')field.value=value;}
 form.elements.timezoneEnabled.checked=p?.timezoneEnabled??!!p?.timezone;form.elements.geolocationEnabled.checked=p?.geolocationEnabled??!!p?.geolocation;form.elements.engine.value=p?(p.engine||'embedded'):(workspace.runtime?.nativeEngines?.some(e=>e.id==='chrome')?'chrome':workspace.runtime?.nativeEngines?.[0]?.id||'embedded');form.elements.launchMode.value=p?(p.launchMode||(form.elements.engine.value!=='embedded'?'plain':'managed')):(form.elements.engine.value!=='embedded'?'plain':'managed');form.elements.id.value=p?.id||'';form.elements.latitude.value=p?.geolocation?.latitude??'';form.elements.longitude.value=p?.geolocation?.longitude??'';
 for(const key of ['canvas','webgl','audio','fonts','webrtc'])form.elements['privacy_'+key].checked=!!p?.privacy?.[key];
 if(!p&&form.elements.launchMode.value==='plain')form.elements.blockWebRTC.checked=false;
 form.elements.emulateScreen.checked=!!p?.emulateScreen;form.elements.startupPages.value=(p?.startupPages||[]).join('\n');proxyMode();startupMode();resetStartupEditor();renderStartupPages();
 launchModeFields();
 selectedProfileGroups=new Set(profileGroups(p));form.elements.group.value='';$('#profile-group-error').textContent='';renderProfileGroups();
 $('#modal-title').textContent=t(p?'Editar perfil':'Criar perfil');$('#profile-dialog').showModal();form.elements.name.focus();
}
$('#profile-form').onsubmit=async e=>{
 e.preventDefault();const form=e.target;if(!addProfileGroup())return;if(form.elements.startupMode.value==='pages'&&$('#startup-url').value.trim()&&!applyStartupPage())return;const data=Object.fromEntries(new FormData(form));data.launchMode=form.elements.launchMode.value;if(!data.id)delete data.id;data.blockWebRTC=form.elements.blockWebRTC.checked;data.groups=[...selectedProfileGroups];delete data.group;
 data.privacy=Object.fromEntries(['canvas','webgl','audio','fonts','webrtc'].map(key=>[key,form.elements['privacy_'+key].checked]));
 data.emulateScreen=form.elements.emulateScreen.checked;data.timezoneEnabled=form.elements.timezoneEnabled.checked;data.geolocationEnabled=form.elements.geolocationEnabled.checked;data.timezone=form.elements.timezone.value;data.latitude=form.elements.latitude.value;data.longitude=form.elements.longitude.value;
 if(form.dataset.launchMode==='plain')for(const key of ['locale','width','height','userAgent','blockWebRTC','privacy','emulateScreen','timezoneEnabled','geolocationEnabled','timezone','latitude','longitude'])delete data[key];
 if(form.elements.proxyFormat.value==='parts'){
  const host=form.elements.proxyHost.value.trim(),port=form.elements.proxyPort.value;
  data.proxy=host?form.elements.proxyProtocol.value+'://'+(host.includes(':')&&!host.startsWith('[')?'['+host+']':host)+(port?':'+port:''):'';
 }
 try{if(data.proxy){const u=new URL(data.proxy);if(u.username||u.password){data.proxyUser=decodeURIComponent(u.username);data.proxyPassword=decodeURIComponent(u.password);u.username='';u.password='';data.proxy=u.href;}}}catch{}

 if(form.elements.forgetProxyPassword.checked)data.proxyPassword=null;
 $('#save-profile').disabled=true;$('#form-error').textContent='';
 try{await request('save',data);$('#profile-dialog').close();toast('Perfil guardado.');}catch(e){$('#form-error').textContent=t(e.message.replace(/^Error invoking remote method.*Error: /,''));}finally{$('#save-profile').disabled=false;}
};
for(const id of ['#new-profile','#first-profile'])$(id).onclick=()=>editProfile();
$('#refresh').onclick=async()=>{const value=await run('state');if(value)render(value);};
async function theme(){await run('theme',{theme:workspace.settings.theme==='light'?'dark':'light'});}
$('#theme').onclick=theme;$('#settings-theme').onclick=theme;
$('#stop-all').onclick=()=>run('stopAll');
$('#export').onclick=async()=>{const r=await run('export',selectedIds.size?{ids:[...selectedIds]}:{});if(r?.saved)toast('Configurações exportadas, sem cookies nem palavras-passe.');};
async function importFile(){
 let result=await run('import');
 if(result?.needsPassword){const password=await ask('Sessão encriptada','Introduza a palavra-passe do ficheiro.',{password:true});if(password)result=await run('import',{token:result.token,password});}
 if(result&&!result.cancelled&&!result.needsPassword)toast(f('{n} perfil(s) e {g} grupo(s) importado(s).',{n:result.imported||0,g:result.importedGroups||0}));
}
$('#import').onclick=importFile;$('#import-groups').onclick=importFile;
for(const format of ['csv','json'])$('#export-groups-'+format).onclick=async()=>{const r=await run('exportGroups',{format,...(selectedGroups.size?{names:[...selectedGroups]}:{})});if(r?.saved)toast('Grupos e descrições exportados.');};
$('#export-csv').onclick=async()=>{const r=await run('export',{format:'csv',...(selectedIds.size?{ids:[...selectedIds]}:{})});if(r?.saved)toast('CSV exportado sem palavras-passe nem cookies.');};
$('#sample-csv').onclick=()=>run('sampleCSV');
$('#delete-selected').onclick=async()=>{if(!selectedIds.size)return toast('Selecione pelo menos um perfil.');const r=await run('deleteSelected',{ids:[...selectedIds]});if(r?.deleted){selectedIds.clear();toast(f('{n} perfis eliminados.',{n:r.deleted}));}};
function editGroup(name){
 const form=$('#group-form');form.reset();form.elements.previous.value=name||'';form.elements.name.value=name||'';form.elements.description.value=workspace.groupDetails?.[name]?.description||'';
 $('#group-error').textContent='';$('#group-title').textContent=t(name?'Editar grupo':'Novo grupo');$('#group-dialog').showModal();
}
$('#group-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target)),wasSelected=selectedGroups.has(data.previous);try{await request('groupSave',data);if(wasSelected){selectedGroups.delete(data.previous);selectedGroups.add(data.name.trim().slice(0,60));renderSections();}$('#group-dialog').close();toast('Grupo guardado.');}catch(e){$('#group-error').textContent=t(e.message);}};
$('#add-group').onclick=()=>editGroup();
$('#delete-groups').onclick=async()=>{if(!selectedGroups.size)return toast('Selecione pelo menos um grupo.');const r=await run('deleteGroups',{names:[...selectedGroups]});if(r){selectedGroups.clear();renderSections();}};
$('#group-search').oninput=()=>{currentGroupPage=1;renderSections();};
$('#clear-downloads').onclick=()=>run('clearDownloads');
$('#clear-history').onclick=async()=>{const ids=collection('history').ids;if(!ids.length)return;const answer=await ask('Limpar histórico',f('Escreva LIMPAR para apagar {n} registo(s) filtrado(s) do gestor. Os cookies e o histórico nativo não são alterados.',{n:ids.length}));if(answer==='LIMPAR')await run('clearHistory',{ids});};
const pages={downloads:['Transferências','Acompanhe os ficheiros transferidos por cada perfil.'],profiles:['Perfis de navegação','Cada identidade, no seu próprio espaço.'],groups:['Grupos de trabalho','Organize os seus perfis por equipa, cliente ou projeto.'],history:['Histórico','Volte às páginas que fazem parte do seu trabalho.'],bookmarks:['Favoritos','As páginas importantes de cada perfil, sempre à mão.'],extensions:['Extensões','Personalize cada perfil com ferramentas de confiança.'],settings:['Definições','O seu navegador, à sua maneira.']};
for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>{page=b.dataset.page;for(const section of document.querySelectorAll('.page'))section.classList.toggle('hidden',section.id!==page);for(const n of document.querySelectorAll('[data-page]'))n.classList.toggle('active',n===b);$('#metrics').classList.toggle('hidden',page!=='profiles');$('#page-title').textContent=t(pages[page][0]);$('#subtitle').textContent=t(pages[page][1]);$('#breadcrumb').textContent=t(pages[page][0]).toUpperCase();renderSections();positionActions();};
for(const id of ['#search','#group-filter','#status-filter','#sort'])$(id).addEventListener('input',()=>{currentPage=1;renderProfiles();});
for(const section of ['history','bookmarks']){
 const prefix=section==='history'?'history':'bookmark';
 for(const suffix of ['search','profile-filter','sort','page-size'])$('#'+prefix+'-'+suffix).addEventListener(suffix==='search'?'input':'change',()=>{recordPages[section]=1;renderSections();});
 for(const [suffix,operation] of Object.entries({first:()=>1,previous:p=>p-1,next:p=>p+1,last:()=>collection(section).pages}))$('#'+prefix+'-'+suffix).onclick=()=>{recordPages[section]=operation(recordPages[section]);renderSections();};
} 
async function openProfile(id){const profile=workspace.profiles.find(p=>p.id===id);if(profile?.busy){toast('Aguarde que a operação deste perfil termine.');return;}if(profile)profile.running=true;renderProfiles();const result=await run('open',{id});if(!result){const next=await run('state');if(next)render(next);}}
function moreMenu(profile,anchor){
 if(profile.busy){toast('Aguarde que a operação deste perfil termine.');return;}
 const existing=document.querySelector('.more-menu');if(existing){existing.remove();return;}
 const menu=el('div',undefined,'more-menu');
 const items=[
 ['Editar',()=>editProfile(profile.id)],
 ['Fixar / desafixar',()=>run('pin',{id:profile.id})],
 ['Duplicar configuração',()=>run('duplicate',{id:profile.id})],
 ['Exportar configuração',()=>run('export',{id:profile.id})],
 [profile.engine&&profile.engine!=='embedded'?'Partilhar sessão (encriptada)':'Partilhar cookies (encriptado)',async()=>{if(profile.launchMode==='plain'){toast('Neste perfil, utilize os menus do navegador para gerir cookies e sessões.');return;}if(profile.running){toast('Feche o perfil antes de partilhar os cookies.');return;}const password=await ask('Partilhar sessão',profile.engine&&profile.engine!=='embedded'?'Inclui cookies, LocalStorage, IndexedDB e armazenamento dos sites. Não inclui palavras-passe guardadas nem extensões. Partilhe apenas com pessoas autorizadas. Palavra-passe: pelo menos 12 caracteres.':'Inclui apenas cookies. LocalStorage e IndexedDB não são incluídos no modo integrado. Partilhe apenas com pessoas autorizadas. Palavra-passe: pelo menos 12 caracteres.',{password:true});if(password){const r=await run('export',{id:profile.id,cookies:true,password});if(r?.saved)toast('Sessão exportada com encriptação.');}}],
 ['Testar proxy / IP',async()=>{const r=await run('proxyTest',{id:profile.id});if(r)toast('IP observado: '+r.ip);}],
 [profile.engine==='embedded'?'Adicionar extensão local':'Gerir extensões no navegador',()=>run('extension',{id:profile.id})],
 ...(profile.engine&&profile.engine!=='embedded'?[['Loja de extensões',()=>run('nativePage',{id:profile.id,page:'store'})],['Definições do navegador',()=>run('nativePage',{id:profile.id,page:'settings'})],['Histórico do navegador',()=>run('nativePage',{id:profile.id,page:'history'})],['Transferências do navegador',()=>run('nativePage',{id:profile.id,page:'downloads'})],['Favoritos do navegador',()=>run('nativePage',{id:profile.id,page:'bookmarks'})]]:[]),
 ['Limpar dados de navegação',async()=>{const r=await run('clear',{id:profile.id});if(r?.native)toast('Escolha os dados a limpar na janela do navegador.');else if(r?.cleared)toast('Dados de navegação limpos.');}],
 ['Eliminar perfil',()=>run('delete',{id:profile.id})]
 ];
 for(const [label,handler] of items)menu.append(button(label,()=>{menu.remove();if(workspace.profiles.find(p=>p.id===profile.id)?.busy){toast('Aguarde que a operação deste perfil termine.');return;}handler();},''));
 document.body.append(menu);const bounds=anchor.getBoundingClientRect();menu.style.position='fixed';menu.style.right='auto';menu.style.left=Math.max(12,Math.min(bounds.right-menu.offsetWidth,innerWidth-menu.offsetWidth-12))+'px';menu.style.top=Math.max(12,Math.min(bounds.bottom+5,innerHeight-menu.offsetHeight-12))+'px';
}
document.addEventListener('click',e=>{if(!e.target.closest('.menu-wrap'))document.querySelector('.more-menu')?.remove();});
function renderProfiles(){
 const result=profilePage(workspace.profiles,{query:$('#search').value,group:$('#group-filter').value,status:$('#status-filter').value,sort:$('#sort').value,page:currentPage,pageSize:$('#page-size').value});
 currentPage=result.page;currentItems=result.items;selectedIds=new Set([...selectedIds].filter(id=>workspace.profiles.some(p=>p.id===id)));
 $('#profile-rows').replaceChildren();$('#empty').classList.toggle('hidden',result.total>0);$('#list-count').textContent=result.total;
 $('#showing').textContent=f('{n} de {total} perfis',{n:result.total,total:workspace.profiles.length});$('#page-label').textContent=result.page+' / '+result.pages;
 $('#previous-page').disabled=currentPage===1;$('#next-page').disabled=currentPage===result.pages;$('#first-page').disabled=currentPage===1;$('#last-page').disabled=currentPage===result.pages;$('#page-jump').max=result.pages;$('#page-jump').value=currentPage;
 $('#select-visible').checked=!!currentItems.length&&currentItems.every(p=>selectedIds.has(p.id));$('#select-visible').indeterminate=currentItems.some(p=>selectedIds.has(p.id))&&!$('#select-visible').checked;
 $('#select-matching-profiles').disabled=!result.total;$('#clear-profile-selection').disabled=!selectedIds.size;$('#open-group').textContent=t(selectedIds.size?'▶ Abrir seleção':$('#group-filter').value?'▶ Abrir grupo':'▶ Abrir todos');
 $('#selection-info').dataset.count=selectedIds.size;$('#selection-info').textContent=selectedIds.size?f('{n} perfil(s) selecionado(s)',{n:selectedIds.size}):t('Nenhum perfil selecionado');
 const date=value=>value?new Date(value).toLocaleDateString(document.documentElement.lang,{day:'2-digit',month:'short',year:'numeric'}):t('Nunca');
 for(const [index,p] of currentItems.entries()){
  const row=el('tr'),selection=el('td'),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=selectedIds.has(p.id);checkbox.setAttribute('aria-label',t('Selecionar perfil')+' '+p.name);checkbox.onchange=()=>{if(checkbox.checked)selectedIds.add(p.id);else selectedIds.delete(p.id);renderProfiles();};selection.append(checkbox);
  const nameCell=el('td'),identity=el('div',undefined,'profile-cell'),avatar=el('span',p.name.slice(0,2).toUpperCase(),'profile-avatar');avatar.style.color=p.color;
  const description=el('div');description.append(el('div',p.name,'profile-name'),el('div',p.notes||p.startURL,'profile-meta'));description.append(el('div',p.launchMode==='plain'?p.engine+' · '+t('Navegação normal')+' · '+(p.proxy||t('Rede do sistema')):(p.engine&&p.engine!=='embedded'?p.engine+' · ':t('Integrado')+' · ')+(p.standardRunning?t('Modo normal')+' · ':'')+(p.proxy||t('Ligação direta')),'profile-meta'));description.title=p.launchMode==='plain'?t('A navegação normal usa dados separados e as definições nativas do navegador. Os dados do modo personalizado são conservados. O proxy configurado é mantido; as alterações de identidade e de APIs do Browserland não são aplicadas.'):(p.proxy||'Liga\u00e7\u00e3o direta')+' | '+p.locale+' | '+(p.timezoneEnabled!==false&&p.timezone?p.timezone:t('Fuso do sistema'));identity.append(avatar,description);nameCell.append(identity);
  const groupCell=el('td'),memberships=profileGroups(p);groupCell.className='group-tags';groupCell.title=memberships.join(', ')||t('Sem grupo');for(const group of memberships.length?memberships:[t('Sem grupo')])groupCell.append(el('span',group,'tag'));
  const statusCell=el('td',undefined,'profile-status-cell');statusCell.append(el('span',t(p.busy?'Ocupado':p.running?'Em execução':'Parado'),'status'+(p.running?' live':'')));
  const actionCell=el('td'),actions=el('div',undefined,'row-actions');
  const openCell=el('td',undefined,'profile-open-cell');openCell.append(button(p.busy?'Ocupado':p.running?'■ Parar':'▶ Abrir',()=>p.running?run('stop',{id:p.id}):openProfile(p.id),'launch'));actions.append(button('Editar',()=>editProfile(p.id),''));
  const wrap=el('div',undefined,'menu-wrap'),more=button('•••',()=>moreMenu(p,more),'');more.title=t('Mais ações');wrap.append(more);actions.append(wrap);
  const pin=button(p.pinned?'★':'☆',()=>run('pin',{id:p.id}),p.pinned?'pinned':'');pin.title=t(p.pinned?'Desafixar perfil':'Fixar perfil');const pinCell=el('td',undefined,'profile-pin-cell'),pinActions=el('div',undefined,'row-actions');pinActions.append(pin);pinCell.append(pinActions);actionCell.append(actions);
  if(p.busy){for(const control of [...openCell.querySelectorAll('button'),...actions.querySelectorAll('button')]){control.disabled=true;control.title=t('Aguarde que a operação deste perfil termine.');}}row.setAttribute('aria-busy',String(!!p.busy));row.dataset.busy=String(!!p.busy);
  row.dataset.profileId=p.id;row.append(selection,el('td',String((result.page-1)*result.pageSize+index+1),'profile-ordinal'),nameCell,openCell,el('td',date(p.createdAt)),el('td',date(p.lastOpened)),groupCell,statusCell,actionCell,pinCell);$('#profile-rows').append(row);
 }
}
$('#select-matching-profiles').onclick=()=>{const result=profilePage(workspace.profiles,{query:$('#search').value,group:$('#group-filter').value,status:$('#status-filter').value,sort:$('#sort').value});for(const id of result.ids)selectedIds.add(id);renderProfiles();};
$('#clear-profile-selection').onclick=()=>{selectedIds.clear();renderProfiles();};
$('#select-visible').onchange=e=>{for(const p of currentItems){if(e.target.checked)selectedIds.add(p.id);else selectedIds.delete(p.id);}renderProfiles();};
$('#page-size').onchange=()=>{currentPage=1;renderProfiles();};
$('#previous-page').onclick=()=>{currentPage--;renderProfiles();};
$('#next-page').onclick=()=>{currentPage++;renderProfiles();};
$('#first-page').onclick=()=>{currentPage=1;renderProfiles();};$('#last-page').onclick=()=>{currentPage=Number($('#page-jump').max);renderProfiles();};$('#page-jump').onchange=()=>{currentPage=Number($('#page-jump').value);renderProfiles();};
const inverseSort={name:'name-desc',new:'old',opened:'opened-old',group:'group-desc',status:'status-desc'};for(const button of document.querySelectorAll('[data-sort]'))button.onclick=()=>{const key=button.dataset.sort;$('#sort').value=$('#sort').value===key?inverseSort[key]:key;currentPage=1;renderProfiles();};
function renderNativeTools(){const profiles=workspace.profiles.filter(p=>p.engine&&p.engine!=='embedded');for(const section of ['history','bookmarks','downloads']){const select=$('#native-'+section+'-profile'),previous=select.value;select.replaceChildren(...profiles.map(p=>new Option(p.name+' · '+p.engine,p.id)));if(profiles.some(p=>p.id===previous))select.value=previous;$('#native-'+section+'-tools').classList.toggle('hidden',!profiles.length);}}
for(const button of document.querySelectorAll('[data-native-page]'))button.onclick=async()=>{const id=$('#native-'+button.dataset.nativeSection+'-profile').value;if(!id)return;const result=await run('nativePage',{id,page:button.dataset.nativePage});if(result?.opened)toast('Página aberta no navegador.');};
function renderSections(){
 if(page==='groups'){
  const result=groupsResult(),list=$('#group-list');list.replaceChildren();currentGroupPage=result.page;const visible=result.items.map(g=>g.name);
  $('#select-groups').disabled=!visible.length;$('#select-filtered-groups').disabled=!result.total;$('#delete-groups').disabled=!selectedGroups.size;$('#clear-group-selection').disabled=!selectedGroups.size;$('#select-groups').checked=!!visible.length&&visible.every(g=>selectedGroups.has(g));$('#select-groups').indeterminate=visible.some(g=>selectedGroups.has(g))&&!$('#select-groups').checked;$('#group-selection-count').textContent=f('{n} grupo(s) selecionado(s)',{n:selectedGroups.size});
  $('#group-page-label').textContent=result.page+' / '+result.pages;$('#group-showing').textContent=f('{n} grupo(s)',{n:result.total});$('#group-page-jump').value=result.page;$('#group-page-jump').max=result.pages;
  for(const side of ['first','previous'])$('#group-'+side).disabled=result.page===1;for(const side of ['next','last'])$('#group-'+side).disabled=result.page===result.pages;
  for(const [index,group] of result.items.entries()){
   const card=el('tr',undefined,'card group-row'),selection=el('td'),select=el('input',undefined,'group-select');card.dataset.groupName=group.name;select.type='checkbox';select.checked=selectedGroups.has(group.name);select.setAttribute('aria-label',t('Selecionar grupo')+' '+group.name);select.onchange=()=>{if(select.checked)selectedGroups.add(group.name);else selectedGroups.delete(group.name);renderSections();};selection.append(select,el('span',String((result.page-1)*result.pageSize+index+1),'group-ordinal'));
   const name=el('td'),description=el('td',group.description||t('Sem descrição'),'group-description'),count=el('td',String(group.count),'group-count'),actions=el('td'),buttons=el('div',undefined,'group-row-actions');name.append(el('h3',group.name));buttons.append(button('Ver perfis',()=>{$('[data-page=profiles]').click();$('#group-filter').value=group.name;currentPage=1;renderProfiles();}),button('Editar',()=>editGroup(group.name)),button('Remover',()=>run('deleteGroups',{names:[group.name]})));actions.append(buttons);card.append(selection,name,description,count,actions);list.append(card);
  }
  if(!result.total){const row=el('tr'),cell=el('td',t('Ainda não existem registos.'),'notice');cell.colSpan=5;row.append(cell);list.append(row);}

 }
 if(page==='downloads'){
  $('#download-list').replaceChildren();
  for(const item of workspace.downloads||[]){
   const row=el('div',undefined,'list-item'),info=el('div');info.append(el('strong',item.name),el('p',(workspace.profiles.find(p=>p.id===item.profileId)?.name||'Perfil removido')+' · '+({completed:'Concluída',progressing:'A transferir',paused:'Pausada',cancelled:'Cancelada',interrupted:'Interrompida'}[item.state]||item.state)),el('p',(item.received/1048576).toFixed(1)+' / '+(item.total>0?(item.total/1048576).toFixed(1):'?')+' MB'));
   row.append(info);if(item.state==='completed')row.append(button('Mostrar na pasta',()=>run('downloadAction',{id:item.id,action:'reveal'})));
   if(['progressing','paused'].includes(item.state))row.append(button(item.state==='paused'?'Retomar':'Pausar',()=>run('downloadAction',{id:item.id,action:item.state==='paused'?'resume':'pause'})),button('Cancelar',()=>run('downloadAction',{id:item.id,action:'cancel'})));
   $('#download-list').append(row);
  }
  if(!workspace.downloads?.length)$('#download-list').append(el('p',t('Ainda não existem transferências.'),'notice'));
 }
 if(page==='history'||page==='bookmarks'){
  const history=page==='history',container=$(history?'#history-list':'#bookmark-list');container.replaceChildren();
  const prefix=history?'history':'bookmark',result=collection(page);recordPages[page]=result.page;
  $('#'+prefix+'-total').textContent=f('{n} registo(s)',{n:result.total});$('#'+prefix+'-page-label').textContent=result.page+' / '+result.pages;
  for(const suffix of ['first','previous'])$('#'+prefix+'-'+suffix).disabled=result.page===1;for(const suffix of ['next','last'])$('#'+prefix+'-'+suffix).disabled=result.page===result.pages;
  if(!result.items.length)container.append(el('p',t('Ainda não existem registos.'),'notice'));
  if(history)$('#clear-history').disabled=!result.total;
  for(const item of result.items){const row=el('div',undefined,'list-item'),info=el('div'),profile=workspace.profiles.find(p=>p.id===item.profileId);row.dataset.recordId=item.id;info.append(el('strong',item.title||item.url),el('p',item.url),el('p',item.notes||''),el('p',(profile?.name||t('Perfil removido'))+(history?' · '+new Date(item.at).toLocaleString(document.documentElement.lang):'')));const open=button('Abrir',async()=>{if(profile)await run('open',{id:profile.id,url:item.url});});open.disabled=!profile;row.append(info,open);if(history)row.append(button('Remover',()=>run('removeHistory',{ids:[item.id]})));else row.append(button('Editar',()=>editBookmark(item)),button('Remover',()=>run('removeBookmark',{id:item.id})));container.append(row);}

 }
 if(page==='extensions'){
  $('#extension-list').replaceChildren();if(!workspace.profiles.length)$('#extension-list').append(el('p',t('Crie um perfil para adicionar extensões.'),'notice'));
  for(const p of workspace.profiles){const row=el('div',undefined,'list-item'),info=el('div');if(p.engine&&p.engine!=='embedded'){info.append(el('strong',p.name),el('p',f('Extensões geridas no navegador {engine}',{engine:p.engine})));row.append(info,button('Gerir extensões',()=>run('nativePage',{id:p.id,page:'extensions'})),button('Loja de extensões',()=>run('nativePage',{id:p.id,page:'store'})));$('#extension-list').append(row);continue;}info.append(el('strong',p.name),el('p',f('{n} extensão(ões)',{n:p.extensions.length})));for(const ext of p.extensions){const item=el('p',ext.name+' ');item.append(button('Remover',()=>run('removeExtension',{id:p.id,extensionId:ext.id})));info.append(item);}row.append(info,button('Adicionar extensão',()=>run('extension',{id:p.id})));$('#extension-list').append(row);}
 }
}
function render(value){
 if(value?.type==='page'){document.querySelector('[data-page='+value.page+']')?.click();if(value.profileId){const prefix=value.page==='bookmarks'?'bookmark':value.page==='history'?'history':null,select=prefix?$('#'+prefix+'-profile-filter'):value.page==='settings'?$('#clear-profile'):null;if(select&&Array.from(select.options).some(o=>o.value===value.profileId)){select.value=value.profileId;select.dispatchEvent(new Event('change'));}}return;}
 appearance(value.settings.appearance);applyLanguage(value.settings.language||DEFAULT_LANGUAGE);$('#ui-language').value=value.settings.language||DEFAULT_LANGUAGE;$('#page-title').textContent=t(pages[page][0]);$('#subtitle').textContent=t(pages[page][1]);
 const selectedClear=$('#clear-profile').value;$('#clear-profile').replaceChildren(...value.profiles.map(p=>new Option(p.name,p.id)));if(value.profiles.some(p=>p.id===selectedClear))$('#clear-profile').value=selectedClear;
 workspace=value;selectedGroups=new Set([...selectedGroups].filter(g=>value.groups.includes(g)));document.body.classList.toggle('light',value.settings.theme==='light');$('#total').textContent=value.profiles.length;$('#nav-count').textContent=value.profiles.length;$('#running').textContent=value.profiles.filter(p=>p.running).length;$('#proxies').textContent=value.profiles.filter(p=>p.proxy).length;$('#group-total').textContent=value.groups.length;
 const selected=$('#group-filter').value;$('#group-filter').replaceChildren(new Option(t('Todos os grupos'),''));$('#group-options').replaceChildren();for(const g of value.groups){$('#group-filter').add(new Option(g,g));const o=el('option');o.value=g;$('#group-options').append(o);}$('#group-filter').value=selected;
 $('#application-version').textContent='Browserland · '+value.runtime.version;
 $('#runtime').textContent='Electron '+value.runtime.electron+' · Chromium '+value.runtime.chromium+' | '+t('Motores completos:')+' '+(value.runtime.nativeEngines?.map(e=>t(e.name)).join(', ')||t('Nenhum encontrado'));
 for(const prefix of ['history','bookmark']){const select=$('#'+prefix+'-profile-filter'),previous=select.value;select.replaceChildren(new Option(t('Todos os perfis'),''),...value.profiles.map(p=>new Option(p.name,p.id)));if(value.profiles.some(p=>p.id===previous))select.value=previous;}
 renderNativeTools();$('#last-error').textContent=value.errors.at(-1)?.message||t('Sem erros registados nesta execução.');renderProfiles();renderSections();requestAnimationFrame(positionActions);
}
window.desktop.subscribe(render);window.desktop.request('state').then(render).catch(e=>toast(e.message));

$('#bulk-create').onclick=async()=>{const value=await ask('Criar perfis em lote','Escreva os nomes separados por ponto e vírgula. Máximo de 100 por lote.');if(value){const r=await run('bulkCreate',{engine:workspace.runtime.nativeEngines?.[0]?.id||'embedded',names:value.split(';').map(x=>x.trim()).filter(Boolean),group:$('#group-filter').value});if(r)toast(f('{n} perfis criados.',{n:r.created}));}};
$('#open-group').onclick=async()=>{const r=await run('openGroup',{group:$('#group-filter').value,...(selectedIds.size?{ids:[...selectedIds]}:{})});if(r){let message=f('{n} perfis abertos (máximo de 10 por operação).',{n:r.opened});if(r.failed?.length)message+=' '+f('Não foi possível abrir: {names}.',{names:r.failed.map(p=>p.name).join(', ')});if(r.limited)message+=' '+f('{n} perfis ficaram fora do limite desta operação.',{n:r.requested-r.attempted});toast(message);}};

document.querySelector('.brand').onclick=e=>{e.preventDefault();document.querySelector('[data-page=profiles]').click();};

document.addEventListener('scroll',()=>document.querySelector('.more-menu')?.remove(),true);

function editBookmark(item){const form=$('#bookmark-form');for(const key of ['id','title','url','notes'])form.elements[key].value=item[key]||'';$('#bookmark-error').textContent='';$('#bookmark-dialog').showModal();}
$('#bookmark-form').onsubmit=async e=>{e.preventDefault();try{await request('editBookmark',Object.fromEntries(new FormData(e.target)));$('#bookmark-dialog').close();toast('Favorito atualizado.');}catch(error){$('#bookmark-error').textContent=t(error.message);}};
$('#clear-data-form').onsubmit=async e=>{e.preventDefault();const f=e.target;const result=await run('clearSelectedData',{id:f.elements.profileId.value,siteData:f.elements.siteData.checked,cache:f.elements.cache.checked,history:f.elements.history.checked,hours:f.elements.hours.value});if(result?.native)toast('Escolha o período e os dados no gestor nativo do navegador.');else if(result?.cleared)toast('Dados selecionados limpos.');};

$('#select-groups').onchange=e=>{for(const group of groupsResult().items){if(e.target.checked)selectedGroups.add(group.name);else selectedGroups.delete(group.name);}renderSections();};
$('#select-filtered-groups').onclick=()=>{for(const name of groupsResult().names)selectedGroups.add(name);renderSections();};
for(const id of ['group-sort','group-page-size'])$('#'+id).onchange=()=>{currentGroupPage=1;renderSections();};
for(const [suffix,operation] of Object.entries({first:()=>1,previous:p=>p-1,next:p=>p+1,last:()=>groupsResult().pages}))$('#group-'+suffix).onclick=()=>{currentGroupPage=operation(currentGroupPage);renderSections();};
$('#group-page-jump').onchange=()=>{currentGroupPage=Number($('#group-page-jump').value);renderSections();};
for(const header of document.querySelectorAll('[data-group-sort]'))header.onclick=()=>{const key=header.dataset.groupSort,inverse={name:'name-desc',count:'count-asc'};$('#group-sort').value=$('#group-sort').value===key?inverse[key]:key;currentGroupPage=1;renderSections();};
$('#clear-group-selection').onclick=()=>{selectedGroups.clear();renderSections();};
