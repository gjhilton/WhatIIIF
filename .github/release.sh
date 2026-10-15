#!/usr/bin/env bash
# whatiiif: template only. Releasing WhatIIIF, where the version in engine/VERSION is the one thing anyone changes:
#
#   .github/release.sh check BASE   (a pull request) a change to what sites get must raise engine/VERSION above BASE's
#   .github/release.sh release      (main) releases engine/VERSION if it is not released yet: the tag vX.Y.Z, the GitHub
#                                   release, its words the merged pull request's description, and the tag of its major
#                                   version (v1 for 1.x), which sites call the shared steps at
#   .github/release.sh released     (main) fails unless everything sites get is in the release of engine/VERSION, and
#                                   the tag of its major version points at it
#
# Run by .github/workflows/version.yml and live.yml. A version with a hyphen (1.2.0-rc.1) is a pre-release: released
# as one, it leaves the major version's tag on the last full release, as release.yml does for one made by hand.
set -euo pipefail

# What sites get: everything a site made from the template runs, or is built from, but for tests and the README's
# pictures.
SITES=(engine ':!engine/test' ':!engine/artwork' package.json package-lock.json .gitattributes
  .github/workflows/deploy.yml .github/workflows/update.yml .github/workflows/publish.yml .github/workflows/offer-update.yml)

version() { git show "${1:-HEAD}:engine/VERSION" | tr -d '[:space:]'; }
major() { echo "v${1%%.*}"; }
prerelease() { [[ "$1" == *-* ]]; }
# Whether version $1 is above $2.
above() { [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -1)" == "$1" ]]; }
# The files of what sites get that differ between $1 and HEAD, on one line.
changed() { git diff --name-only "$1" HEAD -- "${SITES[@]}" | paste -sd ' ' -; }

check() {
  local base=$1 now before differ
  now=$(version)
  before=$(version "$base")
  differ=$(changed "$base")
  if [[ "$now" == "$before" ]]; then
    if [[ -n "$differ" ]]; then
      echo "::error title=Raise engine/VERSION::This changes what sites get ($differ), so it is a new version: raise engine/VERSION above $before. Merging it releases that version."
      exit 1
    fi
    echo "Nothing sites get changes: no new version needed."
    return
  fi
  if ! above "$now" "$before"; then
    echo "::error title=engine/VERSION must go up::$now is not above $before."
    exit 1
  fi
  if git rev-parse -q --verify "refs/tags/v$now" > /dev/null; then
    echo "::error title=v$now is released already::Raise engine/VERSION above it."
    exit 1
  fi
  echo "Merging this releases $now."
}

release() {
  local now tag sha notes
  now=$(version)
  tag="v$now"
  sha=$(git rev-parse HEAD)
  if git ls-remote --exit-code --tags origin "refs/tags/$tag" > /dev/null; then
    echo "$now is released already."
    return
  fi
  # The release's words: the description of the pull request that made it, without the line naming the tool that
  # wrote it; GitHub's own list of what changed, if there is none.
  notes=$(mktemp)
  gh api "repos/$GITHUB_REPOSITORY/commits/$sha/pulls" --jq '.[0].body // ""' | grep -v 'Generated with \[Claude Code\]' > "$notes" || true
  local args=(release create "$tag" --target "$sha" --title "WhatIIIF $now")
  if grep -q '[^[:space:]]' "$notes"; then args+=(--notes-file "$notes"); else args+=(--generate-notes); fi
  if prerelease "$now"; then args+=(--prerelease); fi
  gh "${args[@]}"
  if ! prerelease "$now"; then
    # A release made with the workflow's own token starts no workflow, so release.yml does not move the tag: here.
    git tag -f "$(major "$now")" "$sha"
    git push -q -f origin "refs/tags/$(major "$now")"
  fi
  echo "Released $now."
}

released() {
  local now tag differ
  now=$(version)
  tag="v$now"
  git fetch -q --tags --force origin
  if ! git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then
    echo "::error title=$now is not released::engine/VERSION says $now, which has no release: Live's release job should have made it."
    exit 1
  fi
  if ! prerelease "$now" && [[ "$(git rev-parse "$(major "$now")^{commit}")" != "$(git rev-parse "$tag^{commit}")" ]]; then
    echo "::error title=$(major "$now") is not on $tag::Sites call the shared steps at $(major "$now"), so it must point at the latest release, $tag."
    exit 1
  fi
  differ=$(changed "$tag")
  if [[ -n "$differ" ]]; then
    echo "::error title=main is ahead of $tag::$differ changed since $now was released, without a new version: raise engine/VERSION."
    exit 1
  fi
  echo "Everything sites get on main is in $now, and $(major "$now") points at it."
}

"$@"
