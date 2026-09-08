# Les Critères sont des colonnes SQL, décrites par une définition centralisée

Chaque Critère est une vraie colonne typée en base, pas une entrée dans un objet JSON. Le stockage en JSON avait été envisagé pour rendre l'ajout d'un Critère trivial ; il a été rejeté parce qu'il fait perdre le typage, le tri et le filtrage SQL, au profit d'une souplesse dont un projet à un seul développeur n'a pas besoin.

En parallèle, un fichier de définition unique décrit chaque Critère — libellé, type, unité, groupe, ordre d'affichage — et le formulaire de saisie, le tableau desktop, les cartes mobiles et l'assistant de complétion se génèrent tous à partir de lui. Ce fichier ne stocke aucune donnée : il rassemble en un endroit des métadonnées de présentation qui, autrement, se disperseraient dans chaque écran.

Ajouter un Critère demande donc deux gestes : une migration Lucid d'une ligne, et une ligne dans la définition. C'est ce qui rend tenable la contrainte d'extensibilité posée dès la conception — sans elle, l'ajout d'un Critère toucherait quatre écrans et ne se ferait jamais.
