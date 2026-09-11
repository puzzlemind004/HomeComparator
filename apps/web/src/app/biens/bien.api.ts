import type { ValeurCritere } from '../criteres/comparaison';
import type { PhotoApi } from './photo.api';

/**
 * Les formes échangées avec l'API, telles qu'elle les envoie et les attend.
 *
 * Ces types décrivent le contrat HTTP, pas ce que l'écran affiche : ils
 * restent confinés au service et à l'adapter, qui les traduisent vers les
 * modèles d'affichage de `bien.ts`.
 */

/**
 * Un Bien tel que l'API le renvoie : ses champs propres, puis les Critères
 * à plat, un par colonne (ADR-0004).
 *
 * Les Critères ne sont pas énumérés ici. Les nommer un par un dupliquerait
 * la définition centralisée dans un type que rien ne tiendrait à jour, et
 * ferait de l'ajout d'un Critère un geste de plus (ADR-0004). L'index dit ce
 * qui est vrai du contrat : tout ce qui n'est pas un champ propre est une
 * valeur de Critère, ou rien.
 *
 * Le compilateur ne rattrape donc pas une divergence entre les deux côtés :
 * ce sont les tests fonctionnels Japa qui tiennent ce contrat (ADR-0010), et
 * ils décrivent la liste exacte des champs que l'API rend.
 */
export interface BienApi {
  id: number;
  libelle: string;
  urlAnnonce: string | null;

  /**
   * Les Notes : le texte libre du Bien, `null` tant que rien n'y a été écrit
   * (#8). L'API ne rend jamais la chaîne vide — un champ effacé arrive à
   * `null`, comme l'URL de l'Annonce.
   *
   * **Absentes de la liste** : `GET /biens` ne les rapatrie pas, aucun écran
   * de liste ne les affichant, et un seul Bien bien rempli y pèserait plus
   * lourd que tout le reste réuni. Seule la fiche (`GET /biens/:id`) les
   * porte, d'où l'`undefined` admis ici — c'est l'adapter qui ramène les deux
   * cas à « rien d'écrit ».
   */
  notes?: string | null;

  /**
   * Le cycle de vie (#7). L'API le rend sur tout Bien : c'est la seule
   * colonne obligatoire du carnet avec le Libellé, un Bien étant toujours
   * quelque part dans la recherche.
   */
  statut: string;

  /**
   * Les champs liés au Statut, rendus même à une étape où ils n'ont pas de
   * valeur — « pas encore » y arrive comme `null`, jamais comme une clé
   * absente. La date est une chaîne `YYYY-MM-DD` : c'est un jour, sans
   * heure ni fuseau.
   */
  dateVisite: string | null;
  montantDerniereOffre: number | null;

  createdAt: string;
  updatedAt: string;

  /**
   * La photo représentative, seule, dans un tableau d'au plus un élément
   * (#13). L'API ne rapatrie pas la galerie avec la liste : une vignette
   * suffit à reconnaître un Bien, et vingt photos par Bien feraient voyager
   * vingt fois trop.
   *
   * La galerie complète se demande à part, par `GET /biens/:id/photos`.
   */
  photos?: PhotoApi[];

  /**
   * L'index reste borné aux valeurs de Critères : c'est ce qu'il décrit —
   * tout ce qui n'est pas un champ propre est une valeur de Critère, ou
   * rien. `photos` est déclaré au-dessus et **exclu** de l'index, faute de
   * quoi chaque valeur lue par identifiant de Critère traînerait derrière
   * elle le type d'un tableau de photos, jusque dans les cartes du front.
   */
  [critere: string]: ValeurCritere | PhotoApi[] | undefined;
}

/** Les données acceptées par l'API pour créer un Bien. */
export interface CreationBienApi {
  libelle: string;
  urlAnnonce?: string;
}

/**
 * Les données acceptées par l'API pour modifier un Bien : les seuls champs
 * transmis, et eux seuls, sont écrits (#6).
 *
 * Un champ absent n'est pas touché ; un champ à `null` est vidé. C'est cette
 * distinction qui permet à l'assistant d'enregistrer une réponse sans
 * effacer les Critères qu'il n'a pas encore demandés.
 */
export type ModificationBienApi = Readonly<Record<string, ValeurCritere>>;

/** Une erreur de validation renvoyée par l'API, champ par champ. */
export interface ErreurValidationApi {
  message: string;
  field: string;
  rule: string;
}

export interface ReponseErreurValidationApi {
  errors: ErreurValidationApi[];
}
