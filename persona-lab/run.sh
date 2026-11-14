#!/bin/bash
# Runs the persona-lab engine on this app.
#
#   bash persona-lab/run.sh persona-lab/config [engine options]
#
# The engine is a repository of its own. It is taken from PERSONA_LAB_ENGINE
# (the engine/ directory of a clone) or, when that is not set, from a clone
# called persona-lab next to this repository. The configs, runs/ and history/
# stay here.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="${PERSONA_LAB_ENGINE:-$REPO/../persona-lab/engine}"
if [ ! -f "$ENGINE/run.sh" ]; then
  echo "persona-lab engine not found at $ENGINE" >&2
  echo "clone the persona-lab repository next to this one, or set PERSONA_LAB_ENGINE to its engine/ directory" >&2
  exit 1
fi
exec bash "$ENGINE/run.sh" "$@"
