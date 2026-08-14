# QA Testing Protocol — the `test` command's standards contract

Companion to `/autoresearch:test`. Grounded in primary sources (verified 2026-08): **ISO/IEC/IEEE
29119** (-1:2022 concepts, -2:2021 processes, -3:2021 documentation, -4:2021 techniques,
-5:2024 keyword-driven), **ISTQB CTFL v4.0.1** (2024), **ISO/IEC 25010:2023** product-quality model,
**WCAG 2.2** (2023), **OWASP Top 10:2021/2025 + ASVS 5.0**. The engagement claims **tailored
conformance** to 29119 (tailoring documented in the test plan) — the honest claim for an automated
engagement; full conformance requires organizational-level artifacts (test policy, organizational
test practices) that belong to the client, not to one engagement.

## 1. Process mapping (ISTQB v4.0 seven activities ↔ command phases)

| ISTQB activity | 29119-2:2021 process | Command phase | Output (29119-3:2021 information item) |
|---|---|---|---|
| Test planning | 7.2 Test strategy & planning | Phase 2 | **Test plan** (context, assumptions, stakeholders, risk register, strategy, entry/exit criteria, schedule) |
| Test monitoring & control | 7.3 | every iteration + `--evals` checkpoints | Test status data (`iterations.tsv`, checkpoint prints) |
| Test analysis | 8.2 TD1 (create test model) | Phase 1 + 3 | Requirements inventory, ambiguity list, prioritized conditions ("what to test") |
| Test design | 8.2 TD2–TD3 (coverage items → cases) | Phase 3 | **Test case specifications** (`test-cases.md`: ID, technique, precondition, inputs, expected, priority, requirement link) |
| Test implementation | 8.2 TD4 + 8.3 env & data mgmt | Phase 4 | Automated suites/procedures, test data + environment readiness (entry-criteria check) |
| Test execution | 8.4 | Phase 5 | **Test execution log** (`test-results.tsv` + `evidence/` + `score-log.tsv`) |
| Incident reporting | 8.5 | Phase 5 step 4 | **Test incident reports** (`defects.tsv` + `defect-reports.md` — 29119-3 §8.11 calls defects "incidents") |
| Test completion | 7.4 | Phase 6 | **Test completion report** (`test-summary.md`: deviations, exit-criteria evaluation, residual risks, lessons) |

Seven ISTQB principles the loop enforces: testing shows presence not absence of defects; exhaustive
testing is impossible (risk decides depth); early/static testing first (Phase 1); defects cluster
(risk register + defect-density steering); **tests wear out** (regression selection, not retest-all);
context-dependence (product-type scoping); absence-of-defects fallacy (a green suite on the wrong
requirements is still failure — hence the confirmed oracle gate).

**Test levels** (ISTQB v4.0 five): component, component integration, system, system integration,
acceptance (UAT/operational/contractual/regulatory, alpha/beta). **Independence:** this command runs
at "high" independence — tester ≠ author; it never patches the code it judges.

## 2. Test design techniques (29119-4:2021 Clause 5) — when to use which

| Technique | Use when | Coverage rule of thumb |
|---|---|---|
| Equivalence partitioning | Any input domain that groups into same-behavior classes | ≥1 case per valid + invalid partition |
| Boundary value analysis | Ordered ranges: lengths, amounts, dates, pagination | min−1, min, max, max+1 per boundary |
| Decision table | Output depends on condition COMBINATIONS (pricing, eligibility, permissions, flags) | 1 case per rule column; collapse impossible rules explicitly |
| State transition | Behavior depends on history: auth/session, order/payment/approval lifecycles | All valid transitions (0-switch) + invalid-transition attempts |
| Pairwise / combinatorial | Config explosion (browser × role × plan × locale) | All pairs; name the tool/derivation |
| Scenario / use-case | End-to-end user journeys | 1 happy + the failure exits per journey |
| Random / metamorphic | Oracles hard to state exactly (search relevance, ML-ish outputs) | Metamorphic relations documented |
| Statement / branch (white-box) | Critical modules where structure matters; regulated targets | Branch ≥ statement; MC/DC only for safety-critical claims |
| Error guessing (experience-based) | Everywhere, as a checklist pass | See §5 attack list |
| Exploratory (a PRACTICE per 29119-1, not a Part 4 technique) | High-risk, newly built, defect-dense areas | SBTM sessions (§4) |

Golden business-rule rows (`logic` dimension) are the harness's requirements-based testing with exact
oracles — must-pass, cap semantics identical to `build`.

## 3. Quality model — ISO/IEC 25010:2023 (NINE characteristics) → results dimensions

| 25010:2023 characteristic (current names) | Sub-characteristics (selection) | TSV dimension | Typical checks |
|---|---|---|---|
| Functional suitability | completeness, correctness, appropriateness | `functional`, `logic` | Functional cases, golden vectors |
| Performance efficiency | time behaviour, resource utilization, capacity | `monitoring` | Load/stress/spike/soak vs p95/p99 SLOs, error rate |
| Compatibility | co-existence, interoperability | `devops` | Browser/viewport matrix, API contract checks |
| **Interaction capability** (2011: usability) | operability, user error protection, inclusivity, self-descriptiveness | `ux` | E2E journeys, WCAG 2.2 AA, keyboard/focus, empty/error states |
| Reliability | faultlessness, availability, fault tolerance, recoverability | `monitoring` | Restart/recovery, healthz, retry/idempotency probes |
| Security | confidentiality, integrity, authenticity, **resistance** | `hardening` | §6 security-functional set |
| Maintainability | analysability, modifiability, testability | reported in summary (not scored rows) |
| **Flexibility** (2011: portability) | adaptability, scalability, installability | `devops` | Install/boot from clean state, config portability |
| **Safety** (new 2023) | fail safe, hazard warning | in-scope only for physical-consequence domains — note explicitly if N/A |

Naming note: use the 2023 names in reports ("interaction capability (usability)" is acceptable dual
form — ISTQB v4.0.1 does the same).

## 4. Exploratory testing — SBTM mechanics

- **Charter**: "Explore <area> with <resources> to discover <information>". One sentence, mission not steps.
- **Timebox**: 60–120 min equivalent, uninterrupted; one charter per session.
- **Notes — PQIP**: every observation categorized **P**roblem (→ defect row) / **Q**uestion (→ user) /
  **I**dea (→ backlog) / **P**raise. No pass/fail — findings.
- **Session sheet** (`exploratory/session-<n>.md`): charter, areas touched, notes, defects raised,
  TBS split (test/bug/setup time), charter-vs-opportunity ratio.
- **Debrief — PROOF**: Past, Results, Obstacles, Outlook, Feelings → next charter proposals.

## 5. Error-guessing / hostile-user attack list (minimum pass)

Inputs: empty, null, whitespace-only, 0, negative, max, max+1, very long, unicode/emoji/RTL,
leading/trailing spaces, `<script>alert(1)</script>`, `' OR 1=1 --`, huge/zero-byte/wrong-type
uploads, Feb 29 / DST / timezone-edge dates. State & sequence: back button after submit, refresh
mid-transaction, deep-link into mid-flow, expired session mid-action, out-of-order steps, editing a
record another user deleted. Concurrency & idempotency: double-click submit, two tabs, two users on
one record within 100ms (who wins, what does the loser see), replayed idempotency keys across
workers, retry ≠ double-charge. Hostile: other users' IDs in URLs (IDOR), role escalation via direct
API, tampered client-side prices.

## 6. Non-functional floors

- **Accessibility — WCAG 2.2 level AA = 55 success criteria** (31 A + 24 AA; 4.1.1 Parsing removed —
  checklists citing 87 total are stale). Automated axe scan covers ≈30–57%; mandatory manual:
  keyboard-only navigation + tab order, focus visibility (2.4.11) , target size ≥24px (2.5.8),
  contrast 4.5:1 / 3:1, redundant entry (3.3.7), accessible auth (3.3.8), screen-reader spot pass.
- **Security (QA depth) — OWASP Top 10** (2021 baseline; 2025 final: A01 Broken Access Control now
  absorbs SSRF, A03 Software Supply Chain Failures, A10 Mishandling of Exceptional Conditions) as the
  checklist; **ASVS 5.0 L1** as the structured floor (L2 target for sensitive data). QA owns
  *functional* security: per-role authz matrix, IDOR probes, session expiry, input validation,
  header/config checks, error-message leakage. Crypto review and pentest depth → `security` command /
  humans.
- **Performance** — types per ISTQB CT-PT: load, stress, spike, endurance/soak, concurrency,
  capacity. Assert percentiles (p95/p99) + throughput + error rate, never means. The load model must
  contend on physically possible concurrency or the gate is fiction.
- **Compatibility** — matrix from product analytics where available; else: latest Chromium +
  1 alternative engine + mobile viewport, tiered by risk.

## 7. Defect model (29119-3 incident report ∩ ISTQB §5.5)

**Severity** (technical impact — QA sets): `critical` crash/data loss/security breach/blocked core
flow, no workaround · `high` major function broken, workaround exists · `medium` minor function /
cosmetic-with-impact · `low` polish. **Priority** (business urgency — proposed by QA, owned by
triage): `P1` fix now · `P2` this sprint · `P3` next release · `P4` backlog. Decoupled by design
(crash on 0.1%-use deprecated path = critical/P3; brand typo on launch page = low/P1).

**States**: open → in-progress → fixed → retest → verified → closed; branches reopened, deferred
(justification + target recorded), rejected, duplicate (link to master, never delete).
**Release-blocking rule** (enforced by `score-test.sh`): critical blocks unless
verified/closed/rejected/duplicate — **a critical may not be deferred**; high additionally allows
deferred (documented waiver). Medium/low never block, always reported.

**Report anatomy** (each `defect-reports.md` entry): title = symptom + condition; environment
(build/OS/browser/role); preconditions; numbered repro steps with exact values; expected (oracle
cited) vs actual; evidence ref; reproducibility (always/intermittent + rate); isolation notes (what
was varied); regression flag ("worked in <build>").

## 8. Exit criteria & evidence (what an auditor accepts)

Mechanical gate = `score-test.sh exit-criteria`: 100% planned cases executed · strict-evidence
pass-rate ≥ target (default 0.95) · logic gate PASS · RTM coverage 1.00 with no orphan traces · defect
ledger valid · zero unresolved critical/high. Timebox exhaustion is a legitimate exit ONLY with the
gaps named and residual risk explicitly accepted by the human — never silently.

**Evidence discipline** (29119-3 common information rules): every result attributable (timestamp,
build, environment), reproducible (procedure + data recorded), hash-anchored (`score-log.tsv`),
retained with the run. **RTM chain stored**: requirement ID ↔ test case ID ↔ result (+build/date) ↔
incident ID ↔ resolution/retest — forward AND backward (uncovered requirement = gap; orphan test =
invented). Retention: keep the run dir; regulated targets have their own floors (PCI-DSS: 12 months;
medical device file: product lifetime; SOC 2: audit period — test artifacts ARE audit evidence).

## 9. Regulated-target deltas (flag, don't improvise)

If the target is medical (IEC 62304 class B/C: documented verification per class, mandatory
bidirectional traceability), automotive (ISO 26262: branch coverage from ASIL B, MC/DC at D), payment
(PCI DSS v4.0.1: authenticated pentest annually + after significant change, 12-month evidence
retention), or attestation-bound (SOC 2 Type II: dated, attributable, tamper-evident test records) —
state in the test plan that this engagement provides the *testing* layer only and name the
certification activities that remain human-owned. Never claim regulatory compliance; claim
standards-aligned process + retained evidence.
