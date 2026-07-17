#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Build the server & client images for linux/amd64 (TrueNAS) and push to GHCR.
#
# Your dev machine is arm64 (Apple Silicon) and TrueNAS is amd64, so we
# cross-build with buildx and push straight to the registry.
#
# One-time prerequisites:
#   1. Create a GitHub Personal Access Token (classic) with the 'write:packages' scope.
#   2. Log in to GHCR (token piped in, never echoed to history):
#        echo <YOUR_PAT> | docker login ghcr.io -u <github-username> --password-stdin
#
# Usage:
#   ./scripts/deploy/build-and-push.sh [tag]     # tag defaults to "latest"
#   GHCR_OWNER=myorg ./scripts/deploy/build-and-push.sh v1.2.0
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GHCR_OWNER="${GHCR_OWNER:-danieltucker}"
TAG="${1:-latest}"
REGISTRY="ghcr.io"
PLATFORM="linux/amd64"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Ensure a buildx builder exists and is selected.
if ! docker buildx inspect newtab-builder >/dev/null 2>&1; then
  docker buildx create --name newtab-builder >/dev/null
fi
docker buildx use newtab-builder

echo "==> server  ->  $REGISTRY/$GHCR_OWNER/newtab-server:$TAG  ($PLATFORM)"
docker buildx build --platform "$PLATFORM" \
  -t "$REGISTRY/$GHCR_OWNER/newtab-server:$TAG" \
  --push "$ROOT/server"

echo "==> client  ->  $REGISTRY/$GHCR_OWNER/newtab-client:$TAG  ($PLATFORM)"
docker buildx build --platform "$PLATFORM" \
  -t "$REGISTRY/$GHCR_OWNER/newtab-client:$TAG" \
  --push "$ROOT/client"

echo
echo "==> Done. Pushed:"
echo "    $REGISTRY/$GHCR_OWNER/newtab-server:$TAG"
echo "    $REGISTRY/$GHCR_OWNER/newtab-client:$TAG"
echo
echo "Note: new GHCR packages are private by default. To let TrueNAS pull without a"
echo "login, make them public (GitHub > your profile > Packages > each package >"
echo "Package settings > Change visibility), or 'docker login ghcr.io' on the NAS."
