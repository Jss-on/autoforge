# Add assets and motion to an existing app

```text
$forge feature
Target: build-output/<app>
Feature: Add product illustrations, consistent SVG icons, and a details transition with a complete reduced-motion keyboard path.
Assets: 4
Iterations: 25
```

Forge adopts the app's existing DESIGN.md, assets and icon family. It snapshots the approved
`assets/manifest.json`, adds only the feature's slots and motion records, and keeps earlier
acceptance as the regression floor. New raster work prefers Codex-native imagegen; images are
inspected, copied into the app and linked to actual receipts/prompts. `Assets: off` still permits
checked reuse, icons, CSS motion and validation.

Before keeping a slice, `asset-check.cjs check <target> --previous <snapshot>` checks that approved
assets remain pinned. The touched-route design scan uses `--assets <target>` and exercises both
motion preferences; keyboard tests assert the actual task outcome. Include other routes affected
by a shared animation. Fresh asset and motion evidence enters the final design verdict, while the
existing non-regression ratchet still decides whether the feature can converge.

See the [asset protocol](../claude-plugin/skills/forge/references/integrations-protocol.md) for
manifest fields, replacement records, attempt budgets and completion commands.
