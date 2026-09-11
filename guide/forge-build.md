# Build with images, icons and UI motion

```text
$forge build
Spec: evals/fullstack/<app>.spec.yaml
Scope: build-output/<app>
Assets: 12
Iterations: 40
```

Put required image slots, icon/style constraints, motion behavior and byte budgets in the spec.
Phase 4 records them in `assets/manifest.json` and `assets/PLAN.md` alongside DESIGN.md. Existing
approved assets and icon families come first. For new rasters, Forge prefers an available
Codex-native imagegen tool, then a matching media MCP; API fallback requires explicit authorization.
Icons stay SVG/code and interface motion stays CSS/Web Animations. `Assets: off` disables new
generation while retaining checked reuse and local asset/motion work.

Every generation attempt counts, including failed jobs and edits. Forge inspects kept outputs,
copies them into the app, and records actual receipts and prompts. Required missing assets remain
unmet; optional placeholders name their reason. Fix/resume preserves approved file hashes.

Phase 6 runs the existing design, axe and regression checks plus fresh `score-design.sh assets`,
`design-scan.cjs --assets <target>` and the fifth asset-root argument to the design verdict. The
browser checks normal/reduced motion at desktop/mobile sizes, image decoding and the actual
keyboard task. Provenance and file/payload budgets remain acceptance rows in the existing six
dimensions. See the shared [asset protocol](../claude-plugin/skills/forge/references/integrations-protocol.md)
for the schema, provider decision and exact seam commands.
