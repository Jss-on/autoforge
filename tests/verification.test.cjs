const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const repo=path.resolve(process.argv[2]||'.'),metric=process.argv.includes('--metric'),target=path.join(repo,'scripts/verification.cjs');
assert.equal(Buffer.from('probe').toString(),'probe');
if(!fs.existsSync(target)){console.error('Execution receipt producer/validator absent');console.log('0');process.exit(metric?0:1);}
const a=require(path.join(repo,'scripts/acceptance.cjs')),v=require(target),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'forge-verification-'));
let seq=0,passed=0,failed=0;
function fixture(code="const assert=require('node:assert/strict');assert.equal(require('./app.cjs'),3);",extra={}){
 const root=path.join(tmp,String(++seq));fs.mkdirSync(root);fs.mkdirSync(path.join(root,'evidence'));
 const put=(f,s)=>fs.writeFileSync(path.join(root,f),typeof s==='string'?s:JSON.stringify(s));
 put('requirements.md','FR-1 computed value is 3\n');put('app.cjs','module.exports=3;\n');put('assert.cjs',code);
 const execution={argv:[process.execPath,'assert.cjs'],inputs:['app.cjs','assert.cjs'],environment:[],secret_env:{},timeout_ms:3000,output_limit:8192,...extra};
 put('checks.json',{checks:[{spec:'app',id:'FR-1',dimension:'logic',weight:1,required:true,applicable:true,execution}]});
 a.snapshot(root,'checks.json','plan.json',['requirements.md','assert.cjs']);
 return {root,put,run:()=>v.execute(root,'plan.json','app','FR-1','evidence/receipt.json'),read:()=>v.validate(root,'plan.json','app','FR-1','evidence/receipt.json')};
}
async function test(name,fn){try{await fn();passed++;console.error('PASS: '+name);}catch(e){failed++;console.error('FAIL: '+name+': '+e.message);}}
(async()=>{
 await test('real successful assertion yields a current passing receipt',async()=>{const f=fixture();assert.equal((await f.run()).status,'pass');assert.equal(f.read().status,'pass');});
 await test('nonzero execution cannot satisfy readiness',async()=>{const f=fixture('process.exit(7)');assert.equal((await f.run()).status,'fail');assert.throws(f.read);});
 await test('timeout stops the process tree',async()=>{const f=fixture("require('node:child_process').spawn(process.execPath,['-e',\"setTimeout(()=>require('node:fs').writeFileSync('late.txt','leak'),600)\"],{stdio:'ignore'});setTimeout(()=>{},5000);",{timeout_ms:150});assert.equal((await f.run()).status,'blocked');await new Promise(r=>setTimeout(r,850));assert.equal(fs.existsSync(path.join(f.root,'late.txt')),false);assert.throws(f.read);});
 await test('output overflow blocks rather than truncating to success',async()=>{const f=fixture("process.stdout.write('x'.repeat(100000))",{output_limit:1024});assert.equal((await f.run()).status,'blocked');assert.throws(f.read);});
 await test('split multibyte output preserves distinct values in both receipt streams',async()=>{
  const outputs=[];
  for(const value of ['\u00e9','\u00f8']){
   const text=JSON.stringify({value}),bytes=Buffer.from(text),split=bytes.indexOf(Buffer.from(value))+1;
   const f=fixture(`const bytes=Buffer.from(${JSON.stringify(bytes.toString('base64'))},'base64'); for(const stream of [process.stdout,process.stderr])stream.write(bytes.subarray(0,${split})); setTimeout(()=>{for(const stream of [process.stdout,process.stderr])stream.write(bytes.subarray(${split}));},100);`);
   const r=await f.run();assert.equal(r.status,'pass');assert.equal(r.stdout,text);assert.equal(r.stderr,text);assert.equal(f.read().stdout,text);outputs.push(r.stdout);
  }
  assert.notEqual(outputs[0],outputs[1]);
 });
 await test('malformed and incomplete UTF-8 block even after exit zero',async()=>{
  for(const stream of ['stdout','stderr'])for(const bytes of [[0xff],[0xc3]]){
   const f=fixture(`process.${stream}.write(Buffer.from(${JSON.stringify(bytes)}));`),r=await f.run();
   assert.equal(r.exit_code,0);assert.equal(r.status,'blocked');assert.equal(r.error,'invalid_utf8');assert.equal(r[stream],'');assert.throws(f.read);
  }
 });
 await test('combined byte limit remains bounded and preserves overflow over decoding errors',async()=>{
  const f=fixture("process.stdout.write('abc');setTimeout(()=>process.stderr.write(Buffer.from([0xc3,0xa9])),100);",{output_limit:4}),r=await f.run();
  assert.equal(r.status,'blocked');assert.equal(r.error,'output_limit');assert.ok(Buffer.byteLength(r.stdout)+Buffer.byteLength(r.stderr)<=4);assert.throws(f.read);
 });
 await test('exit zero below the numeric threshold fails',async()=>{const f=fixture("console.log('0.50')",{expect:{min:0.95,max:1}});assert.equal((await f.run()).status,'fail');assert.throws(f.read);});
 await test('changed implementation invalidates a receipt',async()=>{const f=fixture();await f.run();f.put('app.cjs','module.exports=4;');assert.throws(f.read);});
 await test('changed verifier invalidates a receipt',async()=>{const f=fixture();await f.run();f.put('assert.cjs','process.exit(0)');assert.throws(f.read);});
 await test('changed declared environment invalidates a receipt',async()=>{const old=process.env.FORGE_VERIFY_CASE_ENV;try{process.env.FORGE_VERIFY_CASE_ENV='first';const f=fixture(undefined,{environment:['FORGE_VERIFY_CASE_ENV']});await f.run();process.env.FORGE_VERIFY_CASE_ENV='second';assert.throws(f.read);}finally{if(old===undefined)delete process.env.FORGE_VERIFY_CASE_ENV;else process.env.FORGE_VERIFY_CASE_ENV=old;}});
 await test('edited retained output is rejected',async()=>{const f=fixture("console.log('original')");const r=await f.run();r.stdout='altered';f.put('evidence/receipt.json',r);assert.throws(f.read);});
 await test('self-reported pass cannot contradict a failing exit',async()=>{const f=fixture('process.exit(1)');const r=await f.run();r.status='pass';f.put('evidence/receipt.json',r);assert.throws(f.read);});
 await test('missing executable is a blocked execution',async()=>{const f=fixture(undefined,{argv:['forge-command-that-does-not-exist-93f8']});assert.equal((await f.run()).status,'blocked');assert.throws(f.read);});
 await test('secrets are redacted and undeclared environment is withheld',async()=>{const keys=['FORGE_VERIFY_CASE_SECRET','FORGE_VERIFY_CASE_VERSION','FORGE_VERIFY_CASE_OTHER'],old=keys.map(k=>process.env[k]);try{process.env[keys[0]]='dummy-sensitive-value-93f8';process.env[keys[1]]='rotation-1';process.env[keys[2]]='must-not-inherit';const f=fixture("console.log(process.env.FORGE_VERIFY_CASE_SECRET,process.env.FORGE_VERIFY_CASE_OTHER||'absent')",{secret_env:{FORGE_VERIFY_CASE_SECRET:'FORGE_VERIFY_CASE_VERSION'}});const r=await f.run();assert.equal(r.status,'pass');assert.ok(r.stdout.includes('[REDACTED]'));assert.ok(r.stdout.includes('absent'));assert.ok(!JSON.stringify(r).includes(process.env[keys[0]]));assert.equal(f.read().status,'pass');}finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}});
 console.log(metric?passed:`${passed}/${passed+failed} execution receipt checks passed`);if(!metric&&failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
