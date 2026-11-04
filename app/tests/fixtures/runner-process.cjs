const {mkdirSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const root=(process.env.BROWSERLAND_DATA||process.env.MULTIBROWSER_DATA);
if(!root)throw Error('Isolated BROWSERLAND_DATA required');
mkdirSync(root,{recursive:true});
const mode=process.argv[2];
if(mode==='timeout'){setTimeout(()=>process.exit(0),15000);return;}
if(mode!=='missing-report')writeFileSync(join(root,'result.json'),JSON.stringify({ok:mode!=='bad-report',tests:[{name:'fixture',ok:true}]}));
writeFileSync(join(root,'progress.log'),'fixture completed\n');
process.stdout.write('fixture stdout\n');process.exit(mode==='failure'?7:0);
