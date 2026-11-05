#!/usr/bin/env sh
# Creates .env with random local-only secrets if it does not exist.
set -e
cd "$(dirname "$0")/../.."
if [ -f .env ]; then echo ".env already exists - leaving it untouched"; exit 0; fi
rnd() { head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20; }
sed -e "s/^AEGIS_DB_PASSWORD=.*/AEGIS_DB_PASSWORD=$(rnd)/" \
    -e "s/^AEGIS_DEV_PASSWORD=.*/AEGIS_DEV_PASSWORD=$(rnd)/" .env.example > .env
echo "Created .env (local only, gitignored). Dev login password is AEGIS_DEV_PASSWORD in .env"
