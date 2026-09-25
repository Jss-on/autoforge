const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(process.argv[2]||'.'), metric=process.argv.includes('--metric');
const target=path.join(repo,'scripts/acceptance.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
assert.equal(sha('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad','oracle control');
if(!fs.existsSync(target)){console.error('Acceptance gate is not implemented; 0/12 behaviors available.');console.log('0');process.exit(metric?0:1);}
const api=require(target),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'forge-acceptance-'));
let count=0,failed=0,seq=0;
function fixture(){
 const root=path.join(tmp,String(++seq));fs.mkdirSync(root);fs.mkdirSync(path.join(root,'evidence'));
 const put=(f,v)=>fs.writeFileSync(path.join(root,f),typeof v==='string'?v:JSON.stringify(v));
 put('requirements.md','FR-1 core journey\n');put('assert.cjs',"require('node:assert/strict').equal(1+2,3)");
 const checks=[{spec:'app',id:'must',dimension:'functional',weight:1,required:true,applicable:true},{spec:'app',id:'logic',dimension:'logic',weight:1,required:true,applicable:true}];
 for(const c of checks)c.execution={argv:[process.execPath,'assert.cjs'],inputs:['assert.cjs'],environment:[],secret_env:{},timeout_ms:3000,output_limit:1024};
 put('checks.json',{checks});
 const rows=(changes={})=>checks.map(c=>['app',c.dimension,c.id,c.weight,changes[c.id]||'pass','evidence:evidence/'+c.id+'.json'].join('\t')).join('\n')+'\n';
 put('results.tsv',rows());
 api.snapshot(root,'checks.json','plan.json',['requirements.md']);
 function receipts(plan='plan.json') {for(const c of checks.filter(c=>c.applicable)){const out='evidence/'+c.id+'.json';if(fs.existsSync(path.join(root,out)))fs.unlinkSync(path.join(root,out));const r=require('node:child_process').spawnSync(process.execPath,[path.join(repo,'scripts/verification.cjs'),'run',root,plan,'app',c.id,out],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);}}
 receipts();
 return {root,put,checks,rows,receipts,check:()=>api.complete(root,'plan.json','results.tsv')};
}
function test(name,fn){try{fn();count++;console.error('PASS: '+name);}catch(e){failed++;console.error('FAIL: '+name+': '+e.message);}}
test('valid pinned checks complete',()=>{const f=fixture(),r=f.check();assert.equal(r.verdict,'COMPLETE');assert.equal(r.passed,2);assert.equal(r.total,2);});
test('missing required row remains blocked',()=>{const f=fixture();f.put('results.tsv',f.rows().split('\n')[0]+'\n');assert.equal(f.check().verdict,'BLOCKED');});
test('unknown result IDs are rejected',()=>{const f=fixture();f.put('results.tsv',f.rows()+'app\tfunctional\textra\t1\tpass\tevidence:evidence/pass.txt\n');assert.throws(f.check);});
test('unresolved required statuses never complete',()=>{for(const s of ['fail','blocked','flaky','not_run','skip']){const f=fixture();f.put('results.tsv',f.rows({logic:s}));assert.notEqual(f.check().verdict,'COMPLETE');}});
test('only justified pinned non-applicability permits skip',()=>{const f=fixture();f.checks[0].applicable=false;assert.throws(()=>api.snapshot(f.root,'invalid.json','unused.json',[]));f.put('checks.json',{checks:f.checks});assert.throws(()=>api.snapshot(f.root,'checks.json','bad-plan.json',['requirements.md']));f.checks[0].reason='Static managed target does not use this container mechanism';f.put('checks.json',{checks:f.checks});api.snapshot(f.root,'checks.json','na-plan.json',['requirements.md']);f.receipts('na-plan.json');f.put('results.tsv',f.rows({must:'skip'}));assert.equal(api.complete(f.root,'na-plan.json','results.tsv').verdict,'COMPLETE');});
test('weight or dimension changes are rejected',()=>{for(const edit of [s=>s.replace('functional','ux'),s=>s.replace('must\t1','must\t2')]){const f=fixture();f.put('results.tsv',edit(f.rows()));assert.throws(f.check);}});
test('changed source spec invalidates plan',()=>{const f=fixture();f.put('requirements.md','FR-1 changed promise');assert.throws(f.check);});
test('self-edited snapshot cannot drop approved checks',()=>{const f=fixture();const p=JSON.parse(fs.readFileSync(path.join(f.root,'plan.json')));p.checks.pop();f.put('plan.json',p);assert.throws(f.check);});
test('missing or empty evidence remains blocked',()=>{for(const content of [null,'']){const f=fixture();if(content===null)fs.unlinkSync(path.join(f.root,'evidence/must.json'));else f.put('evidence/must.json',content);assert.equal(f.check().verdict,'BLOCKED');}});
test('evidence cannot escape its run directory',()=>{const f=fixture();fs.mkdirSync(path.join(f.root,'run'));f.put('run/results.tsv',f.rows().replaceAll('evidence:evidence/','evidence:../evidence/'));assert.equal(api.complete(f.root,'plan.json','run/results.tsv').verdict,'BLOCKED');});
test('feature snapshot preserves prior required checks',()=>{const f=fixture(),old=sha(fs.readFileSync(path.join(f.root,'plan.json')));f.put('delta.json',{checks:[f.checks[0]]});assert.throws(()=>api.snapshot(f.root,'delta.json','delta-plan.json',['requirements.md'],{path:'plan.json',sha256:old}));f.put('delta.json',{checks:f.checks});api.snapshot(f.root,'delta.json','delta-plan.json',['requirements.md'],{path:'plan.json',sha256:old});f.receipts('delta-plan.json');assert.equal(api.complete(f.root,'delta-plan.json','results.tsv').verdict,'COMPLETE');});
test('expected plan digest cannot be replaced',()=>{const f=fixture();assert.throws(()=>api.complete(f.root,'plan.json','results.tsv','0'.repeat(64)));});
if(metric)console.log(count);else console.log(`${count}/12 acceptance checks passed`);
if(!metric&&failed)process.exitCode=1;
