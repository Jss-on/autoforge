const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),cp=require('node:child_process');
const repo=path.resolve(process.argv[2]||'.'),target=path.join(repo,'scripts/semver.cjs');
if(!fs.existsSync(target)){console.error('Semver seam absent');process.exit(1);}
const sv=require(target),tmp=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'forge-semver-')));
const bashPath=process.env.FORGE_TEST_BASH||(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash');
let seq=0,passed=0,failed=0;
function fixture(at){
 const root=at||path.join(tmp,String(++seq));fs.mkdirSync(root,{recursive:true});
 const git=(...args)=>{const r=cp.spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,args.join(' ')+': '+r.stderr);return r.stdout.trim();};
 git('init','-q','-b','main');git('config','user.name','Semver Test');git('config','user.email','semver@example.test');git('config','commit.gpgsign','false');git('config','core.autocrlf','false');
 fs.appendFileSync(path.join(root,'.git','info','exclude'),'.run/\n');
 const put=(f,s)=>{fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),s);};
 let n=0;const commit=(...msg)=>{put(`f/${++n}.txt`,String(n));git('add','-A');git('commit','-q',...msg.flatMap(m=>['-m',m]));return git('rev-parse','HEAD');};
 const revert=sha=>{git('revert','--no-edit',sha);return git('rev-parse','HEAD');};
 const merge=(branch,msg,...commits)=>{git('checkout','-q','-b',branch);const shas=commits.map(c=>commit(c));git('checkout','-q','main');git('merge','-q','--no-ff',branch,'-m',msg);return {merge:git('rev-parse','HEAD'),shas};};
 const exec=(args,env={})=>{const r=cp.spawnSync(process.execPath,[target,...args],{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,...env}});return {...r,out:r.stdout+r.stderr};};
 const run=path.join(root,'.run');
 const json=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
 return {root,git,put,commit,revert,merge,exec,run,json,head:()=>git('rev-parse','HEAD'),read:f=>fs.readFileSync(path.join(root,f),'utf8')};
}
async function test(name,fn){try{await fn();passed++;console.error('PASS: '+name);}catch(e){failed++;console.error('FAIL: '+name+': '+e.message);}}
// a gh stand-in: logs every call, answers pr create with a URL (or fails it once under FAKE_GH_FAIL_PR), has no releases
function fakeGh(dir){const file=path.join(dir,'gh.cjs');fs.writeFileSync(file,String.raw`const fs=require('fs'),cp=require('child_process'),a=process.argv.slice(2),log=process.env.FAKE_GH_LOG;fs.appendFileSync(log,JSON.stringify(a)+'\n');
if(a[0]==='pr'&&a[1]==='create'){if(process.env.FAKE_GH_FAIL_PR)process.exit(1);fs.appendFileSync(log,'tags-at-pr '+cp.execFileSync('git',['--git-dir',process.env.FAKE_BARE,'tag'],{encoding:'utf8'}).trim().split(/\s+/).join(',')+'\n');console.log('https://github.com/acme/demo/pull/9');}
else if(a[0]==='release'&&a[1]==='view')process.exit(1);else if(a[0]==='api'&&a.includes('--jq'))console.log('PR_TITLE');`);return file;}
const ledger=f=>fs.readFileSync(path.join(f.run,'ledger.tsv'),'utf8').trim().split('\n').slice(1).map(l=>l.split('\t'));
// the history most tests share: an initial direct run, a squashed PR, a direct fix, a merged PR, a docs tail
function history(){
 const f=fixture(),s={};
 s.init=f.commit('chore: init');s.exp=f.commit('experiment: functional — crud');s.rev=f.revert(s.exp);
 s.totals=f.commit('experiment: logic — running totals');s.export=f.commit('feat: invoice export (#2)');
 s.gaps=f.commit('Close access gaps in the reports');
 const m=f.merge('feat/y','Merge pull request #3 from acme/feat/y','experiment: ux — y screen','feat(ui): y screen');s.mergeExp=m.shas[0];s.yfeat=m.shas[1];s.merge=m.merge;
 s.docs=f.commit('docs: readme');
 fs.mkdirSync(f.run,{recursive:true});
 fs.writeFileSync(path.join(f.run,'classes.json'),JSON.stringify({[s.totals.slice(0,7)]:{type:'feat',note:'running totals on every invoice'},[s.gaps.slice(0,9)]:{type:'fix',note:'reports no longer show other accounts'},[s.mergeExp]:{type:'chore'}}));
 return {f,s};
}
(async()=>{
 await test('parse reads a message the way commit-analyzer 13 with the conventionalcommits preset does',()=>{
  const H='c'.repeat(40);
  let p=sv.parse('feat(api)!: drop v1');assert.deepEqual([p.type,p.scope,p.breaking,p.breakingNote],['feat','api',true,'drop v1']);
  assert.equal(sv.parse('chore!: drop node 18').breaking,true);assert.equal(sv.parse('experiment!: rewrite').breaking,true,'a breaking marker on any type is a major');
  p=sv.parse('Some free text\n\nBREAKING CHANGE: sessions reset');assert.deepEqual([p.type,p.breaking,p.breakingNote],[null,true,'sessions reset']);
  assert.equal(sv.parse('docs: notes\n\nBreaking change: sessions reset').breaking,true,'note keywords match in any case');
  assert.equal(sv.parse('docs: x\n\nBREAKING CHANGE\nnext line text').breaking,false,'a note needs its text on the same line');
  p=sv.parse(`Revert "feat: x"\n\nThis reverts commit ${H}.`);assert.deepEqual([p.type,p.revert],[null,{header:'feat: x',hash:H}]);
  assert.deepEqual(sv.parse(`Revert "Revert "feat: x""\n\nThis reverts commit ${H}.`).revert,{header:'Revert "feat: x"',hash:H});
  assert.equal(sv.parse('revert: feat: x').revert,null);assert.equal(sv.parse('revert: feat: x').type,'revert');
  assert.equal(sv.parse(`Revert "Merge pull request #3 from a/b"\n\nThis reverts commit ${H}, reversing\nchanges made to ${'b'.repeat(40)}.`).revert,null,'a merge revert is not a revert to the preset');
  assert.equal(sv.parse('Revert "feat: x"\n\nThis reverts commit abc1234 (feat: x, 2026-10-17).').revert,null,'--reference is not a revert either');
  assert.deepEqual([sv.parse('experiment: functional — crud').type,sv.parse('Feat: capital').type,sv.parse('FEAT: caps').type,sv.parse('feat(): empty scope').type],['experiment','Feat','FEAT','feat']);
 });
 await test('live cancels a revert pair the way conventional-commits-filter does: newest first, exact header and full sha',()=>{
  const H='c'.repeat(40),T={sha:H,message:'chore: x'},R=m=>({sha:'d'.repeat(40),message:m});
  assert.deepEqual(sv.live([T,R(`Revert "chore: x"\n\nThis reverts commit ${H}.`)]),[]);
  assert.equal(sv.live([T,R(`Revert "chore: x" (#5)\n\nThis reverts commit ${H}.`)]).length,2,'a squash title with " (#5)" cancels nothing');
  assert.equal(sv.live([T,R('Revert "chore: x"\n\nThis reverts commit ccccccc.')]).length,2,'an abbreviated sha cancels nothing');
 });
 await test('crafted messages, names and triggers parse in bounded time',()=>{
  const t=Date.now(),blank=' '.repeat(300000);
  sv.parse('Revert '+blank+'x');sv.parse('feat: x\n'+'\n'.repeat(300000)+'BREAKING CHANGE');sv.parse('feat: x\n\n'+blank+'y');sv.parse('Revert "'+'This reverts commit a'.repeat(5000));
  sv.scalar('a'+blank+'b');sv.triggers('on:'+blank+'x\nname: '+blank+'y');
  assert.ok(Date.now()-t<3000,`took ${Date.now()-t} ms`);
 });
 await test('scan marks real Conventional Commits auto, everything else todo, merges, and revert pairs',()=>{
  const {f,s}=history();const r=f.exec(['scan',f.root,'--out',path.join(f.run,'ledger.tsv')]);
  assert.equal(r.status,0,r.out);assert.match(r.out,/SCAN: commits=10 auto=5 todo=3 pairs=2 base=none/);
  const rows=Object.fromEntries(ledger(f).map(c=>[c[0],c]));
  assert.deepEqual([rows[s.exp][2],rows[s.exp][4]],['?','pair:'+s.rev.slice(0,7)]);assert.deepEqual([rows[s.rev][2],rows[s.rev][4]],['revert','pair:'+s.exp.slice(0,7)]);
  assert.deepEqual([rows[s.totals][2],rows[s.totals][4]],['?','todo']);assert.deepEqual([rows[s.gaps][2],rows[s.gaps][4]],['?','todo']);
  assert.deepEqual([rows[s.merge][2],rows[s.merge][4]],['merge','auto']);assert.deepEqual([rows[s.yfeat][2],rows[s.yfeat][5]],['feat','ui']);
  assert.equal(ledger(f)[0][0],s.init,'oldest first');
 });
 await test('plan blocks until every live todo commit is classified, then cuts releases at integration points',()=>{
  const {f,s}=history();f.exec(['scan',f.root,'--out',path.join(f.run,'ledger.tsv')]);
  let r=f.exec(['plan',f.root,path.join(f.run,'ledger.tsv'),'--out',path.join(f.run,'plan.json')]);
  assert.equal(r.status,1,r.out);assert.match(r.out,/PLAN: BLOCKED/);
  for(const sha of [s.totals,s.gaps,s.mergeExp])assert.match(r.out,new RegExp('classify '+sha.slice(0,7)));
  assert.doesNotMatch(r.out,new RegExp('classify '+s.exp.slice(0,7)),'a revert pair inside one release cancels');
  r=f.exec(['plan',f.root,path.join(f.run,'ledger.tsv'),'--classes',path.join(f.run,'classes.json'),'--out',path.join(f.run,'plan.json'),'--changelog',path.join(f.run,'CHANGELOG.md')]);
  assert.equal(r.status,0,r.out);assert.match(r.out,/PLAN: READY releases=4 base=none latest=v1\.2\.0 unreleased=1/);
  const p=JSON.parse(fs.readFileSync(path.join(f.run,'plan.json'),'utf8'));
  assert.deepEqual(p.releases.map(x=>[x.tag,x.sha,x.bump,x.pr]),[['v1.0.0',s.totals,'initial',null],['v1.1.0',s.export,'minor',2],['v1.1.1',s.gaps,'patch',null],['v1.2.0',s.merge,'minor',3]]);
  assert.deepEqual(p.releases[0].commits,[s.init,s.totals],'the cancelled pair is gone from the first release');
  assert.deepEqual(p.releases[3].commits,[s.mergeExp,s.yfeat,s.merge],'a merge brings its branch commits');
  const log=fs.readFileSync(path.join(f.run,'CHANGELOG.md'),'utf8');
  assert.ok(log.startsWith('# Changelog\n\n## 1.2.0 ('),log.slice(0,80));
  assert.ok(log.indexOf('## 1.2.0')<log.indexOf('## 1.1.1')&&log.indexOf('## 1.1.1')<log.indexOf('## 1.0.0'),'newest first');
  assert.match(log,/\* running totals on every invoice \([0-9a-f]{7}\)/);assert.match(log,/\* \*\*ui:\*\* y screen/);assert.match(log,/### Bug Fixes\n\n\* reports no longer show other accounts/);
  assert.doesNotMatch(log,/crud|readme|y screen \(#|Merge pull/,'cancelled, hidden and merge rows stay out');
 });
 await test('a classified feat/fix without a note, an unknown type or a stale ledger is refused',()=>{
  const {f,s}=history();f.exec(['scan',f.root,'--out',path.join(f.run,'ledger.tsv')]);const L=path.join(f.run,'ledger.tsv'),C=path.join(f.run,'c.json');
  fs.writeFileSync(C,JSON.stringify({[s.totals]:{type:'feat'}}));let r=f.exec(['plan',f.root,L,'--classes',C]);assert.equal(r.status,2,r.out);assert.match(r.out,/needs a note/);
  fs.writeFileSync(C,JSON.stringify({[s.totals]:{type:'feature',note:'x'}}));r=f.exec(['plan',f.root,L,'--classes',C]);assert.equal(r.status,2);assert.match(r.out,/type must be one of/);
  fs.writeFileSync(C,JSON.stringify({abc:{type:'feat',note:'x'}}));r=f.exec(['plan',f.root,L,'--classes',C]);assert.equal(r.status,2);assert.match(r.out,/exactly one commit/);
  f.commit('feat: late');r=f.exec(['plan',f.root,L]);assert.equal(r.status,2);assert.match(r.out,/does not match the history.*run scan again/);
 });
 await test('a revert split from its target by a release is a patch, and the target needs a class',()=>{
  const f=fixture(),a1=f.commit('feat: a'),x=f.commit('experiment: functional — x'),b=f.commit('feat: b (#5)'),rx=f.revert(x);
  fs.mkdirSync(f.run,{recursive:true});const L=path.join(f.run,'ledger.tsv');f.exec(['scan',f.root,'--out',L]);
  let r=f.exec(['plan',f.root,L]);assert.equal(r.status,1);assert.match(r.out,new RegExp('classify '+x.slice(0,7)));
  fs.writeFileSync(path.join(f.run,'c.json'),JSON.stringify({[x]:{type:'refactor'}}));
  r=f.exec(['plan',f.root,L,'--classes',path.join(f.run,'c.json'),'--out',path.join(f.run,'p.json')]);assert.equal(r.status,0,r.out);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.run,'p.json'),'utf8')).releases.map(v=>[v.tag,v.sha]),[['v1.0.0',x],['v1.1.0',b],['v1.1.1',rx]]);
  assert.ok(a1);
 });
 await test('a commit after the newest planned tag that semantic-release would release blocks the plan until a release covers it',()=>{
  const f=fixture();f.commit('feat: a (#1)');const x=f.commit('experiment!: rewrite the ledger');fs.mkdirSync(f.run,{recursive:true});
  const L=path.join(f.run,'l.tsv'),C=path.join(f.run,'c.json');f.exec(['scan',f.root,'--out',L]);
  fs.writeFileSync(C,JSON.stringify({[x]:{type:'refactor'}}));let r=f.exec(['plan',f.root,L,'--classes',C]);
  assert.equal(r.status,1,r.out);assert.match(r.out,new RegExp(x.slice(0,7)+' reads as a major to semantic-release'));
  fs.writeFileSync(C,JSON.stringify({[x]:{type:'refactor',breaking:true,note:'the ledger format changed'}}));r=f.exec(['plan',f.root,L,'--classes',C,'--out',path.join(f.run,'p.json')]);
  assert.equal(r.status,0,r.out);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.run,'p.json'),'utf8')).releases.map(v=>v.tag),['v1.0.0','v2.0.0']);
  assert.match(JSON.parse(fs.readFileSync(path.join(f.run,'p.json'),'utf8')).releases[1].notes,/### ⚠ BREAKING CHANGES\n\n\* the ledger format changed/);
 });
 await test('an existing v-tag is the base, --initial sets the first version, and a conflicting tag blocks',()=>{
  let f=fixture();f.commit('feat: a');f.git('tag','v2.3.0');f.commit('fix: b');f.git('tag','2.3.1');const fixb=f.head();fs.mkdirSync(f.run,{recursive:true});let L=path.join(f.run,'l.tsv');
  let r=f.exec(['scan',f.root,'--out',L]);assert.match(r.out,/commits=1 .*base=v2\.3\.0/);
  r=f.exec(['plan',f.root,L,'--out',path.join(f.run,'p.json')]);assert.equal(r.status,0,r.out);assert.match(r.out,/base=v2\.3\.0 latest=v2\.3\.1/);assert.match(r.out,/tag 2\.3\.1 has no "v" prefix/);
  assert.match(fs.readFileSync(path.join(f.run,'p.json'),'utf8'),/compare\/v2\.3\.0\.\.\.v2\.3\.1|"sha": "/);assert.ok(fixb);
  f=fixture();f.commit('fix: a');fs.mkdirSync(f.run,{recursive:true});L=path.join(f.run,'l.tsv');f.exec(['scan',f.root,'--out',L]);
  r=f.exec(['plan',f.root,L,'--initial','0.1.0']);assert.equal(r.status,0,r.out);assert.match(r.out,/latest=v0\.1\.0/);
  r=f.exec(['plan',f.root,L,'--initial','1.0']);assert.equal(r.status,2);
  f.git('checkout','-q','-b','side');f.commit('chore: side');f.git('tag','v1.0.0');f.git('checkout','-q','main');
  r=f.exec(['plan',f.root,L]);assert.equal(r.status,1);assert.match(r.out,/tag v1\.0\.0 already exists on [0-9a-f]{7}/);
 });
 await test('notes reproduce the conventionalcommits preset layout byte for byte',()=>{
  const gh={url:'https://github.com/acme/demo'},sha=c=>c.repeat(40);
  const entries=[{sha:sha('a'),type:'feat',scope:'api',note:'add export endpoint'},{sha:sha('b'),type:'feat',scope:'',note:'drop the v1 api',breaking:true,breakingNote:'clients must call /v2'},
   {sha:sha('c'),type:'fix',scope:'',note:'rounding of overtime (#12)'},{sha:sha('d'),type:'perf',scope:'',note:'faster list'},{sha:sha('e'),type:'revert',scope:'',note:'Revert "feat: old feature to revert"',isRevert:true},{sha:sha('f'),type:'docs',scope:'',note:'readme'}];
  const got=sv.notes({version:'2.0.0',tag:'v2.0.0',date:'2026-10-17'},'1.0.0',gh,entries);
  assert.equal(got,['## [2.0.0](https://github.com/acme/demo/compare/v1.0.0...v2.0.0) (2026-10-17)','### ⚠ BREAKING CHANGES','* clients must call /v2','### Features',
   `* **api:** add export endpoint ([aaaaaaa](https://github.com/acme/demo/commit/${sha('a')}))\n* drop the v1 api ([bbbbbbb](https://github.com/acme/demo/commit/${sha('b')}))`,'### Bug Fixes',
   `* rounding of overtime ([#12](https://github.com/acme/demo/issues/12)) ([ccccccc](https://github.com/acme/demo/commit/${sha('c')}))`,'### Performance Improvements',
   `* faster list ([ddddddd](https://github.com/acme/demo/commit/${sha('d')}))`,'### Reverts',`* Revert "feat: old feature to revert" ([eeeeeee](https://github.com/acme/demo/commit/${sha('e')}))`].join('\n\n'));
  assert.equal(sv.notes({version:'1.0.0',tag:'v1.0.0',date:'2026-08-12'},null,null,[entries[2]]),'## 1.0.0 (2026-08-12)\n\n### Bug Fixes\n\n* rounding of overtime (#12) (ccccccc)');
  assert.equal(sv.changelogText([{notes:'## 1.0.0 (d)'},{notes:'## [1.1.0](x) (d)'}],'# Changelog\n\nold notes\n'),'# Changelog\n\n## [1.1.0](x) (d)\n\n## 1.0.0 (d)\n\nold notes\n');
  const sorted=sv.notes({version:'1.0.0',tag:'v1.0.0',date:'d'},null,null,[{sha:sha('1'),type:'feat',scope:'zeta',note:'b'},{sha:sha('2'),type:'feat',scope:'',note:'another'},{sha:sha('3'),type:'feat',scope:'alpha',note:'zzz'}]);
  assert.deepEqual(sorted.split('\n').filter(l=>l.startsWith('* ')).map(l=>l.replace(/ \(\w+\)$/,'')),['* **alpha:** zzz','* another','* **zeta:** b'],'the writer sorts on scope + subject');
 });
 await test('init writes the config and release workflow for every manifest, keeps existing files, and warns',()=>{
  const f=fixture();f.put('package.json','{\n  "name": "demo",\n  "version": "0.1.0"\n}\n');f.put('pyproject.toml','[project]\nname = "demo"\nversion = "0.1.0"\n');
  f.put('src/App/App.csproj','<Project><PropertyGroup><Version>0.1.0</Version></PropertyGroup></Project>');f.put('Cargo.toml','[workspace]\nmembers = ["a"]\nversion = "0.1.0"\n');
  f.put('.github/workflows/ci.yml','name: CI\non: [push]\n');f.put('.github/workflows/android-release.yml','name: android-release\non:\n  push: { tags: [\'v*\'] }\n  workflow_dispatch:\n');
  f.put('.github/workflows/deploy.yml','name: deploy\non:\n  push:\n    tags: [\'v*\']\n');f.commit('chore: init');
  let r=f.exec(['init',f.root]);assert.equal(r.status,0,r.out);
  assert.match(r.out,/SEMVER_INIT: wrote=\.releaserc\.json,\.github\/workflows\/release\.yml kept=-/);assert.match(r.out,/branch=main ci="CI" manifests=package\.json,pyproject\.toml,src\/App\/App\.csproj dispatch=android-release\.yml/);
  assert.match(r.out,/warn: deploy\.yml builds from tag pushes/);
  const rc=f.json('.releaserc.json'),byName=Object.fromEntries(rc.plugins.map(p=>Array.isArray(p)?p:[p,{}]));
  assert.deepEqual(rc.branches,['main']);assert.equal(byName['@semantic-release/commit-analyzer'].preset,'conventionalcommits');assert.equal(byName['@semantic-release/npm'].npmPublish,false);
  assert.match(byName['@semantic-release/exec'].prepareCmd,/pyproject\.toml && sed .*src\/App\/App\.csproj$/);assert.doesNotMatch(byName['@semantic-release/exec'].prepareCmd,/Cargo/,'a virtual workspace has no package version');
  assert.deepEqual(byName['@semantic-release/git'].assets,['CHANGELOG.md','package.json','package-lock.json','npm-shrinkwrap.json','pyproject.toml','src/App/App.csproj']);
  const yml=f.read('.github/workflows/release.yml');
  for(const s of ['workflows: ["CI"]','branches: ["main"]','node-version: 24','-p semantic-release@25.0.9','-p conventional-changelog-conventionalcommits@9.3.1','-p @semantic-release/exec@7.1.0','gh workflow run android-release.yml --ref "$tag"','  actions: write',
   "if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'",'ref: ${{ github.event.workflow_run.head_sha }}',`npm_config_before: "${sv.PINNED_ON}"`,'npm_config_ignore_scripts: "true"','actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803'])assert.ok(yml.includes(s),s);
  r=f.exec(['init',f.root]);assert.match(r.out,/wrote=- kept=\.releaserc\.json,\.github\/workflows\/release\.yml/);
  r=f.exec(['init',f.root,'--force','--ci','Build']);assert.match(r.out,/wrote=\.releaserc\.json,\.github\/workflows\/release\.yml/);assert.ok(f.read('.github/workflows/release.yml').includes('workflows: ["Build"]'));
  const t=fixture();t.commit('chore: init');t.git('checkout','-q','-b','feat/topic');t.exec(['init',t.root]);
  assert.deepEqual(t.json('.releaserc.json').branches,['main'],'a repository without origin/HEAD still releases from main, not the topic branch');
  const g=fixture();g.put('release.config.js','module.exports={}\n');g.commit('chore: init');r=g.exec(['init',g.root]);
  assert.match(r.out,/already configured in release\.config\.js/);assert.match(r.out,/kept=\.releaserc\.json/);assert.match(r.out,/warn: no workflow runs on push/);assert.ok(!fs.existsSync(path.join(g.root,'.releaserc.json')));
 });
 await test('apply tags first, commits the adoption on a branch, pushes tags before the branch, and check passes',()=>{
  const {f,s}=history();f.put('package.json','{\n  "name": "demo",\n  "version": "0.1.0"\n}\n');f.put('package-lock.json','{\n  "name": "demo",\n  "version": "0.1.0",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "demo",\n      "version": "0.1.0"\n    }\n  }\n}\n');
  f.put('.github/workflows/ci.yml','name: CI\non: [push]\n');f.put('.gitignore','.run/\n');f.git('add','-A');f.git('commit','-q','-m','chore: package');
  const bare=path.join(tmp,'bare-'+seq+'.git');cp.spawnSync('git',['init','-q','--bare','-b','main',bare]);
  f.git('remote','add','origin','https://github.com/acme/demo.git');f.git('config',`url.${bare.replace(/\\/g,'/')}.insteadOf`,'https://github.com/acme/demo.git');f.git('push','-q','origin','main');
  const L=path.join(f.run,'ledger.tsv'),P=path.join(f.run,'plan.json');f.exec(['scan',f.root,'--out',L]);
  let r=f.exec(['plan',f.root,L,'--classes',path.join(f.run,'classes.json'),'--out',P]);assert.equal(r.status,0,r.out);
  const p=JSON.parse(fs.readFileSync(P,'utf8'));assert.match(p.releases[1].notes,/^## \[1\.1\.0\]\(https:\/\/github\.com\/acme\/demo\/compare\/v1\.0\.0\.\.\.v1\.1\.0\)/);
  f.put('dirty.txt','x');r=f.exec(['apply',f.root,P]);assert.equal(r.status,2);assert.match(r.out,/uncommitted changes/);fs.unlinkSync(path.join(f.root,'dirty.txt'));
  const fake=fakeGh(f.run),glog=path.join(f.run,'gh.log');
  const env={FORGE_GH:fake,FAKE_GH_LOG:glog,FAKE_BARE:bare};
  r=f.exec(['apply',f.root,P,'--push','--releases'],env);assert.equal(r.status,0,r.out);assert.match(r.out,/APPLY: PUSHED tags=4 branch=semver\/adopt-\d{6} pr=https:\/\/github\.com\/acme\/demo\/pull\/9 releases=4/);
  for(const x of p.releases)assert.equal(f.git('rev-parse',x.tag+'^{commit}'),x.sha);
  assert.equal(f.git('log','-1','--format=%s'),'ci: adopt semantic-release');assert.equal(f.git('log','-1','--format=%an'),'Semver Test','the clone identity, nobody else');
  assert.deepEqual(f.json('.releaserc.json').branches,['main'],'releases from the default branch, not the adoption branch apply committed on');
  assert.equal(f.json('package.json').version,'1.2.0');assert.equal(f.json('package-lock.json').packages[''].version,'1.2.0');
  const log=f.read('CHANGELOG.md');assert.ok(log.indexOf('## [1.2.0]')<log.indexOf('## 1.0.0 ('),'newest first, first release unlinked');
  const calls=fs.readFileSync(glog,'utf8').trim().split('\n');
  assert.match(calls[0],/"api","-X","PATCH","repos\/acme\/demo","-f","squash_merge_commit_title=PR_TITLE","-f","squash_merge_commit_message=PR_BODY"/);
  assert.ok(calls.includes('tags-at-pr v1.0.0,v1.1.0,v1.1.1,v1.2.0'),'every tag is on the remote before the pull request exists');
  const created=calls.filter(c=>c.includes('"release","create"'));assert.equal(created.length,4);assert.match(created[0],/"v1\.0\.0".*"--latest=false"/);assert.match(created[3],/"v1\.2\.0".*"--latest=true"/);
  assert.match(cp.spawnSync('git',['--git-dir',bare,'branch'],{encoding:'utf8'}).stdout,/semver\/adopt-/);
  r=f.exec(['check',f.root,P,'--remote'],env);assert.equal(r.status,0,r.out);assert.match(r.out,/SEMVER: ADOPTED latest=v1\.2\.0 next=none/);
  f.commit('feat: after adoption');r=f.exec(['check',f.root]);assert.match(r.out,/next=minor → v1\.3\.0/);
  r=f.exec(['apply',f.root,P]);assert.equal(r.status,2);assert.match(r.out,/HEAD moved/);
 });
 await test('apply resumes after a failed push from its own adoption commit and reuses nothing twice',()=>{
  const {f}=history();f.put('.github/workflows/ci.yml','name: CI\non: [push]\n');f.git('add','-A');f.git('commit','-q','-m','ci: pipeline');
  const bare=path.join(tmp,'bare-'+seq+'.git');cp.spawnSync('git',['init','-q','--bare','-b','main',bare]);
  f.git('remote','add','origin','https://github.com/acme/demo.git');f.git('config',`url.${bare.replace(/\\/g,'/')}.insteadOf`,'https://github.com/acme/demo.git');f.git('push','-q','origin','main');
  const L=path.join(f.run,'ledger.tsv'),P=path.join(f.run,'plan.json');f.exec(['scan',f.root,'--out',L]);f.exec(['plan',f.root,L,'--classes',path.join(f.run,'classes.json'),'--out',P]);
  const glog=path.join(f.run,'gh.log'),env={FORGE_GH:fakeGh(f.run),FAKE_GH_LOG:glog,FAKE_BARE:bare};
  let r=f.exec(['apply',f.root,P,'--push','--releases'],{...env,FAKE_GH_FAIL_PR:'1'});assert.equal(r.status,2,r.out);assert.match(r.out,/gh pr create failed/);
  const adopt=f.head();r=f.exec(['apply',f.root,P,'--push','--releases'],env);assert.equal(r.status,0,r.out);
  assert.match(r.out,/APPLY: PUSHED \(resumed\) tags=0 branch=semver\/adopt-\d{6} pr=https:\/\/github\.com\/acme\/demo\/pull\/9 releases=4/);
  assert.equal(f.head(),adopt,'no second adoption commit');assert.equal(f.git('log','--format=%s').split('\n').filter(s=>s==='ci: adopt semantic-release').length,1);
  assert.equal(fs.readFileSync(glog,'utf8').split('\n').filter(l=>l.includes('"release","create"')).length,4,'each release created once');
 });
 await test('check names what is missing: config, the CI workflow, a stale manifest, a missing tag',()=>{
  const f=fixture();f.put('package.json','{"name":"d","version":"0.1.0"}\n');f.commit('feat: a');f.git('tag','v1.2.0');
  let r=f.exec(['check',f.root]);assert.equal(r.status,1);assert.match(r.out,/SEMVER: INCOMPLETE latest=v1\.2\.0 next=none/);
  assert.match(r.out,/missing \.releaserc\.json/);assert.match(r.out,/missing \.github\/workflows\/release\.yml/);assert.match(r.out,/package\.json says 0\.1\.0, the latest release tag is v1\.2\.0/);
  f.put('.github/workflows/build.yml','name: Build\non: [push]\n');f.exec(['init',f.root,'--ci','CI']);
  r=f.exec(['check',f.root]);assert.match(r.out,/waits for workflow "CI", and no workflow/);
  fs.mkdirSync(f.run,{recursive:true});fs.writeFileSync(path.join(f.run,'p.json'),JSON.stringify({releases:[{tag:'v9.0.0',version:'9.0.0',sha:f.head()}]}));
  r=f.exec(['check',f.root,path.join(f.run,'p.json')]);assert.match(r.out,/tag v9\.0\.0 is missing/);assert.match(r.out,/CHANGELOG\.md has no section for 9\.0\.0/);
 });
 await test('apply with nothing to backfill on an adopted repository leaves no branch; the CLI refuses bad calls',()=>{
  const f=fixture();f.put('.github/workflows/ci.yml','name: CI\non: [push]\n');f.commit('chore: init');f.exec(['init',f.root]);f.git('add','-A');f.git('commit','-q','-m','ci: release');
  fs.mkdirSync(f.run,{recursive:true});f.put('.gitignore','.run/\n');f.git('add','-A');f.git('commit','-q','-m','chore: ignore');
  const L=path.join(f.run,'l.tsv'),P=path.join(f.run,'p.json');f.exec(['scan',f.root,'--out',L]);let r=f.exec(['plan',f.root,L,'--out',P]);assert.match(r.out,/PLAN: READY releases=0/);
  r=f.exec(['apply',f.root,P]);assert.equal(r.status,0,r.out);assert.match(r.out,/APPLY: NOTHING/);assert.equal(f.git('branch','--show-current'),'main');assert.doesNotMatch(f.git('branch'),/semver\//);
  assert.equal(f.exec(['scan',f.root]).status,64);assert.equal(f.exec(['bogus']).status,64);assert.equal(f.exec(['plan',f.root,path.join(f.run,'nope.tsv')]).status,2);
 });
 await test('plan follows semantic-release on squash-titled reverts, merges with Conventional headers and FEAT/FIX',()=>{
  const f=fixture();f.commit('feat: base (#1)');const x=f.commit('chore: x');const rv=f.commit('Revert "chore: x" (#5)',`This reverts commit ${x}.`);
  f.git('checkout','-q','-b','y');f.commit('test: y harness');f.git('checkout','-q','main');f.git('merge','-q','--no-ff','y','-m','feat: y screen');const m=f.head();const fx=f.commit('FIX: caps fix');
  fs.mkdirSync(f.run,{recursive:true});const L=path.join(f.run,'l.tsv'),P=path.join(f.run,'p.json');let r=f.exec(['scan',f.root,'--out',L]);assert.match(r.out,/todo=0/,r.out);
  r=f.exec(['plan',f.root,L,'--out',P]);assert.equal(r.status,0,r.out);
  assert.deepEqual(JSON.parse(fs.readFileSync(P,'utf8')).releases.map(v=>[v.tag,v.sha]),[['v1.0.0',f.git('rev-list','--max-parents=0','HEAD')],['v1.0.1',rv],['v1.1.0',m],['v1.1.1',fx]]);
 });
 await test('a v-tag left only in the local clone is pushed with the plan, and check --remote names one missing on origin',()=>{
  const f=fixture();f.put('.github/workflows/ci.yml','name: CI\non: [push]\n');f.commit('feat: a');
  const bare=path.join(tmp,'bare-'+seq+'.git');cp.spawnSync('git',['init','-q','--bare','-b','main',bare]);
  f.git('remote','add','origin','https://github.com/acme/demo.git');f.git('config',`url.${bare.replace(/\\/g,'/')}.insteadOf`,'https://github.com/acme/demo.git');f.git('push','-q','origin','main');
  f.git('tag','v1.0.0');f.commit('fix: b');f.git('push','-q','origin','main');fs.mkdirSync(f.run,{recursive:true});
  const glog=path.join(f.run,'gh.log'),env={FORGE_GH:fakeGh(f.run),FAKE_GH_LOG:glog,FAKE_BARE:bare},L=path.join(f.run,'l.tsv'),P=path.join(f.run,'p.json');
  let r=f.exec(['check',f.root,'--remote'],env);assert.match(r.out,/origin has no tag v1\.0\.0/);
  f.exec(['scan',f.root,'--out',L]);r=f.exec(['plan',f.root,L,'--out',P]);assert.match(r.out,/base=v1\.0\.0 latest=v1\.0\.1/);
  r=f.exec(['apply',f.root,P,'--push'],env);assert.equal(r.status,0,r.out);
  assert.deepEqual(cp.spawnSync('git',['--git-dir',bare,'tag'],{encoding:'utf8'}).stdout.trim().split(/\s+/),['v1.0.0','v1.0.1'],'the local-only base tag reached the remote');
  r=f.exec(['check',f.root,P,'--remote'],env);assert.doesNotMatch(r.out,/origin has no tag/,r.out);
 });
 await test('Cargo.lock and uv.lock follow the version, and only the owning TOML table changes',()=>{
  const f=fixture();f.put('Cargo.toml','[package]\nname = "watchman"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1" }\n');
  f.put('Cargo.lock','version = 4\n\n[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "watchman"\nversion = "0.1.0"\n');
  f.put('pyproject.toml','[tool.thing]\nversion = "9.9"\n\n[project]\nname = "School_Insight"\nversion = "0.1.0"\n');
  f.put('uv.lock','version = 1\n\n[[package]]\nname = "school-insight"\nversion = "0.1.0"\nsource = { editable = "." }\n');
  f.put('.github/workflows/ci.yml','name: CI\non: [push]\n');f.commit('feat: a');
  let r=f.exec(['init',f.root]);assert.match(r.out,/manifests=pyproject\.toml,Cargo\.toml/,r.out);
  const ex=f.json('.releaserc.json').plugins.find(p=>p[0]==='@semantic-release/exec')[1].prepareCmd,assets=f.json('.releaserc.json').plugins.find(p=>p[0]==='@semantic-release/git')[1].assets;
  for(const s of ['/^\\[project\\][[:blank:]]*$/,/^\\[/','/^name = "school-insight"$/{n;','uv.lock','/^\\[package\\][[:blank:]]*$/,/^\\[/','/^name = "watchman"$/{n;','Cargo.lock'])assert.ok(ex.includes(s),s);
  assert.deepEqual(assets,['CHANGELOG.md','pyproject.toml','uv.lock','Cargo.toml','Cargo.lock']);
  if(/GNU/.test(cp.spawnSync('sed',['--version'],{encoding:'utf8'}).stdout||'')){ // the release job's GNU sed, where this machine has it
   const tmpd=fs.mkdtempSync(path.join(tmp,'sed-'));for(const n of ['Cargo.toml','Cargo.lock','pyproject.toml','uv.lock'])fs.copyFileSync(path.join(f.root,n),path.join(tmpd,n));
   const s=cp.spawnSync(bashPath,['-c',ex.replace(/\$\{nextRelease\.version\}/g,'2.3.4')],{cwd:tmpd,encoding:'utf8'});assert.equal(s.status,0,s.stderr);
   assert.match(fs.readFileSync(path.join(tmpd,'Cargo.lock'),'utf8'),/name = "serde"\nversion = "1\.0\.0"[\s\S]*name = "watchman"\nversion = "2\.3\.4"/);
   assert.match(fs.readFileSync(path.join(tmpd,'pyproject.toml'),'utf8'),/\[tool\.thing\]\nversion = "9\.9"[\s\S]*\[project\]\nname = "School_Insight"\nversion = "2\.3\.4"/);
   assert.match(fs.readFileSync(path.join(tmpd,'uv.lock'),'utf8'),/name = "school-insight"\nversion = "2\.3\.4"/);
  } else console.error('NOTE: no GNU sed here; the release-job sed lines were checked as text only');
  fs.rmSync(path.join(f.root,'.releaserc.json'));fs.rmSync(path.join(f.root,'.github/workflows/release.yml'));
  fs.mkdirSync(f.run,{recursive:true});const L=path.join(f.run,'l.tsv'),P=path.join(f.run,'p.json');f.exec(['scan',f.root,'--out',L]);f.exec(['plan',f.root,L,'--out',P]);
  r=f.exec(['apply',f.root,P]);assert.equal(r.status,0,r.out);
  assert.match(f.read('Cargo.lock'),/name = "serde"\nversion = "1\.0\.0"[\s\S]*name = "watchman"\nversion = "1\.0\.0"/);assert.match(f.read('Cargo.toml'),/version = "1\.0\.0"[\s\S]*serde = \{ version = "1" \}/);
  assert.match(f.read('pyproject.toml'),/\[tool\.thing\]\nversion = "9\.9"[\s\S]*version = "1\.0\.0"/);assert.match(f.read('uv.lock'),/name = "school-insight"\nversion = "1\.0\.0"/);
  assert.deepEqual(f.git('show','--name-only','--format=','HEAD').split('\n').sort(),['.github/workflows/release.yml','.releaserc.json','CHANGELOG.md','Cargo.lock','Cargo.toml','pyproject.toml','uv.lock']);
 });
 await test('a CI workflow that never runs on push is no release trigger; names read as YAML; tags: inside steps is no trigger',()=>{
  const f=fixture();f.put('.github/workflows/ci.yml','name: CI # tests\non: [pull_request]\n');f.put('.github/workflows/build.yml','name: "Build"\non:\n  push:\n    branches: [main]\n');
  f.put('.github/workflows/docker.yml','name: docker\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\njobs:\n  x:\n    steps:\n      - uses: docker/metadata-action@v5\n        with:\n          tags: type=sha\n');
  f.put('.github/workflows/notify.yml',"name: 'notify ''n'''\non:\n  release:\n    types: [published]\n");f.commit('chore: init');
  let r=f.exec(['init',f.root]);assert.match(r.out,/ci="Build" manifests=- dispatch=-/,r.out);assert.match(r.out,/warn: notify\.yml runs on release events/);assert.doesNotMatch(r.out,/docker\.yml builds from tag/);
  r=f.exec(['check',f.root]);assert.equal(r.status,0,r.out);
  f.exec(['init',f.root,'--force','--ci','CI']);r=f.exec(['check',f.root]);assert.match(r.out,/waits for "CI" \(ci\.yml\), which never runs on push/);
  fs.writeFileSync(path.join(f.root,'.releaserc.json'),JSON.stringify({branches:'main',plugins:[]}));r=f.exec(['check',f.root]);assert.equal(r.status,1);assert.match(r.out,/is missing @semantic-release\/git/);assert.doesNotMatch(r.out,/does not release from the default branch/);
 });
 await test('apply continues on its branch when an earlier run stopped before committing; a non-top directory is refused',()=>{
  const f=fixture();f.commit('feat: a');fs.mkdirSync(f.run,{recursive:true});const L=path.join(f.run,'l.tsv'),P=path.join(f.run,'p.json');f.exec(['scan',f.root,'--out',L]);f.exec(['plan',f.root,L,'--out',P]);
  f.git('branch','semver/adopt-'+new Date().toISOString().slice(2,10).replace(/-/g,''));
  let r=f.exec(['apply',f.root,P]);assert.equal(r.status,0,r.out);assert.equal(f.git('log','-1','--format=%s'),'ci: adopt semantic-release');
  fs.mkdirSync(path.join(f.root,'sub'));r=f.exec(['check',path.join(f.root,'sub')]);assert.equal(r.status,2);assert.match(r.out,/not the top of a repository/);
 });
 await test('apply refuses to write through a committed symlink',()=>{
  const f=fixture();f.git('config','core.symlinks','true');f.put('outside/victim.txt','ORIGINAL\n');
  try{fs.symlinkSync('outside/victim.txt',path.join(f.root,'CHANGELOG.md'));}catch(e){console.error('NOTE: symlinks unavailable here ('+e.code+'); symlink refusal not exercised');return;}
  f.commit('feat: a');fs.mkdirSync(f.run,{recursive:true});const L=path.join(f.run,'l.tsv'),P=path.join(f.run,'p.json');f.exec(['scan',f.root,'--out',L]);f.exec(['plan',f.root,L,'--out',P]);
  const r=f.exec(['apply',f.root,P]);assert.equal(r.status,2,r.out);assert.match(r.out,/CHANGELOG\.md is a symbolic link; refusing to write through it/);
  assert.equal(f.read('outside/victim.txt'),'ORIGINAL\n');assert.equal(f.git('branch','--show-current'),'main','refused before anything changed');
 });
 await test('validate-handoff re-checks every ADOPTED row, wants the weakest verdict, and refuses a path outside the run',()=>{
  const run=path.join(tmp,'run-'+(++seq)),f=fixture(path.join(run,'demo','repo'));
  f.put('.github/workflows/ci.yml','name: CI\non: [push]\n');f.commit('feat: a');f.git('tag','v1.0.0');f.exec(['init',f.root]);f.git('add','-A');f.git('commit','-q','-m','ci: adopt semantic-release');
  const tsv=rows=>fs.writeFileSync(path.join(run,'semver.tsv'),['repo\tdir\tverdict\tbase\tlatest\treleases\tpr',...rows].join('\n')+'\n');
  const handoff=v=>fs.writeFileSync(path.join(run,'handoff.json'),JSON.stringify({version:'3.3.0',source:'semver',status:'COMPLETE',timestamp:'2026-10-18T09:00:00+08:00',verdict:v,results_tsv:'semver.tsv'}));
  const validate=()=>{const x=cp.spawnSync(bashPath,[path.join(repo,'scripts/validate-handoff.sh'),path.join(run,'handoff.json'),'semver'],{encoding:'utf8',windowsHide:true});return x.stdout.trim().split('\n').pop()+'/'+x.status+' '+x.stderr;};
  tsv(['acme/demo\tdemo\tADOPTED\tnone\tv1.0.0\t1\t-']);handoff('ADOPTED');assert.match(validate(),/^VALID\/0/);
  tsv(['acme/demo\tdemo\tADOPTED\tnone\tv1.0.0\t1\t-','acme/other\tother\tPLANNED\tnone\tv2.0.0\t3\t-']);assert.match(validate(),/^INVALID\/1[\s\S]*weakest row/);
  handoff('PLANNED');assert.match(validate(),/^VALID\/0/);
  fs.unlinkSync(path.join(f.root,'.releaserc.json'));tsv(['acme/demo\tdemo\tADOPTED\tnone\tv1.0.0\t1\t-']);handoff('ADOPTED');assert.match(validate(),/^INVALID[\s\S]*not ADOPTED for acme\/demo/);
  tsv(['acme/demo\t..\tADOPTED\tnone\tv1.0.0\t1\t-']);assert.match(validate(),/plain directory name/);
  handoff('DONE');assert.match(validate(),/verdict not in enum for semver/);
 });
 console.error(`semver: ${passed} passed, ${failed} failed`);
 console.log(`${passed}/${passed+failed}`);
 fs.rmSync(tmp,{recursive:true,force:true});
 process.exitCode=failed?1:0;
})();
