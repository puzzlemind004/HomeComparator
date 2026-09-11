# syntax=docker/dockerfile:1

# --- Étape de build ---------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN node ace build

# --- Étape d'exécution ------------------------------------------------------
FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./

# La version déployée, transmise par la construction et figée dans l'image
# (#67). Un argument et non une variable d'exécution : elle désigne ce que
# l'image contient, et une image à qui l'on pourrait attribuer une autre
# version au démarrage ne dirait plus rien de sûr. `dev` par défaut, pour
# qu'une construction locale n'ait pas à s'inventer un numéro.
#
# C'est ici, et ici seulement, que le nom change : `VERSION` au dehors —
# l'argument que Compose et la CI passent —, `APP_VERSION` au dedans, où
# `start/env.ts` le lit. Les deux espaces de noms sont distincts et leurs
# conventions aussi : `VERSION` désigne ce qu'on construit, tandis que les
# variables lues par l'API portent toutes le préfixe `APP_` (`APP_KEY`,
# `APP_PASSWORD`). Cette ligne est le seul endroit à connaître les deux.
ARG VERSION=dev
ENV APP_VERSION=$VERSION

# Le dossier des photos, créé et donné à `node` avant que l'utilisateur ne
# change (#13). Le volume se monte ici : Docker recopie la propriété du point
# de montage, sans quoi l'API tournant en `node` écrirait dans un dossier
# appartenant à root.
RUN mkdir -p /app/stockage/photos && chown -R node:node /app/stockage

# L'entrypoint joue les migrations avant de démarrer : `docker compose up`
# ne doit demander aucune intervention manuelle.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3333

# Le healthcheck que la dispense d'authentification de `GET /health`
# invoquait sans qu'il existe (#25, ADR-0011). Il interroge le niveau
# anonyme, qui est très exactement ce pour quoi ce niveau existe : l'état du
# service et celui de la base, sans rien apprendre de plus à qui demande.
#
# `wget` plutôt que `curl` : BusyBox fournit le premier dans l'image Alpine,
# et le second demanderait un paquet de plus pour la même requête. `-q -O -`
# jette le corps — seul le code de retour compte, et un corps écrit dans le
# conteneur à chaque intervalle ne servirait personne.
#
# Le port est écrit en clair et non tiré de `$PORT` : `HEALTHCHECK` ne passe
# pas par un shell qui l'étendrait, et `EXPOSE` juste au-dessus fige de
# toute façon la même valeur.
#
# `start-period` couvre les migrations que l'entrypoint joue avant de
# démarrer : pendant ce temps un échec ne compte pas, et le conteneur n'est
# pas déclaré malade pour avoir fait ce qu'on lui demande.
#
# **La base injoignable rend le conteneur malade, et c'est voulu.** La route
# rend alors un 503, que `wget` traite en échec : l'API est pourtant vivante,
# et on pourrait juger qu'elle n'a pas à être déclarée en panne pour une
# panne qui n'est pas la sienne. C'est le contraire qui est retenu. Ce
# healthcheck est ce qui permet au déploiement d'attendre que la pile soit
# saine avant de se déclarer réussi (#66) ; un carnet dont la base ne répond
# pas n'est pas un carnet qui marche, et le déclarer sain ferait passer pour
# réussi un déploiement qui ne sert rien à l'acheteur.
#
# La portée en est bornée : `condition: service_healthy` ne gouverne que le
# démarrage, donc une panne passagère ne referme pas `web` derrière elle.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3333/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "bin/server.js"]
