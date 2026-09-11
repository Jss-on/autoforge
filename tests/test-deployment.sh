#!/usr/bin/env bash
# Local repositories and CLI fakes only; nested gates use tiny fixture suites.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FORGE_AUDIT_BASH="$(command -v bash)" FORGE_AUDIT_GIT="$(command -v git)"
node - "$ROOT" <<'JS'
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const source=process.argv[2],temp=fs.mkdtempSync(path.join(os.tmpdir(),'forge-deployment-'));
const bash=process.env.FORGE_AUDIT_BASH,gitBin=process.env.FORGE_AUDIT_GIT;
const env={...process.env,GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'protocol.allow',GIT_CONFIG_VALUE_0:'never',GIT_CONFIG_KEY_1:'protocol.file.allow',GIT_CONFIG_VALUE_1:'always',GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid',AUTOFORGE_SKIP_TESTS:'0'};
for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE']) delete env[key];
let count=0,sequence=0;
function put(dir,file,text){const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text,{mode:0o755});}
function call(dir,bin,args,extra={}){return cp.spawnSync(bin,args,{cwd:dir,env,encoding:'utf8',...extra});}
function git(dir,...args){const r=call(dir,gitBin,args);assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function commit(dir){git(dir,'add','.');git(dir,'commit','-qm','fixture candidate');return git(dir,'rev-parse','HEAD');}
function fixture(){
 const dir=path.join(temp,String(++sequence)),remote=dir+'-remote.git',bin=dir+'-bin',log=dir+'-calls.log';fs.mkdirSync(dir);fs.mkdirSync(bin);git(temp,'init','--bare',remote);git(dir,'init','-b','master');
 for(const f of ['publish-autoforge.sh','release.sh'])put(dir,'scripts/'+f,fs.readFileSync(path.join(source,'scripts',f)));
 put(dir,'scripts/smoke-seam.sh','#!/bin/bash\nexit 0\n');put(dir,'tests/test-fixture.sh','#!/bin/bash\nexit 0\n');put(dir,'.claude-plugin/marketplace.json','{"version":"1.0.0"}\n');put(dir,'claude-plugin/.claude-plugin/plugin.json','{"name":"forge","version":"1.0.0"}\n');put(dir,'README.md','baseline\n');commit(dir);git(dir,'remote','add','autoforge',remote);git(dir,'push','autoforge','HEAD:refs/heads/master');
 put(bin,'git',`#!/bin/bash
printf '%s\\n' "$*" >> "$AUDIT_LOG"
if [[ "$1 $2" == "remote get-url" ]]; then
  if [[ " $* " == *" --push "* && "\${AUDIT_BAD_PUSH:-0}" == 1 ]]; then echo 'https://github.com/example/wrong.git'; else
    actual=$("$AUDIT_REAL_GIT" "$@")
    if [[ "$actual" == "$AUDIT_REMOTE" ]]; then echo 'https://github.com/Jss-on/autoforge.git'; else echo "$actual"; fi
  fi
  exit 0
fi
if [[ "$1" == fetch && "\${AUDIT_FAIL_FETCH:-0}" == 1 ]]; then exit 43; fi
if [[ "$1" == ls-remote && " $* " == *" --tags "* && "\${AUDIT_FAIL_TAG:-0}" == 1 ]]; then exit 44; fi
if [[ "$1" == push && -n "\${AUDIT_RACE:-}" ]]; then "$AUDIT_REAL_GIT" -C "$AUDIT_REMOTE" update-ref refs/heads/master "$AUDIT_RACE"; fi
if [[ "$1" == push && " $* " == *':refs/heads/master '* ]]; then
  [[ "\${AUDIT_DENY_MASTER:-0}" != 1 ]] || { echo 'remote policy denied master push' >&2; exit 1; }
  [[ -z "\${AUDIT_RELEASE_RACE:-}" ]] || "$AUDIT_REAL_GIT" -C "$AUDIT_REMOTE" update-ref refs/heads/master "$AUDIT_RELEASE_RACE"
fi
args=()
for arg in "$@"; do [[ "$arg" != 'https://github.com/Jss-on/autoforge.git' ]] || arg=autoforge; args+=("$arg"); done
exec "$AUDIT_REAL_GIT" "\${args[@]}"
`);
 put(bin,'gh',`#!/bin/bash
printf 'gh %s\\n' "$*" >> "$AUDIT_LOG"
case "$1 $2" in
  'pr create') echo 'https://github.com/Jss-on/autoforge/pull/123' ;;
  'pr checks') [[ "\${AUDIT_FAIL_CI:-0}" != 1 ]] ;;
  'pr view')
    if [[ " $* " == *' headRefOid,'* ]]; then
      head=$("$AUDIT_REAL_GIT" rev-parse HEAD)
      [[ "\${AUDIT_CHANGED_HEAD:-0}" != 1 ]] || head=0000000000000000000000000000000000000000
      printf '{"headRefOid":"%s","baseRefName":"master","state":"OPEN","isCrossRepository":false,"isDraft":%s,"mergeStateStatus":"%s","reviewDecision":"%s"}\\n' "$head" "\${AUDIT_DRAFT:-false}" "\${AUDIT_MERGE_STATE:-CLEAN}" "\${AUDIT_REVIEW:-}"
    else
      merge=$("$AUDIT_REAL_GIT" -C "$AUDIT_REMOTE" rev-parse master)
      [[ "\${AUDIT_BAD_RECEIPT:-0}" != 1 ]] || merge=0000000000000000000000000000000000000000
      if [[ "\${AUDIT_RECEIPT_DELAY:-0}" == 1 && ! -f "$AUDIT_LOG.receipt" ]]; then
        touch "$AUDIT_LOG.receipt"; echo '{"state":"OPEN","mergeCommit":null}'
      else
        if [[ "\${AUDIT_ADVANCE_AFTER_MERGE:-0}" == 1 ]]; then
          next=$("$AUDIT_REAL_GIT" -C "$AUDIT_REMOTE" commit-tree "$merge^{tree}" -p "$merge" -m 'concurrent product update')
          "$AUDIT_REAL_GIT" -C "$AUDIT_REMOTE" update-ref refs/heads/master "$next"
        fi
        printf '{"state":"MERGED","mergeCommit":{"oid":"%s"}}\\n' "$merge"
      fi
    fi ;;
  'pr merge') echo 'unexpected provider-side merge' >&2; exit 45 ;;
  'release create') : ;;
  api*)
    head=$("$AUDIT_REAL_GIT" rev-parse HEAD)
    conclusion=success; [[ "\${AUDIT_SKIPPED_CI:-0}" != 1 ]] || conclusion=skipped
    if [[ "\${AUDIT_MISSING_CI:-0}" == 1 ]]; then echo '{"total_count":0,"check_runs":[]}'; else
      printf '{"total_count":2,"check_runs":[{"name":"Harness test suites","app":{"slug":"github-actions"},"head_sha":"%s","status":"completed","conclusion":"%s"},{"name":"Model smoke (drift alarm)","head_sha":"%s","status":"completed","conclusion":"skipped"}]}\\n' "$head" "$conclusion" "$head"
    fi ;;
  *) exit 45 ;;
esac
`);
 const taskEnv={...env,PATH:bin+path.delimiter+env.PATH,AUDIT_REAL_GIT:gitBin,AUDIT_REMOTE:remote,AUDIT_LOG:log};
 return {dir,remote,log,run:(script='publish-autoforge.sh',args=[],extra={})=>call(dir,bash,['scripts/'+script,...args],{env:{...taskEnv,...extra.env},input:extra.input||''}),calls:()=>fs.existsSync(log)?fs.readFileSync(log,'utf8'):''};
}
function candidate(f){put(f.dir,'README.md','candidate\n');commit(f.dir);}
function rejected(f,r,reason){assert.notEqual(r.status,0,r.stdout+r.stderr);assert.match(r.stdout+r.stderr,reason);assert.doesNotMatch(f.calls(),/^push /m,'must stop before product push');}
function test(name,fn){fn();count++;console.log('  PASS: '+name);}
test('valid candidate publishes only its tree with atomic first tag',()=>{const f=fixture();candidate(f);const head=git(f.dir,'rev-parse','HEAD');const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(git(f.remote,'rev-parse','master^{tree}'),git(f.dir,'rev-parse','HEAD^{tree}'));assert.notEqual(git(f.remote,'rev-parse','master'),head);assert.match(f.calls(),/^push --no-follow-tags --atomic https:\/\/github.com\/Jss-on\/autoforge.git /m);});
test('product squash tree can anchor a later source publication',()=>{const f=fixture();candidate(f);assert.equal(f.run().status,0);put(f.dir,'README.md','next candidate\n');commit(f.dir);const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(git(f.remote,'show','master:README.md'),'next candidate');});
test('publication does not follow unrelated local annotated tags',()=>{const f=fixture();git(f.dir,'tag','-a','private-local-notes','-m','Dummy local-only annotation');git(f.dir,'config','push.followTags','true');candidate(f);const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(git(f.remote,'tag','--list'),'v1.0.0');assert.equal(git(f.dir,'tag','--list'),'private-local-notes');});
test('wrong push destination is rejected',()=>{const f=fixture();candidate(f);rejected(f,f.run(undefined,[],{env:{AUDIT_BAD_PUSH:'1'}}),/must target/);});
test('gate-time remote configuration mutation is rejected',()=>{const f=fixture();put(f.dir,'tests/test-fixture.sh','#!/bin/bash\ngit remote set-url --push autoforge https://github.com/example/wrong.git\n');commit(f.dir);rejected(f,f.run(),/must target/);});
test('failed fetch cannot publish a stale tree',()=>{const f=fixture();candidate(f);rejected(f,f.run(undefined,[],{env:{AUDIT_FAIL_FETCH:'1'}}),/./);});
test('failed tag lookup cannot publish',()=>{const f=fixture();candidate(f);rejected(f,f.run(undefined,[],{env:{AUDIT_FAIL_TAG:'1'}}),/remote release tag/);});
test('remote-only changes cannot be overwritten',()=>{const f=fixture(),writer=f.dir+'-writer';git(temp,'clone','--branch','master',f.remote,writer);put(writer,'security-fix.txt','keep me');commit(writer);git(writer,'push','origin','master');candidate(f);rejected(f,f.run(),/absent from source history/);assert.equal(git(f.remote,'show','master:security-fix.txt'),'keep me');});
for(const [name,body] of [
 ['HEAD','printf "late\\n" > late.txt\ngit add late.txt\ngit commit -qm late\n'],
 ['index','printf "late\\n" > README.md\ngit add README.md\n'],
 ['worktree','printf "late\\n" > README.md\n']
])test('gate-time '+name+' mutation prevents publication',()=>{const f=fixture();put(f.dir,'tests/test-fixture.sh','#!/bin/bash\n'+body);commit(f.dir);rejected(f,f.run(),/changed; verify again/);});
test('failed suite blocks publication',()=>{const f=fixture();put(f.dir,'tests/test-fixture.sh','#!/bin/bash\nexit 1\n');commit(f.dir);rejected(f,f.run(),/test-fixture/);});
for(const flag of ['--assume-unchanged','--skip-worktree'])test(flag+' cannot hide a failing committed suite',()=>{const f=fixture();put(f.dir,'tests/test-fixture.sh','#!/bin/bash\nexit 1\n');commit(f.dir);git(f.dir,'update-index',flag,'tests/test-fixture.sh');put(f.dir,'tests/test-fixture.sh','#!/bin/bash\nexit 0\n');assert.equal(git(f.dir,'status','--porcelain'),'');rejected(f,f.run(),/clear assume-unchanged and skip-worktree flags/);});
test('failed seam blocks publication',()=>{const f=fixture();put(f.dir,'scripts/smoke-seam.sh','#!/bin/bash\necho "seam failed" >&2\nexit 1\n');commit(f.dir);rejected(f,f.run(),/seam failed/);});
test('test bypass is rejected',()=>{const f=fixture();candidate(f);rejected(f,f.run(undefined,[],{env:{AUTOFORGE_SKIP_TESTS:'1'}}),/cannot be skipped/);});
for(const file of ['forge/client/run.json','autoresearch/old/client.json','data/client.csv','.env.production','certs/server.key'])test('tracked private artifact rejected: '+file,()=>{const f=fixture();put(f.dir,file,'dummy fixture');commit(f.dir);rejected(f,f.run(),/private run output or credential/);});
test('PEM private key content rejected without revealing contents',()=>{const f=fixture();put(f.dir,'certificate.pem',['-----BEGIN '+'PRIVATE KEY-----','DUMMY PRIVATE MATERIAL','-----END '+'PRIVATE KEY-----',''].join('\n'));commit(f.dir);const r=f.run();rejected(f,r,/private-key material/);assert.doesNotMatch(r.stderr,/DUMMY PRIVATE MATERIAL/);});
test('environment examples and distributed forge skills remain valid',()=>{const f=fixture();put(f.dir,'.env.example','EXAMPLE=replace-me');put(f.dir,'.env.production.template','EXAMPLE=replace-me');put(f.dir,'plugins/forge/skills/forge/example.md','public skill');commit(f.dir);const r=f.run();assert.equal(r.status,0,r.stdout+r.stderr);});
test('remote race is rejected without force or partial tag',()=>{const f=fixture(),writer=f.dir+'-writer';git(temp,'clone','--branch','master',f.remote,writer);put(writer,'new.txt','remote race');const race=commit(writer);git(writer,'push','origin','HEAD:refs/heads/race-object');candidate(f);const r=f.run(undefined,[],{env:{AUDIT_RACE:race}});assert.notEqual(r.status,0);assert.equal(git(f.remote,'rev-parse','master'),race);assert.equal(git(f.remote,'tag','--list'),'');assert.doesNotMatch(f.calls(),/^push .*--force/m);});
for(const args of [['1.0.1;echo'],['01.0.1'],['1.0.1','extra'],['1.0.1','--title'],['1.0.1','--unknown']])test('invalid release arguments fail before external work: '+args.join(' '),()=>{const f=fixture();const r=f.run('release.sh',args);assert.notEqual(r.status,0);assert.equal(f.calls(),'');});
test('release requires increasing version',()=>{const f=fixture();rejected(f,f.run('release.sh',['1.0.0']),/must increase/);});
test('release refuses private source history',()=>{const f=fixture();candidate(f);rejected(f,f.run('release.sh',['1.0.1']),/source history/);});
test('release cannot push failing tests',()=>{const f=fixture();put(f.dir,'tests/test-fixture.sh','#!/bin/bash\nexit 1\n');commit(f.dir);git(f.dir,'push','autoforge','HEAD:master');rejected(f,f.run('release.sh',['1.0.1'],{input:'\nabort\n'}),/test-fixture/);});
test('release leaves PR open on declined merge',()=>{const f=fixture();const r=f.run('release.sh',['1.0.1'],{input:'\nabort\n'});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(f.calls(),/gh pr create --repo Jss-on\/autoforge/);assert.doesNotMatch(f.calls(),/^push .*:refs\/heads\/master|gh pr merge|gh release create/m);});
test('failed required CI prevents release merge and tag',()=>{const f=fixture();const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{AUDIT_FAIL_CI:'1'}});assert.notEqual(r.status,0);assert.match(f.calls(),/gh pr checks .*--watch --fail-fast/);assert.doesNotMatch(f.calls(),/^push .*:refs\/heads\/master|gh pr merge|gh release create/m);assert.equal(git(f.remote,'tag','--list'),'');});
test('changed PR head prevents merge and tag',()=>{const f=fixture();const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{AUDIT_CHANGED_HEAD:'1'}});assert.notEqual(r.status,0);assert.match(r.stderr,/PR identity changed/);assert.doesNotMatch(f.calls(),/^push .*:refs\/heads\/master|gh pr merge|gh release create/m);});
for(const flag of ['AUDIT_MISSING_CI','AUDIT_SKIPPED_CI'])test(flag+' prevents merge and tag',()=>{const f=fixture();const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{[flag]:'1'}});assert.notEqual(r.status,0);assert.match(r.stderr,/successful Harness test suites CI is required/);assert.doesNotMatch(f.calls(),/^push .*:refs\/heads\/master|gh pr merge|gh release create/m);});
for(const state of [{AUDIT_REVIEW:'CHANGES_REQUESTED'},{AUDIT_REVIEW:'REVIEW_REQUIRED'},{AUDIT_MERGE_STATE:'BLOCKED'},{AUDIT_DRAFT:'true'}])test('unready PR cannot merge: '+JSON.stringify(state),()=>{const f=fixture();const base=git(f.remote,'rev-parse','master');const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:state});assert.notEqual(r.status,0);assert.match(r.stderr,/PR readiness/);assert.equal(git(f.remote,'rev-parse','master'),base);assert.equal(git(f.remote,'tag','--list'),'');});
test('release master push rejects a last-moment base advance',()=>{const f=fixture(),writer=f.dir+'-writer';git(temp,'clone','--branch','master',f.remote,writer);put(writer,'remote-fix.txt','preserve concurrent correction');const race=commit(writer);git(writer,'push','origin','HEAD:refs/heads/race-object');const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{AUDIT_RELEASE_RACE:race}});assert.notEqual(r.status,0);assert.match(r.stderr,/rejected/);assert.equal(git(f.remote,'rev-parse','master'),race);assert.equal(git(f.remote,'show','master:remote-fix.txt'),'preserve concurrent correction');assert.equal(git(f.remote,'tag','--list'),'');assert.doesNotMatch(f.calls(),/gh release create|--force/);});
test('remote policy denying master push stops before tagging',()=>{const f=fixture(),base=git(f.remote,'rev-parse','master');const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{AUDIT_DENY_MASTER:'1'}});assert.notEqual(r.status,0);assert.match(r.stderr,/remote policy denied/);assert.equal(git(f.remote,'rev-parse','master'),base);assert.equal(git(f.remote,'tag','--list'),'');assert.doesNotMatch(f.calls(),/gh release create|--force/);});
test('unconfirmed provider merge receipt blocks tagging',()=>{const f=fixture();const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{AUDIT_BAD_RECEIPT:'1'}});assert.notEqual(r.status,0);assert.match(r.stderr,/receipt is unconfirmed/);assert.equal(git(f.remote,'tag','--list'),'');assert.doesNotMatch(f.calls(),/gh release create/);});
test('delayed provider receipt is retried before tagging',()=>{const f=fixture();const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{AUDIT_RECEIPT_DELAY:'1'}});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(git(f.remote,'rev-parse','refs/tags/v1.0.1'),git(f.remote,'rev-parse','master'));});
test('release tags the verified merge if master advances afterward',()=>{const f=fixture();const r=f.run('release.sh',['1.0.1'],{input:'\nmerge\n',env:{AUDIT_ADVANCE_AFTER_MERGE:'1'}});assert.equal(r.status,0,r.stdout+r.stderr);const tag=git(f.remote,'rev-parse','refs/tags/v1.0.1');assert.notEqual(tag,git(f.remote,'rev-parse','master'));assert.equal(git(f.remote,'rev-parse','master^'),tag);assert.equal(git(f.remote,'rev-parse',tag+'^{tree}'),git(f.dir,'rev-parse','HEAD^{tree}'));});
test('verified release preserves reviewed parents and tree without following local tags',()=>{const f=fixture(),base=git(f.remote,'rev-parse','master');git(f.dir,'tag','-a','private-local-notes','-m','Dummy local-only annotation');git(f.dir,'config','push.followTags','true');const r=f.run('release.sh',['1.0.1','--title','Fixture release'],{input:'\nmerge\n',env:{AUDIT_REVIEW:'APPROVED'}});assert.equal(r.status,0,r.stdout+r.stderr);const head=git(f.dir,'rev-parse','HEAD'),merge=git(f.remote,'rev-parse','refs/tags/v1.0.1');assert.equal(git(f.remote,'show','-s','--format=%P',merge),base+' '+head);assert.equal(git(f.remote,'rev-parse',merge+'^{tree}'),git(f.dir,'rev-parse','HEAD^{tree}'));assert.match(f.calls(),new RegExp('gh release create v1.0.1 --repo Jss-on/autoforge --verify-tag --target '+merge));assert.equal(git(f.remote,'tag','--list'),'v1.0.1');assert.equal(git(f.dir,'tag','--list'),'private-local-notes');assert.doesNotMatch(f.calls(),/gh pr merge|--force|branches\/master\/protection/);});
console.log(`=== ${count}/${count} passed ===`);
JS
