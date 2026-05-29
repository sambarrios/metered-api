#!/bin/sh
# Runs DB migrations against the compiled data source, then launches whatever
# CMD was given (default: the API). Migrations are idempotent, so this is safe
# to run on every container start.
set -e

echo "[entrypoint] waiting for migrations..."
npm run migration:run:prod
echo "[entrypoint] migrations applied; starting: $*"
exec "$@"
