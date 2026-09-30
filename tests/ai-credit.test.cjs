'use strict';

// Table test for the AI-authorship screen (.claude/hooks/forge/lib/ai-credit.cjs): what is
// refused, what is left alone, what is knowingly out of reach, and that hostile text costs
// milliseconds. Run by tests/test-hooks.sh; standalone: node tests/ai-credit.test.cjs

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-credit-')).replace(/\\/g, '/');
process.env.TMPDIR = process.env.TEMP = process.env.TMP = T; // Git Bash's /tmp resolves here
process.env.HOME = process.env.USERPROFILE = T;              // and so does ~
const { aiCredit } = require('../.claude/hooks/forge/lib/ai-credit.cjs');

const WIN = process.platform === 'win32';
const AI = 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>';
const NOREPLY = 'Co-Authored-By: Claude <noreply@anthropic.com>';
const FOOT = '🤖 Generated with [Claude Code](https://claude.com/claude-code)';
const commit = trailer => `git commit -m "fix: x\n\n${trailer}"`;
const by = name => commit(`Co-Authored-By: ${name}`);
const heredoc = (head, body) => `${head} "$(cat <<'EOF'\n${body}\nEOF\n)"`;
const pr = body => heredoc('gh pr create --title "fix: x" --body', `## Summary\n- x\n\n${body}`);
const file = (name, text) => {
  const p = `${T}/${name}`;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return p;
};

const msg = file('msg-ai.txt', `fix: x\n\n${NOREPLY}\n`);
const body = file('body-ai.md', `## What\nx\n\n${FOOT}\n`);
const crlf = file('msg-crlf.txt', `fix: x\r\n\r\n${NOREPLY}\r\n`);
const human = file('msg-human.txt', 'fix: x\n\nCo-authored-by: Claude Dupont <claude.dupont@example.fr>\n');
const clean = file('msg-ok.txt', 'fix: x\n\nCloses #12\n');
const huge = file('msg-huge.txt', 'x\n'.repeat(600000) + NOREPLY + '\n');
const payload = file('payload.json', JSON.stringify({ title: 't', body: `x\n\n${FOOT}` }));
const crlfName = file('msg-crlf-name.txt', 'fix: x\r\n\r\nCo-Authored-By: Claude Fable 5.1\r\n');
const crlfBare = file('msg-crlf-bare.txt', 'fix: x\r\n\r\nCo-Authored-By: Claude\r\n');
const eofName = file('msg-eof-name.txt', 'fix: x\n\nCo-Authored-By: Claude Fable 5.1');
const eofBare = file('msg-eof-bare.txt', 'fix: x\n\nCo-Authored-By: Claude');
const bodyFirst = file('body-first.md', 'Generated with Claude Code\n\n## What\nx\n');
const bodyEof = file('body-eof.md', '## What\nx\n\nGenerated with Claude Code');
const bodyCrlf = file('body-crlf.md', '## What\r\nx\r\n\r\nGenerated with Claude Code\r\n');
file('sub/msg-ai.txt', `fix: x\n\n${NOREPLY}\n`);
const drive = WIN ? `/${T[0].toLowerCase()}${T.slice(2)}` : T; // Git Bash spelling of T

// [label, command, session directory?]
const refused = [
  // how an agent writes a commit
  ['trailer in a quoted message', commit(AI)],
  ['heredoc commit with footer and trailer', heredoc('git commit -m', `fix: x\n\n${FOOT}\n\n${NOREPLY}`)],
  ['indented heredoc', `git commit -m "$(cat <<'EOF'\n   fix: x\n\n   ${FOOT}\n\n   ${AI}\n   EOF\n   )"`],
  ['CRLF line ends', `git commit -m "$(cat <<'EOF'\r\nfix: x\r\n\r\n${NOREPLY}\r\nEOF\r\n)"`],
  ['add, then commit', `git add src/a.ts && ${commit(NOREPLY)}`],
  ['trailer as its own -m paragraph', `git commit -m "fix: x" -m "${AI}"`],
  ['single-quoted paragraphs', `git commit -m 'fix: x' -m '${NOREPLY}'`],
  ['amend', `git commit --amend -m "fix: x" -m "${NOREPLY}"`],
  ['commit -am', `git commit -am "fix: x\n\n${NOREPLY}"`],
  ['merge message', `git merge --no-ff topic -m "Merge topic\n\n${NOREPLY}"`],
  ['annotated tag', `git tag -a v1.2.0 -m "v1.2.0\n\n${FOOT}"`],
  ['git notes', `git notes add -m "${NOREPLY}"`],
  ['push option carrying the description', `git push -u origin topic -o merge_request.create -o merge_request.description="What\n\n${FOOT}"`],
  ['ANSI-C quoting', `git commit -m $'fix: x\\n\\n${NOREPLY}'`],
  ['printf piped to commit -F -', `printf 'fix: x\\n\\n${NOREPLY}\\n' | git commit -F -`],
  ['heredoc on stdin', `git commit -F - <<'EOF'\nfix: x\n\n${NOREPLY}\nEOF`],
  ['message in a variable, same command', `MSG="fix: x\n\n${NOREPLY}"\ngit commit -m "$MSG"`],
  ['subshell', `(cd sub && git commit -m "fix: x" -m "${NOREPLY}")`],
  ['for loop', `for f in a b; do git add $f && git commit -m "add $f\n\n${NOREPLY}"; done`],
  ['line continuations', `git commit \\\n  -m "fix: x" \\\n  -m "${NOREPLY}"`],
  ['continuation between git and commit', `git \\\n  commit -m "fix: x" -m "${NOREPLY}"`],
  ['git.exe', `git.exe commit -m "fix: x" -m "${NOREPLY}"`],
  ['options before the subcommand', 'git -C sub commit -m x --trailer "Co-authored-by=Claude Code <claude@example.com>"'],
  ['--trailer key=value with the Anthropic address', 'git commit -m x --trailer "Signed-off-by=Assistant <noreply@anthropic.com>"'],
  ['git -C with a quoted path', `git -C "my repo" commit -m "fix: x" -m "${NOREPLY}"`],
  ['bash -c wrapper', `bash -c "git commit -m 'fix: x' -m '${NOREPLY}'"`],
  ['powershell wrapper', `powershell.exe -NoProfile -Command "git commit -m 'fix: x' -m '${NOREPLY}'"`],
  ['PowerShell here-string pasted into bash', `git commit -m @'\nfix: x\n\n${NOREPLY}\n'@`],

  // an apostrophe earlier in the command must not hide the commit
  ['comment with an apostrophe, heredoc commit', `# Commit the fix - don't push yet\ngit add src/a.ts && ${heredoc('git commit -m', `fix: x\n\n${NOREPLY}`)}`],
  ['comment with an apostrophe, single-quoted -m', `# don't push yet\ngit commit -m 'fix: x\n\n${NOREPLY}'`],
  ['possessive in a comment', `# update the user's profile tests\n${heredoc('git commit -m', `test: profile\n\n${NOREPLY}`)}`],
  ['apostrophe in an unquoted echo', `echo Committing, don't interrupt && git commit -m 'fix: x' -m '${NOREPLY}'`],
  ['file heredoc with a lone double quote', `cat > a.txt <<EOF\n5" nails\nEOF\ngit add a.txt && git commit -m "fix: x" -m "${NOREPLY}"`],
  ['message file written by heredoc, then committed', `cat > msg.txt <<'EOF'\nfix: don't crash\n\n${NOREPLY}\nEOF\ngit commit -F msg.txt && echo 'done'`],
  ['comment with an apostrophe, pull request', `# Open the PR - don't request reviewers\n${pr(FOOT)}`],

  // who is named
  ['Claude, the address Claude Code signs with', by('Claude <noreply@anthropic.com>')],
  ['Claude Fable 5.1, any address', by('Claude Fable 5.1 <x@example.com>')],
  ['Opus 4.5', by('Opus 4.5 <x@example.com>')],
  ['Fable 5.1', by('Fable 5.1 <fable@example.com>')],
  ['Claude Code', by('Claude Code <claude-code@example.com>')],
  ['Claude Opus 4.5 (1M context)', by('Claude Opus 4.5 (1M context) <bot@example.com>')],
  ['Claude Opus 4.5 [1M]', by('Claude Opus 4.5 [1M] <x@example.com>')],
  ['a model id', by('claude-fable-5-1 <bot@example.com>')],
  ['a dated model id', by('claude-haiku-4-5-20251001 <bot@example.com>')],
  ['claude[bot]', by('claude[bot] <209825114+claude[bot]@users.noreply.github.com>')],
  ['Claude Sonnet 4.5, github noreply', by('Claude Sonnet 4.5 <claude@users.noreply.github.com>')],
  ['Claude Mythos 5.1', by('Claude Mythos 5.1 <x@example.com>')],
  ['Claude (Anthropic)', by('Claude (Anthropic) <claude@example.com>')],
  ['Claude AI, Anthropic address', by('Claude AI <claude@anthropic.com>')],
  ['Anthropic Claude, Anthropic address', by('Anthropic Claude <claude@anthropic.com>')],
  ['Claude, Anthropic', by('Claude, Anthropic <claude@anthropic.com>')],
  ['Claude Assistant, no-reply address', by('Claude Assistant <no-reply@anthropic.com>')],
  ['via Claude Code', by('Claude Fable 5.1 via Claude Code <claude@anthropic.com>')],
  ['any -by trailer with the Anthropic address', commit('Signed-off-by: Assistant <noreply@anthropic.com>')],
  ['Co-Author: key', commit('Co-Author: Claude <noreply@anthropic.com>')],
  ['Co-Author: key, model name', commit('Co-Author: Claude Code <x@example.com>')],
  ['Authored-by: key, no address', commit('Authored-by: Claude Code')],
  ['model name followed by another trailer', 'git commit -m "fix: x\n\nCo-authored-by: Claude Code\nRefs: #4"'],
  ['model name, literal backslash-n after it', `printf 'fix: x\\n\\nCo-Authored-By: Claude Fable 5.1\\n' | git commit -F -`],
  ['bare model word, literal backslash-n after it', `printf 'fix: x\\n\\nCo-Authored-By: Claude\\n' | git commit -F -`],
  ['model name ending a CRLF file', `git commit -F ${crlfName}`],
  ['bare model word ending a CRLF file', `git commit -F ${crlfBare}`],
  ['model name ending a file without a newline', `git commit -F ${eofName}`],
  ['bare model word ending a file without a newline', `git commit -F ${eofBare}`],
  ['no spaces, lower case', commit('co-authored-by:claude<noreply@anthropic.com>')],
  ['indented trailer', commit('   Co-Authored-By: Claude <x@anthropic.com>')],
  ['bare model word at a line start, no address', commit('Co-Authored-By: Claude')],
  ['bare model word followed by another trailer', 'git commit -m "fix: x\n\nCo-authored-by: Opus\nRefs: #4"'],
  ['model name without an address, own paragraph', 'git commit -m "fix: x" -m "Co-Authored-By: Claude Fable 5.1"'],

  // the footer and the links
  ['footer in a pull request body', pr(FOOT)],
  ['footer in a blockquote', pr(`> ${FOOT}`)],
  ['*Generated by Claude*', pr('---\n*Generated by Claude*')],
  ['HTML comment footer', pr('<!-- Generated with Claude Code -->')],
  ['italic footer', pr(`_${FOOT}_`)],
  ['bold product name', pr('Generated with **Claude Code**')],
  ['indented footer', pr('        🤖 Generated with Claude Code')],
  ['footer inside <sub>', pr(`<sub>${FOOT}</sub>`)],
  ['sentence carrying the footer link', pr('🤖 This PR was generated with [Claude Code](https://claude.com/claude-code)')],
  ['Generated using', pr('🤖 Generated using Claude Code')],
  ['Created with', pr('🤖 Created with Claude Code')],
  ['Written by', pr('Written by Claude Code')],
  ['a model instead of the product', pr('🤖 Generated with Fable 5.1')],
  ['product and model', pr('Generated with Claude Fable 5.1')],
  ['italic, no link', pr('_Generated with Claude Code_')],
  ['footer on the first line of a body file', `gh pr create --title t --body-file ${bodyFirst}`],
  ['footer ending a body file without a newline', `gh pr create --title t --body-file ${bodyEof}`],
  ['footer in a CRLF body file', `gh pr create --title t --body-file ${bodyCrlf}`],
  ['footer before a literal backslash-n', `gh api repos/o/r/issues/1/comments -f body='Done.\\n\\nGenerated with Claude Code\\n'`],
  ['Co-authored with', pr('Co-authored with Claude Code')],
  ['trailing period', pr('Generated with Claude Code.')],
  ['the older footer link', pr('🤖 Generated with [Claude Code](https://claude.ai/code)')],
  ['footer link on the same line as the comment', `gh pr comment 5 --body "Fixed in abc1234. ${FOOT}"`],
  ['footer as its own -m paragraph', `git commit -m "fix: x" -m "${FOOT}"`],
  ['merge request description', `glab mr create --title t --description "What\n\n${FOOT}" --yes`],
  ['plain footer closing the description', 'glab mr create --title t --description "thing\n\nGenerated with Claude Code" --yes'],
  ['pull request edit', `gh pr edit 3 --body "x\n\n${FOOT}"`],
  ['squash-merge body', `gh pr merge 5 --squash --body "fix: x\n\n${NOREPLY}"`],
  ['review body', `gh pr review 5 --approve --body "LGTM\n\n${FOOT}"`],
  ['closing note', `gh issue close 4 -c "Fixed.\n\n${FOOT}"`],
  ['issue note', `glab issue note 4 -m "Fixed.\n\n${FOOT}"`],
  ['merge request update', `glab mr update 3 --description "x\n\n${FOOT}"`],
  ['gh api field, real newlines', `gh api repos/o/r/pulls -f title=t -f head=b -f base=main -f body="Summary\n\n${FOOT}"`],
  ['gh api field, literal backslash-n', `gh api repos/o/r/issues/1/comments -f body='Done.\\n\\n${FOOT}'`],
  ['release notes', `gh release create v1.2.0 --notes "## Changes\n- x\n\n${FOOT}"`],
  ['session link in an issue', 'gh issue create --title t --body "Repro steps\n\nhttps://claude.ai/code/session_01AbCdEfGh"'],
  ['session link in a merge request note', 'glab mr note create 4 -m "done https://claude.ai/code/session_01AbC" --resolvable=false'],
  ['session link in a commit', 'git commit -m "fix\n\nhttps://claude.ai/code/session_01AbCdEf"'],
  ['trailer in a merge request note', `glab mr note create 4 -m "done\n\n${NOREPLY}" --resolvable=false`],
  ['gh with a repo flag first', 'gh -R o/r pr create --title t --body "x\n\nGenerated with Claude Code"'],
  ['gh.exe', `gh.exe pr create --title t --body "x\n\n${FOOT}"`],
  ['quoted path to gh.exe', `"/c/Program Files/GitHub CLI/gh.exe" pr create --title t --body "x\n\n${FOOT}"`],

  // message files
  ['message file', `git commit -F ${msg}`],
  ['--file=', `git commit --file=${msg}`],
  ['double-quoted path', `git commit -F "${msg}"`],
  ['single-quoted path', `git commit -F '${msg}'`],
  ['path attached to -F', `git commit -F${msg}`],
  ['relative to the session directory', 'git commit -F msg-ai.txt', T],
  ['relative to a cd target', `cd ${T}/sub && git commit -F msg-ai.txt`],
  ['relative to a git -C target', `git -C ${T}/sub commit -F msg-ai.txt`],
  ['--body-file', `gh pr create --title t --body-file ${body}`],
  ['gh -F', `gh pr create --title t -F ${body}`],
  ['--body-file="quoted"', `gh pr edit 7 --body-file="${body}"`],
  ['--description-file', `glab mr create --title t --description-file ${body} --yes`],
  ['--notes-file', `gh release create v1 --notes-file ${body}`],
  ['issue comment body file', `gh issue comment 4 --body-file ${body}`],
  ['body read with $(cat file)', `gh pr create --title t --body "$(cat ${body})"`],
  ['cat file | commit -F -', `cat ${msg} | git commit -F -`],
  ['commit -F - < file', `git commit -F - < ${msg}`],
  ['message read with $(<file)', `git commit -m "$(<${msg})"`],
  ['CRLF message file', `git commit -F ${crlf}`],
  ['~/ path', 'git commit -F ~/msg-ai.txt'],
  ['gh -F ~/ path', 'gh release create v1 -F ~/body-ai.md'],
  ...(WIN ? [
    ['Git Bash drive path', `git commit -F ${drive}/msg-ai.txt`],
    ['Git Bash /tmp path', 'git commit -F /tmp/msg-ai.txt'],
    ['Git Bash /tmp path on a merge request', 'glab mr create --title t --description-file /tmp/body-ai.md --yes'],
    ['backslash path', `git commit -F "${T.replace(/\//g, '\\')}\\msg-ai.txt"`],
  ] : []),

  // a model as the author itself
  ['--author with the Anthropic address', 'git commit --author="Claude <noreply@anthropic.com>" -m "fix: x"'],
  ['--author, space form', 'git commit --author "Claude Code <noreply@anthropic.com>" -m "fix: x"'],
  ['--author with a model name', 'git commit --author="Claude Fable 5.1 <x@example.com>" -m "fix: x"'],
  ['git -c identity', 'git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -m "fix: x"'],
  ['git config user.name', 'git config user.name "Claude"'],
  ['git config user.name, product', 'git config user.name "Claude Code"'],
  ['git config user.name, unquoted', 'git config user.name Claude'],
  ['git config user.name, model id', 'git config user.name claude-fable-5-1'],
  ['git config user.name, model id, then more', 'git config user.name claude-fable-5-1 && git config user.email me@example.com'],
  ['git config user.email', 'git config --global user.email "claude@anthropic.com"'],
  ['author environment', 'GIT_AUTHOR_NAME="Claude" GIT_AUTHOR_EMAIL="noreply@anthropic.com" git commit -m "fix: x"'],
  ['author name environment, unquoted', 'GIT_AUTHOR_NAME=Claude git commit -m "fix: x"'],
  ['author name environment, model name', 'GIT_AUTHOR_NAME="Claude Fable 5.1" git commit -m "fix: x"'],
  ['committer name environment, unquoted', 'GIT_COMMITTER_NAME=Claude git commit -m "fix: x"'],
  ['committer address environment', 'GIT_COMMITTER_EMAIL=noreply@anthropic.com git commit -m "fix: x"'],

  // refused although harmless — the price of reading text, pinned so a change is deliberate
  ['an example block showing the full trailer', `gh issue create --title "Strip attribution in CI" --body "Commits from the bot end with:\n\n    ${NOREPLY}\n\nStrip it."`],
  ['a fixture written and committed in one command', `printf 'fix: x\\n\\n${NOREPLY}\\n' > tests/fixtures/ai-trailer.txt && git add tests/fixtures/ai-trailer.txt && git commit -m "test: fixture"`],
];

const allowed = [
  // people
  ['Claude Dupont', by('Claude Dupont <claude.dupont@example.fr>')],
  ['Jean-Claude Van Damme', by('Jean-Claude Van Damme <jc@example.com>')],
  ['Claude-Michel Schoenberg', by('Claude-Michel Schoenberg <cm@example.fr>')],
  ['Claude M. Steele', by('Claude M. Steele <cms@example.edu>')],
  ['Claudette Colbert', by('Claudette Colbert <cc@example.fr>')],
  ['first name only, own address', by('Claude <claude.dupont@example.fr>')],
  ['a handle that is a model word', by('opus <12345+opus@users.noreply.github.com>')],
  ['Fable, a person', by('Fable <fable@studio.example>')],
  ['Haiku, a person', by('Haiku <haiku@example.jp>')],
  ['Claude (ACME)', by('Claude (ACME) <claude@acme.example>')],
  ['Claude 3rd', by('Claude 3rd <c3@example.com>')],
  ['Ana Reyes', by('Ana Reyes <ana@acme.com>')],
  ['Claude Dupont, no address', by('Claude Dupont')],
  ['Signed-off-by: Claude', commit('Signed-off-by: Claude <claude@redhat.example>')],
  ['Reviewed-by: Claude (ACME)', commit('Reviewed-by: Claude (ACME) <claude@acme.example>')],
  ['Reported-by: Claude', commit('Reported-by: Claude')],
  ['Suggested-by: Sonnet Nguyen', commit('Suggested-by: Sonnet Nguyen <sn@example.com>')],
  ['human co-author in a message file', `git commit -F ${human}`],
  ['--author, a person named Claude', 'git commit --author="Claude <claude.dupont@example.fr>" -m "fix: x"'],
  ['user.name Claude Dupont', 'git config user.name "Claude Dupont"'],
  ['user.name Claudette', 'git config user.name Claudette'],
  ['user.name Claude 3rd', 'git config user.name "Claude 3rd"'],
  ['user.email of a person', 'git config user.email "claude.dupont@example.fr"'],
  ['reading user.name', 'git config user.name'],

  // model words that mean something else
  ['Fable the compiler', commit('Compiled-by: Fable 4.24.0')],
  ['Opus the codec', pr('## Metadata\nEncoded-by: opus\nBitrate: 96k')],
  ['workflow input graded-by=opus', 'gh workflow run evals.yml -f "graded-by=opus" -f suite=smoke'],
  ['a flag that ends in -by', 'gh api graphql -f query=x \\\n  --sort-by=opus'],
  ['model switch', 'git commit -m "chore: default model claude-sonnet-4-5 -> claude-opus-4-5\n\nReviewed-by: Dana Li <dana@example.com>"'],
  ['model setting in a commit body', 'git commit -m "feat: switch summarizer\n\nmodel: claude-fable-5-1"'],
  ['Claude the product in a pull request', 'gh pr create --title t --body "Adds a Claude API client\n\nCloses #4"'],
  ['UI string in a subject', `git commit -m 'feat(ui): show "Generated by Claude" badge on assistant replies'`],
  ['UI string opening a body line', heredoc('git commit -m', 'feat: label exports\n\n"Generated with Claude" now appears in the PDF footer.')],
  ['subject starting Generated by Claude API', 'git commit -m "Generated by Claude API: refresh eval snapshots"'],
  ['label list', pr('## Labels\n- Generated with Claude: shown on assistant output\n- Edited by human: shown after an edit')],
  ['product bullet', 'gh pr create --title t --body "- Summaries are generated by Claude Haiku"'],
  ['the product page linked in prose', 'gh pr create --title t --body "Requires Claude Code, see https://claude.com/claude-code for setup"'],

  // talking about the rule
  ['subject about the rule', 'git commit -m "docs: never name Claude, Fable or Opus as co-author; drop the Generated with Claude Code footer"'],
  ['footer quoted mid-sentence', 'git commit -m "docs: never name Claude as co-author; drop the \\"Generated with Claude Code\\" footer"'],
  ['trailer quoted in a subject', `git commit -m 'fix(hooks): refuse "Co-Authored-By: Claude" trailers'`],
  ['trailer named unquoted in a subject', 'git commit -m "feat: refuse Co-Authored-By: Claude trailers"'],
  ['commit body describing the screen', heredoc('git commit -m', 'feat(hooks): refuse AI attribution\n\nThe hook now refuses a co-author trailer naming a model, a "Generated with Claude Code"\nfooter and a session link, in the command text and in a message file.')],
  ['backticked trailer mid-sentence', heredoc('git commit -m', 'feat(hooks): refuse AI attribution\n\nThe hook now refuses `Co-Authored-By: Claude <noreply@anthropic.com>` and the footer.')],
  ['session-link pattern in prose', pr('- document that a `claude.ai/code/session…` link is refused')],
  ['subject about session links', 'git commit -m "docs: explain that claude.ai/code/session links are stripped from PR bodies"'],
  ['issue quoting the block message', 'gh issue create --title "hook message is unclear" --body "The hook prints: BLOCKED: A model is named as author - a co-author trailer, a \\"Generated with Claude Code\\" footer, a session link."'],

  // reading and searching
  ['status', 'git status --short'],
  ['plain commit', 'git commit -m "fix: thing"'],
  ['history search for the trailer', 'git log --grep="Co-Authored-By: Claude <noreply@anthropic.com>" --oneline'],
  ['counting trailers in a range', 'git log origin/main..HEAD --format=%B | grep -ci "co-authored-by: claude"'],
  ['grep for the trailer', 'grep -rn "Co-Authored-By: Claude <noreply@anthropic.com>" docs'],
  ['history search by author', 'git log --author="Claude Fable 5.1" --oneline'],
  ['gh search for the trailer', 'gh search commits "Co-Authored-By: Claude <noreply@anthropic.com>" --repo o/r --limit 5'],
  ['gh pr view | grep footer', 'gh pr view 42 --json body --jq .body | grep -i "generated with claude"'],
  ['gh pr list | grep trailer', 'gh pr list --state merged --limit 20 --json number,body | grep -ci "co-authored-by: claude"'],
  ['glab mr list | grep footer', `glab mr list --merged -P 20 | grep -i 'Generated with Claude Code'`],
  ['merge request view', 'glab mr view 4 --comments'],
  ['gh pr diff | grep trailer', 'gh pr diff 42 | grep -n "Co-Authored-By: Claude"'],
  ['gh run view | grep footer', 'gh run view 123 --log | grep "Generated with Claude Code"'],
  ['gh pr view | grep session link', 'gh pr view 42 --json body --jq .body | grep -c "claude.ai/code/session"'],
  ['git cat-file | grep trailer', 'git cat-file commit HEAD | grep "Co-authored-by: Claude"'],
  ['tag list, then a history search', 'git tag -l | tail -3; git log --grep="Co-Authored-By: Claude" --oneline'],
  ['gh search by reviewer', 'gh pr list --search "reviewed-by:opus"'],

  // taking it out
  ['amend, trailer filtered out', `git commit --amend -m "$(git log -1 --format=%B | grep -v 'Co-Authored-By: Claude')"`],
  ['amend from a filtered pipe', 'git log -1 --format=%B | grep -v "Co-Authored-By: Claude" | git commit --amend -F -'],
  ['amend through sed', `git commit --amend -m "$(git log -1 --format=%B | sed '/^Co-Authored-By: Claude/d')"`],
  ['amend, address filtered out', `git commit --amend -m "$(git log -1 --format=%B | grep -v 'noreply@anthropic.com')"`],
  ['pull request body with the footer filtered out', `gh pr edit 12 --body "$(gh pr view 12 --json body -q .body | grep -v 'Generated with Claude Code')"`],
  ['filter-branch', `git filter-branch -f --msg-filter 'grep -v "Co-Authored-By: Claude"' origin/main..HEAD`],

  // a disclosure in the user's words is not authorship
  ['Assisted-by', commit('Assisted-by: Claude Fable 5.1')],
  ['Generated-by', commit('Generated-by: Claude Code')],
  ['Assisted-by, kernel form', commit('Assisted-by: Claude:claude-fable-5-1')],
  ['AI-assisted-by', commit('AI-assisted-by: Claude Code')],
  ['Assisted-by with a vendor note', commit('Assisted-by: Claude Code (Anthropic)')],
  ['template checkbox, ticked', 'glab mr create --title t --description "## AI disclosure\n- [x] I used an AI assistant (Claude Code) for parts of this change\n\n## What\nx" --yes'],
  ['template checkbox worded like the footer', 'glab mr create --title t --description "## AI use\n- [ ] Generated with Claude Code or another AI assistant\n- [x] Written by hand\n\n## What\nx" --yes'],
  ['user-worded disclosure sentence', pr('## AI use\nGenerated with Claude Code; reviewed and tested by me.')],
  ['AI use line', pr('AI use: Claude Code (Fable 5.1), all lines reviewed by the author.')],
  ['a denial', 'gh pr create --title t --body "## AI use\nGenerated by Claude? No.\n\n## What\nx"'],
  ['thread reply in prose', 'glab mr note create 4 --reply abc123 -m "Yes, written with Claude Code and reviewed by me." --resolvable=false'],

  // message files that say nothing, or are not message files
  ['clean message file', `git commit -F ${clean}`],
  ['message file not written yet', `git commit -F ${T}/not-written-yet.txt`],
  ['stdin with nothing inline', 'git commit -F -'],
  ['a directory', `git commit -F ${T}`],
  ['a file too large to be a message', `git commit -F ${huge}`],

  // out of reach of a lexical screen — the contract rule (SKILL.md) is what binds here
  ['file named through a variable', 'git commit -F "$HOME/msg-ai.txt"'],
  ['gh api field read from a file', `gh api repos/o/r/issues/1/comments -F body=@${body}`],
  ['gh api --input payload', `gh api repos/o/r/pulls --input ${payload}`],
  ['commit template', `git commit --template ${msg} --no-edit`],
  ['footer mid-sentence without its link', 'gh pr create --title "fix: x" --body "Fixes the crash. Generated with Claude Code."'],
  ['another vendor\'s model', by('Codex <codex@openai.com>')],
  ['model named only inside a note', by('AI Assistant (Claude Fable 5.1) <ai@example.com>')],
  ['a key that is not author or -by', commit('AI-Assistant: Claude Fable 5.1')],
  ['unquoted --trailer without an address', 'git commit -m "fix: x" --trailer Co-Authored-By:Claude'],
];

// Hostile text: every shape here was quadratic, or overflowed the regex stack, in an earlier draft.
const N = 300000;
const hostile = [
  ['a run of quotes', '"'.repeat(N)],
  ['key, colon, spaces', `\nCo-authored-by:${' '.repeat(N)}x`],
  ['key, model, spaces', `\nCo-authored-by: Claude${' '.repeat(N)}x`],
  ['one line of -by= attributes', ' data-sort-by="x"'.repeat(60000)],
  ['trailer followed by three million tokens', `\nCo-authored-by: Claude${' 1'.repeat(3000000)}!`],
  ['newlines', '\n'.repeat(N)],
  ['spaces after a newline', `\n${' '.repeat(N)}x`],
  ['many git words', 'git '.repeat(N / 4)],
  ['many gh words', 'gh '.repeat(N / 3)],
  ['many file flags', ' -F x'.repeat(2000)],
];

let pass = 0, total = 0;
const check = (ok, label) => {
  total++;
  if (ok) pass++;
  else console.log(`  FAIL: ${label}`);
};
for (const [label, command, cwd] of refused) check(aiCredit(command, cwd) === true, `refused: ${label}`);
for (const [label, command, cwd] of allowed) check(aiCredit(command, cwd) === false, `allowed: ${label}`);
for (const [label, text] of hostile) {
  const started = process.hrtime.bigint();
  let threw = false;
  try { aiCredit(`git commit -m x ${text}`); } catch { threw = true; }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  check(!threw && ms < 2000, `hostile: ${label} (${ms.toFixed(0)} ms${threw ? ', threw' : ''})`);
}

fs.rmSync(T, { recursive: true, force: true });
console.log(`${pass}/${total} AI-credit cases passed`);
process.exitCode = pass === total ? 0 : 1;
