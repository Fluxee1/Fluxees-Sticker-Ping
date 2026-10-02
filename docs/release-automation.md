# Foundry release registration

The repository's Actions secret `FOUNDRY_PACKAGE_RELEASE_TOKEN` must contain this
package's complete Foundry token, including its `fvttp_` prefix. The workflow uses
the token directly as the Authorization header, without a Bearer prefix. Never
put the token in source files or workflow inputs.

Future version-matching `*-Release` tags publish GitHub assets first, then verify
the public manifest and ZIP against the tagged source and reviewed asset hashes
before registering that version with Foundry. Compatibility comes from the
published manifest and is not changed by registration.

For an existing GitHub release, open Actions, select the release workflow, and
choose Run workflow on main. Enter its exact release tag. Leave `dry_run` enabled
to validate without saving. Disable it only when registering an unregistered
release or recovering a failed registration; this path never republishes GitHub
assets. If the API reports a duplicate, an exact version heading and manifest
link in the same public directory entry confirm the distinct "already
registered" outcome. This is not fresh dry-run validation or a metadata update.
A missing, unavailable, or nonmatching directory entry still fails safely.

Rate limits honor Retry-After with bounded retries. Validation errors fail without
retry. Timeouts and server errors require checking the public Foundry package
directory before retrying. Exact version and immutable manifest matches prevent
repeat registration. A missing or delayed directory entry leaves the result
uncertain; inspect the package management page before another manual write.

API reference: https://foundryvtt.com/article/package-release-api/

## Prepared Sticker Ping 1.0.3

Version 1.0.3 prepares the tested Foundry 13/14 compatibility declaration:
minimum 13, verified 14, and no maximum. Its download URL points to the future
`1.0.3-Release` asset. Until that new tag is published, use the existing latest
release installation URL; the prepared download URL does not exist yet.

Pushing main alone does not publish this release or update Foundry's existing
1.0.2 entry. After reviewing and pushing the local commit, publish the exact
`1.0.3-Release` tag from that commit through the release workflow. The workflow
verifies and publishes the GitHub assets, then registers the new version with
Foundry using the new manifest compatibility. Leave 1.0.2 assets unchanged.
Manual dispatch with `release_tag: 1.0.2-Release` still checks the published
1.0.2 metadata, not the prepared 1.0.3 compatibility declaration.
