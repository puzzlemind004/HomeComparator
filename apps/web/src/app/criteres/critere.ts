/**
 * Ce qu'est un Critère, indépendamment de tout écran.
 *
 * Un Critère est une caractéristique comparable d'un Bien, renseignée dans
 * un champ dédié pour tous les Biens — ce qui la distingue des données liées
 * au Statut, qui n'existent qu'à partir d'une étape du cycle de vie
 * (ADR-0002) et ne figurent donc pas ici.
 *
 * Ce fichier ne décrit que les formes ; la liste elle-même est dans
 * `definition.ts`, et rien de ce module ne fait d'entrée-sortie ni ne dépend
 * d'Angular : cinq écrans le lisent (formulaire, tableau, cartes,
 * comparaison, assistant) et aucun ne doit avoir à monter un composant pour
 * savoir ce qu'est un prix.
 */

/**
 * La nature d'un Critère, qui décide de la façon dont il se saisit,
 * s'affiche et se compare.
 *
 * `entier` et `decimal` sont distingués alors que les deux sont des nombres :
 * un prix se saisit sans virgule et s'affiche sans décimale, une surface non.
 */
export type TypeCritere = 'entier' | 'decimal' | 'texte' | 'enumeration' | 'booleen';

/**
 * `booleen` ne sert aucun des quinze Critères d'aujourd'hui : « extérieur »
 * et « travaux à prévoir » se sont révélés plus utiles en énumérations, un
 * balcon et un jardin ne se ramenant pas à oui ou non. Le type est déclaré
 * quand même parce qu'un Critère par oui/non est le premier qu'on voudra
 * ajouter — ascenseur, cave, garage — et que la définition doit pouvoir
 * l'accueillir sans retoucher les écrans qui la lisent.
 */

/**
 * Le sens dans lequel un Critère se compare, dont la vue de comparaison
 * (#12) tire la mise en évidence de la meilleure valeur.
 *
 * `aucun` est le cas de tous les Critères dont on ne peut pas dire qu'une
 * valeur est meilleure qu'une autre : une adresse, un type de chauffage.
 * Les désigner ainsi vaut mieux que les omettre — l'exhaustivité est
 * vérifiable, l'oubli ne l'est pas.
 */
export type SensComparaison = 'plusPetitEstMeilleur' | 'plusGrandEstMeilleur' | 'aucun';

/**
 * Le regroupement d'un Critère dans les écrans qui en affichent plusieurs.
 * Le formulaire (#6) s'en sert pour ses sections, la fiche pour ses blocs.
 */
export type GroupeCritere = 'budget' | 'logement' | 'localisation' | 'confort';

/** Une valeur admise par un Critère de type `enumeration`. */
export interface ValeurEnumeree {
  /** Ce qui est écrit en base, et ce que l'API reçoit. */
  valeur: string;

  /** Ce que l'acheteur lit à l'écran. */
  libelle: string;
}

/**
 * La déclaration d'un Critère : tout ce que les écrans ont besoin de savoir
 * pour l'afficher, le saisir et le comparer, en un seul endroit.
 *
 * Ajouter un Critère, c'est ajouter une entrée ici et une ligne de migration
 * (ADR-0004) — les cinq écrans en dérivent sans être retouchés.
 */
export interface Critere {
  /**
   * L'identifiant du Critère, qui est aussi le nom du champ tel que l'API
   * l'échange. Les deux sont volontairement confondus : une table de
   * correspondance en plus serait un troisième geste à faire à chaque ajout,
   * et l'adapter (ADR-0010) a déjà la charge de la traduction des formes.
   */
  id: string;

  /** Le nom du Critère tel qu'il s'affiche : en-tête de colonne, étiquette. */
  libelle: string;

  type: TypeCritere;

  /**
   * L'unité affichée à côté de la valeur, ou `null` quand le Critère n'en a
   * pas. Elle n'est jamais incluse dans la valeur stockée.
   */
  unite: string | null;

  groupe: GroupeCritere;

  /**
   * La position du Critère dans les écrans qui les listent. Ordre global et
   * non par groupe : c'est un seul tri à faire, et les groupes se suivent.
   */
  ordre: number;

  sensComparaison: SensComparaison;

  /**
   * Les valeurs admises, pour un Critère de type `enumeration` uniquement.
   * `null` partout ailleurs.
   *
   * Pour un Critère ordonné — le DPE, dont A vaut mieux que G — l'ordre de
   * cette liste porte la comparaison : la première valeur est la meilleure.
   */
  valeurs: readonly ValeurEnumeree[] | null;
}
