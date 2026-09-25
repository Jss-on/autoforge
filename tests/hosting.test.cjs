const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const repo=path.resolve(process.argv[2]||'.'),a=require(path.join(repo,'scripts/acceptance.cjs')),metric=process.argv.includes('--metric');
if(!a.hosting){console.error('Hosting applicability gate absent: 0/8');console.log('0');process.exit(metric?0:1);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'forge-hosting-'));let seq=0,n=0,failed=0;
function fixture(kind='managed',stateful=false,alter=()=>{}){const root=path.join(tmp,String(++seq));fs.mkdirSync(root);const outcomes=['delivery','configuration','health','observability',...(stateful?['persistence','compatibility','backup','restore']:[]),...(kind==='container'?['container_nonroot','container_health','container_image']:[])];const checks=outcomes.map(outcome=>({spec:'app',id:outcome,dimension:'devops',weight:1,required:true,applicable:true,outcome}));const def={hosting:{kind,stateful,decision:'stack.md',target:'isolated-pilot'},checks};alter(def);fs.writeFileSync(path.join(root,'stack.md'),'Reviewed hosting choice with source and scope');fs.writeFileSync(path.join(root,'checks.json'),JSON.stringify(def));a.snapshot(root,'checks.json','plan.json',['stack.md']);return()=>a.hosting(root,'plan.json');}
function test(name,fn){try{fn();n++;console.error('PASS: '+name);}catch(e){failed++;console.error('FAIL: '+name+': '+e.message);}}
for(const k of ['managed','static','container'])test(k+' uses its applicable mechanisms',()=>assert.equal(fixture(k)().verdict,'READY'));
test('stateful app cannot waive restore',()=>assert.throws(()=>fixture('managed',true,d=>{d.checks.find(c=>c.outcome==='restore').applicable=false;d.checks.find(c=>c.outcome==='restore').reason='managed backup exists';})()));
test('stateful app requires schema compatibility',()=>assert.throws(()=>fixture('managed',true,d=>d.checks=d.checks.filter(c=>c.outcome!=='compatibility'))()));
test('container requires applicable nonroot check',()=>assert.throws(()=>fixture('container',false,d=>d.checks=d.checks.filter(c=>c.outcome!=='container_nonroot'))()));
test('static cannot hide persistent state',()=>assert.throws(()=>fixture('static',true)()));
test('legacy plan requires hosting re-verification',()=>assert.throws(()=>fixture('managed',false,d=>delete d.hosting)()));
console.log(metric?n:n+'/8 hosting checks passed');if(!metric&&failed)process.exitCode=1;
