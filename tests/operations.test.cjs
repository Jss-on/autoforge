const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const repo=path.resolve(process.argv[2]||'.'),o=require(path.join(repo,'scripts/operational.cjs')),metric=process.argv.includes('--metric');if(!o.budget){console.log('0');console.error('Journey error-budget gate absent: 0/8');process.exit(metric?0:1);}let n=0,fail=0;const p=()=>({target:0.99,window_ms:2592000000,owner:'pilot-operator',telemetry:'protected-journey-collector',alert_sink:'local-test',runbook:'runbook.md',review_at:'2026-10-25T00:00:00Z'});const v=()=>({started_at:'2026-01-01T00:00:00Z',ended_at:'2026-01-31T00:00:00Z',total:1000,good:995,coverage:1});function test(name,fn){try{fn();n++;console.error('PASS: '+name);}catch(e){fail++;console.error('FAIL: '+name+': '+e.message);}}
test('known SLI and budget match hand calculation',()=>{const r=o.budget(p(),v());assert.equal(r.sli,0.995);assert.equal(r.remaining,5);assert.equal(r.burn_rate,0.5);assert.equal(r.action,'CONTINUE');assert.equal(r.slo_proven,true);});
test('short pilot does not prove a full-window SLO',()=>{const x=v();x.ended_at='2026-01-01T00:01:00Z';assert.equal(o.budget(p(),x).slo_proven,false);});
test('exhausted budget prioritizes repair',()=>{const x=v();x.good=989;assert.equal(o.budget(p(),x).action,'REPAIR_ONLY');});
test('zero events are unavailable',()=>{const x=v();x.total=x.good=0;const r=o.budget(p(),x);assert.equal(r.sli,null);assert.equal(r.action,'HOLD');});
test('incomplete coverage holds release',()=>{const x=v();x.coverage=0.9;assert.equal(o.budget(p(),x).action,'HOLD');});
test('impossible counts are rejected',()=>{const x=v();x.good=1001;assert.throws(()=>o.budget(p(),x));});
test('missing responder/runbook is rejected',()=>{const x=p();delete x.owner;assert.throws(()=>o.budget(x,v()));});
test('perfect target cannot create divide by zero',()=>{const x=p();x.target=1;assert.throws(()=>o.budget(x,v()));});
test('zero failures never exhaust a near-one target',()=>{const x=p(),y=v();x.target=1-Number.EPSILON;y.good=y.total;assert.equal(o.budget(x,y).action,'CONTINUE');});
console.log(metric?n:n+'/9 operations checks passed');if(!metric&&fail)process.exitCode=1;
