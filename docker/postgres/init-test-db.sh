#!/bin/sh
set -e

# La base de test est créée à l'initialisation du volume : les tests
# fonctionnels tournent sur une base distincte de celle de développement,
# sans geste manuel après un clone.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test OWNER ${POSTGRES_USER};
EOSQL
