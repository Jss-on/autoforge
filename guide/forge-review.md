# /forge:review — Is This Merge Request Safe to Merge?

The reviewer of the pipeline. `backlog` writes merge requests for a repository that is not yours;
`review` reads them — a colleague's, a client's, your own — and answers one question with evidence:
**is this change safe to merge?** It writes its comments the way that repository's reviewers write
them, proves its verdict by running the change, and hands you a Google Doc with the proof in images.

It never approves, never submits a request-changes review and never merges. Nothing is posted on the
merge request until you say so.

## Before the first run

| Need | How |
|---|---|
| The repository cloned, and the host CLI logged in | GitLab: `glab auth login --hostname <host>`. GitHub: `gh auth login` |
| A Google account that can write to the evidence folder | Once: `gcloud auth login <account> --enable-gdrive-access` (for company work, your company account) |
| A working Pandoc (the Google Doc is imported from a DOCX) | `bash scripts/doctor.sh` runs it; a package-manager shim whose target was removed shows as `MISSING` |
| Chrome or Edge (evidence images, PDF) | Usually already installed; `FORGE_CHROME` may name one |
| The project's tests and app runnable locally, if possible | Their README. What cannot run here is reported as missing evidence, never passed |

## Invocation

```
/forge:review 231                                    # one merge request, by number or URL
/forge:review https://gitlab.acme.com/platform/api/-/merge_requests/231
/forge:review --mine                                 # the merge requests waiting for your review
/forge:review 231 --no-post                          # everything, but post nothing
/forge:review --resume forge/review-261006-0930-231  # again, after the author pushed fixes
/forge:review 231 Coverage: 90                       # a stricter changed-line coverage bar
```

| Argument | Meaning |
|---|---|
| `MR:` / first argument | A number, or a URL of this repository (or the project it was forked from) |
| `--mine` | List the open merge requests waiting for your review and pick |
| `Folder:` / `Account:` | Google Drive folder for the evidence and the account that writes there; remembered per repository |
| `Coverage:` | Changed-line coverage threshold (default: the repository's own, else 80) |
| `--no-post` | Post nothing, even if you say yes later in the run |
| `--resume <run>` | Re-review after new commits: earlier findings marked addressed or still open |

## The review

1. **Ground.** Which host, whose repository (`host.cjs detect`), where the merge request stands. The
   first time in a repository it asks for the evidence folder and checks it (`gdoc.cjs check`): for
   a company's code that is a folder in **their** Google Workspace, and never one anyone with the
   link can open. Base and head are checked out in their own worktrees outside both the run and the
   repository (`review.cjs workspace`) — your checkout and your uncommitted work are never touched,
   and the change's code cannot reach the evidence by a relative path.
2. **How this repository reviews.** The review comments on its last 20 merged merge requests
   (`host.cjs reviews`), its templates, CODEOWNERS and approval rules become `review-conventions.md`:
   their labels (`nit:`, `issue (blocking):`, emoji, plain prose), which of them block, one summary or
   many comments, tone and language. No precedent → Conventional Comments.
3. **Read the change** — its description, linked issue and acceptance criteria, every commit, the diff,
   and what others already said (never repeated).
4. **Screen before running.** The change's code runs with your file access when its tests run.
   `review.cjs prescreen` lists changes to CI, dependencies, install scripts, package-manager or
   submodule configuration, build or test configuration, git hooks, symbolic links, executables,
   binaries, and test or script lines that reach the environment, processes, files or network. Those —
   or an author outside the project, or a fork — are shown to you first, and nothing runs until you
   say OK. Every command goes through `review.cjs capture`: no shell wrappers, an allow-listed
   environment (no tokens, passwords or keys by any name), output redacted, and the run directory
   fingerprinted around it — a change that rewrites the evidence is marked `TAMPERED` and stops the
   review. There is no sandbox; for an author nobody knows, use a container.
5. **Seven gates**, each with receipts:

   | Gate | Passes when |
   |---|---|
   | `pipeline` | their pipeline is green for the reviewed head (a pass on an older push does not count) |
   | `regression` | no test went green→red against the merge base (the `regression` protocol, full suite) |
   | `tests-detect` | the change's own tests fail on the base code and pass on the head — they really catch what it fixes |
   | `coverage` | the changed lines the tests actually execute reach the threshold |
   | `app` | the same screens or requests, before and after, show the intended change and nothing else broken |
   | `security` | no secret, no risky new dependency, nothing from the security checklist |
   | `mergeable` | open, mergeability computed, no conflict, no rebase needed |

6. **Review the code** — intent against the acceptance criteria, correctness and edge cases,
   compatibility, migrations, performance, security, tests that test behaviour (a weakened test blocks),
   their architecture. Each finding is one concrete problem on one line, written exactly as it would be
   posted, in their format.
7. **Challenge.** A second agent of the same assistant (the code never goes to another provider) gets
   the diff, the evidence and the findings — not the verdict — and removes what it disproves.
8. **Verdict** from `review.cjs verdict`, which checks every pass against its evidence: the saved diff
   against git, the newest host reading for this head, the regression receipt and its unchanged
   results, the new tests failing on the base and passing on the head, coverage recomputed from the
   diff and the report the coverage run produced (`capture` copies it in as a product, so a stale
   report cannot stand in), before/after screenshots that differ, every receipt untouched. What it
   cannot do is tell a receipt `capture` wrote from one forged with your own file access — receipts
   come only from `capture`, and the document shows the raw outputs so you can judge them.
9. **The evidence document** — rendered and uploaded (below).
10. **You decide.** You see the verdict, the findings as they would be posted and the document link.
    Edit, drop or reword anything; your wording wins. On your yes it re-checks the head (new commits →
    re-review, never a stale post), runs every body through `review.cjs scrub` (no GitLab quick
    action such as `/approve` or `/merge`, no merge-bot command, nobody @-mentioned without your word,
    no AI credit) and posts from files: on GitLab one diff discussion per blocking finding on a
    changed line and a summary note with the rest; on GitHub one review of type `COMMENT` pinned to
    the reviewed commit.

## Verdicts

| Verdict | Means |
|---|---|
| `SAFE_TO_MERGE` | every gate that applies passed (or a missing one was waived by you) and nothing blocking is open. Approval under their rules and the merge are still people's steps |
| `NEEDS_CHANGES` | a gate failed or a blocking finding is open |
| `CANNOT_VERIFY` | evidence is missing — the review says exactly what would produce it |

A gate may be "not applicable" only with a reason: no CI in the repository, no behaviour change, no
executable code changed, nothing a user or API client sees. `regression`, `security` and `mergeable`
always apply. Only you can waive a missing gate, in your own words; a failing gate is never waived.

## The evidence document

`review-report.cjs` renders, through your installed Chrome or Edge:

- the pipeline's jobs for the head, green and red;
- each check's output (tests, regression, security scan) with its exit code and receipt hash;
- each finding drawn on its code, the line highlighted with the finding's label;
- changed-line coverage drawn over the diff — green ran under the tests, red never ran;
- the app before and after, side by side.

They go into one self-contained HTML report, a PDF and a DOCX; `gdoc.cjs upload` checks the approved
folder again, creates the Google Doc from the DOCX there (named from the review), exports it back and
counts its images: `GDOC_CREATED` when every image arrived, `GDOC_UNVERIFIED` when the doc exists but
the count could not be made — open it, never upload again. The doc inherits the folder's access —
forge never changes sharing, never makes a public link and never puts the evidence anywhere else.
Code shown for a finding comes from the head checkout only; a link in the change cannot pull another
file into the document. When something is missing (no sign-in, Pandoc broken, Drive refuses), you
still get the HTML, PDF and DOCX, with the one command that fixes the gap.

## What stays human

- Logging in to the host and to Google, and choosing the evidence folder.
- Letting the change's code run when the screen found something risky.
- Waiving a gate that could not be checked here.
- Every word that gets posted, and whether anything is posted at all.
- Approval and the merge.
- A repository rule about disclosing AI use — forge shows it to you and writes only what you say.

Contract: `commands/forge/review.md`. Seams: `scripts/review.cjs`, `scripts/review-report.cjs`,
`scripts/gdoc.cjs`, `scripts/host.cjs`.
