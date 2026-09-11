# Un PostgreSQL par projet, en conteneur, plutôt qu'une instance mutualisée

Le carnet est déployé avec son propre PostgreSQL, dans le Compose de production,
et non sur l'instance PostgreSQL installée sur l'hôte.

Le VPS portait déjà une instance PostgreSQL sur l'hôte, héritée d'un projet
abandonné (`critikall`). La question s'est posée d'y loger simplement une
nouvelle base : une seule instance, une base par projet, la mémoire payée une
fois. C'est la mutualisation, et elle a été écartée.

Ce qui la disqualifie n'est pas la mémoire. Un PostgreSQL au repos sur une base
de quelques mégaoctets tient dans quelques dizaines de mégaoctets résidents ;
`shared_buffers` est un cache partagé qui se remplit à l'usage, pas une
réservation. Sur ce VPS à un cœur sans swap, le poste à surveiller est la
construction des images, pas une instance de base supplémentaire.

Ce qui la disqualifie, c'est que la mutualisation fait dépendre le carnet d'un
état du serveur qu'aucun dépôt ne décrit. Redéployer ailleurs demanderait de
reconstituer l'instance hôte à la main, et le Compose de développement
divergerait de la production sur un service entier — précisément ce que la pile
de production versionnée (#69) cherche à supprimer. Elle impose aussi une
version majeure et un jeu d'extensions communs à tous les projets présents.

Aucun second projet n'est en vue. Concevoir aujourd'hui pour une application
hypothétique reviendrait à payer une contrainte réelle contre un bénéfice
supposé — et ce second projet, s'il arrive, apportera son propre conteneur
plutôt que de réclamer l'instance partagée.

Le chemin de sortie est bon marché, ce qui achève de trancher : mutualiser plus
tard, si le nombre de projets le justifiait, demande de retirer le service
`postgres` du Compose et de changer une chaîne de connexion. Porte réversible,
donc décision à prendre maintenant plutôt qu'à reporter.

## Conséquence

L'instance PostgreSQL de l'hôte n'a plus d'objet une fois ses données sorties
(voir [ADR-0016](0016-critikall-conserve-hors-du-vps.md)) et sera supprimée lors
de la bascule décrite par #69. La sauvegarde du carnet (ADR-0007) s'exécute donc
contre le conteneur et non contre l'hôte.
