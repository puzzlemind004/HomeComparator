#!/bin/sh
set -e

# Les migrations tournent au démarrage. `migration:run --force` est requis
# hors développement ; la commande est idempotente, un conteneur qui
# redémarre ne rejoue rien.
echo "Exécution des migrations…"
node ace migration:run --force

exec "$@"
