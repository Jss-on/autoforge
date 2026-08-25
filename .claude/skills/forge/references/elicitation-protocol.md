# Elicitation Protocol — capturing intent the client cannot articulate

Companion to `/forge:requirements`. Grounded in standard requirements-engineering practice
(ISO/IEC/IEEE 29148 elicitation guidance, BABOK v3 technique catalog, the Volere template, the Kano
model, jobs-to-be-done interviewing) adapted to what this pipeline can uniquely do: **generate
throwaway artifacts on demand and let the client react to them**.

## 0. The three failure modes this protocol exists to beat

A raw interview captures only **stated** intent. Projects die on the other three quarters:

| Failure mode | Why the interview misses it | Countermeasure (section) |
|---|---|---|
| **Assumed / must-be needs** — refunds, password reset, receipts, permissions, backups, exports, the undo path | Kano "must-be" needs are invisible: clients never mention what they consider obvious, and only notice it missing at delivery | Domain recon (§1) + must-be checklist (§4) |
| **Inarticulable taste** — "make it clean", "professional", "like an app" | People cannot specify aesthetics or interaction feel in words, but they can **criticize an artifact** instantly | Artifact-reaction loop (§5) |
| **Unknown unknowns** — statutory rules, edge cases, concurrency, the day-2 workflows (end-of-shift, month-end, the wrong-entry correction) | The client is not a systems analyst; the domain knows things neither party said out loud | Domain recon (§1) + day-in-the-life walkthrough (§3) + ambiguity audit (§6) |

The stance throughout: **the client is the authority on their business and their taste, never on
software structure.** Ask about their world; derive the software; play the derivation back for
correction. Never ask a client to design a schema, and never make them responsible for remembering
a table-stakes feature.

## 1. Domain recon BEFORE the first question (research-first rule)

Before Round 1, spend one bounded pass researching the stated domain — competitors/category leaders,
the standard workflow vocabulary, and any **statutory/regulatory layer** (tax rules, receipts,
discounts, retention, audit trails, accessibility law). Sources: web search, the category's leading
products, regulator sites. Output: a **domain brief** in the run dir with (a) the table-stakes
feature list for this category, (b) the domain glossary, (c) the regulatory checklist with citations,
(d) the 3–5 highest-risk questions a domain expert would ask first.

Why first: **question quality is capped by domain knowledge.** "What discounts do you offer?" gets a
shrug; "SC/PWD discounts — 20% VAT-exempt for groceries, or the 5% BNPC scheme for hardware, and is
the ₱2,500 weekly cap calendar-week or rolling?" gets the real answer and tells the client you know
their world. Every derived item goes into the interview as a **confirmation, not an open question**.

## 2. Interview structure — progressive disclosure, one facet per round

Never one giant questionnaire. Each round ≤4 questions, one AskUserQuestion call, every question
carrying a recommended default the client can accept with one click. Order:

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
8. **Out-of-scope & priorities** — explicit Won't-list read back; MoSCoW on everything captured.

Stop condition (saturation): two consecutive rounds surface nothing scope-defining AND the must-be
checklist (§4) is fully dispositioned AND the client has corrected an artifact playback (§5, §7).

## 3. The day-in-the-life walkthrough (scenario elicitation)

Feature lists hide gaps; narratives expose them. Have the client narrate a **concrete day** — open
to close — for each primary role: "It's 7:30 AM, Maria unlocks the store. What's the first thing she
does?" Follow the actual sequence and probe at every step:

- **The unhappy paths, explicitly:** the customer returns an item; the cashier fat-fingers a price;
  the drawer is over/short; the internet dies mid-sale; the manager is absent for an approval; the
  day closed but a sale was missed. Every exception named here is a requirement nobody would have
  listed.
- **The rhythms:** end-of-shift, end-of-day, end-of-month, year-end. Periodic rituals (readings,
  reports, remittances, stock counts) are the most-forgotten feature class.
- **The paper:** every physical artifact in the current process (receipt, logbook, ledger, sticky
  note) is a data model + a report the system must replace or produce.

Write each walkthrough up as a numbered scenario; these become the SRS use cases AND the e2e
acceptance journeys.

## 4. The must-be checklist (Kano guard)

After the walkthroughs, disposition EVERY item below explicitly — in / out / N-A-because — and record
the client's answer. These are the needs clients never state because they assume them:

auth + password reset + session expiry · roles/permissions · the correction path for every mutation
(edit/void/reverse — nothing is truly append-only to a human) · search/filter on every list · export
(CSV/print/PDF) of anything a boss might ask for · receipts/notifications where money moves · audit
trail of who did what · backup/restore + what-if-the-laptop-dies · data import from the old
system/spreadsheet · empty states + onboarding · offline/poor-connectivity behavior · timezone/
locale/currency formatting · soft limits (list pagination, file sizes) · the "we hired someone new"
path (account provisioning) and the "someone quit" path (deactivation, handover).

An item silently absent from both the interview and this disposition list is a protocol violation,
not a client oversight.

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

Every requirement carries a **provenance tag**:

| Tag | Meaning | Validation burden |
|---|---|---|
| `stated` | client said it | normal read-back |
| `derived-domain` | recon/checklist surfaced it, client confirmed | **read back individually** — this is where miscommunication lives |
| `default-confirmed` | pipeline default (anti-demo set etc.), client accepted | listed as a block, one-click confirm |
| `open` | still undispositioned | **blocks sign-off** |

Playback for sign-off is **never the SRS document**. It is: (a) the numbered day-in-the-life
scenarios re-told with the system in place ("Maria scans 3 items, the customer shows an SC card,
the screen shows ₱X because …"), (b) the mockup screenshots, (c) the worked-example table for every
money rule, (d) the derived-requirements list read back item by item, (e) the Won't-list. The client
corrects narratives and pictures far more reliably than clauses. Sign-off on the playback = sign-off
on the SRS.

## 8. Honesty clause — capture is iterative by design

Say this to the client at sign-off, verbatim in spirit: **the built app is the best elicitation
artifact there is.** Some requirements only become visible when they use v1 — that is normal, not a
capture failure. The pipeline is built for it: reactions land as GitHub issues on the project's own
repo, and `feature`/`fix` re-enter the loop with the shipped acceptance baseline as the regression
floor. The goal of this protocol is that nothing *knowable today* is missing — not that change
never happens.
