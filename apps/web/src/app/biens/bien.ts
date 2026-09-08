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
}

/** Ce que l'acheteur saisit pour créer un Bien : un Libellé, et rien d'autre. */
export interface CreationBien {
  libelle: string;
  urlAnnonce: string;
}
