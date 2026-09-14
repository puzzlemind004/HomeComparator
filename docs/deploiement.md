# Déploiement

Ce document dit **quelle valeur remplir, où, et quand** pour que le carnet
réponde en HTTPS sur son nom de domaine, puis décrit la bascule qui libère les
ports du VPS.

Le déploiement est **automatique** depuis #70 : l'acheteur pose une version
depuis l'onglet Actions, et tout le reste s'enchaîne. Voir « Déployer une
nouvelle version », plus bas, et ADR-0018 pour les décisions.

Ce qui suit décrit d'abord la **mise en place** — ce qu'il faut avoir posé une
fois pour que ce mécanisme tourne — puis la procédure manuelle, qui reste
valable et sert de recours quand le workflow ne peut pas s'exécuter.

## Trois scripts déroulent ces procédures

Le document reste la référence — il explique *pourquoi* chaque geste —, mais on
n'a pas à le suivre à la main : trois wizards l'exécutent pas à pas, en
vérifiant à chaque étape.

```bash
# Mise en place du déploiement automatique (#70), une fois pour toutes.
# Depuis la racine du dépôt, sur la machine de développement :
bash scripts/preparer-deploiement.sh
```

Les deux autres servent à la première installation, et à la bascule :

```bash
# 1. Sur la machine de développement, à la racine du dépôt :
bash scripts/publier-images.sh

# 2. Copier la pile et le second wizard sur le VPS :
scp docker-compose.prod.yml Caddyfile scripts/basculer-vps.sh root@srv571823:/root/

# 3. Puis, connecté au VPS :
ssh root@srv571823
bash /root/basculer-vps.sh
```

**Le second tourne sur le VPS, et c'est une contrainte et non un confort** : les
trois secrets qu'il génère ne doivent jamais quitter le serveur, ce qu'un
script piloté depuis une autre machine ne pourrait pas garantir. Il est
interruptible — les valeurs déjà écrites sont reprises à la relance — et ne
coupe rien avant d'avoir tout vérifié.

## Ce qui va où

Trois endroits reçoivent des valeurs, et ils ne se valent pas. La distinction
qui compte est la dernière colonne : **ce qui ne quitte jamais le serveur**.

| Valeur | Où elle vit | Quand la poser | Quitte le serveur ? |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | `.env` du VPS | avant le premier démarrage | **jamais** |
| `APP_KEY` | `.env` du VPS | avant le premier démarrage | **jamais** |
| `APP_PASSWORD` | `.env` du VPS | avant le premier démarrage | **jamais** |
| `POSTGRES_USER`, `POSTGRES_DB` | `.env` du VPS | avant le premier démarrage | sans objet — ce ne sont pas des secrets |
| `DOMAINE` | `.env` du VPS | avant le premier démarrage | sans objet |
| `COURRIEL_ACME` | `.env` du VPS | avant le premier démarrage | sans objet |
| `GHCR_COMPTE` | `.env` du VPS | avant le premier démarrage | sans objet |
| `VERSION` | `.env` du VPS | écrite par le workflow à chaque déploiement | sans objet |
| Enregistrement DNS `A` | zone du domaine | **avant** le premier démarrage de Caddy | sans objet |
| `VPS_CLE_SSH` | secrets GitHub | à la mise en place (#70) | la clé **privée** ne quitte pas GitHub ; la publique va sur le VPS |
| `VPS_HOTE`, `VPS_UTILISATEUR`, `VPS_DOMAINE`, `VPS_EMPREINTE` | secrets GitHub | à la mise en place (#70) | sans objet — ce ne sont pas des secrets, mais ils vivent là où le workflow les lit |
| Jeton du registre | **nulle part** | jamais | n'existe pas — voir plus bas |

`VERSION` est la seule ligne du `.env` que le workflow écrit. Tout le reste du
fichier est posé à la main, une fois, et n'est jamais touché ensuite.

### Les trois secrets qui ne quittent jamais le serveur

`POSTGRES_PASSWORD`, `APP_KEY` et `APP_PASSWORD` se génèrent **sur le VPS**, y
restent, et ne sont recopiés nulle part : ni dans le dépôt, ni dans les secrets
GitHub, ni dans un gestionnaire de mots de passe partagé. Rien d'autre ne les
lit — le workflow de déploiement relance la pile, il ne renseigne pas son
environnement.

`APP_PASSWORD` est la seule exception pratique : c'est le mot de passe qui se
tape à chaque connexion (ADR-0011), donc le seul dont le propriétaire doive se
souvenir. Il se choisit plutôt qu'il ne se génère, et il est raisonnable qu'il
vive aussi dans un gestionnaire de mots de passe personnel — ce qui n'est pas
« quitter le serveur » au sens de ce tableau.

```bash
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 24   # APP_KEY
```

`APP_KEY` se génère **avant** le premier démarrage : l'API refuse de booter
sans elle, donc aucune commande passant par `node ace` ne peut la produire tant
qu'elle manque.

### Le jeton de registre qui n'existe pas

Les images sont privées sur `ghcr.io` (ADR-0017), et **aucun identifiant de
registre ne réside sur le VPS**. Le workflow de déploiement ouvre la session
avec le jeton de son exécution, tire les images, puis se déconnecte.

C'est délibéré : un jeton personnel déposé sur le serveur est un secret qui
expire, et son expiration casse un déploiement des mois plus tard sur un
`unauthorized` dont le lien avec la cause n'est pas immédiat.

D'ici #70, le premier déploiement se fait à la main, et cette connexion aussi
est éphémère — voir « Publier les images à la main », plus bas.

### Les cinq secrets GitHub, et l'utilisateur qui va avec

`scripts/preparer-deploiement.sh` les pose, et fait au passage le reste de la
mise en place. Ce qu'il établit :

| Secret | Ce qu'il vaut |
| --- | --- |
| `VPS_HOTE` | le nom ou l'IP du serveur |
| `VPS_UTILISATEUR` | `deploy` — voir ci-dessous |
| `VPS_DOMAINE` | le nom sur lequel la vérification finale interroge le carnet |
| `VPS_CLE_SSH` | la moitié privée d'une clé ed25519 dédiée au déploiement |
| `VPS_EMPREINTE` | la clé d'hôte du serveur, au format `known_hosts` |

**Le workflow se connecte sous `deploy` et non sous root**, avec une clé propre
au déploiement. Une clé dédiée se révoque seule, sans casser l'accès personnel ;
un secret de CI vaut l'accès qu'il ouvre, et celui-ci n'ouvre que ce qu'un
déploiement fait réellement (#76).

Une limite à énoncer plutôt qu'à taire : `deploy` est membre du groupe `docker`,
ce qui **équivaut en pratique à root sur l'hôte** — un conteneur privilégié
monte le système de fichiers de la machine. C'est assumé, le déploiement
pilotant Docker. « Non privilégié » désigne donc ici l'absence de `sudo` et de
session root, et non une impossibilité d'escalade.

`VPS_EMPREINTE` est posée depuis un secret plutôt que récoltée par le workflow
au moment de se connecter. Demander sa clé à la machine à laquelle on s'apprête
à faire confiance ne vérifie rien : un intermédiaire qui répondrait à sa place
serait cru sur parole. Le wizard la relève et demande de la comparer à celle lue
sur la console du serveur, chez l'hébergeur.

**Cette comparaison est la première chose que le wizard fait, avant sa première
connexion, et l'ordre fait partie de la mesure** (#86). Le même raisonnement qui
interdit de récolter l'empreinte à la volée interdit de parler au serveur
d'abord et de le vérifier ensuite : une empreinte confirmée après que
l'utilisateur `deploy` a été créé, la clé publique installée et un mot de passe
d'administration présenté ne protège plus rien. Une fois confirmée, elle est
**opposée** à chacune des connexions du wizard — qui refusent donc l'hôte
qu'elles ne reconnaissent pas, exactement comme le fera le workflow.

### Le DNS, qui doit précéder le reste

L'enregistrement `A` du domaine doit pointer vers l'IP du VPS **avant** le
premier démarrage de Caddy, et sa propagation doit être effective :

```bash
dig +short home-comparator.puzzlemind.fr
```

Ce n'est pas une précaution de confort. Let's Encrypt joint ce nom sur le port
80 pour valider la demande, et **plafonne les échecs à cinq par nom et par
heure**. Un DNS non propagé consomme ces tentatives, et l'attente qui suit se
paie au plus mauvais moment — pendant la bascule, quand rien ne répond.

## Publier les images à la main (première fois seulement)

#70 automatisera ce geste ; en attendant, les images n'existent pas et le
Compose de production pointerait dans le vide.

La construction se fait **en local et non sur le VPS** : la machine a un cœur
et pas de swap, et y compiler un bundle Angular expose à l'arrêt du processus
par l'OOM killer (ADR-0017).

```bash
# Depuis un clone du dépôt, sur une machine de développement.
VERSION=0.1.0
COMPTE=puzzlemind004

echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$COMPTE" --password-stdin

docker build -t "ghcr.io/$COMPTE/homecomparator-api:$VERSION" \
  --target production --build-arg "VERSION=$VERSION" ./apps/api
docker build -t "ghcr.io/$COMPTE/homecomparator-web:$VERSION" \
  --target production ./apps/web

docker push "ghcr.io/$COMPTE/homecomparator-api:$VERSION"
docker push "ghcr.io/$COMPTE/homecomparator-web:$VERSION"

docker logout ghcr.io
```

`--build-arg VERSION` n'est pas décoratif : c'est lui qui fige le numéro dans
l'image, et c'est ce numéro que la route de santé rend (#67). Une image
construite sans lui porte `dev`, et le carnet déployé dirait `dev` à qui
l'interroge.

Vérifier ensuite sur GitHub que les deux paquets sont en **visibilité privée**.
Les images publiées rendent le code compilé lisible par qui connaît l'URL, et
une image publique ne se dépublie pas utilement : elle est déjà tirée et mise
en cache ailleurs.

## La bascule

C'est la partie risquée : une machine en production, et une fenêtre où rien ne
répond. L'ordre compte, et le principe est **vérifier avant de couper**.

L'inventaire (#68) a montré que 80 et 443 étaient tenus par un nginx installé
sur l'hôte, servant cinq vhosts avec leurs certificats certbot. Aucun de ces
services n'est utilisé : les arrêter libère les deux ports, et rend au passage
mémoire et processeur à une machine qui n'en a guère.

### 1. Préparer, pendant que l'ancien tourne encore

Rien de cette étape n'interrompt quoi que ce soit.

```bash
# Sur le VPS, dans le dossier qui portera la pile.
mkdir -p /opt/homecomparator && cd /opt/homecomparator
```

Y déposer trois fichiers, et trois seulement — le dépôt n'a pas à être cloné
sur le serveur :

- `docker-compose.prod.yml`
- `Caddyfile`
- `.env`, dérivé de `.env.prod.example` et renseigné selon le tableau ci-dessus

Puis vérifier que Compose lit tout ce dont il a besoin, **sans rien démarrer** :

```bash
docker compose -f docker-compose.prod.yml config -q && echo "configuration lisible"
```

Cette commande échoue en nommant la variable manquante si le `.env` est
incomplet. C'est le moment de le découvrir, pas après avoir coupé nginx.

**Elle ne vérifie pourtant pas tout, et l'angle mort est piégeux** : Compose ne
regarde pas les fichiers montés. Sans `Caddyfile` dans le dossier,
`config -q` sort en 0 comme si tout allait bien — puis Docker crée un
**dossier** vide à sa place au démarrage, et Caddy refuse de partir. La panne
est franche, mais elle tombe après la coupure, dans la fenêtre où plus rien ne
répond, sur une machine où Let's Encrypt ne tolère que cinq échecs par nom et
par heure.

Vérifier donc le fichier lui-même, et pas seulement le Compose :

```bash
test -f Caddyfile && echo "Caddyfile présent" || echo "MANQUANT"
docker run --rm -e DOMAINE -e COURRIEL_ACME --env-file .env \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Cette seconde commande couvre le cas voisin — le `Caddyfile` présent mais
fautif —, qui se paierait au même moment et au même prix.

Tirer les images tout de suite, toujours sans démarrer : c'est long, et autant
que ce le soit pendant que l'ancien site répond encore.

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$COMPTE" --password-stdin
docker compose -f docker-compose.prod.yml pull
docker logout ghcr.io
```

### 2. Libérer les ports

À partir d'ici, le VPS ne sert plus rien. La fenêtre est ouverte.

```bash
# La pile de l'ancien projet. `down` sans `-v` : les volumes sont CONSERVÉS,
# le temps de s'assurer que rien n'y est regretté.
cd /chemin/vers/cooking-prod && docker compose down

# nginx de l'hôte : arrêté ET désactivé au démarrage, sans quoi il
# reprendrait les ports au prochain redémarrage et Caddy ne se lierait plus.
systemctl stop nginx && systemctl disable nginx

# certbot : les certificats deviennent l'affaire de Caddy. Laisser le timer
# actif entretiendrait un second mécanisme de renouvellement, sur des vhosts
# qui n'existent plus.
systemctl stop certbot.timer && systemctl disable certbot.timer

# PM2 et son application fantôme, relevés par l'inventaire (#68) : un
# gestionnaire de processus qui relance au démarrage une application dont
# plus rien ne dépend. Le détail du démontage relève de #72 ; ce qui
# compte ici est qu'il ne reprenne rien au redémarrage.
pm2 delete all && pm2 unstartup && pm2 kill

# La sauvegarde de 3 h 00 de l'ancienne base devient sans objet. Sans ce
# retrait elle échouerait chaque nuit, en silence. Lister avant de
# modifier : on retire une ligne nommément, on ne vide pas un crontab.
crontab -l
crontab -e   # retirer la ligne de sauvegarde de cooking-prod
```

Vérifier que plus rien ne tient les deux ports avant de continuer :

```bash
ss -lntp | grep -E ':(80|443)\s'   # ne doit rien rendre
```

Puis vérifier qu'**aucun second mécanisme de certificats ne subsiste**. Le
timer arrêté plus haut est celui qu'on connaissait ; le critère porte sur une
absence, et une absence se constate plutôt qu'elle ne se déduit. certbot
s'installe selon les distributions en timer systemd, en service, ou en entrée
de `cron.d` — désactiver l'un laisse les autres :

```bash
systemctl list-timers --all | grep -i 'certbot\|acme'   # ne doit rien rendre
systemctl is-enabled certbot.service 2>/dev/null        # disabled, ou absent
ls /etc/cron.d/ | grep -i 'certbot\|letsencrypt'        # ne doit rien rendre
grep -ri 'certbot\|letsencrypt' /etc/crontab /etc/cron.*/ 2>/dev/null
```

`/etc/letsencrypt` n'est pas supprimé pour autant : les certificats qui s'y
trouvent ne gênent personne une fois que plus rien ne les renouvelle ni ne les
sert, et les effacer n'apporte rien qu'un risque de se tromper de dossier
pendant la fenêtre où le carnet ne répond pas. C'est du ménage, et il se fait
à froid.

### 3. Démarrer

```bash
cd /opt/homecomparator
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f caddy
```

Caddy demande son certificat au premier démarrage. Les journaux disent si
l'obtention a réussi ; en cas d'échec, **lire la cause avant de relancer** —
cinq échecs par nom et par heure, et chaque `up` à l'aveugle en consomme un.

### 4. Vérifier la chaîne complète

Trois vérifications, qui sont les trois derniers critères du ticket. Elles
portent sur la chaîne entière — Caddy, nginx, l'API, la base — et non sur
chaque maillon isolément.

```bash
# Le certificat est valide et le clair redirige vers le chiffré.
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://home-comparator.puzzlemind.fr
curl -sS https://home-comparator.puzzlemind.fr/api/health
```

Puis, dans un navigateur :

1. **La connexion par mot de passe unique** aboutit et le carnet s'affiche.
2. **L'envoi d'une Photo** aboutit, plafond de taille compris : une photo de
   quelques mégaoctets passe, et une série aussi.

Le plafond mérite d'être éprouvé à travers la chaîne et pas seulement sur le
principe, car **trois** plafonds se suivent désormais : l'API refuse au-delà
de 10 Mo par fichier en nommant le fichier en cause (#13), nginx refuse un
corps entier au-delà de 62,9 Mo (`client_max_body_size 60m`, la notation étant
binaire), et Caddy au-delà de 64 Mo.

Ce qui se vérifie est donc l'ordre autant que les valeurs : un envoi trop
lourd d'un seul fichier doit recevoir le message de l'API, qui nomme le
fichier, et non le 413 muet d'un proxy. Mesuré à la mise au point : 20 Mo
atteignent l'API et reçoivent son message, 182 Mo sont arrêtés avant.

### 5. Vérifier la sauvegarde, une fois

La pile porte un service de sauvegarde quotidienne depuis #71, et il démarre
avec le reste. Sa vérification est **manuelle et se fait une fois**, au
premier déploiement : un dump qu'on n'a jamais restauré n'est pas une
sauvegarde.

```bash
docker compose -f docker-compose.prod.yml exec sauvegarde sauvegarder.sh
curl -sS https://home-comparator.puzzlemind.fr/api/health   # session ouverte
```

La route doit rendre une `derniereSauvegarde` fraîche. La procédure complète —
restaurer dans une base jetable et compter les Biens — est dans
`docs/sauvegarde.md`, qui est aussi le document à ouvrir le jour où l'on
restaure pour de vrai.

### 6. Ce qui reste ouvert

Les volumes de l'ancienne pile sont **conservés** et non supprimés : leur sort
se décide une fois passée la période où l'on s'aperçoit qu'on en avait besoin.
La suppression de l'instance PostgreSQL de l'hôte relève de #72 et suppose
d'avoir d'abord rapatrié puis restauré ses données ailleurs (ADR-0015,
ADR-0016) — ajouter et prouver avant de retirer.

## Déployer une nouvelle version

Un seul geste, depuis l'onglet **Actions** de GitHub : workflow « Poser une
version », `Run workflow`, et le numéro — `0.1.0`. Ou, en ligne de commande :

```bash
gh workflow run poser-version.yml -f version=0.1.0
```

Ce qui s'enchaîne ensuite, sans intervention (ADR-0018) :

1. Lint, types, tests et construction des images passent d'abord sur `main`,
   **avant que rien ne soit écrit** : le numéro est consommé dès que le tag est
   poussé, et un échec après coup le brûlerait (#105). Les images sont
   construites sans être poussées — elles partent plus loin, au numéro figé.
2. Le numéro est inscrit dans les deux `package.json`, commité sur `main`,
   tagué `v0.1.0`. Le tag naît d'un `main` à jour, ce qui rend structurellement
   impossible une version posée depuis un clone en retard.
3. Le déploiement vérifie que le commit **descend de `main`** et s'arrête sinon.
4. Lint, types, tests et construction des images sont **rejoués** sur ce commit,
   qui porte cette fois le numéro.
5. Les images partent sur GHCR, privées, taguées `0.1.0`.
6. Le VPS les tire — session vers le registre ouverte avec le jeton de
   l'exécution, refermée ensuite — et la pile démarre en attendant que **chaque
   service soit sain**.
7. Le workflow interroge `https://<domaine>/api/health` **depuis l'extérieur**,
   par le vrai nom et le vrai certificat, jusqu'à réponse favorable ou
   expiration. Il vérifie enfin que l'image qui tourne porte bien ce numéro.

Les migrations sont jouées par l'entrypoint de l'image au démarrage, et sont
idempotentes : un conteneur qui redémarre ne rejoue rien.

### Si le déploiement échoue

**Rien n'est défait automatiquement**, et c'est une décision (ADR-0018) : les
migrations ne se défont pas, et redescendre une image sur un schéma déjà migré
casse plus sûrement que de rester en panne. Le workflow échoue bruyamment, et
c'est à l'acheteur de décider.

Revenir à une version antérieure, c'est reposer ce numéro par le même
mécanisme — à la réserve près qu'une migration déjà jouée ne se défait pas, donc
que l'image précédente doit savoir vivre avec le schéma en place.

### À la main, en recours

Si le workflow ne peut pas s'exécuter, les gestes qu'il fait restent jouables
depuis le serveur :

```bash
cd /opt/homecomparator

# La ligne est retirée puis réécrite, et non modifiée par `sed -i` : un
# `sed` de substitution ne fait *rien* si le `.env` ne porte pas encore de
# ligne `VERSION=`, et la pile repartirait alors sur l'ancien numéro sans
# que rien ne le signale. C'est ce que fait le workflow, à l'identique.
grep -v '^VERSION=' .env > .env.nouveau || [ $? -eq 1 ]
echo "VERSION=0.1.0" >> .env.nouveau
mv .env.nouveau .env

echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$COMPTE" --password-stdin
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --wait
docker logout ghcr.io
```
