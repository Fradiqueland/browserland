import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const APPLICATION_NAME='Browserland';
export const APPLICATION_ID='net.antoniofradique.browserland';
export function environmentValue(name,env=process.env){return env['BROWSERLAND_'+name]||env['MULTIBROWSER_'+name];}
export function bundleFormat(kind){return 'browserland-'+kind;}
export function isBundleFormat(value,kind){return value===bundleFormat(kind)||value==='multi-browser-'+kind;}

// Electron derives its macOS encryption keychain service from app.name. Existing
// workspaces must continue using that private identity to read encrypted data.
// Window titles, menus, About and package metadata use APPLICATION_NAME instead.
export function encryptionApplicationName(dataRoot,platform=process.platform){
 if(platform!=='darwin')return APPLICATION_NAME;
 const file=join(dataRoot,'application-identity.json');
 const read=()=>{
  const value=JSON.parse(readFileSync(file,'utf8'));
  if(value.version!==1||!['Multi-Browser',APPLICATION_NAME].includes(value.keychainName))throw Error('Invalid application encryption identity.');
  return value.keychainName;
 };
 if(existsSync(file))return read();
 const keychainName=existsSync(join(dataRoot,'workspace.json'))?'Multi-Browser':APPLICATION_NAME;
 try{writeFileSync(file,JSON.stringify({version:1,keychainName})+'\n',{flag:'wx',mode:0o600});}
 catch(error){if(error.code==='EEXIST')return read();throw error;}
 return keychainName;
}
