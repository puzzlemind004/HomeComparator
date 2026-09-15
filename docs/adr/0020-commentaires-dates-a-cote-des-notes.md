# Les Commentaires sont des observations datées, à côté des Notes et non à leur place

Le carnet portait déjà un texte libre par Bien : les Notes, un champ propre du Bien pour tout ce qui compte mais ne se compare pas en colonne (ADR-0012). Il portait aussi des Photos, dont ADR-0014 dit qu'elles vivent sur un volume et que rien ne distingue en base celle de l'annonce de celle prise pendant la visite.

Ce qui manquait est ce qu'on fait **pendant** la visite, debout dans une pièce : photographier le mur fissuré, poser deux étoiles, écrire trois mots, et passer à la pièce suivante. Les Notes ne savent pas le porter. Ce sont un texte unique qu'on relit et réécrit : ajouter une observation demande de rouvrir le paragraphe, de trouver où l'insérer, et d'écrire au milieu de ce qui est déjà là — trois gestes de trop quand on tient son téléphone d'une main. Et surtout, les Notes n'ont pas de date : « la salle de bain est à refaire » et « le mur était déjà comme ça » ne se répondent que si l'on sait laquelle des deux visites les a produites.

Nous introduisons donc le **Commentaire** : une ligne qui s'ajoute, horodatée, portant trois champs tous facultatifs — un texte, une photo, une appréciation de 1 à 5 étoiles. Le suivant ne touche pas au précédent, ce qui est très exactement ce qu'une table sait dire et qu'un champ de texte ne sait pas.

Le mot est celui de l'acheteur, et il entre au glossaire malgré ce qu'ADR-0012 en disait : « Commentaire » y figurait comme terme à éviter pour les Notes, parce qu'il n'y avait alors rien d'autre à nommer. Il en reste un mauvais synonyme de Notes — les deux ne sont pas la même chose, et le glossaire dit maintenant ce qui les sépare.

Trois choix méritent d'être dits.

**Les trois champs sont facultatifs, et au moins l'un des trois est exigé.** Un mur fissuré se passe de légende, trois étoiles sur une chambre se passent de photo. Exiger un champ précis ferait inventer une valeur pour pouvoir enregistrer, alors que le geste doit rester d'une seconde ; n'en exiger aucun ferait enregistrer des Commentaires vides au moindre appui.

**La photo d'un Commentaire est une Photo du Bien, pas un stockage à part.** Elle rejoint la galerie au même rang que les autres, ce qu'ADR-0014 autorise en posant que rien ne les distingue en base. L'inverse aurait donné deux stockages, deux façons d'effacer, et une galerie qui ignore la moitié des clichés de la visite. Le lien est en `SET NULL` dans les deux sens de lecture : supprimer la photo depuis la galerie laisse le Commentaire sans image plutôt que d'emporter des mots qu'on ne réécrira pas, et supprimer le Commentaire laisse la photo dans la galerie.

**L'ajout est un seul appel, en `multipart`.** La photo voyage avec le texte et l'appréciation. Deux allers-retours — créer la photo, puis le Commentaire — doubleraient l'attente sur la connexion d'un couloir, et le second qui échoue laisserait une photo que personne n'a demandée.

Un Commentaire ne se modifie pas : c'est une observation datée, pas un texte qu'on retravaille. Ce qui a été mal dit se supprime et se réécrit, et l'API n'expose donc ni `PATCH` ni `PUT` sur cette collection.
