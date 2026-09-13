#!/bin/sh
set -eu

# Ce qui décide du moment (#71). `sauvegarder.sh` fait une sauvegarde ; ce
# script dit quand.
#
# **Une boucle et non un cron, et ce n'est pas un raccourci.** Un crontab
# posé à la main sur le serveur ne vit pas dans le dépôt : il ne se déploie
# pas, il ne se relit pas, et une sauvegarde qui cesse de tourner dans un
# crontab que personne n'ouvre cesse de tourner sans le dire. Ici, ce qui
# décrit la production vit dans le dépôt et se déploie d'un geste.
#
# `crond` dans le conteneur aurait aussi tenu, et a été écarté pour deux
# raisons. Il écrit ses journaux ailleurs que sur la sortie standard, donc
# hors de `docker logs` — un échec ne se lirait pas là où l'on regarde. Et le
# processus principal du conteneur serait le démon, si bien qu'une sauvegarde
# qui n'aurait jamais tourné aurait exactement l'allure d'un conteneur sain.
# Cette boucle-ci dit chaque jour ce qu'elle attend et ce qu'elle a fait.

HEURE="${SAUVEGARDE_HEURE:-3}"
MINUTE="${SAUVEGARDE_MINUTE:-0}"

journal() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] boucle : $*"
}

# Les secondes à attendre jusqu'au prochain passage à HEURE:MINUTE UTC.
#
# Calculé à partir de l'heure courante plutôt qu'en dormant 24 h entre deux
# passages : un `sleep 86400` dérive d'autant que le travail a duré, et
# quelques semaines suffisent à faire glisser la sauvegarde de la nuit vers
# le jour. Ici chaque attente vise l'heure absolue, donc l'erreur ne
# s'accumule pas.
#
# Tout est en UTC — les conteneurs de la pile tournent en `TZ: UTC` — et
# l'heure de sauvegarde ne se décale donc pas deux fois l'an. Ce n'est pas un
# oubli du fuseau français : l'heure d'été ferait passer la sauvegarde de
# 4 h 00 à 5 h 00 sans que personne ne s'en aperçoive, et rien dans ce carnet
# ne rend une heure plus favorable qu'une autre — il n'est consulté par
# personne à 3 h du matin, quel que soit le fuseau.
secondes_jusqua_lheure() {
  maintenant=$(date -u '+%s')

  # `date -d` n'existe pas dans BusyBox sous la forme qui parserait une date
  # arbitraire. Le calcul se fait donc à la main, en secondes depuis minuit,
  # ce qui ne demande rien d'autre que l'heure courante.
  secondes_du_jour=$((
    $(date -u '+%H' | sed 's/^0//;s/^$/0/') * 3600 +
    $(date -u '+%M' | sed 's/^0//;s/^$/0/') * 60 +
    $(date -u '+%S' | sed 's/^0//;s/^$/0/')
  ))
  cible=$((HEURE * 3600 + MINUTE * 60))

  attente=$((cible - secondes_du_jour))

  # L'heure est déjà passée aujourd'hui — ou c'est exactement l'heure, et
  # repartir sans attendre ferait tourner la sauvegarde en rafale pendant
  # une seconde entière. Ce sera donc demain.
  [ "$attente" -gt 0 ] || attente=$((attente + 86400))

  echo "$attente"
  # `maintenant` n'est lu que pour forcer l'échec si `date` ne répond pas ;
  # le calcul, lui, ne s'en sert pas.
  : "$maintenant"
}

journal "démarrée — sauvegarde quotidienne à ${HEURE}h${MINUTE} UTC"

# **Aucune sauvegarde au démarrage, et c'est délibéré.** Le conteneur
# redémarre à chaque déploiement (#70), et sauvegarder à chaque démarrage
# ferait de la rétention une fenêtre de quelques heures le jour où l'on
# déploie plusieurs fois — sept quotidiennes qui couvriraient une journée au
# lieu d'une semaine, très exactement le jour où l'on touche à la production.
# Une sauvegarde immédiate se déclenche à la main, et se dit :
#
#   docker compose exec sauvegarde sauvegarder.sh

while true; do
  attente=$(secondes_jusqua_lheure)
  journal "prochaine sauvegarde dans $((attente / 3600)) h $(((attente % 3600) / 60)) min"
  sleep "$attente"

  # L'échec d'une nuit n'arrête pas la boucle : demain peut très bien
  # réussir — la base était en cours de migration, le disque était plein le
  # temps d'une rotation. Un conteneur qui s'arrêterait à la première panne
  # transformerait un incident d'une nuit en arrêt définitif de la
  # sauvegarde, et `restart: unless-stopped` le relancerait en boucle serrée.
  #
  # Ce qui rend cette indulgence tenable est que l'échec **se voit** : la
  # ligne ci-dessous part dans `docker logs`, et surtout l'horodatage n'est
  # pas déposé — la route de santé continue d'annoncer la date d'avant, qui
  # vieillit. C'est la boucle fermée du ticket : une date ancienne se voit,
  # là où un conteneur mort passerait inaperçu.
  if sauvegarder.sh; then
    :
  else
    journal "la sauvegarde de cette nuit a échoué ; la boucle continue"
  fi
done
