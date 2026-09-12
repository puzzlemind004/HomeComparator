# Images privées sur GHCR, tirées par une authentification éphémère

La CI publie les images de l'API et du front sur GitHub Container Registry
(`ghcr.io`) en visibilité privée, taguées par le numéro de version. Le VPS s'y
authentifie le temps du déploiement, avec le jeton de l'exécution du workflow,
puis se déconnecte : aucun identifiant de registre ne réside sur le serveur.

## Pourquoi un registre

Le VPS a un cœur et pas de swap. Y construire un bundle Angular expose à l'arrêt
du processus par l'OOM killer, sur la machine qui sert le carnet au même moment.
La construction appartient donc à la CI (#19, #64), et le serveur ne fait que
tirer un artefact déjà vérifié — ce qui rend le déploiement reproductible : la
production tourne l'image exacte que la CI a validée.

GHCR plutôt que Docker Hub : aucune contrainte du projet ne désigne un registre
en particulier, c'est donc un choix par défaut assumé et non un arbitrage. GHCR
le gagne parce que le dépôt est déjà sur GitHub — le jeton de l'exécution suffit
à pousser, sans compte externe — et parce que Docker Hub plafonne les tirages
sur ses comptes gratuits.

## Pourquoi privées, et sans jeton résident

Le dépôt est privé. Publier les images en accès libre aurait dispensé le VPS de
s'authentifier, mais aurait rendu le code compilé lisible par qui connaît l'URL
— et une image publique ne se dépublie pas utilement : elle est déjà tirée et
mise en cache ailleurs.

L'accès privé demande une authentification, et c'est là que le choix se joue.
Un jeton personnel déposé sur le serveur est un secret qui **expire**. Son
expiration casse un déploiement des mois plus tard, sur un `unauthorized` dont
le lien avec la cause n'est pas immédiat, et rien ne prévient avant.

Le workflow de déploiement se connecte déjà au VPS en SSH (#70). C'est donc lui
qui ouvre la session vers le registre, avec le jeton de son exécution, tire les
images, puis ferme la session. Le jeton vit le temps du déploiement et n'est
jamais écrit durablement sur la machine. Un secret qui n'existe pas ne peut ni
fuir, ni expirer.

## Alternatives écartées

**Images publiques.** Écarté : rend le code compilé lisible alors que les
sources sont privées, pour un bénéfice — ne pas s'authentifier — que
l'authentification éphémère procure déjà.

**Jeton de tirage en lecture seule résidant sur le VPS.** C'était la formulation
initiale de #70. Écarté pour la panne différée décrite plus haut : le mode de
défaillance est silencieux jusqu'au jour où il bloque, et sa cause est distante
de son effet.

**Construction sur le VPS.** Écarté : la machine n'en a pas les moyens, et la
production ne tournerait plus l'artefact que la CI a validé.

## Conséquence sur les tickets

#70 prévoyait « un jeton en lecture seule » côté serveur ; cet ADR remplace ce
point par l'authentification éphémère portée par le workflow. Le reste de #70 —
images privées, taguées par la version — est inchangé.
