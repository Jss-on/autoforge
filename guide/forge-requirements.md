# Specify images, icons and UI motion

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

Requirements completes on the existing spec/traceability gate. A planned asset is not a delivered
one: build later runs inventory/provenance checks, browser image verification, normal/reduced
motion and keyboard-task checks. See the [asset protocol](../claude-plugin/skills/forge/references/integrations-protocol.md)
for the shared lifecycle and schema.
