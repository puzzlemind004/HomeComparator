# Sauvegarde et restauration

Les données du carnet sont saisies entièrement à la main (ADR-0001) : un Bien
perdu ne se retrouve pas, et une Photo de visite encore moins — on ne repasse
pas la prendre. La sauvegarde est donc une exigence et non une commodité
(ADR-0007).

Ce document dit **ce qui tourne**, **comment vérifier que ça tourne encore**,
et surtout **comment restaurer** — la seule partie qui compte vraiment le jour
où elle sert.

## Ce qui tourne

Un service de la pile, `sauvegarde`, produit chaque nuit à **3 h 00 UTC** :

- un `pg_dump` compressé de la base, `AAAAMMJJ-HHMMSS-<sorte>.sql.gz` ;
- une archive des Photos, `AAAAMMJJ-HHMMSS-<sorte>-photos.tar.gz`.

Les deux portent le même horodatage et se restaurent ensemble : la base ne
contient que les **noms** des fichiers de Photos (ADR-0014), et une base
restaurée sans elles affiche des galeries vides.

`<sorte>` vaut `quotidienne`, ou `hebdomadaire` le dimanche. La rétention
garde **7 quotidiennes et 4 hebdomadaires** et supprime le reste ; chaque
suppression emporte le dump et son archive de Photos ensemble.

Un service de la pile plutôt qu'un `crontab` posé sur le serveur, et ce n'est
pas un détail de goût : ce qui décrit la production vit dans le dépôt et se
déploie d'un geste, tandis qu'une sauvegarde qui vit dans un crontab que
personne ne relit est une sauvegarde qui cesse de tourner sans le dire.

### Où vivent les fichiers

Deux volumes Docker distincts, et la séparation est délibérée (#75) :

| Volume | Contenu | Qui le monte |
| --- | --- | --- |
| `sauvegardes-data` | les dumps et les archives de Photos | `sauvegarde` seul, en écriture |
| `sauvegardes-etat` | l'horodatage de la dernière réussite | `sauvegarde` en écriture, `api` en **lecture seule** |

L'API ne voit donc jamais les archives. Un dump porte le carnet entier, et le
processus qui sert les requêtes HTTP publiques n'a aucune raison de l'avoir
dans son système de fichiers : une faille de traversée de chemin y donnerait
accès à tout ce que la sauvegarde existe pour protéger, en plus des données
vives.

Les deux volumes survivent à la reconstruction des conteneurs — c'est même
leur raison d'être.

## Vérifier que ça tourne encore

**C'est la route de santé qui le dit**, session ouverte (#67) :

```bash
curl -s -b cookies.txt https://home-comparator.puzzlemind.fr/api/health
```

```json
{"status":"ok","database":"ok","version":"0.1.0","derniereSauvegarde":"2026-09-13T03:00:04.000Z"}
```

`derniereSauvegarde` est déposé **en dernier** par le script, et seulement si
le dump et l'archive ont abouti *et* se relisent. Une date ancienne signifie
donc que les sauvegardes ont cessé, pas qu'un fichier a mal été écrit.

C'est ce qui ferme la boucle : un conteneur mort passerait inaperçu, une date
qui vieillit se voit. `null` signifie qu'aucune sauvegarde n'a jamais réussi.

Les journaux disent le détail :

```bash
docker compose -f docker-compose.prod.yml logs sauvegarde
```

## Sauvegarder maintenant, sans attendre la nuit

```bash
docker compose -f docker-compose.prod.yml exec sauvegarde sauvegarder.sh
```

C'est le geste à faire **avant toute opération risquée** — une migration
inhabituelle, une suppression en masse, une bascule de serveur.

## Restaurer

> Restaurer **écrase** les données en place. Avant de commencer, faire une
> sauvegarde de l'état actuel (commande ci-dessus) : elle ne coûte rien et
> c'est le seul filet si l'on restaure la mauvaise date.

### 1. Choisir la sauvegarde

```bash
docker compose -f docker-compose.prod.yml exec sauvegarde ls -la /sauvegardes/archives
```

Les noms se trient chronologiquement. Retenir le préfixe **sans extension**,
par exemple `20260913-030000-quotidienne`.

### 2. Restaurer la base

```bash
docker compose -f docker-compose.prod.yml exec sauvegarde sh -c \
  'gzip -dc /sauvegardes/archives/20260913-030000-quotidienne.sql.gz \
   | psql --host=postgres --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
          -v ON_ERROR_STOP=1'
```

Le dump est pris `--clean --if-exists` : il supprime les tables existantes
avant de les recréer, donc il se restaure sur une base peuplée sans geste
préalable. C'est l'état dans lequel on restaure vraiment — on répare un carnet
qui existe, on ne repart pas d'une base vierge.

`ON_ERROR_STOP=1` arrête à la première erreur au lieu de poursuivre sur une
restauration partielle, qui serait le pire des résultats : une base à moitié
restaurée ressemble à une base qui marche.

Quelques lignes `set_config` et `setval` s'affichent : c'est normal, ce sont
les séquences que le dump repositionne.

### 3. Restaurer les Photos

```bash
docker compose -f docker-compose.prod.yml exec sauvegarde sh -c \
  'tar -xzf /sauvegardes/archives/20260913-030000-quotidienne-photos.tar.gz -C /photos'
```

**Le volume des Photos est monté en lecture seule dans `sauvegarde`**, et
cette commande échouera donc telle quelle. C'est voulu : la sauvegarde lit les
Photos, elle n'a pas à les écrire. Pour restaurer, passer par un conteneur
jetable qui monte le même volume en écriture :

```bash
docker run --rm \
  -v homecomparator_photos-data:/photos \
  -v homecomparator_sauvegardes-data:/archives:ro \
  alpine tar -xzf /archives/20260913-030000-quotidienne-photos.tar.gz -C /photos
```

Le préfixe des volumes est celui du projet Compose — `docker volume ls` le
donne.

L'archive porte des chemins **relatifs** : elle se déverse dans n'importe quel
dossier, et n'impose pas son point de montage d'origine.

### 4. Vérifier

```bash
# Les Biens sont revenus.
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'SELECT count(*) FROM biens;'

# Les Photos aussi.
docker compose -f docker-compose.prod.yml exec sauvegarde ls /photos
```

Puis ouvrir le carnet dans un navigateur et vérifier qu'une fiche de Bien
affiche bien ses Photos — c'est la vérification qui couvre les deux moitiés à
la fois, la base ne portant que les noms des fichiers.

Redémarrer l'API n'est pas nécessaire : elle ne garde rien en mémoire entre
deux requêtes.

## Ce que cette sauvegarde ne couvre pas

**La copie hors-site est hors périmètre**, et c'est une décision explicite
d'ADR-0007 : les snapshots de l'hébergeur constituent le second niveau en
attendant. Les deux ne couvrent pas la même chose — le snapshot restaure le
VPS entier, le `pg_dump` permet de récupérer une donnée précise supprimée par
erreur sans toucher au reste.

Conséquence à garder en tête : **une perte du VPS emporte les sauvegardes avec
les données**, les deux vivant sur la même machine. C'est le snapshot de
l'hébergeur qui couvre ce cas-là, pas ce dispositif.

## Vérification au premier déploiement

Ce ticket n'a pas de test automatisé, et c'est assumé plutôt que contourné par
un test qui rassurerait sans rien exercer : ce qui est à vérifier est qu'un
dump produit par ce service, dans cette pile, se restaure vraiment.

La vérification a été faite à l'implémentation, sur une pile complète : deux
Biens et deux Photos sauvegardés, la table supprimée et les fichiers effacés,
puis restaurés par la procédure ci-dessus — les deux Biens et les deux Photos
sont revenus à l'identique, contenu compris. La rétention a été éprouvée sur
un historique fabriqué de 10 quotidiennes et 6 hebdomadaires : 7 et 4 gardées,
aucun orphelin.

À refaire **au premier déploiement en production**, sur les vraies données :

1. `docker compose -f docker-compose.prod.yml exec sauvegarde sauvegarder.sh`
2. vérifier que la route de santé rend la date fraîche ;
3. restaurer ce dump dans une base jetable et compter les Biens :

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -c 'CREATE DATABASE verification;'

docker compose -f docker-compose.prod.yml exec sauvegarde sh -c \
  'gzip -dc /sauvegardes/archives/<la-sauvegarde>.sql.gz \
   | psql --host=postgres --username="$POSTGRES_USER" --dbname=verification \
          -v ON_ERROR_STOP=1'

docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d verification -c 'SELECT count(*) FROM biens;'

docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -c 'DROP DATABASE verification;'
```

Restaurer dans une base jetable plutôt que dans la vraie : la vérification ne
doit pas être plus risquée que ce qu'elle vérifie.
