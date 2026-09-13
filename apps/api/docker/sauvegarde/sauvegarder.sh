#!/bin/sh
set -eu

# Une sauvegarde du carnet : le dump de la base, l'archive des Photos, et
# l'horodatage que la route de santé lit (#71, ADR-0007).
#
# Ce script fait **une** sauvegarde et s'arrête. Ce qui décide du moment vit
# à côté, dans `boucle.sh` ; le séparer est ce qui permet de déclencher une
# sauvegarde à la main sans attendre la nuit, et c'est aussi comment la
# restauration se vérifie :
#
#   docker compose exec sauvegarde sauvegarder.sh
#
# Les données du carnet sont saisies entièrement à la main (ADR-0001) : un
# Bien perdu ne se retrouve pas, et une Photo de visite encore moins — on ne
# repasse pas la prendre. D'où le périmètre : la base **et** le volume des
# Photos, dans le même mouvement et sous le même horodatage.

# --- Où les choses vivent ---------------------------------------------------
#
# Deux racines distinctes, et la séparation est une décision (#75) : ce que
# l'API lit n'est pas ce que la sauvegarde produit.
#
#   ARCHIVES  les dumps et les archives de Photos. Ce volume n'est monté que
#             ici : un dump porte le carnet entier, et selon sa forme les
#             identifiants de connexion. Le processus qui sert les requêtes
#             HTTP publiques n'a aucune raison de l'avoir dans son système de
#             fichiers, fût-ce en lecture seule.
#   ETAT      le seul horodatage de la dernière réussite. C'est ce que l'API
#             monte, en lecture seule, et tout ce qu'elle monte.
#
# Ces trois chemins sont **écrits en dur et non paramétrables**, à la
# différence de la rétention et de l'heure. Ce ne sont pas des réglages :
# ce sont les points de montage que les deux fichiers Compose déclarent, et
# les rendre variables donnerait deux endroits où dire la même chose, qui
# finiraient par diverger. Le jour où ils changent, ils changent dans le
# Compose et ici, ensemble.
ARCHIVES=/sauvegardes/archives
ETAT=/sauvegardes/etat
PHOTOS=/photos

# Rétention, en nombre de sauvegardes gardées de chaque sorte (ADR-0007).
# Un dump compressé pèse quelques dizaines de kilo-octets pour ce volume : la
# rétention longue ne coûte rien et couvre l'erreur découverte tardivement.
QUOTIDIENNES="${SAUVEGARDE_QUOTIDIENNES:-7}"
HEBDOMADAIRES="${SAUVEGARDE_HEBDOMADAIRES:-4}"

# Le jour qui fait d'une sauvegarde une hebdomadaire : le dimanche, au sens
# de `date +%u`. En dur pour la même raison que les chemins — rien dans
# ADR-0007 ne fait dépendre la rétention du jour retenu, et un réglage de
# plus serait un réglage que personne ne touche.
JOUR_HEBDOMADAIRE=7

journal() {
  # L'horodatage est écrit par le script et non laissé au collecteur : ces
  # lignes se lisent dans `docker logs`, où rien d'autre ne les date.
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

echoue() {
  journal "ÉCHEC : $*"
  exit 1
}

# --- Le nom d'une sauvegarde ------------------------------------------------
#
# `AAAAMMJJ-HHMMSS`, en UTC, suivi de la sorte. La sorte est dans le nom et
# non dans un sous-dossier ou un fichier d'index : la rétention doit pouvoir
# trier sans rien lire, et un état qui se déduit du nom ne se désynchronise
# pas de ce qu'il décrit. Un dossier de sauvegardes se lit aussi à l'œil nu
# le jour où l'on restaure, qui n'est pas le jour où l'on a envie de déchiffrer
# une convention.
horodatage=$(date -u '+%Y%m%d-%H%M%S')

if [ "$(date -u '+%u')" = "$JOUR_HEBDOMADAIRE" ]; then
  sorte="hebdomadaire"
else
  sorte="quotidienne"
fi

nom="$horodatage-$sorte"

journal "Sauvegarde $nom"

mkdir -p "$ARCHIVES" "$ETAT"

# Les restes d'une tentative interrompue sont balayés avant de commencer.
#
# Ils ne se suppriment pas tout seuls : un conteneur tué net, ou une nuit de
# disque plein, laisse un `.partiel` que rien ne reprend — et le glob de la
# rétention ne le voit pas, puisqu'il ne finit pas par `.sql.gz`. Sans ce
# balayage ils s'accumulent, un par nuit, sur le volume que la sauvegarde a
# précisément besoin de garder libre (#95).
#
# Les supprimer ici plutôt qu'en sortie est ce qui les rattrape *tous*, y
# compris ceux d'une exécution qui n'a jamais atteint sa sortie. Aucun n'a de
# valeur : un `.partiel` est par définition ce qui n'a pas été mené à terme.
for reste in "$ARCHIVES"/*.partiel "$ARCHIVES"/.code-pg_dump.*; do
  [ -e "$reste" ] || continue
  journal "Reste d'une tentative interrompue, supprimé : $(basename "$reste")"
  rm -f "$reste"
done

# --- Le dump de la base -----------------------------------------------------
#
# Écrit d'abord sous un nom temporaire, renommé seulement une fois `pg_dump`
# rendu. Un `pg_dump` interrompu — conteneur arrêté au milieu, base coupée —
# laisse sinon un fichier tronqué portant le nom d'une sauvegarde valable, et
# la rétention finirait par supprimer une bonne sauvegarde pour garder
# celle-là. Le renommage est atomique sur le même système de fichiers : ce qui
# porte le nom final a été écrit en entier.
dump="$ARCHIVES/$nom.sql.gz"
dump_partiel="$dump.partiel"

# Format texte compressé, et non le format personnalisé de `pg_dump -Fc`. Il
# se restaure avec `psql`, présent partout où PostgreSQL l'est, là où `-Fc`
# exige un `pg_restore` de version compatible ; il se lit aussi tel quel —
# `zcat` suffit pour retrouver une seule ligne supprimée par erreur, ce qui
# est très exactement le cas que la sauvegarde quotidienne couvre (ADR-0007).
# Le format personnalisé ne vaudrait ses contraintes que pour la restauration
# sélective d'une grosse base, que ce carnet n'est pas.
#
# `--clean --if-exists` : le dump se restaure sur une base déjà peuplée sans
# geste préalable, et c'est l'état dans lequel on restaure vraiment — on
# répare un carnet qui existe, on ne repart pas d'une base vierge.
#
# `PGPASSWORD` n'apparaît pas ici : le mot de passe vient de l'environnement
# du conteneur, que Compose renseigne. Le passer en argument le rendrait
# visible dans la liste des processus.
journal "Dump de $POSTGRES_DB"

# **Le code de retour de `pg_dump` est récupéré à part, et il le faut.**
# `sh` ne connaît pas `PIPESTATUS` ni `pipefail` : le code d'un tube est
# celui de son *dernier* maillon, donc celui de `gzip`. Une base injoignable
# donnerait ici un succès — `gzip` a parfaitement compressé les zéro octet
# qu'il a reçus — et l'échec ne se verrait qu'à la vérification du marqueur,
# qui l'attribuerait à un dump tronqué. Le message désignerait alors la
# mauvaise cause, ce qui se paie à l'heure où on le lit.
#
# D'où ce fichier temporaire portant le code : c'est la façon portable de
# faire remonter le statut d'un maillon de tête hors du sous-shell où le
# tube l'enferme.
#
# **Il est effacé avant d'être testé**, et non seulement après. Son épreuve
# est son *existence*, et les PID d'un conteneur sont de très petits nombres
# qui se recyclent en quelques dizaines de lancements (mesuré : 7, 8, 9…).
# Un résidu laissé par un échec antérieur au même PID ferait rejeter un dump
# parfaitement bon en accusant la base — le pire des diagnostics, puisqu'il
# envoie chercher la panne là où elle n'est pas.
code_dump="$ARCHIVES/.code-pg_dump.$$"
rm -f "$code_dump"

# **`set -e` est neutralisé le temps de ce tube, et c'est ce qui permet au
# reste de tourner.** Sous `set -e`, un `gzip` qui bute sur ENOSPC — disque
# plein — tue le script *ici*, avant le nettoyage et avant la rétention. Les
# trois effets se renforcent : le `.partiel` survit, la rétention qui aurait
# libéré de la place ne tourne jamais, et le résidu s'ajoute à celui de la
# veille. Une seule nuit de disque plein arrêtait ainsi la sauvegarde
# définitivement (#95) : le volume ne redescendait plus.
#
# La panne se voyait — l'horodatage n'est pas déposé, donc la route de santé
# vieillit — mais se voir ne suffit pas : la sauvegarde doit pouvoir repartir
# seule dès que la place revient.
set +e
{
  pg_dump \
    --host="${POSTGRES_HOTE:-postgres}" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --clean --if-exists --no-owner --no-privileges \
    || echo "$?" > "$code_dump"
} | gzip -9 > "$dump_partiel"
code_gzip=$?
set -e

# **L'écriture est jugée avant `pg_dump`, et l'ordre compte.** Le disque
# plein fait échouer les deux — `gzip` sur le dump, et `echo` sur le fichier
# de code, qui reste alors vide. Diagnostiquer d'abord `pg_dump` accuserait
# la base d'une panne du serveur, en affichant un code de retour vide
# (mesuré). Le volume saturé est la cause commune : il se nomme en premier.
if [ "$code_gzip" -ne 0 ]; then
  rm -f "$code_dump" "$dump_partiel"
  echoue "l'écriture du dump a rendu $code_gzip — le volume des sauvegardes est probablement plein ; rien n'a été déposé"
fi

# Le fichier de code **et son contenu** : vide, il ne dit rien d'exploitable,
# et le lire quand même produirait un message nommant un code absent.
if [ -s "$code_dump" ]; then
  echec_pg_dump=$(cat "$code_dump")
  rm -f "$code_dump" "$dump_partiel"
  echoue "pg_dump a rendu $echec_pg_dump — base injoignable ou refus d'authentification ; rien n'a été déposé"
fi

rm -f "$code_dump"

# Le contenu est vérifié en plus du code de retour, et les deux ne couvrent
# pas le même risque. Le bloc ci-dessus attrape le `pg_dump` qui **échoue** ;
# celui-ci attrape le dump qui **s'arrête sans échouer** — disque plein au
# milieu de l'écriture, conteneur arrêté, tube rompu. Un dump complet porte
# en fin de fichier un marqueur que `pg_dump` n'écrit qu'une fois tout rendu,
# et c'est la seule vérification qui porte sur ce qui a réellement été écrit.
#
# Les **vingt** dernières lignes et non les trois : le marqueur n'est pas
# garanti dernier. PostgreSQL 17 fait suivre d'une ligne `\unrestrict`, et
# une version ultérieure peut en ajouter d'autres — mesuré ici, où la
# vérification a d'abord rejeté des dumps parfaitement valables. Ce qui
# compte est que le marqueur soit présent *vers la fin*, non qu'il soit la
# dernière ligne ; une fenêtre large tient cette promesse-là sans se
# rompre à la prochaine version mineure.
if ! gzip -dc "$dump_partiel" | tail -n 20 | grep -q 'PostgreSQL database dump complete'; then
  rm -f "$dump_partiel"
  echoue "le dump ne porte pas son marqueur de fin, il est incomplet"
fi

mv "$dump_partiel" "$dump"
journal "Dump déposé : $(basename "$dump") ($(du -h "$dump" | cut -f1))"

# --- L'archive des Photos ---------------------------------------------------
#
# Dans le même mouvement et sous le même horodatage que le dump : la base ne
# porte que les noms de fichiers (ADR-0014), et une base restaurée dont les
# Photos manquent affiche des galeries vides. Les deux moitiés se restaurent
# ensemble ou ne servent à rien.
#
# Le volume est monté en lecture seule ici — la sauvegarde lit les Photos,
# elle n'a aucune raison de pouvoir les écrire.
archive="$ARCHIVES/$nom-photos.tar.gz"
archive_partielle="$archive.partiel"

journal "Archive des Photos"

# `-C "$PHOTOS" .` plutôt que le chemin absolu : l'archive porte des chemins
# relatifs, et se déverse donc dans n'importe quel dossier au moment de
# restaurer. Une archive de chemins absolus imposerait son point de montage.
#
# Un dossier de Photos vide donne une archive valable et vide, ce qui est
# exact : le carnet neuf n'a pas encore de Photos, et l'absence d'archive
# serait plus difficile à distinguer d'un échec.
if ! tar -czf "$archive_partielle" -C "$PHOTOS" .; then
  rm -f "$archive_partielle"
  echoue "l'archive des Photos n'a pas abouti, le dump de cette nuit reste sans elle"
fi

# `tar -t` relit l'archive entière : elle est de l'ordre du mégaoctet, et
# c'est le seul moyen de savoir qu'elle se déroulera le jour venu.
if ! tar -tzf "$archive_partielle" > /dev/null; then
  rm -f "$archive_partielle"
  echoue "l'archive des Photos ne se relit pas"
fi

mv "$archive_partielle" "$archive"
journal "Photos déposées : $(basename "$archive") ($(du -h "$archive" | cut -f1))"

# --- La rétention -----------------------------------------------------------
#
# Elle tourne **après** la réussite et non avant : une sauvegarde qui échoue
# ne doit pas emporter la plus ancienne des bonnes au passage. Le jour où la
# base ne répond plus, les 7 quotidiennes restent 7.
elaguer() {
  sorte_a_elaguer="$1"
  garder="$2"

  # **Garder zéro ne veut pas dire tout supprimer, et sans cette ligne c'est
  # exactement ce qui arriverait.** `head -n -0` rend *toutes* les lignes au
  # lieu d'aucune — mesuré dans BusyBox —, si bien qu'un
  # `SAUVEGARDE_QUOTIDIENNES=0` effacerait chaque dump et chaque archive de
  # Photos au lieu de ne rien élaguer. Les réglages sont annoncés comme
  # modifiables dans `.env.example`, donc ce zéro est atteignable par
  # quelqu'un qui cherche précisément à éprouver la rétention.
  #
  # Une valeur nulle ou négative est traitée comme « ne rien supprimer » :
  # c'est le sens le plus sûr des deux, une rétention mal réglée devant au
  # pire garder trop.
  [ "$garder" -gt 0 ] 2>/dev/null || {
    journal "Rétention $sorte_a_elaguer : « $garder » n'est pas un nombre de sauvegardes à garder, rien n'est supprimé"
    return 0
  }

  # Un dump et son archive de Photos portent le même préfixe : la liste est
  # faite sur les dumps, et chaque suppression emporte les deux. Les compter
  # ensemble donnerait une rétention deux fois plus courte que celle
  # d'ADR-0007, sans que rien ne le dise.
  #
  # Le tri est lexicographique et l'horodatage `AAAAMMJJ-HHMMSS` le rend
  # chronologique : le plus récent est le dernier.
  a_supprimer=$(
    find "$ARCHIVES" -maxdepth 1 -name "*-$sorte_a_elaguer.sql.gz" -type f \
      | sort \
      | head -n "-$garder"
  )

  [ -n "$a_supprimer" ] || return 0

  echo "$a_supprimer" | while IFS= read -r vieux_dump; do
    prefixe="${vieux_dump%.sql.gz}"
    journal "Rétention : suppression de $(basename "$prefixe")"
    rm -f "$prefixe.sql.gz" "$prefixe-photos.tar.gz"
  done
}

elaguer "quotidienne" "$QUOTIDIENNES"
elaguer "hebdomadaire" "$HEBDOMADAIRES"

# --- L'horodatage, en dernier -----------------------------------------------
#
# **L'ordre est le cœur du dispositif.** Cette ligne n'est atteinte que si le
# dump et l'archive ont abouti et se relisent : l'horodatage atteste d'une
# sauvegarde complète, pas d'une tentative. Le déposer plus tôt ferait dire à
# la route de santé que tout va bien pendant que rien n'est sauvegardé, ce
# qui est pire que de ne rien dire — l'acheteur n'irait pas vérifier.
#
# ISO 8601, le format que `derniere_sauvegarde.ts` lit et le seul qu'il
# accepte : une date mal relue vaudrait moins que pas de date du tout, elle
# rassurerait à tort.
#
# Écrit puis renommé, comme les archives : l'API lit ce fichier à chaque
# appel de la route de santé, et une lecture tombant au milieu de l'écriture
# trouverait une date tronquée. `derniere_sauvegarde.ts` traite l'illisible
# comme l'absence, donc la panne serait passagère et bénigne — mais elle
# ferait clignoter une alerte sans cause, et le renommage l'évite pour rien.
date -u -Iseconds > "$ETAT/derniere-sauvegarde.partiel"
mv "$ETAT/derniere-sauvegarde.partiel" "$ETAT/derniere-sauvegarde"

journal "Sauvegarde $nom terminée"
