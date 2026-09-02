#!/usr/bin/env bash
set -euo pipefail

readonly project_directory="${HOME}/projects/raspi5-control-center"
export NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"

# Load the owner's active NVM Node version without hard-coding its patch path.
source "${NVM_DIR}/nvm.sh"
cd "${project_directory}"
exec node apps/api/dist/index.js
