#!/usr/bin/env bash
# whatiiif: template only. Releasing WhatIIIF, where the version in engine/VERSION is the one thing anyone changes:
#
#   .github/release.sh check BASE   (a pull request) a change to what sites get must raise engine/VERSION above BASE's
#   .github/release.sh release      (main) releases every version merged since the last release, each at the commit
#                                   that brought it to main: the tag vX.Y.Z and the GitHub release, its words the
#                                   description of the pull request that brought it; then points the tag of the major
#                                   version (v1 for 1.x), which sites call the shared steps at, at the latest
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
# A version as semantic versioning writes one: 1.2.0, or a pre-release such as 1.2.0-rc.1.
valid() {
  if [[ ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
    echo "::error title=engine/VERSION is not a version::It says \"$1\": write three numbers, such as 1.2.0, or a pre-release, such as 1.2.0-rc.1."
    exit 1
  fi
}
# Whether version $1 is above $2: by their numbers, and with the same numbers, a release above its pre-releases.
above() {
  local a=$1 b=$2 highest
  [[ "$a" == "$b" ]] && return 1
  if [[ "${a%%-*}" != "${b%%-*}" ]]; then
    highest=$(printf '%s\n%s\n' "${a%%-*}" "${b%%-*}" | sort -V | tail -1)
    [[ "$highest" == "${a%%-*}" ]]
  elif ! prerelease "$a"; then
    return 0
  elif ! prerelease "$b"; then
    return 1
  else
    highest=$(printf '%s\n%s\n' "$a" "$b" | sort -V | tail -1)
    [[ "$highest" == "$a" ]]
  fi
}
# The files of what sites get that differ between $1 and HEAD, on one line.
changed() { git diff --name-only "$1" HEAD -- "${SITES[@]}" | paste -sd ' ' -; }
released_at() { git ls-remote --exit-code --tags origin "refs/tags/$1" > /dev/null; }

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
  valid "$now"
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

# Releases version $1 at commit $2, unless it is released already.
release_one() {
  local now=$1 sha=$2 notes
  if released_at "v$now"; then return; fi
  # The release's words: the description of the pull request that brought it, without the line naming the tool that
  # wrote it; GitHub's own list of what changed, if there is none.
  notes=$(mktemp)
  gh api "repos/$GITHUB_REPOSITORY/commits/$sha/pulls" --jq '.[0].body // ""' | grep -v 'Generated with \[Claude Code\]' > "$notes" || true
  local args=(release create "v$now" --target "$sha" --title "WhatIIIF $now")
  if grep -q '[^[:space:]]' "$notes"; then args+=(--notes-file "$notes"); else args+=(--generate-notes); fi
  if prerelease "$now"; then args+=(--prerelease); fi
  gh "${args[@]}"
  echo "Released $now at $sha."
}

# Points the tag sites call, of version $1's major version, at its release, unless that is a pre-release or the tag is
# on a later release already. (A release made with the workflow's own token starts no workflow, so release.yml, which
# does this for a release made by hand, does not.)
point_major() {
  local now=$1 tag at
  tag=$(major "$now")
  prerelease "$now" && return
  git fetch -q -f origin "refs/tags/v$now:refs/tags/v$now"
  at=$(git ls-remote --tags origin "refs/tags/$tag" | cut -f1)
  [[ "$at" == "$(git rev-parse "v$now^{commit}")" ]] && return
  if [[ -n "$at" ]] && git fetch -q -f origin "refs/tags/$tag:refs/tags/$tag" && above "$(version "$tag")" "$now"; then return; fi
  git tag -f "$tag" "v$now^{commit}" > /dev/null
  git push -q -f origin "refs/tags/$tag"
  echo "$tag points at $now."
}

release() {
  # Live can be run by hand on any branch; a release is of main.
  if [[ "${GITHUB_REF:-refs/heads/main}" != refs/heads/main ]]; then
    echo "Releases are made from main: this is $GITHUB_REF."
    return
  fi
  local now since commit each before=
  now=$(version)
  valid "$now"
  released_at "v$now" && before=yes
  # Every commit on main since the last release that changed engine/VERSION, oldest first: Live keeps only the latest
  # of the runs waiting for it, so one run may find several versions merged since the last. With no release before,
  # just this one.
  since=$(git describe --tags --abbrev=0 --first-parent --match 'v[0-9]*.[0-9]*.[0-9]*' HEAD 2> /dev/null || true)
  if [[ -n "$since" ]]; then
    # The last release first, so a run that stopped before moving its major version's tag is finished by the next.
    point_major "$(version "$since")"
    for commit in $(git rev-list --reverse --first-parent "$since..HEAD" -- engine/VERSION); do
      each=$(version "$commit")
      valid "$each"
      release_one "$each" "$commit"
      point_major "$each"
    done
  fi
  release_one "$now" "$(git rev-parse HEAD)"
  point_major "$now"
  if [[ -n "$before" ]]; then echo "$now is released already."; else echo "$now is released."; fi
}

released() {
  local now tag differ
  now=$(version)
  valid "$now"
  tag="v$now"
  git fetch -q --tags --force origin
  if ! git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then
    echo "::error title=$now is not released::engine/VERSION says $now, which has no release: Live's release job should have made it."
    exit 1
  fi
  if ! prerelease "$now" && [[ "$(git rev-parse "$(major "$now")^{commit}" 2> /dev/null)" != "$(git rev-parse "$tag^{commit}")" ]]; then
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
