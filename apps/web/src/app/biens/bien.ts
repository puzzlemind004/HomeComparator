import type { ValeurCritere } from '../criteres/comparaison';
import type { ValeursCriteres } from '../criteres/valeurs';
import type { Statut, ValeursChampsStatut } from '../criteres/statut';

/**
 * Un logement que l'acheteur envisage d'acheter : l'objet que l'on compare.
 *
 * Ce modèle ne porte que ce que l'interface affiche — il ne recopie pas la
 * forme de l'API. Les dates de création et de modification en sont absentes
 * parce qu'aucun écran ne les montre ; le jour où l'une d'elles s'affiche,
 * elle entrera ici sous forme de `Date`, convertie par l'adapter.
 */
export interface Bien {
  id: number;

  /** Le nom sous lequel le Bien apparaît dans les listes. */
  libelle: string;

  /**
   * L'URL de l'Annonce par laquelle le Bien a été repéré, ou `null` tant
   * qu'aucune n'a été renseignée.
   */
  urlAnnonce: string | null;

  /**
   * L'étape où se trouve le Bien dans la recherche (#7).
   *
   * Il ne figure pas dans `criteres` : un Critère se compare d'un Bien à
   * l'autre, le Statut décide de ce qui est pertinent. C'est lui qui commande
   * l'affichage des champs qui suivent (ADR-0002).
   */
  statut: Statut;

  /**
   * Les valeurs des champs liés au Statut, indexées par identifiant.
   *
   * Séparées des Critères pour la même raison que le Statut l'est : elles
   * n'existent qu'à partir d'une étape du cycle, et n'ont donc pas de sens
   * en colonne du tableau ni en question de l'assistant.
   *
   * Elles sont **toujours portées**, même à une étape où l'écran ne les
   * montre pas : reculer dans le cycle masque le champ, jamais sa valeur
   * (ADR-0002).
   */
  champsStatut: ValeursChampsStatut;

  /**
   * Les valeurs portées par les Critères, indexées par identifiant.
   *
   * Rassemblées dans une carte plutôt qu'étalées en quinze champs : la fiche
   * parcourt la définition et lit la valeur au passage, sans jamais énumérer
   * les Critères à la main (ADR-0004). L'API, elle, les rend à plat, aux
   * côtés de l'`id` et des dates — c'est l'adapter qui fait la traduction
   * (ADR-0010).
   *
   * Un Critère non renseigné y vaut `null`, jamais zéro ni la chaîne vide.
   */
  criteres: ValeursCriteres;
}

/** Ce que l'acheteur saisit pour créer un Bien : un Libellé, et rien d'autre. */
export interface CreationBien {
  libelle: string;
  urlAnnonce: string;
}

/**
 * Ce que l'acheteur modifie depuis la fiche ou l'assistant : un Critère, ou
 * quelques-uns, jamais forcément tous.
 *
 * Le Libellé et l'URL de l'Annonce s'y modifient comme les autres, sous leur
 * propre identifiant : la fiche ne fait pas de cas particulier (#6).
 *
 * Ce qui n'y figure pas n'est pas touché : c'est la mise à jour partielle,
 * et c'est ce qui permet à l'assistant d'enregistrer une réponse sans
 * effacer les quatorze autres Critères.
 */
export type ModificationBien = Readonly<Record<string, ValeurCritere>>;
