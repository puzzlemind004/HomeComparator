import type { ValeurCritere } from './comparaison';

/**
 * Le cycle de vie d'un Bien : l'étape où il se trouve dans la recherche, et
 * les champs qui n'existent qu'à partir de cette étape (#7, ADR-0002).
 *
 * Ce module vit à côté de la définition des Critères sans en faire partie,
 * et la distinction est celle du glossaire : un **Critère** est renseigné
 * pour tous les Biens et se compare de l'un à l'autre ; le **Statut**, lui,
 * ne se compare pas — il décide de ce qui est pertinent. Les mêler ferait
 * apparaître le Statut comme une colonne du tableau (#10) et une question de
 * l'assistant, ce qu'il n'est ni l'un ni l'autre.
 *
 * Comme `definition.ts`, ce fichier ne fait aucune entrée-sortie et ne
 * dépend pas d'Angular : la fiche, la liste et le futur tableau le lisent,
 * et « quels champs sont pertinents à cette étape » se vérifie sans monter
 * de composant.
 */

/**
 * Les six Statuts, dans l'ordre du cycle.
 *
 * L'ordre porte du sens : c'est de lui que se déduit à partir de quelle
 * étape un champ devient pertinent. Il ne contraint **rien** — aucune
 * transition n'est interdite, les sorties sont atteignables depuis n'importe
 * quel état et tout retour arrière est permis (#7). Un outil personnel n'a
 * pas à empêcher son unique utilisateur de corriger un état.
 */
export type Statut = 'aContacter' | 'aVisiter' | 'visite' | 'offreFaite' | 'ecarte' | 'vendu';

/**
 * Ce qu'un Statut est dans le cycle : une étape qu'on traverse, ou une
 * sortie qui met fin à la recherche pour ce Bien.
 *
 * La distinction sert l'affichage — les sorties se présentent à part, après
 * les étapes — et elle dit surtout que la progression des étapes est ce dont
 * se déduit la pertinence d'un champ. Une sortie, elle, ne rend aucun champ
 * pertinent qui ne le serait pas déjà.
 */
export type NatureStatut = 'etape' | 'sortie';

/** La déclaration d'un Statut : tout ce que les écrans ont à en savoir. */
export interface DefinitionStatut {
  /** L'identifiant, qui est aussi la valeur que l'API échange. */
  valeur: Statut;

  /** Ce que l'acheteur lit à l'écran. */
  libelle: string;

  nature: NatureStatut;

  /**
   * Le rang dans le cycle, dont se déduit à partir de quelle étape un champ
   * devient pertinent.
   *
   * Les sorties portent le rang de l'étape la plus avancée : un Bien écarté
   * ou vendu a pu l'être à n'importe quel moment, et ce qui avait été saisi
   * reste consultable — c'est tout l'intérêt de garder trace d'un refus.
   * Les masquer reviendrait à effacer à l'écran ce que la base conserve.
   */
  rang: number;
}

/**
 * Les six Statuts, déclarés une seule fois. La liste est écrite dans l'ordre
 * du cycle, et c'est l'ordre dans lequel les écrans les présentent.
 */
export const STATUTS: readonly DefinitionStatut[] = [
  { valeur: 'aContacter', libelle: 'À contacter', nature: 'etape', rang: 0 },
  { valeur: 'aVisiter', libelle: 'À visiter', nature: 'etape', rang: 1 },
  { valeur: 'visite', libelle: 'Visité', nature: 'etape', rang: 2 },
  { valeur: 'offreFaite', libelle: 'Offre faite', nature: 'etape', rang: 3 },

  /**
   * Les deux sorties. Écarté est une décision de l'acheteur, Vendu un fait
   * extérieur : les distinguer sert à savoir, en relisant le carnet, si le
   * Bien a été refusé ou s'il est parti.
   */
  { valeur: 'ecarte', libelle: 'Écarté', nature: 'sortie', rang: 3 },
  { valeur: 'vendu', libelle: 'Vendu', nature: 'sortie', rang: 3 },
];

/** Le Statut d'un Bien nouvellement créé : il vient d'être repéré (#7). */
export const STATUT_INITIAL: Statut = 'aContacter';

/**
 * Un champ qui n'existe qu'à partir d'une étape du cycle (ADR-0002).
 *
 * Ce n'est pas un Critère : il ne se compare pas d'un Bien à l'autre, parce
 * que tous les Biens ne sont pas au même endroit du cycle. Il n'a donc rien
 * à faire dans `CRITERES`, où le tableau et la comparaison vont chercher
 * leurs colonnes.
 */
export interface ChampStatut {
  /** L'identifiant, qui est aussi le nom du champ tel que l'API l'échange. */
  id: string;

  libelle: string;

  /** La nature du champ, qui décide de la façon dont il se saisit. */
  type: 'date' | 'entier';

  unite: string | null;

  /**
   * Le Statut à partir duquel le champ devient pertinent. Le formulaire ne
   * l'affiche pas avant, et c'est le principal levier de simplicité de la
   * saisie (ADR-0002).
   */
  depuis: Statut;
}

/**
 * Les champs liés au Statut, déclarés une seule fois comme le sont les
 * Critères (ADR-0004).
 *
 * Ils sont deux aujourd'hui. Un troisième s'ajouterait ici, avec sa colonne
 * en migration, et la fiche l'afficherait à la bonne étape sans être
 * retouchée — c'est tout l'objet de cette liste.
 */
export const CHAMPS_STATUT: readonly ChampStatut[] = [
  {
    id: 'dateVisite',
    libelle: 'Date de visite',
    type: 'date',
    unite: null,
    // Le rendez-vous se fixe une fois le contact établi. Elle peut rester
    // vide tant qu'il ne l'est pas : c'est l'état ordinaire du Bien qu'on
    // vient d'appeler (#7).
    depuis: 'aVisiter',
  },
  {
    id: 'montantDerniereOffre',
    libelle: 'Montant de la dernière offre',
    type: 'entier',
    unite: '€',
    depuis: 'offreFaite',
  },
];

/** La déclaration du Statut portant cette valeur, ou `undefined`. */
export function statutParValeur(valeur: string): DefinitionStatut | undefined {
  return STATUTS.find((statut) => statut.valeur === valeur);
}

/**
 * Le libellé sous lequel un Statut s'affiche.
 *
 * Une valeur hors définition s'affiche telle quelle, comme le fait
 * `formaterValeur` pour une énumération de Critère : montrer ce qui est en
 * base vaut mieux qu'une case vide, qui se lirait « non renseigné ».
 */
export function libelleStatut(valeur: string): string {
  return statutParValeur(valeur)?.libelle ?? valeur;
}

/**
 * Vrai quand ce champ est pertinent pour ce Statut, c'est-à-dire quand le
 * cycle a atteint l'étape dont le champ dépend (ADR-0002).
 *
 * Un Statut inconnu ne rend aucun champ pertinent : à défaut de savoir où en
 * est le Bien, la fiche s'en tient à ce dont elle est sûre plutôt que de
 * montrer un champ qui n'a peut-être pas lieu d'être.
 */
export function estPertinent(champ: ChampStatut, statut: string): boolean {
  const courant = statutParValeur(statut);
  const requis = statutParValeur(champ.depuis);

  if (!courant || !requis) {
    return false;
  }

  return courant.rang >= requis.rang;
}

/**
 * Les champs pertinents pour ce Statut, dans l'ordre de la déclaration.
 *
 * C'est ce que la fiche affiche, et rien d'autre : reculer dans le cycle
 * fait disparaître un champ de l'écran, **sans que sa valeur soit effacée**
 * (ADR-0002). C'est la base qui la conserve, et c'est ici qu'on choisit de
 * ne pas la montrer.
 */
export function champsPertinents(statut: string): readonly ChampStatut[] {
  return CHAMPS_STATUT.filter((champ) => estPertinent(champ, statut));
}

/**
 * Les valeurs que le Bien porte sur les champs liés au Statut, indexées par
 * identifiant — la même forme que `ValeursCriteres`, pour la même raison :
 * la fiche parcourt la déclaration et lit la valeur au passage.
 */
export type ValeursChampsStatut = Readonly<Record<string, ValeurCritere>>;
