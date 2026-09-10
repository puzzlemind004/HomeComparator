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
openssl rand -base64 24       # reporter dans POSTGRES_PASSWORD= du .env
                              # puis choisir APP_PASSWORD
docker compose up --build
```

L'`APP_KEY` se génère avant le premier démarrage : l'API refuse de booter
sans elle, donc aucune commande passant par `node ace` ne peut la produire
tant qu'elle manque.

L'`APP_PASSWORD` est le mot de passe unique qui protège l'accès au carnet
(ADR-0011). Il est lui aussi obligatoire : mieux vaut un conteneur qui
s'arrête qu'un carnet déployé en accès libre. Le changer ne déconnecte pas
les sessions ouvertes, qui vivent en base ; vider la table `sessions` le
fait, et c'est le geste à faire si le mot de passe a fui.

Le front est sur http://localhost:4200, l'API sur http://localhost:3333.
Les migrations sont jouées automatiquement au démarrage de l'API, et la
base de test est créée à l'initialisation du volume PostgreSQL.

### Ce qui est exposé, et où

Seul le front est publié sur toutes les interfaces de la machine : c'est le
seul service qui ait vocation à être joint de l'extérieur, et nginx y relaie
`/api` vers l'API par le réseau interne de Docker.

PostgreSQL et l'API sont publiés sur la **boucle locale uniquement**
(`127.0.0.1`). Ces deux publications ne servent qu'au développement — lancer
l'API hors conteneur, jouer les tests fonctionnels contre la base — et n'ont
aucun usage en production. Les lier ainsi évite deux choses : une base
joignable depuis le réseau, alors que le carnet est saisi à la main et
irremplaçable (ADR-0001, ADR-0007) ; et un accès direct à l'API qui
court-circuiterait nginx, donc la limitation des tentatives de connexion, qui
compte par adresse et suppose que l'en-tête `X-Forwarded-For` soit posé par le
proxy (ADR-0011).

Ce qui est fermé au réseau reste ouvert depuis l'hôte : qui a un accès à la
machine joint ces deux ports comme avant. C'est délibéré — le développement
en dépend — et cela situe la limite : ces liaisons protègent du réseau, pas
de quelqu'un déjà entré.

Le conteneur expose PostgreSQL sur le port **5433** de la machine hôte,
et non 5432 : une instance PostgreSQL installée localement occupe souvent
ce port et gagnerait la course à la liaison, ce qui produit des erreurs
d'authentification déroutantes. Ajuster `POSTGRES_PORT` si besoin.

## Déployer

Le déploiement se fait par Docker sur un VPS personnel doté d'un nom de
domaine (ADR-0003, ADR-0007), et **suppose un pare-feu n'exposant que les
ports 80 et 443**. Les publications sur la boucle locale ci-dessus ne
dispensent pas de ce réglage : elles évitent d'en dépendre pour PostgreSQL et
l'API, mais tout autre port ouvert sur la machine le reste. L'hypothèse est
écrite ici pour être vérifiée au moment du déploiement, plutôt que supposée.

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

Y reporter le `POSTGRES_PASSWORD` du `.env` racine : c'est la même base,
dans le même conteneur, et ce mot de passe se génère à l'installation.

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
