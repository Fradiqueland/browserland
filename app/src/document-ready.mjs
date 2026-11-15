import {until} from './operations.mjs';

// did-finish-load may already have fired while isLoading() still reflects
// other work. Query the actual document instead of waiting for a lost event.
export function waitForDocument(contents,timeout=15000){
 return until(async()=>{
  if(contents.isDestroyed())throw Error('O documento foi fechado antes de carregar.');
  if(!contents.getURL())return false;
  return contents.executeJavaScript("document.readyState === 'complete'");
 },'carregar documento',timeout);
}
