# Requirements the client can understand and correct

`forge requirements` starts by showing what Forge thinks you want to build, the assumptions it
is making, and stories of people using the system. You correct that picture in everyday words.
Forge turns the agreed picture into technical requirements and a validated build spec.

```text
$forge requirements
Brief: A booking system for my repair shop
Name: repair-booking
--chain build
```

In Claude Code, use `/forge:requirements`. `--chain build` starts the build only after the client
approves the final review and the generated spec passes validation.

## 1. Show the picture before asking detailed questions

The first review includes:

- **What I understand:** the problem, who has it, what a good result looks like, and what is outside
  the proposed first version. Forge separates what you actually said from what it inferred.
- **What I am assuming:** all currently known assumptions, grouped across the system's whole life.
  Each has an `A-` ID, its source or reason, its effect if wrong, and whether you have confirmed it.
  An unknown stays visible; a suggested default is a proposal until you accept it.
- **People's stories:** `US-` IDs for simple statements such as “A customer wants to book a repair
  without calling the shop.”
- **Step-by-step scenarios:** `SC-` IDs showing what each person does, what the system does, and
  how the person knows the task worked. These include things going wrong, correcting mistakes,
  and the work needed to keep the service running.

This lives in `client-review.md` in the requirements run directory. The first version is a draft
to react to, not a claim that Forge already knows every answer. New assumptions discovered later
join the same review before they become requirements.

## 2. Review the whole life of the system

Forge covers every area below. It marks an area unresolved when information is missing and records
the reason when the client agrees it does not apply. It does not silently add accounts, hosting
services, subscriptions, or other features just because similar products have them.

| Area | What the client reviews in simple words |
|---|---|
| Goals, scope, cost and timing | Who this helps; what success means; what is included now; budget, ongoing costs and deadlines. |
| People and access | Who can see, change or approve each thing; how people join, recover access and leave. |
| Screens and accessibility | The devices and languages people use; first-time and empty screens; using a keyboard or assistive tools; images and motion. |
| Rules, records and connections | What gets saved; calculations and status changes; fixing mistakes; keeping or deleting records; old data and outside services. |
| Testing and acceptance | Real examples that must work; busy periods and failures; who tries the result and decides it is ready. |
| Environments, launch and rollback | Where people try changes safely; where the live service runs; who owns the accounts and approves launch; how to undo a bad release. |
| Security, privacy and compliance | What needs protection; who may access it; where the business, users and data are located; which obligations need checking and what evidence shows they are met. |
| Monitoring, support and recovery | How someone learns that things broke; who helps users; what gets backed up; how much lost work or downtime is acceptable; how recovery is checked. |
| Maintenance, handover and retirement | Who owns updates, instructions and ongoing costs; how another team takes over; how people get their data back when the service closes. |

For compliance, Forge distinguishes a question to investigate from a verified obligation. It
records the relevant location, source and responsible reviewer; it does not present an unchecked
legal assumption as a fact.

### Make security visible

Forge asks what could cause real harm: another customer reading private records, a stolen staff
account, a harmful upload, lost data, or a service that stops working. For each applicable concern,
it shows **what we propose to protect → how we will test it → who handles a problem**. You correct
these scenarios in the same review; you do not need to choose security libraries or algorithms.

For example: “Another shop tries to download your customer list. The system refuses and returns
none of your records.” This becomes an access-control requirement and a real negative test, linked
to its scenario. The final report shows the checks and evidence, plus anything still untested.
Build and feature completion require all planned security checks to pass and no unresolved
Critical/High findings. An accepted risk or a high overall score cannot waive that gate. Production
settings are checked again for the release environment. See the [security guide](forge-security.md).

## 3. Correct stories, then see what changed

You can respond in ordinary words: “Customers never need an account,” “That happens at the end of
the day,” or “I don't know who will handle backups.” IDs are there to keep the records connected;
you do not need to use them.

Forge updates the linked assumptions, stories and scenarios together, keeps their IDs stable,
and shows what changed each round. A correction reopens any earlier decision it affects. Forge
then asks a small batch of focused questions about the next gaps, with short examples and the
consequence of each suggested choice. Silence never means agreement.

### Example: booking a repair

**What I understand:** customers should be able to request a repair time without phoning the shop.

**Draft assumptions:** `A-001` customers need an account; `A-002` a time is reserved immediately;
`A-003` staff handle a booking when a message fails. None is confirmed yet.

**Story `US-001`:** a customer wants to choose a repair time and know whether the shop expects them.

- **Success `SC-001`:** the customer chooses Tuesday at 10 → enters contact details → sends the
  request → sees whether the time is reserved.
- **Failure `SC-002`:** two customers choose the last time → only one reservation succeeds → the
  other customer sees available alternatives.
- **Recovery `SC-003`:** the customer notices the wrong phone number → follows the agreed correction
  route → sees that the right number is saved without creating another booking.
- **Operations `SC-004`:** the booking is saved but its message fails → the responsible staff member
  sees the problem → follows the agreed retry or contact process without duplicating the booking.

The owner replies: **“No accounts. They request a time; staff must approve it.”**

Forge shows the change: `A-001` is rejected; `A-002` is corrected to require staff approval; `US-001` and
`SC-001` now end with “request received, waiting for approval.” It reopens `SC-002` to resolve what
happens to competing requests, and adds the staff story and approval/rejection scenarios. The
owner can correct those revised flows before approving the complete picture.

## Wireframes are cloned from popular open-source and premium peers, then scored

Forge does not invent the first screens. It searches GitHub for the most-starred open-source
projects of the same kind and the App Store for the paid and premium products of the same kind —
popular (500+ stars or ratings) and alive (a push or release within two years) — looks at 3–5 of
them (the premium listings' screenshots are downloaded for it), captures the screens that match
your busiest scenarios and records each one in `wireframes/references.tsv` (link, stars or
ratings, license, the screen, the capture, what it gets right). At least one reference must be a
paid product: the layouts people pay for are the strongest evidence of what the category expects.
You see those captures first and say what you dislike. Each throwaway wireframe is then a
re-expression of a different reference's layout in your own objects and words — its structure,
never its code, styling, icons or logos — so the choice you make is between patterns thousands
of users already corrected, not between the interviewer's guesses.

The set is gated mechanically before you react to it:

```text
scripts/score-design.sh wireframes forge/requirements-<run>/wireframes --require SC-1,SC-2 --capture
screen sale: variants=4 lineages=4 niches=4 diversity=0.46
WIREFRAMES: PASS wqd=4.00/4 coverage=1.00 diversity=0.46 refs=5 premium=2 bytes_max=7k
```

`wqd` is a quality–diversity score: every wireframe earns up to 1 for meeting its contract (the
scenario ids it covers, navigation, a main area, one primary action, an empty and an error state,
self-contained and small enough to open instantly); wireframes of the same screen whose renders
look like the same layout under a perceptual hash count once, so three recolours score about 1,
not 3. `coverage` is the share of the required scenarios that have a screen, `diversity` how far
apart the variants of a screen are, `refs` the live references with captures and `premium` how
many of those are paid products. PASS needs at least three references with one premium among
them, every required scenario covered, two or more lineages per screen that really
differ, and `wqd` of at least 0.8 per wireframe. Creativity beyond that is yours to judge in the
reaction round; the number only guarantees you are choosing between real, complete alternatives.

The lines above come from a sari-sari store POS brief. The sweep found `opensourcepos` (4.5k stars,
captured from its public demo), `laravel-pos` and `flutter-pos-system` (README screenshots) on
GitHub and, on the App Store, Shopify POS (7.5k ratings; its iPad "New order" screenshot was
downloaded by the sweep) and Square POS (607k ratings; its listing shows a reports screen and
marketing shots but no sale screen, so it is recorded and not cloned), while `NexoPOS` (demo
offline, logo-only README) and `Store-POS` (no screenshots anywhere) were excluded with the reason
printed. The four wireframes re-express four layouts — top icon bar + cart table + customer card;
dark sidebar + cart + product grid; category chips + grid + order list with a bulk bar; icon rail +
tile grid + cart panel with a pinned Checkout — and a fifth that only recoloured the first failed
the gate at `wqd=4.00/5`. The example ships as `tests/fixtures/requirements/wireframes/`.

## 4. Choose the stack on evidence — you approve it

Before the technical requirements are written, Forge chooses the technology stack the way it
chooses everything else: visibly, with evidence, and with your sign-off. A `Stack:` hint is a
candidate, not a decision; if you say "this is decided", Forge validates it and records the risks
instead of overruling you.

First it asks the things only you know: how many people and requests, how many years the system
must live, who will run it after handover, which licences are acceptable, which laws apply, where
it must be hosted, and the monthly budget. Then it forms three to five real candidate stacks — the
boring, proven default is always one of them — and researches each with dated, tier-graded sources:
licence, support window, open security advisories, maintenance health, hosting cost under your
numbers, and whether the harness has delivered that stack before. Candidates that fail a hard gate
(licence, end-of-life inside your horizon, unmaintained, unpatched advisories, platform or
compliance) are eliminated first.

What you see is a short playback: one sentence stating the choice and what it gives up, the three
strongest reasons each with its source, the downsides Forge accepts on your behalf, what the
runner-up would give and cost, the money consequences, how hard it would be to change later, and
whether the ranking is robust or flips if you weigh something differently. Forge also lists the
questions no evidence can answer — team familiarity, hiring, five-year viability — so you decide
those knowingly. You can **approve**, **change the weights**, **ask for more evidence**, or
**mandate your own stack**.

Example: for the repair-booking service, Forge recommends a Node + Fastify + Postgres stack over a
Next.js stack and a Django stack: "Your VPS already runs Node, every part is supported past your
three-year horizon, and the runner-up would give a longer support window but cost you a second
runtime nobody on your side operates." You approve; the approval is pinned to the exact evidence
you saw, so if a source or a weight changes later, Forge must show you the decision again.

## 5. Approve the playback, then generate requirements

Forge reads back the complete agreed picture: understanding, assumption decisions, stories,
success/failure/recovery/operations scenarios, screen examples, worked rules, lifecycle decisions
and what is excluded. Remaining scope decisions and conflicts must be resolved; an excluded or
not-applicable item needs an explicit reason. You approve that version of `client-review.md`.

Only then does Forge finalize the technical `requirements.md` (the software requirements
specification, or SRS), preserving the links from `A-`, `US-` and `SC-` IDs to requirements and
acceptance checks. If translation reveals a new decision or changes the agreed meaning, Forge
returns to the client review and obtains approval for the changed version.

The final `evals/fullstack/<name>.spec.yaml` must pass the existing requirements validator before
Forge hands it to build — including the stack gate: `decision:` points at the complete approved
bundle in tracked `evals/fullstack/<name>.stack/`, and `score-requirements.sh stack` must print
`STACK_DECISION: READY`. Your approval pins the ledgers and decision record. Client approval establishes
what to build and on what stack; mechanical validation checks the build spec's structure,
acceptance coverage and the stack record. All are required.

## 6. Read the result as a designed document

The signed-off `requirements.md` stays the file `build` reads; what you and the client read is
`requirements.pdf`, rendered by `scripts/requirements-report.cjs pdf <run-dir>`:

| Page | What is on it |
|---|---|
| Cover | the title, the counts (functional and non-functional requirements, stories and scenarios, diagrams, tables, sections) |
| Contents | every section with its icon, a priority (MoSCoW) donut and a requirements-by-dimension bar chart |
| Sections | an icon per heading; FR/NFR tables become cards — id, bold title, the Given/When/Then text, priority badge, provenance and dimension chips |
| Diagrams | every Mermaid block (ER, state, sequence, flowchart) rendered to real SVG, captioned by kind |
| Gallery | the run's images — direction boards, wireframe captures, playback material — as direction evidence, not approved assets |

The verdict line says what happened: `REPORT: PDF_EXPORTED requirements.pdf pages=N sections=S
requirements=F+N diagrams=R/T images=I`. Diagrams render from a pinned Mermaid build fetched once into
`~/.cache/forge/` and hash-checked; offline, `FORGE_MERMAID=<path>` names a local copy, and a diagram
that cannot render is printed as its source and counted in `diagrams=R/T`. Without an installed
Chrome or Edge the verdict is `EXPORT_UNAVAILABLE` and `requirements.html` — the same document — stands
in. `--source playback.md` renders the client review the same way; `--replace` re-renders after a change.
The document is self-contained: no script, nothing fetched when it is opened.

## 7. The data decisions are asked in plain words and written down as `DATA.md`

Software + data: after the money rules, Forge runs a **data & scale** round from the
[data-intensive protocol](../claude-plugin/skills/forge/references/data-intensive-protocol.md) — the
decision procedure of Kleppmann & Riccomini's *Designing Data-Intensive Applications* (2nd ed.) in
client language. How many people at the busiest moment and how much data in two years. How long the
main screens may take typically and in the worst case you would still tolerate, and what share of
requests may fail. Which rules must never break even for a moment (a unique receipt number, stock never
below zero, no double booking) and which could be apologized for afterwards. What must never happen
twice when someone clicks twice. How much saved work may be lost if a server dies and how fast service
must return. Where else the data must appear (search, reports, the app on a phone) and how stale each
copy may be. Which facts are about people, why each is kept, for how long, and within how many days a
person who asks must be gone from every copy. Each answer is an `A-n` decision, and the ambiguity audit
turns every adjective into a number with its load model — "fast" becomes "p95 under 400 ms at 46
requests per second".

The answers become `DATA.md`, the data twin of `DESIGN.md`: eight groups (workload · slo · model ·
integrity · evolution · durability · derived · retention) in machine-readable form plus a page that
says which store is the source of truth for each fact and what was rejected and why. It is linted
before sign-off:

```text
node scripts/data-score.cjs lint forge/requirements-<run>/DATA.md
DATA_LINT: VALID groups=8/8 na=0
```

A mean instead of percentiles, a closed-loop load model, a cache written by the application next to
the database (a dual write) or a 90-day erasure promise fails the lint with the book's reason. The
generated spec carries a `data:` block pointing at the record and a `data` acceptance row per group;
`REQUIRE_DATA=1` makes the validator refuse a spec for a data-keeping product that lacks them. `build`
then measures every decision (see the [build guide](forge-build.md)).

## Specify images, icons and UI motion

```text
$forge requirements
Brief: <brief or file>
Name: <app>
Assets: 12
--chain build
```

The interview records required/optional imagery, supplied brand assets, icon family, permitted
sources, byte/attempt budgets, routes, alt text and loading. Motion requirements name the trigger,
duration, reduced behavior and the keyboard task that must still complete. These become a planning
`assets/manifest.json` and mechanical acceptance rows in the generated build spec.

Optional moodboards can use Codex-native imagegen when available, under the stated budget. They
retain real files, prompts and receipts in the run directory and are marked as throwaway direction
evidence. They do not become approved product assets automatically. `Assets: off` preserves
planning and reuse without launching generation.

Requirements completes after owner approval and the existing spec/traceability gate. A planned asset is not a delivered
one: build later runs inventory/provenance checks, browser image verification, normal/reduced
motion and keyboard-task checks. See the [asset protocol](../claude-plugin/skills/forge/references/integrations-protocol.md)
for the shared lifecycle and schema.
