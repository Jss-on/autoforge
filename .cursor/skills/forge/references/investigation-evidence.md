# Investigation evidence format

`investigate.cjs` records commands and checks saved artifact structure. It cannot certify source
authenticity, causal conclusions, complete tool coverage, or whether an excerpt supports a claim.
Keep those limits in every report. `source` and `scope` below are nonempty strings declared by the
investigator, not independently discovered by the runner. Case text fields and request metadata
are nonempty single-line strings; retained stdout/stderr may contain multiple lines.

## Plan approval before execution

Write `interview.md` with the actual intake context and `investigation-plan.md` with the detailed
plan. Those two Markdown files support multiline prose. Snapshot the drafts before displaying
the concrete plan to the user:

```text
node <AR_ROOT>/scripts/investigate.cjs plan <run>
node <AR_ROOT>/scripts/investigate.cjs status <run>
```

`plan` saves the exact drafts in `plans/plan-<N>.json` with their hashes. The result identifies
the revision, `plan_sha256`, and `snapshot_sha256` (the complete saved snapshot, including intake).
Unchanged drafts reuse the latest revision and its recorded
approval; edited drafts produce a new revision awaiting approval. Prior snapshots are preserved.
`status` reports `unplanned`, `awaiting_approval`, `approved`, or `stale`. It does not run commands.

Show the plan, then wait for the actual user response. After explicit approval, save a request
such as the following, populated from the real plan result and user message:

```json
{
  "revision": 1,
  "plan_sha256": "<hash returned for the displayed plan>",
  "snapshot_sha256": "<hash returned for this exact intake and plan snapshot>",
  "user_response": "<actual user approval response>",
  "message_ref": "<reference identifying that user message in this conversation>"
}
```

```text
node <AR_ROOT>/scripts/investigate.cjs approve <run> <approval-request.json>
```

The helper saves `plans/approval-<N>.json` against the current revision and refuses stale or
mismatched requests. Both hashes must match, so a different case's intake cannot reuse approval
merely because its plan text and revision number match. Do not synthesize user responses or call
it when the user requested changes.
Its provenance is `agent_saved`: local records cannot authenticate human consent or determine
whether the response meant approval. The agent must establish that from the actual conversation.

`capture` refuses to start a process or create a receipt unless the current drafts match a
snapshotted revision with recorded approval. Changing either draft invalidates that permission
until the new revision is approved. Keep progress, output, and approval annotations outside the
drafts to avoid accidental changes to approved content. New captures retain the plan revision,
plan hash, and snapshot hash; `check` validates their linkage to the retained snapshot and approval.
The helper does not intercept direct MCP/browser calls or determine a command's semantic scope;
the command contract requires the same approval boundary for those actions.

Older receipts remain auditable with `check`. A valid evidence structure, or an old approval
record, does not by itself authorize new execution. Use `status` against the current plan.

## Capturing a command

Write a JSON request under `<run>/requests/` and pass its path to the capture command. Example
(replace the repository path with the real absolute path on your machine):

```json
{
  "id": "E1",
  "argv": ["git", "rev-parse", "HEAD"],
  "cwd": "C:/work/client-app",
  "source": "Local checkout of client-app; git HEAD",
  "scope": "Local revision only; deployed production revision has not been established",
  "timeout_ms": 10000,
  "output_limit": 1048576
}
```

```text
node <AR_ROOT>/scripts/investigate.cjs capture <run> <request.json>
node <AR_ROOT>/scripts/investigate.cjs check <run>
```

Use distinct IDs for repeated queries. The runner reserves `receipts/E1.json` exclusively and
records `acquisition: process_capture`, sanitized argv/cwd/source/scope, start/end time, elapsed
time, bounds, actual exit code/signal/error, retained stdout/stderr, hashes, and completeness.
Failures are evidence of failed checks; an exit code is not a claim about the incident.

Do not put secrets in arguments or metadata. Existing authentication is inherited by the child
process; environment values are not serialized. Common credential patterns and known secret
environment values are redacted from output, but automated redaction is not comprehensive.
The receipt hashes cover the retained, redacted representation. Limit queries before collecting
unrelated personal data. Restrict local access according to the project's existing policy.

## Tool responses and research sources

When a runtime receipt is unavailable, preserve the actual displayed tool output in a separate
receipt with `acquisition: agent_saved`. Label material copied from user input explicitly in
`source`. This format is also suitable for permitted excerpts of retrieved primary documentation:

```json
{
  "version": 1,
  "id": "E2",
  "acquisition": "agent_saved",
  "source": "Actual tool name; original URL/message/object locator; sanitized query/parameters; tool call ID if exposed",
  "scope": "Document version and section, retrieval context; excerpts only; incident applicability unknown",
  "captured_at": "2026-10-04T03:00:00.000Z",
  "stdout": "The exact permitted source excerpt actually retrieved.",
  "stderr": "",
  "stdout_sha256": "<sha256 of UTF-8 stdout bytes>",
  "stderr_sha256": "<sha256 of empty bytes>",
  "completeness": "partial",
  "exit_code": null
}
```

The displayed timestamp and text above are format examples, not evidence. Populate fields from
the actual retrieval. Hash using Node's `crypto.createHash('sha256').update(text).digest('hex')`.
Completeness is `complete|partial|unknown`; excerpts, truncated responses and unfinished pagination
are partial. A complete response can still represent a narrowly filtered or sampled source.
Do not label an agent-written file as a runtime-authenticated receipt. Even `process_capture`
files are locally editable: their digests detect inconsistencies, not deliberate forgery.

## Case ledger

`case.json` has this shape. Replace the example revision with the actual captured value before
using it as an observed claim. For unanswered questions, reference an `unknown` claim with empty
evidence; question and conclusion claim-reference lists must each remain nonempty.

```json
{
  "version": 1,
  "issue": "QA reports export failures in production",
  "scope": "Reported customer and event window; production linkage still unknown",
  "questions": [
    {"id": "Q1", "text": "Which code revision is available?", "answer": "Local checkout identified; deployed revision unknown", "claims": ["C1"]}
  ],
  "claims": [
    {
      "id": "C1",
      "text": "The local checkout reports revision <actual revision>",
      "kind": "observed",
      "evidence": [{"receipt": "receipts/E1.json", "stream": "stdout", "start_line": 1, "end_line": 1}],
      "limitations": "This does not identify the production deployment",
      "counterevidence": []
    }
  ],
  "review": {"mode": "self", "findings": "Checked the local revision receipt; production cause cannot be established"},
  "conclusion": {"status": "unresolved", "text": "Cause remains unknown", "claims": ["C1"], "limitations": "Production evidence is unavailable"},
  "next_steps": ["Retrieve the deployment revision and request trace for the reported event"]
}
```

- Claim kinds: `reported|observed|inferred|hypothesis|unknown`.
- Non-unknown claims require evidence. `inferred` also requires nonempty `reasoning` explaining
  the bridge and assumptions; hypotheses state the discriminating next test in their limitations
  or the round log. `unknown` may have no evidence. All claims record nonempty limitations;
  use an explicit bounded scope when no additional limitation was identified.
- References use paths confined to the run and inclusive **1-based** line numbers in a retained
  `stdout` or `stderr` stream. Cite the underlying receipt, not an investigator's summary. Keep
  counterevidence in the same format. For a process outcome use, for example,
  `{"receipt":"receipts/E1.json","field":"exit_code"}`. Allowed result fields are `exit_code`,
  `error`, `signal`, and `completeness`, only on process receipts. To cite a genuinely empty
  stream, use `{"receipt":"receipts/E1.json","field":"stdout"}` (or `stderr`); nonempty
  streams require line references. Never combine `field` with `stream`/line fields or fabricate
  an output line. These references support facts about the attempt and retained output, not a
  claim that an empty query proves the event never occurred. Source/scope declarations cannot
  be cited as independently observed result fields.
- Review modes: `independent|self|unavailable`; findings describe what was actually checked and
  unresolved objections. The checker validates the declaration, not reviewer independence.
- Conclusion: `demonstrated|supported|unresolved`, always explicitly analyst assessed. Preserve
  its scope, linked claims, and limitations. For demonstrated historical cause, the semantic review
  must establish incident linkage and a causal test or trace, not simply a matching error string.
- Questions, claims, and next steps can grow during a case. Preserve original unanswered questions
  and corrections; a smaller ledger must not hide uncertainty or failed work.

## Actual images and snapshots

Optional `visuals` and `visual_gaps` extend version 1 cases. Existing text-only cases still pass.
An example entry under `visuals` (values are placeholders, not evidence):

```json
{
  "id": "V1",
  "file": "visuals/export-screen.png",
  "sha256": "<sha256 of the actual image bytes>",
  "kind": "screenshot",
  "caption": "The retrieved screen shows the export error for this request; it does not establish why it failed.",
  "alt": "Export error visible beside the reported request identifier",
  "source": "Original page/message locator and actual capture tool or user-provided source",
  "captured_at": "<actual ISO capture timestamp, or unknown when truly unknown>",
  "scope": "Actual environment, account, view and capture context; distinguish event time from capture time",
  "limitations": "This image shows the retrieved state; earlier production behavior is not established",
  "claims": ["C1"],
  "acquisition": "tool_capture",
  "include_in_report": true
}
```

- `kind`: `screenshot|reproduction|annotated|diagram`. A reproduction is an actual image of the
  isolated test, not a picture of the historical production incident. Diagrams are explanatory.
- `acquisition`: `tool_capture|user_provided|agent_saved`, a provenance declaration, not a signature.
  `captured_at: "unknown"` is permitted for user-provided/agent-saved images whose capture time is
  genuinely unknown. A download time is not the original capture time. Tool captures need a date.
- Each visual needs nonempty caption, source, scope, limitations, and existing claim IDs; `alt`
  optionally provides an accessible description, otherwise the caption is used.
- An `annotated` image needs `derived_from` naming an earlier retained visual plus `transformations`
  describing actual crops/redactions/highlights. Any derivative requires transformations and a
  retained parent; chains cannot cycle. Do not relabel an edited image as an untouched screenshot.
  If retaining the original is prohibited, keep only the authorized image as an `agent_saved`
  screenshot and explicitly disclose that it was redacted externally and its original is unavailable.
- `include_in_report` defaults to true; explicitly set it false for restricted originals. Excluded
  image bytes and metadata are omitted from exported reports; a referenced ID gets a restricted
  placeholder. Inspect redacted derivatives before export; the checker cannot verify redaction.
- File paths stay inside the run, including resolved symlinks; images must have PNG, JPEG, or WebP
  signatures and matching hashes. No SVG, HTML, remote URLs, or automatic downloads. Limits:
  32 visuals, 8 MiB per image, 32 MiB total. The checker validates signatures, not full decoding.
- A claim can cite `{"visual":"V1"}` as evidence or counterevidence. A visual citation cannot mix
  receipt fields; explanatory diagrams cannot be evidence. Charts/diagrams link their underlying
  receipts through their claims. Captions and rendered image content still require semantic review.
- `visual_gaps` is an optional array of nonempty strings explaining missing captures and their
  impact. A text-only report states that no visual source evidence is attached. It remains valid
  when honest about why visuals are unavailable or unhelpful.

## Rendering and delivery

New final cases include `report` below. It is optional for compatibility with older cases; when
present all three sections are required. Factual prose in research/reply text references existing
claims, and the renderer preserves those links. The delivery summary compares expected evidence
and answered questions against actual findings and gaps; include next owners/actions in
`next_steps`. Keep per-format export state in `exports.json`, since exports occur after rendering.

```json
{
  "report": {
    "research": {"text": "No production-specific explanation has been established; version applicability remains unknown.", "claims": ["C1"]},
    "delivery": "The plan requested a deployed revision and incident trace. Only the local revision was retrieved; the production trace remains outstanding.",
    "stakeholder_reply": {"text": "We have identified the available local revision and are checking the production deployment and request trace before drawing a conclusion.", "claims": ["C1"]}
  }
}
```

The above is a format example only; replace the text and claim links with the actual findings.

```text
node <AR_ROOT>/scripts/investigate-report.cjs html <run>
node <AR_ROOT>/scripts/investigate-export.cjs pdf <run>
node <AR_ROOT>/scripts/investigate-export.cjs docx <run>
```

All renderers call `check` first. HTML is offline and self-contained: included images are embedded,
text is escaped, claims link to figures and captured excerpts, and printing uses a dedicated layout.
Narrative can be edited in the browser and saved as an explicitly unverified draft; evidence is not
editable through those controls. Reconcile edits into `case.json`, check and review before calling
them findings. PDF/DOCX generation always uses the checked case, not arbitrary or edited HTML.
Outputs use exclusive writes; select a new relative filename for a revised export instead of
overwriting the reviewed report. A second positional argument after the run selects that filename.
PDF requires an installed Chrome/Edge; DOCX requires working Pandoc. Missing/broken tools are
reported unavailable, with no automatic installation. Do not claim a conversion succeeded without
its actual output. Inspect exported images and layout when the relevant viewer is available.

Google Docs is the workflow default, with PDF when available; these local helpers do not implement
Google authentication or claim to upload anything. The agent must discover a connected private
document creation/import capability, use the approved destination, and verify the created document
and embedded images. A read-only search connector cannot do that. Never host private screenshot
URLs publicly to satisfy an insertion API. Prefer private import of embedded DOCX images when
supported, otherwise keep HTML and available local exports and state the missing capability.

Record each requested format in `exports.json` with `status: success|unavailable|failed`, the actual
file or returned document URL/ID, actual export time, case SHA-256, and reason when incomplete.
Keep the short delivery index in `report.md`; use its path in the existing handoff. If a PDF was
generated from the local case rather than the Google Doc, identify that origin. Record requested
but missing formats as remaining work. A case can be structurally valid while delivery is incomplete.

`check` validates types, IDs, referenced claims, receipt paths and digests, actual line ranges,
the allowed result/empty-stream fields, and visual paths, hashes, types and references.
It reports acquisition counts, failed/incomplete receipts, and verification limitations. A valid
unresolved case passes. A failed query receipt may be cited to establish that access failed; it
cannot establish that the requested object was absent. Whether a sentence makes that distinction
requires source-aware review. It does not execute commands found inside saved receipts.

The checker does not parse `report.md` for factual coverage. The investigator and reviewer must
check every material report sentence against the case and retained source, including research
applicability, contradictions, and scope. Keep the short stakeholder draft within the same bounds.
