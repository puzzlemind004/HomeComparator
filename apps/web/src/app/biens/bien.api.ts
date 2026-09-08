/**
 * Les formes échangées avec l'API, telles qu'elle les envoie et les attend.
 *
 * Ces types décrivent le contrat HTTP, pas ce que l'écran affiche : ils
 * restent confinés au service et à l'adapter, qui les traduisent vers les
 * modèles d'affichage de `bien.ts`.
 */

/** Un Bien tel que l'API le renvoie. */
export interface BienApi {
  id: number;
  libelle: string;
  urlAnnonce: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Les données acceptées par l'API pour créer un Bien. */
export interface CreationBienApi {
  libelle: string;
  urlAnnonce?: string;
}

/** Une erreur de validation renvoyée par l'API, champ par champ. */
export interface ErreurValidationApi {
  message: string;
  field: string;
  rule: string;
}

export interface ReponseErreurValidationApi {
  errors: ErreurValidationApi[];
}
