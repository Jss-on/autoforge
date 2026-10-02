# Delivery outcomes

`evals --delivery --service ID --from ISO --to ISO receipt.json ...` reads records only. No report
authorizes a release. Retain original provider/CI receipts; never rewrite history to manufacture proof.
`ship.delivery` embeds a native operation record, or pass native records directly. Required reporting
identity: `provider`, `service`, `environment`, `operation_id`, `provider_deployment_id`, `target`,
`candidate`, `configuration_sha256`, `action`, `state`, `observed_live_at`, `source_commits`.
Keep `requested_at`, `accepted_at`, `verified_live_at`, rollout and recovery references when known.
The delivery helper records observed traffic even when the journey fails (`OBSERVED_UNHEALTHY`).
It blocks readiness, preserves the first observation timestamp, and never upgrades accepted-only events.

Source commits carry `id`, `committed_at`, optional `original_id` and `mapping_uncertain`. Preserve the
original change identity/time through squash/cherry-pick when known. Unknown mappings are excluded from
lead time and exposed as coverage issues. The first delivery in the supplied history establishes lead
time; provide earlier records to avoid mistaking a repeated change for its first delivery.

Incident JSON: `{ "source": "incident", "incident": { "id": "INC-1", "service": "notes",
"impact_started_at": "2026-01-04T00:10:00Z", "restored_at": null, "causal_operation_id": "op-2",
"remediation_operation_ids": [], "unplanned": true } }`. A null cause remains unknown. Link actual
causality and unplanned response from incident evidence; do not infer either from a commit message.

Conventions per service and explicit `[from,to)` window:

- Deployment frequency: observed production operations per day. Previews, staging and experiments
  are excluded. Production rollback is another delivery, even when it repeats an artifact.
- Change lead time: median commit-to-first-observed-production seconds per unique original change.
  Repeated rollback commits add no new lead-time sample.
- Change fail rate: unique in-window deployments with a linked incident observed before window end,
  divided by in-window deliveries. Several incidents from one delivery count once.
- Failed deployment recovery time: median completed durations for linked incidents starting in the
  window. Incidents still open at window end remain censored with age; future restoration is not used.
- Deployment rework rate: in-window deliveries explicitly linked as unplanned remediation of a
  causally established production incident, divided by all in-window deliveries.

Identical imports are deduplicated. Conflicting records are excluded and flagged, never picked silently.
Missing identity/time and unrelated incidents remain visible. Zero deployments means unavailable rates,
not perfect reliability. These are five separate measurements, with sample sizes and data limitations,
not a combined score or cross-team ranking. Local test fixtures are not real production history.

Definitions: [DORA's five metrics](https://dora.dev/guides/dora-metrics/). An incident narrative can suggest
a lesson; only the existing `lessons.cjs` baseline/recovery/holdout/guard gates can verify/promote it.
