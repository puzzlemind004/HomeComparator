# HomeComparator

Un carnet de comparaison personnel pour une recherche d'achat immobilier. Les portails immobiliers savent déjà trouver et mettre en favori des annonces ; ce qu'ils ne savent pas faire, c'est se souvenir des caractéristiques qui comptent pour l'acheteur et mettre plusieurs logements côte à côte sur ces caractéristiques-là.

## Language

### Objets

**Bien** :
Un logement que l'acheteur envisage d'acheter. C'est l'objet que l'on compare.
_Avoid_: Annonce, propriété, offre, listing

**Annonce** :
La publication d'un Bien sur un portail immobilier, conservée sous forme d'URL. Un même Bien peut faire l'objet de plusieurs Annonces, et une Annonce peut disparaître alors que le Bien reste pertinent.
_Avoid_: Listing, offre, publication

**Critère** :
Une caractéristique comparable d'un Bien, **saisie** dans un champ dédié et renseignée pour tous les Biens, ce qui la rend comparable. Se distingue des données liées au Statut, qui n'existent qu'à partir d'une étape du cycle de vie, et d'une Colonne calculée, qui se compare aussi mais ne se saisit pas.
_Avoid_: Champ, attribut, caractéristique

**Colonne** :
Ce qui se compare et se trie à l'écran. Une Colonne présente soit un Critère, soit une valeur calculée à partir de plusieurs Critères — le Prix au mètre carré est aujourd'hui la seule de cette seconde sorte. Tout Critère a donc sa Colonne, mais toute Colonne n'est pas un Critère.

La notion vit côté écran : l'API ne connaît que les Critères, chacun adossé à sa colonne SQL (ADR-0004), et ignore les Colonnes calculées, qui n'existent qu'une fois les Biens affichés. C'est ce qui permet au tri et à la mise en évidence de traiter le Prix au mètre carré sans savoir qu'il est calculé (ADR-0013).
_Avoid_: Colonne SQL — le stockage d'un Critère est un détail de base, sans rapport avec ce que le mot désigne ici. Champ, cellule

**Carte** :
La façon dont un Bien se présente sur un écran étroit : son Libellé, son Statut, et les quelques Colonnes les plus décisives plutôt que toutes. C'est une présentation distincte du tableau et non son adaptation, ce qu'ADR-0006 tranche : un tableau de seize Colonnes est illisible sur un téléphone quelle que soit l'astuce employée.

Une Carte se lit seule, là où un tableau se lit en comparant des lignes entre elles. C'est ce qui décide de ce qu'elle porte, et pourquoi le Prix au mètre carré y figure : il est ce qui permet de situer un Bien sans avoir l'autre sous les yeux (ADR-0013).
_Avoid_: Tuile, vignette, ligne mobile

**Colonne décisive** :
Une Colonne portée par la Carte, parce qu'elle permet de reconnaître un Bien d'un coup d'œil sans ouvrir sa fiche. Elles sont quatre — le prix demandé, le Prix au mètre carré, la surface habitable, la ville ou quartier — et se choisissent à la main : rien dans la définition d'un Critère ne dit qu'il décide plus qu'un autre, et un Critère ajouté ne le devient pas du seul fait d'exister. Ce sont des Colonnes et non des Critères, le Prix au mètre carré n'en étant pas un.
_Avoid_: Critère décisif — le Prix au mètre carré en est une sans être un Critère. Critère principal, colonne mise en avant

**Prix au mètre carré** :
Le prix demandé rapporté à la surface habitable, la valeur qui permet de comparer des Biens de surfaces différentes. C'est une Colonne calculée : l'acheteur y pense comme à un chiffre du carnet, mais il ne se saisit nulle part et ne se stocke pas (ADR-0013).
_Avoid_: Prix au m² (à l'écrit dans le code), prix unitaire

**Libellé** :
Le nom sous lequel un Bien apparaît dans les listes, saisi à la main et obligatoire à la création. C'est un support de mémoire avant tout : « celui avec la cuisine refaite » sert mieux la reconnaissance qu'une adresse. Un libellé composé automatiquement à partir des Critères a été écarté, ceux-ci n'étant pas encore renseignés au moment de la création.
_Avoid_: Titre, nom, surnom

**Photo** :
Une image d'un Bien : celle de l'annonce, ou celle prise pendant la visite. Rien ne les distingue en base — elles s'affichent dans la même galerie —, mais ce sont les secondes qui portent l'essentiel : elles montrent ce que l'annonce tait, le défaut du mur ou la vue réelle depuis le balcon.

C'est ce qui fait reconnaître un Bien un mois plus tard, quand « le T3 rue Victor Hugo » n'évoque plus rien. À ce titre elle sert la même fonction que le Libellé, et pas celle d'un Critère : elle ne se compare pas d'un Bien à l'autre, et n'a donc pas de Colonne.

Les fichiers vivent sur un volume Docker et non en base ; la base n'en porte que le nom (ADR-0014).
_Avoid_: Image, cliché, visuel, pièce jointe

**Photo représentative** :
Celle qui figure dans la liste et sur les Cartes, où une seule a la place de s'afficher. C'est la première ajoutée, et cela ne se choisit pas : un drapeau à cocher serait un geste de plus pendant la visite, là où le geste doit rester rapide (ADR-0014).
_Avoid_: Photo principale, photo de couverture, miniature — la vignette est le fichier, la représentative est le rôle.

**Notes** :
Le texte libre attaché à un Bien, pour tout ce qui compte mais ne se compare pas en colonne : impressions de visite, travaux à prévoir, remarques sur le voisinage.
_Avoid_: Commentaire, description, mémo

**Sauvegarde** :
Une copie datée de tout ce qui ne se retrouve pas : le contenu de la base et les fichiers des Photos, pris ensemble et sous le même horodatage. Les deux moitiés ne valent que réunies — la base ne porte que les noms des fichiers (ADR-0014), et une base restaurée sans ses Photos affiche des galeries vides.

Elle existe parce que tout est saisi à la main (ADR-0001) : un Bien perdu ne se retrouve pas, et une Photo de visite encore moins. C'est une exigence et non une commodité (ADR-0007).

Se distingue de l'**Export**, avec lequel elle se confond facilement : l'Export sort les données vers un tableur, à destination de l'acheteur, et ne contient pas les Photos ; la Sauvegarde sert à revenir en arrière, et personne ne la lit tant que rien n'a été perdu.
_Avoid_: Backup, archive — l'archive désigne ici le fichier des Photos, qui n'est qu'une moitié de la Sauvegarde. Dump, qui n'en désigne que l'autre.

**Propriétaire** :
Celui à qui appartient un Bien dans le carnet. L'outil n'a qu'un utilisateur et n'offre aucune gestion de comptes : tous les Biens portent la même valeur constante. Le terme n'existe que pour rendre indolore un éventuel passage au multi-utilisateurs (ADR-0011), et ne désigne jamais le vendeur du logement.
_Avoid_: Utilisateur, compte, vendeur

### Cycle de vie

**Statut** :
L'étape où se trouve un Bien dans la recherche. Le Statut conditionne les données affichées : certains champs n'apparaissent qu'à partir d'une étape donnée (voir ADR-0002).
_Avoid_: État, étape, phase

**À contacter** :
Bien repéré, dont l'agence ou le vendeur n'a pas encore été contacté.

**À visiter** :
Contact établi, visite à faire. Porte une date de visite, qui peut être vide tant que le rendez-vous n'est pas fixé.

**Visité** :
Bien vu, en cours d'évaluation.

**Offre faite** :
Une offre d'achat a été soumise. Porte le montant de la dernière offre.

**Écarté** :
Sortie du cycle par décision de l'acheteur. Les Notes disent pourquoi.
_Avoid_: Rejeté, refusé, abandonné

**Vendu** :
Sortie du cycle par un fait extérieur : le Bien est parti. Distinct d'Écarté, où la décision appartenait à l'acheteur.
_Avoid_: Indisponible, perdu

Écarté et Vendu sont atteignables depuis n'importe quelle étape, et tout retour en arrière est permis : un Bien écarté dont le prix baisse peut revenir dans le cycle, une offre refusée ramène le Bien à Visité. L'outil n'interdit aucune transition.

Écarter n'est pas supprimer : un Bien écarté reste consultable, et les Notes disent pourquoi il l'a été. La suppression existe séparément, pour corriger une saisie erronée ou un doublon.
