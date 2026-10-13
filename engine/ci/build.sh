#!/usr/bin/env bash
# Run by the deploy workflow on a GitHub runner. Locally, just run `npm run build`.
set -euo pipefail

sudo apt-get update -qq
sudo apt-get install -y -qq libvips-tools
vips --version

npm ci
npm run build
