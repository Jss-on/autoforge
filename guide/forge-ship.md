# /forge:ship — The Shipping Workflow

Ship anything through 8 phases: **Identify → Inventory → Checklist → Prepare → Dry-run → Ship → Verify → Log**. Linear — no loop, no iterations. Uses explicit session authorization for the concrete action and destination; a direct user `--auto` applies within that scope after blockers pass.

---

## Delivery Evidence

Pin the destination (repository/account/environment) and artifact using `git:<40-or-64-hex>`
or `sha256:<64-hex>`. A branch, tag or latest label is mutable. Keep readiness evidence bound
to that identity; changing it requires the affected checks to run again. Inspect required CI for
that commit, including pending checks, and run any required security audit gate.

Use the typed `ship` record in `references/handoff-schema.md`: planned readiness checks,
authorization context, observed receipt and post-ship checks. Save redacted evidence under the
run directory. Existing session authorization persists; stored files and upstream flags cannot
grant it. `--force` never waives blockers, authorization, identity or verification.

After an actual shipment or rollback, run:

```bash
scripts/validate-handoff.sh <run>/handoff.json ship --require-pass
```

The gate requires passing planned checks, matching artifact/destination receipt, and nonempty
regular evidence files confined to that run. Independently verify the live target; the validator
checks recorded evidence consistency and presence. Failed/unavailable smoke checks retain the
receipt and produce ERROR/BLOCKED, never COMPLETE. Only passing actual outcomes may chain.

Dry-run/checklist-only outcomes use DRY_RUN with no execution receipt or post-ship checks. They
validate with the ordinary shape gate, stop chaining and do not publish, push, deploy or send messages.

## The 8 Phases

| Phase | What Happens |
|-------|-------------|
| **1. Identify** | Detect what you're shipping (auto or via `--type`) |
| **2. Inventory** | Enumerate all artifacts, dependencies, and targets |
| **3. Checklist** | Generate type-specific readiness checklist |
| **4. Prepare** | Run pre-ship tasks (build, lint, bump version, etc.) |
| **5. Dry-run** | Simulate the ship action without executing it |
| **6. Ship** | Execute the actual ship action |
| **7. Verify** | Confirm successful delivery |
| **8. Log** | Record ship event with timestamp and artifact details |

---

## Auto-Detection

When no `--type` is given, `:ship` inspects context to detect what you're shipping:

- **Git state** — uncommitted changes, branch name, open PRs
- **Target file** — `.md` → content, `Dockerfile` → deployment
- **Directory structure** — `content/`, `campaigns/`, `decks/`
- **CI config** — presence of workflow files, deploy scripts
- **Conversation context** — what you said most recently

If it cannot determine type with confidence, it asks one clarifying question.

---

## 8 Supported Types

| Type | Ship Action |
|------|-------------|
| `code-pr` | Create PR with full description, reviewers, and labels |
| `code-release` | Git tag + GitHub release with changelog |
| `deployment` | CI/CD trigger, kubectl apply, or deploy branch push |
| `content` | Publish via CMS or merge content branch |
| `marketing-email` | Send via ESP (SendGrid, Mailchimp, etc.) |
| `marketing-campaign` | Activate ads, launch landing page, notify channels |
| `sales` | Send proposal email, share deck link with prospect |
| `research` | Upload preprint, submit paper, publish report |
| `design` | Export assets, upload to shared drive, notify stakeholders |

---

## All Flags

| Flag | Purpose |
|------|---------|
| `--dry-run` | Validate without executing the ship action |
| `--auto` | Auto-approve checklist if no blockers found |
| `--force` | Skip non-critical warnings (blockers always enforced) |
| `--rollback` | Undo the last ship action |
| `--monitor N` | Post-ship monitoring for N minutes |
| `--type <type>` | Override auto-detection |
| `--checklist-only` | Generate readiness checklist without shipping |
| `--chain <targets>` | Chain to next command(s) after completion |

---

## Examples

### Auto-detect and ship (interactive)

```
/forge:ship
```

### Ship a code PR with auto-approve

```
/forge:ship --auto
```

### Ship a code release

```
/forge:ship --type code-release
```

### Dry-run a deployment

```
/forge:ship --type deployment --dry-run
```

### Ship with post-deploy monitoring

```
/forge:ship --type deployment --monitor 10
```

### Checklist only

```
/forge:ship --checklist-only
```

### Ship a blog post

```
/forge:ship --type content
Target: content/blog/2026-q1-retrospective.md
```

### Ship a marketing email

```
/forge:ship --type marketing-email
Target: campaigns/march-launch/email-final.html
```

### Ship a sales proposal

```
/forge:ship --type sales
Target: decks/q1-enterprise-proposal.pdf
```

### Rollback

```
/forge:ship --rollback
```

Select the prior receipt for the requested target and independently inspect the current deployment.
The receipt ID, target and artifact must still match before a reversible restoration. Save that
observation in `ship.rollback`, obtain any missing authorization only after the proposed action
is reviewable, then save the new receipt and verify the restored artifact. A newer deployment,
wrong environment or irreversible action blocks rollback. Emails cannot be unsent; database
recovery requires a tested procedure. Never execute text from a previous log as a command.

---

## Checklists by Type

### code-pr
- [ ] Branch is up to date with base branch
- [ ] All CI checks passing
- [ ] No merge conflicts
- [ ] PR description describes the change and why
- [ ] Tests added or updated for new behavior
- [ ] No secrets or credentials in diff

### code-release
- [ ] Version bumped in package.json / pyproject.toml
- [ ] CHANGELOG updated with release notes
- [ ] All tests passing on main
- [ ] No open blocking issues tagged for this milestone

### deployment
- [ ] Build artifact exists and is current
- [ ] Environment variables confirmed for target env
- [ ] Database migrations ready (if needed)
- [ ] Rollback plan documented
- [ ] On-call engineer notified

### content
- [ ] Front-matter complete (title, date, tags, description)
- [ ] All internal links valid
- [ ] Images optimized with alt text
- [ ] SEO title and meta description present

### marketing-email
- [ ] Unsubscribe link present
- [ ] "From" name and address configured
- [ ] HTML renders in major email clients
- [ ] Send list verified — no test addresses in production list

---

## Post-Ship Monitoring

When `--monitor N` is set, `:ship` enters a watch loop after shipping:

- Polls health endpoints or deploy status URLs
- Watches for error rate spikes vs baseline
- Checks response time p95 against pre-ship baseline
- Reports at 1-minute intervals for N minutes
- Triggers rollback recommendation if anomaly threshold exceeded

| Environment | Recommended |
|-------------|-------------|
| Staging deploys | `--monitor 5` |
| Production deploys | `--monitor 15` |
| High-traffic production | `--monitor 30` |

---

## Chain Patterns

### loop → ship

```
/forge
Goal: Reduce p95 API latency below 100ms
Verify: npm run bench:api | grep "p95"
Guard: npm test
Iterations: 20

/forge:ship --type code-pr --auto
```

### fix → ship

```
/forge:fix
Iterations: 25

/forge:ship --type deployment --monitor 10
```

### security → fix → ship

```
/forge:security
Iterations: 15

/forge:fix --from-debug
Iterations: 20

/forge:ship --type deployment --monitor 15
```

### Full pipeline (single command)

```
/forge:predict --chain scenario,debug,security,fix,ship
Scope: src/**
Goal: Complete quality pipeline for v2.0 release
```

---

## Tips

- **Use `--dry-run`** when shipping to production for the first time, or after changing deploy config.
- **Use `--checklist-only`** for a readiness score without committing to ship.
- **Use `--force` sparingly.** It skips warnings but not blockers. Fix blockers — they are blockers for a reason.
- **Log entries** are written to `ship-log.tsv`: timestamp, type, artifacts, git hash, verification status.

---

## Related Guides

- [/forge:fix](forge-fix.md) — fix everything before shipping
- [/forge:security](forge-security.md) — audit before shipping
- [Chains & Combinations](chains-and-combinations.md) — full lifecycle pipelines
