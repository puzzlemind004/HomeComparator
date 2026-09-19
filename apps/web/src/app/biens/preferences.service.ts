import { Injectable, computed, signal } from '@angular/core';
import { POIDS_MAXIMUM, POIDS_PAR_DEFAUT, type Poids, type PoidsPoses } from '../criteres/score';
import {
  type Rattachement,
  type Theme,
  identifiantDeTheme,
  libelleDeThemeValide,
} from '../criteres/themes';

/**
 * Ce que l'acheteur a dit de ses priorités : les poids de chaque Critère,
 * les thèmes qu'il a créés, et les Commentaires qu'il y a rattachés (#126).
 *
 * **Pourquoi le navigateur et non la base.** Ce ne sont pas des données de
 * Bien mais des préférences de lecture : elles ne décrivent aucun logement,
 * elles disent comment l'acheteur veut les regarder. L'outil n'a qu'un
 * utilisateur (ADR-0011), et rien ici ne se perd qu'un mouvement de curseur
 * ne refasse en trois secondes — ce qui les distingue d'un Bien saisi à la
 * main, qui ne se retrouve pas (ADR-0001) et justifie la Sauvegarde
 * (ADR-0007).
 *
 * **La contrepartie est assumée** : les poids n'entrent pas dans la
 * Sauvegarde, et changer de navigateur les remet à leur valeur par défaut.
 * Le jour où ils mériteront de survivre — s'ils se chargent de rattachements
 * nombreux, longs à refaire — ils passeront en base, et c'est ce service qui
 * changera de source sans qu'aucun écran soit retouché.
 *
 * L'état est tenu en signaux et le stockage n'est qu'une copie : l'écran lit
 * les signaux, et chaque écriture les sauve. C'est ce qui permet au
 * classement de se recalculer à chaque mouvement de curseur sans relire le
 * stockage à chaque fois.
 */

const CLE_POIDS = 'homecomparator.poids';
const CLE_THEMES = 'homecomparator.themes';
const CLE_RATTACHEMENTS = 'homecomparator.rattachements';

@Injectable({ providedIn: 'root' })
export class Preferences {
  private readonly poidsEcrits = signal<PoidsPoses>(lire(CLE_POIDS, {}));
  private readonly themesEcrits = signal<readonly Theme[]>(lire(CLE_THEMES, []));
  private readonly rattachementsEcrits = signal<readonly Rattachement[]>(
    lire(CLE_RATTACHEMENTS, []),
  );

  readonly poids = this.poidsEcrits.asReadonly();
  readonly themes = this.themesEcrits.asReadonly();
  readonly rattachements = this.rattachementsEcrits.asReadonly();

  /**
   * Vrai tant qu'aucun poids n'a été posé : l'écran s'en sert pour dire que
   * le classement qu'il montre est celui du carnet, et non celui de
   * l'acheteur.
   */
  readonly aucunPoidsPose = computed(() => Object.keys(this.poids()).length === 0);

  /**
   * Le poids d'un Critère, borné, quelle qu'ait été la valeur reçue.
   *
   * `NaN` est ramené au défaut et non borné : `Math.min`/`Math.max` le
   * laissent passer intact, et il se sérialiserait en `null` — un poids que
   * la relecture suivante prendrait pour une absence. Inatteignable par le
   * curseur, mais c'est le propre d'un garde que de tenir aussi pour ce qui
   * n'arrive pas encore.
   */
  poser(critereId: string, poids: Poids): void {
    const demande = Number(poids);
    const borne = (
      Number.isFinite(demande)
        ? Math.max(0, Math.min(POIDS_MAXIMUM, Math.round(demande)))
        : POIDS_PAR_DEFAUT
    ) as Poids;

    this.poidsEcrits.update((poids) => ({ ...poids, [critereId]: borne }));
    ecrire(CLE_POIDS, this.poidsEcrits());
  }

  /**
   * Remet tous les poids à leur valeur par défaut, en vidant la carte plutôt
   * qu'en la remplissant : un poids absent vaut déjà le défaut (voir
   * `scorer`), et l'écrire partout ferait de « jamais touché » et de « remis
   * à 3 » deux états indiscernables au stockage.
   */
  reinitialiserPoids(): void {
    this.poidsEcrits.set({});
    ecrire(CLE_POIDS, {});
  }

  /** Crée un thème, et rend son identifiant — ou `null` si le nom est vide. */
  creerTheme(libelle: string): string | null {
    if (!libelleDeThemeValide(libelle)) {
      return null;
    }

    const theme: Theme = {
      id: identifiantDeTheme(libelle, this.themes()),
      libelle: libelle.trim(),
    };

    this.themesEcrits.update((themes) => [...themes, theme]);
    ecrire(CLE_THEMES, this.themesEcrits());

    return theme.id;
  }

  /**
   * Supprime un thème, ses rattachements et son poids d'un seul geste.
   *
   * Les trois vont ensemble : un rattachement vers un thème disparu ne se
   * rattache plus à rien, et un poids orphelin reviendrait s'appliquer à un
   * thème recréé sous le même nom.
   */
  supprimerTheme(themeId: string): void {
    this.themesEcrits.update((themes) => themes.filter((theme) => theme.id !== themeId));
    this.rattachementsEcrits.update((rattachements) =>
      rattachements.filter((rattachement) => rattachement.themeId !== themeId),
    );
    this.poidsEcrits.update((poids) =>
      Object.fromEntries(Object.entries(poids).filter(([id]) => id !== themeId)),
    );

    ecrire(CLE_THEMES, this.themesEcrits());
    ecrire(CLE_RATTACHEMENTS, this.rattachementsEcrits());
    ecrire(CLE_POIDS, this.poidsEcrits());
  }

  /** Renomme un thème sans toucher à ses Commentaires ni à son poids. */
  renommerTheme(themeId: string, libelle: string): void {
    if (!libelleDeThemeValide(libelle)) {
      return;
    }

    this.themesEcrits.update((themes) =>
      themes.map((theme) =>
        theme.id === themeId ? { ...theme, libelle: libelle.trim() } : theme,
      ),
    );
    ecrire(CLE_THEMES, this.themesEcrits());
  }

  /**
   * Rattache un Commentaire à un thème, ou l'en détache s'il y était déjà.
   *
   * Un Commentaire peut appartenir à plusieurs thèmes : « la cuisine donne
   * sur la rue bruyante » parle de la cuisine **et** du voisinage, et forcer
   * un choix ferait perdre la moitié de ce qui a été observé.
   */
  basculerRattachement(commentaireId: number, bienId: number, themeId: string): void {
    // Le Bien entre dans la comparaison comme il entre dans l'écriture : un
    // Commentaire appartient à un Bien et à un seul, mais lire sur deux clés
    // quand on en écrit trois laisse la porte ouverte à un rattachement qu'on
    // croit retirer sans y parvenir.
    const present = this.rattachements().some(
      (rattachement) =>
        rattachement.commentaireId === commentaireId &&
        rattachement.bienId === bienId &&
        rattachement.themeId === themeId,
    );

    this.rattachementsEcrits.update((rattachements) =>
      present
        ? rattachements.filter(
            (rattachement) =>
              !(
                rattachement.commentaireId === commentaireId &&
                rattachement.bienId === bienId &&
                rattachement.themeId === themeId
              ),
          )
        : [...rattachements, { commentaireId, bienId, themeId }],
    );

    ecrire(CLE_RATTACHEMENTS, this.rattachementsEcrits());
  }

  /**
   * Oublie les rattachements des Biens qui ne sont plus au carnet.
   *
   * Un Bien supprimé emporte ses Commentaires, et leurs rattachements ne
   * désignent plus rien : les garder ferait grossir le stockage d'une
   * poussière qu'aucun écran ne lit. À n'appeler que sur une liste
   * réellement chargée — une API muette n'est pas une suppression.
   */
  oublierLesDisparus(bienIds: readonly number[]): void {
    const presents = new Set(bienIds);

    this.rattachementsEcrits.update((rattachements) =>
      rattachements.filter((rattachement) => presents.has(rattachement.bienId)),
    );
    ecrire(CLE_RATTACHEMENTS, this.rattachementsEcrits());
  }
}

/**
 * Ce que le stockage porte sous cette clé, ou le défaut.
 *
 * Tout échec rend le défaut : le stockage peut être refusé — navigation
 * privée, cookies bloqués —, et un tableau de bord qui planterait au montage
 * pour une préférence illisible serait un écran perdu pour une poussière. Un
 * JSON corrompu se réécrit au premier mouvement de curseur.
 */
function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle);

    return brut === null ? defaut : (JSON.parse(brut) as T);
  } catch {
    return defaut;
  }
}

/** Sauve, et se tait si le stockage n'en veut pas — voir `lire`. */
function ecrire(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Le stockage est plein ou refusé : l'écran continue de fonctionner sur
    // ses signaux, et seule la persistance est perdue.
  }
}
