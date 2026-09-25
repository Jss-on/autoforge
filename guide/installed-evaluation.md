# Installed evaluation and release evidence

Run Node 24 and Git Bash on Windows, or Bash on Linux. Use the native Claude and Codex CLIs.
The current runner uses Claude 2.1.282 and Codex 0.156.1; CLI changes require a
new evaluation. Codex applies a named OS permission profile to its tools; that same native sandbox
wraps the Claude CLI. The runner first proves that task writes and disposable Git commits work,
and that writes to the independent oracle and installed bundle are denied. If isolation is
unavailable it blocks, never silently switches to full access. No Docker service is required.

```bash
AR_SMOKE_MODEL_REQUIRED=1 FORGE_EVAL_AGENT=codex FORGE_EVAL_MODEL=gpt-6-astra \
  FORGE_EVAL_OUTPUT=/path/to/private-evidence bash scripts/smoke-model.sh
# Repeat with FORGE_EVAL_AGENT=claude and your explicit supported model identifier.
```

`FORGE_CODEX_CLI` and `FORGE_CLAUDE_CLI` may name exact native executables. Evaluations use only
subscription logins: Claude Code's claude.ai account and Codex's Sign in with ChatGPT. The runner
checks the official CLI's authentication status before model execution and pins that login method
in the disposable profile. API, Console, missing and unrecognized login states block execution.
Model API keys, provider credentials and alternate endpoints are not inherited from the parent
environment. Only the selected agent's local login is copied into a temporary profile on the same
host, then removed. Do not export logins to cloud runners or commit evidence directories.
The task has one Forge iteration, ten minutes by default (maximum twenty), 8 MiB retained output,
and Claude's 40-turn/$5 ceiling. `FORGE_EVAL_TIMEOUT_MS` changes the time bound. Codex tokens/cost and
resolved model identity are unknown unless exposed by the CLI; the runner does not invent them.
A CLI-reported dollar estimate is not a subscription invoice; subscription usage limits still apply.

Each candidate is installed in a disposable session. Claude loads its plugin with `--plugin-dir`;
Codex uses an isolated home and local marketplace installation. A feature task must preserve old
behavior and satisfy an external oracle. Three historical readiness challenges must reject blocked,
stale and failed required assertions. A positive receipt control runs before the challenges. The
host retains tool traces showing the loaded router, command, verification and negative paths.

Reports bind the normalized text package identity (stable across Git CRLF checkouts), exact installed
bytes, CLI/platform/model, external oracle and runner hashes, transcript digest, cases and time.
The executable scripts themselves, protected oracle and installed bytes remain independently bound.
Review traces and limit access/retention: redaction covers tested credential patterns, not arbitrary
application secrets. CI retains summaries and redacted traces for seven days. Disposable task/state
paths in local reports can be removed after reviewing the exact reported directories and retaining
necessary evidence; never recursively remove a computed parent directory.

GitHub-hosted Actions run the Linux suites and Windows smoke on every PR. Native model evaluations
run on the operator's signed-in computer before release, using the subscription commands above.
No self-hosted runner, model API key, or uploaded subscription credential is required. The current
verified model routes are Windows Claude Code and Codex; other platforms remain unverified until
exercised. GitHub CI does not claim to have executed these local model tasks.

Release policy is an operator-approved JSON outside candidate control. Set FORGE_RELEASE_POLICY
and its exact-byte FORGE_RELEASE_POLICY_SHA256. Set FORGE_EVAL_REPORT to the fresh local report:
{ "version": 1, "evaluations": [ /* both actual evaluation records */ ] }.

For this hosted-CI/local-model setup, policy authentication must be "subscription" and
local_report_sha256 must be the SHA256 of the exact report bytes. Policy evaluations pins agent,
platform, CLI version, requested/resolved model, oracle hash and runner hash for both Claude and
Codex. max_age_ms is at most seven days, defaulting to one day. A missing, edited, failed, skipped,
stale or different-bundle report blocks release. The report hash records the operator's accepted
local evidence; it does not turn local execution into independently executed GitHub model evidence.

Policy ci pins the repository, candidate head, run ID/attempt, workflow, protected source revision,
and protected file digests. Required hosted jobs are Harness test suites and Harness Windows smoke.
Protect .github/workflows/ci.yml, scripts/{installed-eval,release-evidence,ci-evidence}.cjs and
evals/devops/installed-oracle.cjs. Run the release consumer in ci mode from the signed-in machine;
it independently checks GitHub, validates the local subscription report, then rechecks GitHub.
The returned evaluation_source is local. Owner acceptance may establish the protected tooling
reference; a separate peer reviewer is not required for this pilot.

Existing policies without local_report_sha256 retain the stricter CI-artifact route: they require
Installed Forge evaluations and a downloaded, digest-checked installed-evaluations-RUN-ATTEMPT
artifact. A missing or skipped required job still blocks those policies. No report or skipped job
is silently substituted across the two evidence sources.

The private pilot uses a manual deployment gate compatible with GitHub Pro. Set policy approval to
{ "mode": "workflow_dispatch", "actor": "Jss-on" }, keep the environment restricted to protected
branches, and pin deployment_branch and ci.protected_ref. The owner dispatches forge-pilot.yml from
the protected default branch with request_sha256 equal to the exact approved request digest. The
executor checks the actual GitHub run, original and rerun actors, attempt, repository, workflow,
branch and tooling commit before accessing the deployment target. Its receipt records the approval.
Policies without this explicit mode continue to require native environment reviewers.

The current pilot's extra peer-review requirement is waived by the owner. Status checks, exact
artifact/configuration checks, scoped provider access, serialized delivery, observation and recovery
remain required. A production-designated promotion still requires authorization for its concrete
request. The live pilot and long-window SLO remain separate evidence.

Native CLI references: [Claude subscription login](https://code.claude.com/docs/en/authentication),
[Codex subscription login](https://learn.chatgpt.com/docs/auth),
[Codex noninteractive execution](https://learn.chatgpt.com/docs/non-interactive-mode),
[Codex permissions](https://learn.chatgpt.com/docs/permissions). Use installed `claude --help` and
`codex exec --help` to confirm the exact runner version before updating the fixture.
