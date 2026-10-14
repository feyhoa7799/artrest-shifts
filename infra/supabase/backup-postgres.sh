#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

ENV_FILE="${ARTREST_BACKUP_ENV_FILE:-/etc/artrest-supabase-backup.env}"

fail() {
  printf 'artrest-supabase-backup: %s\n' "$*" >&2
  exit 1
}

[[ -r "$ENV_FILE" ]] || fail "configuration file is not readable: $ENV_FILE"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

required_variables=(
  RESTIC_REPOSITORY
  RESTIC_PASSWORD_FILE
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
)

for variable_name in "${required_variables[@]}"; do
  [[ -n "${!variable_name:-}" ]] || fail "required variable is missing: $variable_name"
done

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
command -v restic >/dev/null 2>&1 || fail "restic is not installed"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is not installed"

db_container="${SUPABASE_DB_CONTAINER:-supabase-db}"
db_name="${SUPABASE_DB_NAME:-postgres}"
db_user="${SUPABASE_DB_USER:-postgres}"
config_dir="${SUPABASE_CONFIG_DIR:-/opt/artrest-supabase}"
backup_root="${BACKUP_WORK_DIR:-/var/backups/artrest-supabase}"

[[ -r "$RESTIC_PASSWORD_FILE" ]] || fail "Restic password file is not readable"
[[ -r "$config_dir/.env" ]] || fail "Supabase environment file is not readable"

mkdir -p "$backup_root" "${RESTIC_CACHE_DIR:-$backup_root/.restic-cache}"
chmod 0700 "$backup_root" "${RESTIC_CACHE_DIR:-$backup_root/.restic-cache}"

work_dir="$(mktemp -d "$backup_root/run-XXXXXXXX")"
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

if [[ "$(docker inspect --format '{{.State.Running}}' "$db_container" 2>/dev/null)" != "true" ]]; then
  fail "database container is not running: $db_container"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
roles_dump="$work_dir/roles-$timestamp.sql"
database_dump="$work_dir/database-$timestamp.dump"

docker exec "$db_container" pg_dumpall \
  --username "$db_user" \
  --roles-only \
  >"$roles_dump"

docker exec "$db_container" pg_dump \
  --username "$db_user" \
  --dbname "$db_name" \
  --format custom \
  --compress 9 \
  --no-owner \
  >"$database_dump"

[[ -s "$roles_dump" ]] || fail "roles dump is empty"
[[ -s "$database_dump" ]] || fail "database dump is empty"

docker exec -i "$db_container" pg_restore --list <"$database_dump" >/dev/null

(
  cd "$work_dir"
  sha256sum "$(basename "$roles_dump")" "$(basename "$database_dump")" >SHA256SUMS
)

cat >"$work_dir/manifest.txt" <<EOF
created_at_utc=$timestamp
database=$db_name
container=$db_container
format=postgres_custom
EOF

restic snapshots --latest 1 >/dev/null 2>&1 || \
  fail "Restic repository is not initialized or is unavailable"

restic backup \
  --tag artrest-supabase \
  --tag postgres \
  "$work_dir" \
  "$config_dir/.env" \
  "$config_dir/docker-compose.yml" \
  "$config_dir/compose.artrest.override.yml"

restic forget \
  --tag artrest-supabase \
  --keep-daily 14 \
  --keep-weekly 8 \
  --keep-monthly 12 \
  --prune

restic check
restic snapshots --latest 1 --tag artrest-supabase

printf 'artrest-supabase-backup: completed at %s\n' "$timestamp"
