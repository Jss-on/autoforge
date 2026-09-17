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

## 4. Approve the playback, then generate requirements

Forge reads back the complete agreed picture: understanding, assumption decisions, stories,
success/failure/recovery/operations scenarios, screen examples, worked rules, lifecycle decisions
and what is excluded. Remaining scope decisions and conflicts must be resolved; an excluded or
not-applicable item needs an explicit reason. You approve that version of `client-review.md`.

Only then does Forge finalize the technical `requirements.md` (the software requirements
specification, or SRS), preserving the links from `A-`, `US-` and `SC-` IDs to requirements and
acceptance checks. If translation reveals a new decision or changes the agreed meaning, Forge
returns to the client review and obtains approval for the changed version.

The final `evals/fullstack/<name>.spec.yaml` must pass the existing requirements validator before
Forge hands it to build. Client approval establishes what to build; mechanical validation checks
the build spec's structure and acceptance coverage. Both are required.

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
