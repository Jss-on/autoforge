const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const repo=path.resolve(process.argv[2]||'.'),metric=process.argv.includes('--metric'),file=path.join(repo,'scripts/release-evidence.cjs');
if(!fs.existsSync(file)){console.log('0');console.error('Required installed evaluation gate absent: 0/14');process.exit(metric?0:1);}
const {evaluations,identity}=require(file),digest='a'.repeat(64),now=Date.now();
const required=['claude','codex'].map(agent=>({agent,platform:'win32',cli_version:'fixture-1',requested_model:'fixture-model',oracle_sha256:'b'.repeat(64),runner_sha256:'c'.repeat(64)}));
const policy={evaluations:required,max_age_ms:3600000};
const rows=required.map(r=>({...r,bundle_sha256:digest,installed_sha256:'d'.repeat(64),source_sha256:'d'.repeat(64),loaded_path:'/isolated/plugin/skills/forge/SKILL.md',route:'forge --classic',status:'pass',ended_at:new Date(now).toISOString(),transcript_sha256:'e'.repeat(64),isolation:'os-sandbox',cases:{feature:true,blocked:true,stale:true,failed:true},trace:{router:true,command:true,verification:true}}));
let n=0,fail=0;function test(name,fn){try{fn();n++;console.error('PASS: '+name);}catch(e){fail++;console.error('FAIL: '+name+': '+e.message);}}
const check=r=>evaluations(policy,{version:1,evaluations:r},digest,now),edit=fn=>{const r=structuredClone(rows);fn(r);return r;};
test('fresh two-agent executed evaluation control',()=>assert.equal(check(rows).verdict,'VERIFIED'));
test('subscription policy rejects API or missing login proof',()=>{
  const p={...policy,authentication:'subscription'},r=edit(rows=>rows.forEach(r=>r.authentication={mode:'subscription',method:r.agent==='codex'?'chatgpt':'claude.ai'}));
  assert.equal(evaluations(p,{version:1,evaluations:r},digest,now).verdict,'VERIFIED');
  assert.throws(()=>evaluations(p,{version:1,evaluations:rows},digest,now));
  r[0].authentication.mode='api';assert.throws(()=>evaluations(p,{version:1,evaluations:r},digest,now));
  assert.throws(()=>evaluations({...policy,authentication:'unknown'},{version:1,evaluations:rows},digest,now));
});
test('missing route blocks',()=>assert.throws(()=>check(rows.slice(0,1))));
test('required skipped evaluation blocks',()=>assert.throws(()=>check(edit(r=>r[0].status='skipped'))));
test('changed bundle blocks',()=>assert.throws(()=>check(edit(r=>r[0].bundle_sha256='f'.repeat(64)))));
test('changed oracle blocks',()=>assert.throws(()=>check(edit(r=>r[0].oracle_sha256='f'.repeat(64)))));
test('changed model or CLI blocks',()=>{assert.throws(()=>check(edit(r=>r[0].requested_model='other')));assert.throws(()=>check(edit(r=>r[0].cli_version='other')));});
test('stale or future evaluation blocks',()=>{assert.throws(()=>check(edit(r=>r[0].ended_at=new Date(now-3600001).toISOString())));assert.throws(()=>check(edit(r=>r[0].ended_at=new Date(now+60000).toISOString())));});
test('self-graded or missing negative task blocks',()=>{assert.throws(()=>check(edit(r=>r[0].cases.stale=false)));assert.throws(()=>check(edit(r=>delete r[0].cases.failed)));});
test('unproven loaded bundle or route blocks',()=>{assert.throws(()=>check(edit(r=>r[0].installed_sha256='f'.repeat(64))));assert.throws(()=>check(edit(r=>r[0].trace.router=false)));});
test('oracle without enforced write isolation blocks',()=>assert.throws(()=>check(edit(r=>r[0].isolation='prompt-only'))));
test('ambiguous duplicates and malformed data block',()=>{assert.throws(()=>check([...rows,rows[0]]));assert.throws(()=>check(null));assert.throws(()=>evaluations({evaluations:[]},{version:1,evaluations:rows},digest,now));});
test('required unavailable model runner cannot skip',()=>{const bash=process.env.FORGE_TEST_BASH||(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash');const r=cp.spawnSync(bash,[path.join(repo,'scripts/smoke-model.sh')],{encoding:'utf8',timeout:10000,env:{...process.env,AR_SMOKE_MODEL:'0',AR_SMOKE_MODEL_REQUIRED:'1',FORGE_EVAL_AGENT:'unavailable'}});assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout,/SKIPPED/);});
test('hook ignore line endings normalize while binary bytes remain bound',()=>{
  const parent=fs.realpathSync(require('node:os').tmpdir()),root=fs.mkdtempSync(path.join(parent,'forge-bundle-'));
  try {
    for(const [name,newline] of [['lf','\n'],['crlf','\r\n']]){
      const dir=path.join(root,name);fs.mkdirSync(path.join(dir,'claude-plugin/hooks'),{recursive:true});fs.mkdirSync(path.join(dir,'plugins/forge'),{recursive:true});
      fs.writeFileSync(path.join(dir,'claude-plugin/hooks/.ckignore'),'node_modules/'+newline+'.git/'+newline);fs.writeFileSync(path.join(dir,'plugins/forge/icon.png'),Buffer.from([0,13,10,255]));
    }
    const lf=path.join(root,'lf'),crlf=path.join(root,'crlf');assert.equal(identity(lf),identity(crlf));
    fs.writeFileSync(path.join(crlf,'plugins/forge/icon.png'),Buffer.from([0,10,255]));assert.notEqual(identity(lf),identity(crlf));
  } finally {assert.equal(path.dirname(fs.realpathSync(root)),parent);assert.ok(path.basename(root).startsWith('forge-bundle-'));fs.rmSync(root,{recursive:true,force:true});}
});
console.log(metric?n:`${n}/14 release evaluation checks passed`);if(fail&&!metric)process.exitCode=1;
