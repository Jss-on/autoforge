# Elicitation Protocol — understand, show, correct, then specify

Companion to `/forge:requirements`. Grounded in standard requirements-engineering practice
(ISO/IEC/IEEE 29148 elicitation guidance, BABOK v3 technique catalog, the Volere template, the Kano
model, jobs-to-be-done interviewing) adapted to what this pipeline can uniquely do: **generate
throwaway artifacts on demand and let the client react to them**.

## 0. Show the diagnosis before asking for decisions

The first substantive reply to a brief is a **draft understanding, visible assumptions, user
stories, and scenarios**, before the detailed interview or technical specification. Like a doctor
explaining a working diagnosis: say what you heard, what you think it means, what you do not yet
know, and what an example would look like. The owner corrects the picture; Forge does the analysis.
If no brief was supplied, ask only what they want to build, then produce this first playback.

Create `client-review.md` in the run dir and present its contents in the conversation. It is the
living owner-facing review, not a hidden appendix or a link the owner must open to find assumptions:

1. **What I think you want to build** — the problem, people, desired result, main start-to-finish
   journey, first-release scope, and what appears outside scope. Separate "You said" from "I think".
2. **What I am assuming / do not know yet** — all currently known assumptions, including defaults,
   inferred features, exclusions, technology choices with owner consequences, and missing facts.
   Group by the lifecycle areas in §4. Do not claim to know every future assumption; add new ones
   as they emerge. An unmentioned area is `open`, never silently out of scope.
3. **Stories and scenarios** — draft the stories and numbered walkthroughs in §3 immediately,
   even from a short brief. Label invented actors, steps, rules, numbers and outcomes as proposals
   and link their assumptions. Unknown details stay unknown; do not fabricate client facts.
4. **What needs your attention first** — highlight the few choices with the largest effect on
   usefulness, cost, access, data loss or launch. The full list stays visible; questions come in
   small batches (§2).

Use short sentences and everyday words throughout the interview, including choices and summaries.
Say "who can see another shop's records?", not "tenant isolation"; "how much work could we lose?",
not "RPO". Explain an unavoidable technical term next to its practical meaning. Never ask the
owner to design the software. Give a recommendation and its consequence, not an unexplained label.

Keep stable IDs so corrections can be traced, but accept ordinary language such as "customers
don't need an account" — the owner never needs to use IDs. The review contains:

| ID / area | What I heard, assume, or need to know | Why it matters if wrong | Basis | State / owner response | Linked stories / scenarios |
|---|---|---|---|---|---|
| A-1 / access | I think customers must sign in before booking. | This adds a step before they can book. | Forge proposal, not in the brief | open | US-1 / SC-1 |
| A-2 / recovery | I do not yet know how much recent work you could afford to lose. | This affects how we save spare copies and recover after a failure. | missing fact | open | SC-3 |

**States:** `open` (unconfirmed or needs evidence), `confirmed`, `excluded`, `not-applicable`, or
`deferred` (explicitly outside this release, with consequence and revisit trigger). Record the
owner's actual response and the review revision for each decision; reasons are required for
exclusions, deferrals and non-applicability. A stated fact cites the brief/answer; an inference
cites its basis and stays open until reviewed. Never write "confirmed" merely because Forge
recommends it. Confirmation of a source fact does not confirm an inference drawn from it.

## The three failure modes this protocol exists to beat

A raw interview captures only **stated** intent. Projects die on the other three quarters:

| Failure mode | Why the interview misses it | Countermeasure (section) |
|---|---|---|
| **Assumed / must-be needs** — refunds, password reset, receipts, permissions, backups, exports, the undo path | Kano "must-be" needs are invisible: clients never mention what they consider obvious, and only notice it missing at delivery | Visible assumptions (§0) + domain recon (§1) + lifecycle checklist (§4) |
| **Inarticulable taste** — "make it clean", "professional", "like an app" | People cannot specify aesthetics or interaction feel in words, but they can **criticize an artifact** instantly | Artifact-reaction loop (§5) |
| **Unknown unknowns** — statutory rules, edge cases, concurrency, the day-2 workflows (end-of-shift, month-end, the wrong-entry correction) | The client is not a systems analyst; the domain knows things neither party said out loud | Domain recon (§1) + day-in-the-life walkthrough (§3) + ambiguity audit (§6) |

The stance throughout: **the client is the authority on their business and their taste, never on
software structure.** Ask about their world; derive the software; play the derivation back for
correction. Never ask a client to design a schema, and never make them responsible for remembering
a table-stakes feature.

## 1. Domain recon BEFORE the first detailed question (research-first rule)

After the initial playback and before Round 1, spend one bounded pass researching the stated domain — competitors/category leaders,
the standard workflow vocabulary, and any **statutory/regulatory layer** (tax rules, receipts,
discounts, retention, audit trails, accessibility law). Sources: web search, the category's leading
products, regulator sites. Output: a **domain brief** in the run dir with (a) the table-stakes
feature list for this category, (b) the domain glossary, (c) the regulatory checklist with citations,
(d) the 3–5 highest-risk questions a domain expert would ask first.

Update the visible review with discoveries before questioning. Research informs proposals; a
competitor feature is not a client requirement. For compliance, establish operating countries,
customer locations, industry, data types and responsible reviewer before asserting applicability.
Record authoritative sources, date checked, and what still needs verification. Unknown jurisdiction,
unavailable research or uncertain applicability stays open with a named next step; never claim
"compliant" from an owner yes/no. Owner preference cannot waive a binding obligation or substitute
for evidence. Use ordinary examples: "Must this receipt show your business registration number?"

Every derived item goes into the interview as a **confirmation of a visible proposal**, with a
recommended answer only when supported. For an unknown fact, ask for the fact; never invent a
default legal rule, price, deadline or tolerance for losing data.

## 2. Interview structure — progressive disclosure, one facet per round

Never one giant questionnaire. Each round has 1–3 related questions, in one available question-tool
call or a short conversational batch. Offer a recommended answer with its tradeoff where justified,
plus room to correct it or say "I don't know". Start with corrections to the first playback; do not
ask the owner to repeat information already provided. Order by risk, using these facets:

1. **Vision & stakes** — what is this, who uses it, what does success look like in 90 days, what
   breaks/costs money today. (Laddering: for every feature ask what it's *for* — capture the GOAL,
   which survives even when the feature idea was wrong.)
2. **Actors & roles** — every kind of person/system touching it; what each may see and do; who
   approves what. (Permission grids fall out of this, not out of "do you need roles?")
3. **The day-in-the-life walkthrough (§3)** — the spine of the whole elicitation.
4. **Objects & lifecycle** — the nouns from the walkthrough; for each: who creates it, what states
   it passes through, can it be edited/voided/deleted after the fact, who may, what's the correction
   path, how long is it kept. (This is ER + state machines in client language.)
5. **Money & rules** — every computation: exact rates, caps, boundaries, rounding, with a worked
   example EACH ("sale of ₱1,234.56, senior citizen, paying cash — walk me to the receipt total").
   Worked examples become the golden vectors; a rule without a worked number is not captured.
6. **Design & taste — via artifacts (§5), never via adjectives.**
7. **Edges & elasticity** — offline? two people editing the same thing? peak load (numbers, not
   "fast")? device mix? data import from the old system? what happens at month 13?
8. **Delivery & life after launch (§4)** — how we test that it works, where it runs, who releases
   updates, who pays, who responds when it breaks, access and privacy, applicable obligations,
   recovery, upkeep and closing down. Walk these as concrete situations, not a technical checklist.
9. **Out-of-scope & priorities** — explicit Won't-list read back; MoSCoW on everything captured.

After every owner response, update the same review: show **what changed, what that changes
elsewhere, and what is still open**. Update linked assumptions, stories, scenarios, rules and any
draft requirements together. Keep IDs stable; preserve the old decision in a short change log.
When a correction invalidates an earlier confirmation, reopen the affected items and present the
changed flows for review again. Only unrelated confirmations carry forward. Do not keep interviewing
against the old picture or repeatedly ask about settled items.

Stop condition (saturation): two consecutive reviewed rounds surface nothing scope-defining AND
the full lifecycle/must-be checklist (§4) is dispositioned AND the client has reviewed the story
and scenario playback (corrected it or explicitly said it is accurate). Silence, elapsed time,
tool defaults, "I don't know", or no new questions from Forge are not confirmation or saturation.
If the owner is unavailable, save the draft and open items for resumption; do not finalize or chain.

## 3. The day-in-the-life walkthrough (scenario elicitation)

Feature lists hide gaps; narratives expose them. **Forge drafts first; the client corrects.** Write
one simple user story per goal/role: `US-1 — As a customer, I want to book a visit so I know when to
arrive.` Then tell a **concrete day** with the proposed system, open to close for each primary role,
including the owner, administrator and support person where relevant. Follow the sequence:

- `SC-n` title, linked `US-n` / `A-n`, actor, goal, and starting situation.
- Numbered steps: **person does → system shows/does → what happens next**. Include handoffs and
  end with an observable result (including what was saved and who was told).
- **Normal path, unhappy paths, and recovery/correction path**: mistakes, denied access, missing
  information, cancellation, timeout, duplicate action, concurrent edits, or an unavailable service
  where relevant. Say what is kept, lost, retried, or undone and who can fix it.
- Include first use, return use, and applicable periodic/operational situations from §4. Link an
  unneeded case to an explicit non-applicability decision instead of quietly omitting it.

Example proposal, not a confirmed booking rule:
`SC-1 / US-1 / A-1 — A customer books a visit. 1. They choose a free time. 2. The system shows the
date and price. 3. They confirm. 4. The system saves the booking and shows a receipt. If the time
was just taken, nothing is booked and they see other times. If the reply is lost, they can check
whether it saved before trying again.` The price, sign-in step and recovery behavior each need a
visible assumption if the brief did not specify them.

Ask the owner to correct this walkthrough, then probe:

- **The unhappy paths, explicitly:** the customer returns an item; the cashier fat-fingers a price;
  the drawer is over/short; the internet dies mid-sale; the manager is absent for an approval; the
  day closed but a sale was missed. Every exception named here is a requirement nobody would have
  listed.
- **The rhythms:** end-of-shift, end-of-day, end-of-month, year-end. Periodic rituals (readings,
  reports, remittances, stock counts) are the most-forgotten feature class.
- **The paper:** every physical artifact in the current process (receipt, logbook, ledger, sticky
  note) is a data model + a report the system must replace or produce.

Keep the stories and numbered scenarios in `client-review.md`; the confirmed versions become
the SRS use cases AND the e2e acceptance journeys. Derive testable requirements from the reviewed
flows, never introduce new scope only when translating them into technical language.

## 4. Full lifecycle coverage + must-be checklist (Kano guard)

In the first playback, cover **every area below** with the current understanding, proposed
assumptions and unknowns. Each individual concern gets an A-n decision or a link to an existing
one; a broad "security included" tick cannot cover several unanswered choices. Areas can be
reviewed in small batches, but none may disappear. This covers the whole software development
lifecycle (SDLC); it does not make every possible feature mandatory.

| Area | What to make visible, in simple words |
|---|---|
| Purpose, scope & feasibility | Who needs this, the problem and success measure, first release vs later, budget, deadline, running costs, dependencies and constraints that could stop delivery. |
| People & access | Every user and operator, who owns it, who can see/change/approve what, new accounts, forgotten passwords, staff joining/leaving, shared devices and separate customer records. |
| Journeys & business rules | Main tasks, handoffs, states, mistakes and undo, approvals, scheduled work, exact money/time rules and examples, conflicting or repeated actions. |
| Experience & accessibility | Devices, languages, keyboard/screen-reader use, poor connectivity, first use, empty/loading/error states, design preferences and supplied content/assets. |
| Data & its lifetime | What is collected, who owns it, where it comes from, import/migration, persistence, edits, exports, retention, deletion and closing an account. |
| Connections & technical constraints | Other services/devices, what data crosses, credentials and ownership, failures/retries, vendor limits, existing systems and stack constraints with cost or hosting consequences. |
| Testing & acceptance | How the owner will know each story works, normal and failure examples, speed/volume targets, test data, accessibility/security checks, who accepts the result. |
| Environments & deployment | Local/test/live environments, hosting country/provider, account/domain ownership, configuration/secrets, release approval, automated checks, data changes during upgrades and rollback after a bad release. |
| Security & misuse | Sensitive actions/data, access boundaries, likely misuse, secure sign-in, secret storage, audit records and what happens after a suspected break-in. |
| Privacy & compliance | Operating/customer jurisdictions, personal/sensitive/children's data, consent and data requests, applicable industry/contract/accessibility obligations, source evidence and responsible review. |
| Reliability & recovery | Expected busy periods, acceptable downtime and lost work, backups, restore checks, broken connections, failure recovery and who performs it. |
| Monitoring & support | How someone notices a failure, useful logs without exposing private data, alerts, support contact/hours, incident responsibility and operating instructions. |
| Maintenance & handover | Who owns code/accounts/data, who pays and updates dependencies, security patches, training, documentation, future change approval and vendor changes. |
| Retirement & exit | How users are told, data export/transfer/deletion including backups, shutting off access/services/billing, and any records that must be kept. |

Record both the decision and its consequence. "Not needed for this first release" must name what
users/operators do instead and when to revisit it. An unresolved safety, security or compliance
obligation cannot be relabeled `deferred` just to pass sign-off.

After the walkthroughs, disposition EVERY item below explicitly — in / out / N-A-because — using
the same visible ledger and record the client's answer. These are the needs clients never state
because they assume them; do not keep a second hidden checklist:

auth + password reset + session expiry · roles/permissions · the correction path for every mutation
(edit/void/reverse — nothing is truly append-only to a human) · search/filter on every list · export
(CSV/print/PDF) of anything a boss might ask for · receipts/notifications where money moves · audit
trail of who did what · backup/restore + what-if-the-laptop-dies · data import from the old
system/spreadsheet · empty states + onboarding · offline/poor-connectivity behavior · timezone/
locale/currency formatting · soft limits (list pagination, file sizes) · the "we hired someone new"
path (account provisioning) and the "someone quit" path (deactivation, handover).

An item silently absent from both the interview and this disposition list is a protocol violation,
not a client oversight.

### Security review the owner can understand

Use the same A-n / US-n / SC-n review, not a separate technical questionnaire. Establish what must
be protected (personal records, money, private files, administrator access), who could misuse it,
what harm would follow, and who owns recovery. Never ask the client to paste passwords, private
keys or real customer records; examples use invented or redacted data.

Show a short **concern → proposed protection → how we will check it** table, for example:

| Concern, in the owner's words | Proposed protection | Example check before completion |
|---|---|---|
| Can another customer read my records? | Check who may access each record on the server. | Sign in as a different customer and try to read, change and export it; nothing private is returned or changed. |
| What if someone steals an administrator's password? | Require an additional sign-in factor for privileged access and re-check identity for sensitive changes. | Try the privileged action without that factor; try a revoked session after the administrator removes access. |
| What if a staff member leaves? | Remove access, including existing sessions and issued keys. | The former staff member's old session and key no longer work. |
| What if someone sends a harmful file or link? | Accept only needed file types and destinations; limit size and work. | Try an unauthorized file, an oversized request and a link to a private service; each is safely refused. |
| What if records are lost or exposed? | Keep protected backups, record important actions safely and name the incident owner. | Restore test records from a backup; check that an alert reaches the intended operator without exposing private data. |

Tailor these scenarios to the app and label new choices open. A client explains who should have
access and acceptable disruption; Forge proposes the technical controls from
`fullstack-hardening-checklist.md` and `security-checklist.md`. Basic access checks, secret handling,
input validation and protection against data loss are part of doing the agreed work safely, never
quietly removed as a shortcut. Account-free products still need protection for operator access and
private records; do not create customer accounts solely to satisfy a generic checklist.

Record a measurable NFR and a negative test (an action that must be refused) for each applicable
protection. Include its linked scenario, expected result, evidence to collect, and responsible
owner; unavailable checks stay open. Explain what remains outside the tested scope. No blanket
"secure" or "compliant" claim: final delivery includes the checks performed, their results, and
remaining risks. New data, roles, integrations or deployment exposure reopen this review.

## 5. Artifact-reaction loop (design & UX intent)

Clients specify taste by **selection and correction, never by description**. So put artifacts in
front of them:

- **Reference triage:** show 3–5 named design directions (catalog slugs / live products) and ask
  which feels right and — more informative — **what they dislike** in each.
- **Throwaway wireframes:** generate 2–3 disposable static HTML mockups of the 1–2 highest-traffic
  screens (list + primary workflow), screenshot them via Playwright, and present the PNGs. Ask for
  reactions per screen: what's missing, what's noise, what would you tap first. **These mockups are
  elicitation instruments, not product code** — they live in the run dir, are never reused by
  `build`, and carry a THROWAWAY banner in the file. (This is the pipeline's structural advantage:
  a disposable prototype costs minutes here, so use prototyping as an interview technique, not a
  milestone.)
- Capture the outcome as **tokens + patterns** (`DESIGN.md` source, density, navigation shape,
  the states that matter), each traced to a client reaction, not to taste of the interviewer.

## 6. Ambiguity audit (adversarial self-review before playback)

Before validation, sweep the draft SRS with these mechanical checks — each hit goes BACK to the
client as a closed-choice question:

- **Adjective → number:** every "fast/large/many/simple/secure" must carry a measurable threshold
  with a stated load model (a p95 without concurrency is not testable).
- **Rule → boundary:** every cap/threshold/window names its edge behavior (inclusive? calendar or
  rolling? what at exactly the boundary? rounding mode, to the centavo).
- **Workflow → failure path:** every happy path names what happens on failure/timeout/duplicate
  submit, and who sees what.
- **Every mutation → correction path:** edit/void/reverse semantics + permission.
- **Every list → volume:** expected count at year 1 (drives pagination/search/index decisions).
- **Every integration → contract:** what exact data crosses, which side owns retries.
- **Pronoun test:** no requirement whose subject is ambiguous ("the user" — which role?).

## 7. Provenance ledger + playback in the client's language

The assumptions ledger starts in §0, not at sign-off. Every final requirement carries a
**provenance tag**, linked to its reviewed A-n decision and, for behavior, its US-n / SC-n:

| Tag | Meaning | Validation burden |
|---|---|---|
| `stated` | client said it | normal read-back |
| `derived-domain` | recon/checklist surfaced it, client confirmed | **read back individually** — this is where miscommunication lives |
| `default-confirmed` | visible pipeline proposal, client accepted | record exactly which listed items the response covers |
| `open` | still undispositioned | **blocks sign-off** |

Playback for sign-off is **never the SRS document**. Use the latest `client-review.md` revision:
(a) the understanding and complete decisions list, including changes since the last review,
(b) the stories and numbered day-in-the-life
scenarios re-told with the system in place ("Maria scans 3 items, the customer shows an SC card,
the screen shows ₱X because …"), (c) the mockup screenshots, (d) the worked-example table for every
money rule, (e) the derived-requirements list read back item by item, (f) the Won't/deferred list and
its consequences, and (g) how delivery, launch, operation and eventual exit will work. Small batches
are fine; blanket approval of unseen items is not. The client corrects narratives and pictures far
more reliably than clauses.

Before finalization: every lifecycle concern has a recorded disposition, every in-scope story and
scenario is reviewed, every derived/default decision has an actual owner response, and there are
zero `open` items or unresolved conflicts. Capture explicit final approval of the **latest review
revision**, with the owner's words, and map that revision to `requirements.md`. Existing explicit
approval remains valid for unchanged content; any material change reopens the affected review and
invalidates final approval until the changed revision is accepted. A draft may be saved at any
time, but cannot be handed to build as complete. The spec validator checks build-input structure;
it does not prove understanding, legal compliance, lifecycle coverage or owner approval.

## 8. Honesty clause — capture is iterative by design

Say this to the client at sign-off, verbatim in spirit: **the built app is the best elicitation
artifact there is.** Some requirements only become visible when they use v1 — that is normal, not a
capture failure. The pipeline is built for it: reactions land as GitHub issues on the project's own
repo, and `feature`/`fix` re-enter the loop with the shipped acceptance baseline as the regression
floor. The goal of this protocol is that nothing *knowable today* is missing — not that change
never happens.
