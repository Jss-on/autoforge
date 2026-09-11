# Release and product publication

`scripts/publish-autoforge.sh` publishes a verified source tree as one commit on the
`Jss-on/autoforge` product lineage. It does not publish local source history.
`scripts/release.sh` prepares a versioned PR and creates a release after review.
Both scripts use the `autoforge` remote and validate its effective fetch and push
URLs against the product repository. `origin` is never a publication destination.

## Publish source changes

```bash
bash scripts/publish-autoforge.sh "publish: describe the product change"
```

Commit the intended source changes first. Publication requires:

- A successful fresh fetch of product `master`, whose tree appears in the local
  source ancestry. This supports squash publication while refusing to overwrite
  product-only changes. Reconcile those changes into source before retrying.
- No tracked client run directories, environment secrets, credential artifacts,
  or PEM private keys. `.env.example`, `.env.sample`, and `.env.template` files
  are allowed; actual credentials must never be placed in those templates.
- Every `tests/test-*.sh` suite and `scripts/smoke-seam.sh` passing against one
  unchanged source commit, index, and tracked working tree. Verification cannot
  be bypassed with `AUTOFORGE_SKIP_TESTS`.
- A checked product destination immediately before publication. An unexpected
  remote update makes the normal, non-forced push fail.

The first publish for a marketplace version creates its tag atomically with the
product commit. Existing version tags are preserved; unrelated local tags are
never followed, even when `push.followTags` is enabled. Fetch, tag lookup, push,
and post-push verification errors are fatal. A fresh product repository must be
initialized separately; this script requires an existing product `master`.

The credential gate checks filenames and PEM private-key headers; it does not
replace a dedicated secret scanner or a review of the intended tracked tree.

## Create a versioned release

Use a clean **product checkout** at the freshly fetched `autoforge/master` commit,
with `master` checked out and `gh` authenticated. Source checkouts with a separate
private history must use the publisher first and then release from the product
checkout.

```bash
bash scripts/release.sh 3.6.1 --title "Release title"
```

The version must increase and use `X.Y.Z` with no leading zeros; a leading `v` is
accepted. Unknown or duplicate arguments are rejected before remote work.

The script updates the three manifests, all five skill versions, and version
badges, then pauses for document review. Review `README.md`, `guide/`,
`CONTRIBUTING.md`, and `COMPARISON.md`. It stages only those release/documentation
paths and rejects unrelated staged or tracked edits. It does not regenerate or
silently overwrite distribution content.

After the full test and seam gates pass, the script pushes the exact verified
commit and creates a PR against product `master`. Enter `merge` to continue;
anything else leaves the PR open. It waits for CI, requires a successful
`Harness test suites` job from GitHub Actions on that exact PR head, and rejects
missing, failed, cancelled, or skipped mandatory checks. The manual model smoke
may be skipped. A changed PR head or base requires fresh verification.
The PR must also be non-draft, report a clean merge state, and have no outstanding
required or blocking review decision before publication.

The script constructs a merge commit containing the verified tree, with the
reviewed base and PR head as its two parents. A normal, non-forced push publishes
that commit to product `master`; a concurrent base advance rejects the push
before it changes `master`. Existing repository permissions and branch rules
remain enforced. A denied push stops without a tag or release; the script never
changes settings or bypasses remote policy.

The PR head becomes an ancestor of `master`, allowing GitHub to recognize the
merge. Before tagging, the script verifies the merge remains in current remote
ancestry and waits up to five receipt reads (two seconds apart) for GitHub to
confirm that exact merge commit. It then tags the constructed merge commit,
even if `master` has advanced again. The release branch remains available.

## Stops and retries

A failed gate leaves local changes or the open PR available for inspection;
there is no automatic reset, force-push, branch deletion, or test bypass. An
abort during document review keeps only local changes. An abort after PR creation
leaves the PR open. Reverify any changed candidate before merging or tagging it.
