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
Une caractéristique comparable d'un Bien, saisie dans un champ dédié et renseignée pour tous les Biens, ce qui la rend comparable. Se distingue des données liées au Statut, qui n'existent qu'à partir d'une étape du cycle de vie.
_Avoid_: Champ, attribut, caractéristique

**Libellé** :
Le nom sous lequel un Bien apparaît dans les listes, saisi à la main et obligatoire à la création. C'est un support de mémoire avant tout : « celui avec la cuisine refaite » sert mieux la reconnaissance qu'une adresse. Un libellé composé automatiquement à partir des Critères a été écarté, ceux-ci n'étant pas encore renseignés au moment de la création.
_Avoid_: Titre, nom, surnom

**Notes** :
Le texte libre attaché à un Bien, pour tout ce qui compte mais ne se compare pas en colonne : impressions de visite, travaux à prévoir, remarques sur le voisinage.
_Avoid_: Commentaire, description, mémo

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
