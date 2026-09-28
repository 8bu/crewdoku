#!/bin/sh
# Branch name → Cloudflare Workers Previews name, shared by preview.yml's two
# jobs (deploy on push, cleanup on branch delete) so both derive the same name.
#
# Usage: preview-name.sh [branch]   # defaults to $GITHUB_REF_NAME
#
# A Preview is served at <name>-crewdoku.<subdomain>.workers.dev, and each label
# of a hostname is capped at 63 characters, so the rules are:
#
#   - lowercase; every run of characters outside [a-z0-9] becomes one '-'
#   - no leading or trailing '-'
#   - first character is a letter ('b-' is prepended when it is not)
#   - '<name>-crewdoku' fits in 63 characters; a longer slug is truncated and
#     given a '-<sha1 of the branch>' tail so distinct branches stay distinct
#
# Deterministic: same branch in, same name out, on any host.
set -eu

# Byte-wise case folding and character classes: 'ü' must count as a separator,
# not as a letter, whatever locale the runner happens to have.
LC_ALL=C
export LC_ALL

suffix='-crewdoku'                      # the Worker name appended by Previews
max=$((63 - ${#suffix}))                # longest DNS label the name may occupy

branch=${1:-${GITHUB_REF_NAME:-}}
if [ -z "$branch" ]; then
  echo 'preview-name: no branch name given (pass one, or set GITHUB_REF_NAME)' >&2
  exit 1
fi

slug=$(printf '%s' "$branch" \
  | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz' \
  | sed -e 's/[^a-z0-9][^a-z0-9]*/-/g' -e 's/^-//' -e 's/-$//')

# A Preview name must start with a letter: "123-hotfix" is not a legal label.
case $slug in
  [a-z]*) ;;
  *) slug="b-$slug" ;;
esac
# The prefix can itself leave a trailing dash when the branch was all
# separators ("___"), and a lone 'b' is the floor for a real hostname.
slug=$(printf '%s' "$slug" | sed -e 's/-$//')
[ -n "$slug" ] || slug=b

if [ ${#slug} -gt "$max" ]; then
  # Hash the branch, not the slug, so the tail survives any later change to the
  # slug rules. sha1sum is coreutils; the fallbacks cover shasum and openssl.
  if command -v sha1sum >/dev/null 2>&1; then
    digest=$(printf '%s' "$branch" | sha1sum)
  elif command -v shasum >/dev/null 2>&1; then
    digest=$(printf '%s' "$branch" | shasum -a 1)
  else
    digest=$(printf '%s' "$branch" | openssl dgst -sha1)
  fi
  hash=$(printf '%s' "$digest" | cut -c1-6)
  # 6 for the hash and 1 for its '-' come out of the budget; re-trim so a
  # truncated name never ends in a dash.
  slug=$(printf '%s' "$slug" | cut -c1-$((max - 7)) | sed -e 's/-$//')
  slug="$slug-$hash"
  echo "preview-name: '$branch' is too long, using '$slug'" >&2
fi

printf '%s\n' "$slug"
