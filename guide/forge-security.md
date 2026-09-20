# /forge:security — The Security Auditor

Security audit using STRIDE threat modeling, OWASP ASVS 5.0.0 requirements, OWASP Top 10:2025 risk
categories and 4 red-team personas. Default: 15 iterations. Findings require concrete evidence
(file:line + attack scenario); untested risks stay open questions, not confirmed vulnerabilities.

Loads `references/security-checklist.md` for STRIDE/OWASP coverage tracking. Pin the scoped check
list before execution and report PASS, FAIL or BLOCKED separately from audit completion.
PASS requires every planned check to pass and zero unresolved findings at/above `--fail-on`
(default high). A clean audit can pass with zero findings; accepting a risk does not resolve it.

Write the typed `security` record from `references/handoff-schema.md` and save redacted check
outputs/retest proof under the run directory. Before claiming readiness or chaining beyond
remediation, run `scripts/validate-handoff.sh <run>/handoff.json security --require-pass`.
FAIL/BLOCKED can chain only to authorized fixes; re-audit afterward. Historical reports remain
readable but cannot substitute for current evidence.

---

## From the client interview to release

Security starts in `forge:requirements`. Forge explains its assumptions in ordinary words and
lets the owner correct them before turning them into a build plan. Each concern follows the same
path: **what could go wrong → protection → check → proof**.

For example, for an app that stores customer documents:

| What Forge asks the owner to confirm | Protection | How Forge checks it | Proof shown to the owner |
|---|---|---|---|
| “I think each customer should see only their own documents.” | The server checks who owns every document. | Sign in as another customer and try to read, change or download it directly. | The attempt was denied, no document was revealed and no change was saved. |
| “I think an administrator needs an extra sign-in check, even when recovering an account.” | Require a second factor and protect account recovery. | Try admin access without it; try an old reset link and a revoked session. | Each attempt was rejected. |
| “I think we must be able to recover yesterday's work if storage fails.” | Keep private backups and agree how much work/time can be lost. | Restore test documents in a separate environment and measure recovery. | Recovered records, elapsed time and any lost changes against the agreed limits. |
| “I think someone needs to know when suspicious access happens.” | Send a redacted alert to the named responder. | Trigger a harmless test event and check the approved test inbox. | The event arrived without passwords or private document contents. |

These are proposed assumptions, not promises made before testing. The owner also reviews who
handles private data, third parties, hosting locations, retention/deletion, legal obligations,
security updates and incident response. Questions requiring legal judgment remain explicit.

`forge:build` and `forge:feature` reuse the approved scenarios and the
[application security baseline](../claude-plugin/skills/forge/references/security-checklist.md).
Every area needs an applicability decision with a reason; missing information is not a reason
to omit a protection. Forge reuses the app's framework and hosting controls, adds negative tests
through the real app paths, and records results for the candidate commit/environment.

Before either command reports complete/converged, its typed `security` record must pass every
planned check and have no unresolved Critical/High findings (or the stricter chosen bar).
A high build score, a scan with no findings, or a completed audit alone cannot satisfy this gate.
Release also checks the deployment's permissions, secrets, backups and alerts, and reads the
actual evidence for the candidate being released. Retest after relevant changes. Missing access
or tools means **blocked**, never “secure.”

The standards are pinned to [ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/)
and [Top 10:2025](https://owasp.org/Top10/2025/) (checked 2026-09-16). ASVS supplies testable
requirements; Top 10 groups risks. Forge reports the selected requirements and evidence, not
OWASP certification, legal compliance, or a guarantee that no vulnerability exists.

---

## How It Works — 3 Phases

```
SETUP (once):
  1. Codebase Recon      Tech stack, deps, configs, routes
  2. Asset Identification  Data stores, auth, APIs, inputs
  3. Trust Boundary Map  Browser↔Server, Public↔Auth, User↔Admin
  4. STRIDE Threat Model  6 threat categories × every asset
  5. Attack Surface Map  Entry points, data flows, abuse paths
  6. Baseline            Pin applicable checks; run supported scans + negative tests

LOOP (15 iterations by default):
  1. Select untested attack vector from threat model
  2. Deep-dive into target code
  3. Validate with code evidence (file:line + scenario)
  4. Classify: severity + OWASP category + STRIDE tag
  5. Log to security-audit-results.tsv
  6. Print STRIDE/OWASP coverage every 5 iterations

REPORT:
  Severity-ranked findings + STRIDE/OWASP coverage matrices
  Prioritized remediation roadmap
```

---

## STRIDE Threat Model

| Threat | Question | Example Findings |
|--------|----------|-----------------|
| **S**poofing | Can an attacker impersonate a user? | Weak auth, missing CSRF, forged JWTs |
| **T**ampering | Can data be modified? | Missing validation, SQL injection, mass assignment |
| **R**epudiation | Can actions be denied? | Missing audit logs, unsigned transactions |
| **I**nfo Disclosure | Can sensitive data leak? | PII in logs, verbose errors, debug endpoints |
| **D**enial of Service | Can the service be disrupted? | Missing rate limits, ReDoS, unbounded uploads |
| **E**levation of Privilege | Can a user gain higher access? | IDOR, broken access control, path traversal |

---

## 4 Red-Team Personas

| Persona | Mindset |
|---------|---------|
| **Security Adversary** | External hacker — auth bypass, injection, session hijacking |
| **Supply Chain Attacker** | Compromising dependencies or CI/CD — CVEs, typosquatting |
| **Insider Threat** | Malicious employee — privilege escalation, data exfiltration |
| **Infrastructure Attacker** | Attacking deployment — container escape, hardcoded secrets |

---

## All Flags

| Flag | Purpose |
|------|---------|
| `Iterations: N` | Override default of 15 |
| `--diff` | Only audit files changed since last audit (fast PR checks) |
| `--fix` | Auto-fix confirmed Critical/High findings after audit |
| `--fail-on <severity>` | Audit threshold: `critical`, `high` (default), `medium`, `low`, `info`; build/feature readiness requires high or stricter |
| `--strix` | Add required Strix dynamic verification to this audit once selected |
| `--strix-target <target>` | Repeatable authorized target; default is a disposable snapshot of the scoped project |
| `--strix-budget <USD>` | Positive authorized spend cap; separate from Forge's iteration budget |
| `--evals` | Analyze security-audit-results.tsv after completion |
| `--chain <targets>` | Chain to next command(s) after completion |

Flags combine: `--diff --fix --fail-on high`

---

## Strix dynamic verification

[Strix](https://github.com/usestrix/strix) adds autonomous penetration testing and reproducible
vulnerability evidence to the existing audit. Enable it for an application with:

```text
/forge:security --strix --strix-budget 5
Scope: src/**, tests/**, package.json, package-lock.json
Depth: standard
Iterations: 15
```

In Codex, use `$forge security` with the same arguments. The CLI requires a working Docker runtime
and a configured model/provider; [upstream setup](https://github.com/usestrix/strix#quick-start)
covers installation. Forge's doctor reports whether `strix` is available; the audit checks the
runtime and existing target/provider/budget authorization before launching it. Installation is
optional unless the spec or audit selects this check. Missing prerequisites then block readiness.

Local scans use a disposable copy of the candidate because Strix mounts local targets writable.
Forge keeps application source unchanged and records snapshot integrity. Add `--strix-target`
only for explicitly authorized targets; URLs discovered in code or API specifications need the
same scope review. Use synthetic accounts/data and a restricted instruction file for credentials.
Telemetry is disabled for the invocation; the authorized model provider still processes context.

Strix runs headless with explicit full scope, even alongside Forge's `--diff`. `Depth:` sets its
scan mode; `Iterations:` bounds only Forge's loop. The positive USD budget limits estimated model
spend, can overshoot in-flight calls, and is never automatically extended. A timeout, budget stop,
missing report or uncovered follow-up remains blocked rather than becoming a clean audit.

Forge saves redacted native `run.json` and `findings.sarif` under `evidence/strix/`, imports findings
into the existing ledger and checks native completion/coverage during handoff validation. Exit 2
means findings, whose severities use the audit's `--fail-on` threshold; exit 0 alone cannot pass.
Fixes require a fresh retest, and build/feature carry this check and its reports into completion.
Strix supplements the security baseline and app-specific tests; it is not a security guarantee.

Execution and supported report format:
[Strix protocol](../claude-plugin/skills/forge/references/security-checklist.md#strix-dynamic-verification---strix).

---

## Code Evidence Format

Every finding must include concrete evidence. This is an illustrative defect; replace the
location, reproduction and results with observed evidence from the application being audited:

```markdown
### [CRITICAL] Unverified token claims used as identity
- **OWASP:** A07:2025 — Authentication Failures
- **STRIDE:** Spoofing
- **Location:** src/middleware/auth.ts:18
- **Confidence:** Confirmed
- **Attack Scenario:**
  1. Attacker changes the token's user ID to an administrator's ID
  2. The auth middleware decodes the payload without verifying the signature
  3. A protected admin request succeeds with the forged identity
- **Code Evidence:**
  req.user = jwt.decode(token);
  next(); // decoding is not verification
- **Mitigation:**
  Use the identity provider's verified-token middleware with the intended
  signature algorithm/key, issuer, audience and expiry checks. Reject invalid
  tokens; rerun the forged-token request and verify access is denied.
```

---

## Examples

### Full audit (bounded)

```
/forge:security
Iterations: 15
```

### Focused on auth

```
/forge:security
Scope: src/api/**/*.ts, src/middleware/**/*.ts
Focus: authentication and authorization flows
Iterations: 15
```

### Delta mode — PR check

```
/forge:security --diff
Iterations: 5
```

### Auto-fix Critical/High

```
/forge:security --fix
Iterations: 15
```

### CI/CD gate — fail on High or Critical

```
/forge:security --fail-on high
Iterations: 10
```

### Combined: delta + fix + gate

```
/forge:security --diff --fix --fail-on high
Iterations: 15
```

### Python/Flask

```
/forge:security
Scope: app/**/*.py, tests/**/*.py
Focus: Flask routes, SQLAlchemy models, auth decorators
Iterations: 15
```

### Infrastructure/DevOps

```
/forge:security
Scope: Dockerfile, docker-compose.yml, .github/workflows/**/*.yml, k8s/**/*.yaml
Focus: container configuration, secrets management, CI/CD pipeline
Iterations: 12
```

---

## CI/CD Integration

Run the audit in a job without deployment credentials or write permissions. Pin checkout/tool
versions to reviewed immutable identities. Audit untrusted pull-request code without privileged
secrets; do not grant a privileged workflow access merely to make a check run.

The runner records the exact audit directory in `AUDIT_RUN`; gate that run rather than selecting
the newest unrelated report or trusting an agent process exit code:

```bash
scripts/validate-handoff.sh "$AUDIT_RUN/handoff.json" security --require-pass
```

The gate rejects missing/empty/outside-run evidence, failed or skipped checks and unresolved
findings at the selected threshold. A completed failing audit is a valid report with a failing
readiness gate. Archive the redacted run directory; never upload credentials.


---

## Output Structure

```
forge/security-{YYMMDD}-{HHMM}/
├── overview.md                 Executive summary + links
├── threat-model.md             STRIDE analysis per asset + trust boundaries
├── attack-surface-map.md       Entry points, data flows, abuse paths
├── findings.md                 All findings ranked by severity with code evidence
├── owasp-coverage.md           OWASP Top 10 coverage matrix
├── dependency-audit.md         npm/pip/go audit results + CVE details
├── recommendations.md          Prioritized fix roadmap with code examples
├── handoff.json                Typed security verdict, checks and finding dispositions
├── evidence/                   Redacted check outputs and successful retests
└── security-audit-results.tsv  Machine-readable iteration log
```

---

## OWASP Coverage

Use the versioned [Top 10:2025 risk map and application security baseline](../claude-plugin/skills/forge/references/security-checklist.md).
Report executed/planned checks separately from category coverage and readiness. The ASVS
requirement selection and app-specific misuse scenarios determine what must be tested; marking
ten categories covered does not mean every relevant protection works.

---

## Chain Patterns

### security → fix → re-audit → ship

```
/forge:security --fix --fail-on high
Iterations: 15

/forge:security --fail-on high
Iterations: 10

/forge:ship --auto
```

`--fix` passes the actual security findings to remediation. Re-audit the pinned release scope
after fixes; a narrow `--diff` report alone cannot cover unchanged release requirements.

### predict → security

```
/forge:predict --adversarial --chain security
Scope: src/auth/**, src/api/**, src/middleware/**
Goal: Pre-deployment security review
```

---

## When to Run

| Scenario | Recommendation |
|----------|---------------|
| Before a major release | `Iterations: 15` |
| PR review (changed files) | `--diff --iterations 5` |
| Overnight comprehensive sweep | `Iterations: unlimited` |
| CI/CD gate | `--fail-on high --iterations 10` |
| After auth/API changes | `--diff --fix` |
| Compliance preparation | `Iterations: 20` |
