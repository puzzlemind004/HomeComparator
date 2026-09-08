# HomeComparator

Un carnet de comparaison personnel pour une recherche d'achat immobilier.
Voir [CONTEXT.md](CONTEXT.md) pour le vocabulaire du domaine et
[docs/adr/](docs/adr/) pour les décisions d'architecture.

## Structure

```
apps/api/    API AdonisJS + Lucid, tests Japa
apps/web/    Front Angular, tests Vitest
docker/      Scripts d'initialisation des conteneurs
```

## Démarrer

Prérequis : Docker et Node 24.

```bash
cp .env.example .env
openssl rand -base64 24       # reporter dans APP_KEY= du .env
                              # puis renseigner POSTGRES_PASSWORD
docker compose up --build
```

L'`APP_KEY` se génère avant le premier démarrage : l'API refuse de booter
sans elle, donc aucune commande passant par `node ace` ne peut la produire
tant qu'elle manque.

Le front est sur http://localhost:4200, l'API sur http://localhost:3333.
Les migrations sont jouées automatiquement au démarrage de l'API, et la
base de test est créée à l'initialisation du volume PostgreSQL.

### Port de PostgreSQL

Le conteneur expose PostgreSQL sur le port **5433** de la machine hôte,
et non 5432 : une instance PostgreSQL installée localement occupe souvent
ce port et gagnerait la course à la liaison, ce qui produit des erreurs
d'authentification déroutantes. Ajuster `POSTGRES_PORT` si besoin.

## Développer

Les deux applications se lancent séparément, PostgreSQL restant dans Docker :

```bash
docker compose up -d postgres

cd apps/api && npm install && npm run dev     # http://localhost:3333
cd apps/web && npm install && npm start       # http://localhost:4200
```

Le serveur de développement Angular relaie `/api` vers l'API
(voir `apps/web/proxy.conf.json`), comme le fait nginx en production.

## Vérifier

Chaque application porte les mêmes trois commandes, que la CI exécute :

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Japa côté API, Vitest côté front
```

Les tests fonctionnels de l'API tournent sur `homecomparator_test`, base
distincte de celle de développement et créée automatiquement à
l'initialisation du volume PostgreSQL. Leur configuration vient de
`apps/api/.env.test` :

```bash
cp apps/api/.env.test.example apps/api/.env.test
```

Les tests du front n'utilisent pas TestBed : la logique vit dans des
services et des composants que l'on peut instancier avec un simple
`Injector`.

## Contrats entre le front et l'API

Le front et l'API ne partagent pas de source TypeScript commune. Chacun
décrit les formes qu'il manipule, et le front traduit à la frontière :

```
apps/api/app/models/       modèles Lucid, calqués sur la base
apps/web/src/app/biens/
  bien.api.ts              les formes échangées avec l'API
  bien.ts                  les modèles que l'écran affiche
  bien.adapter.ts          la traduction entre les deux
```

Le modèle d'affichage ne porte que ce qu'un écran montre : les dates de
création et de modification, renvoyées par l'API, n'y figurent pas tant
qu'aucun écran ne les affiche. L'adapter est le seul endroit du front qui
connaisse les deux formes ; partout ailleurs on ne manipule que le modèle
d'affichage.

Conséquence assumée : une divergence entre les deux côtés se rattrape par
les tests fonctionnels Japa, pas par le compilateur.
