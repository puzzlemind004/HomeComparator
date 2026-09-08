# Modèles distincts de part et d'autre, traduits par un adapter

Le front et l'API ne partagent aucune source TypeScript. L'API décrit ses
modèles d'après la base ; le front décrit les siens d'après ce que ses écrans
affichent ; un adapter, au point d'entrée du front, traduit les formes reçues
vers les modèles d'affichage.

Un contrat partagé — dossier `packages/contrats` en workspace npm, ou paquet
publié sur un registre — a été envisagé et écarté. Les deux applications sont
des projets npm indépendants, avec leurs lockfiles et surtout leurs contextes
de build Docker (`./apps/api` et `./apps/web`) : une source unique hors de ces
dossiers imposerait soit de publier une version à chaque évolution du contrat,
soit d'élargir les contextes Docker et de refondre les deux jobs de CI. Le coût
d'infrastructure ne se justifiait pas, d'autant que les deux côtés n'ont pas
les mêmes besoins : la base porte des colonnes que l'écran n'affiche pas.

Deux règles en découlent. Le modèle d'affichage ne porte **que ce qu'un écran
montre** : les dates de création et de modification, pourtant renvoyées par
l'API, n'y figurent pas tant qu'aucun écran ne les affiche. Et l'adapter ne
convertit une date ISO en `Date` que **pour une date réellement affichée** —
une date de visite, par exemple — plutôt que par principe.

Conséquence assumée : une divergence entre les deux côtés n'est pas rattrapée
par le compilateur. Ce sont les tests fonctionnels Japa qui tiennent le
contrat, en décrivant les formes que l'API rend réellement.
