import { Component, computed, input } from '@angular/core';

/**
 * Une barre du diagramme : un Bien, son score, et sa place.
 *
 * Le libellé est déjà là — le diagramme ne va pas rechercher les Biens qu'on
 * lui demande de dessiner.
 */
export interface BarreScore {
  bienId: number;
  libelle: string;

  /** Le score sur 100, ou `null` pour un Bien qui n'en a pas. */
  score: number | null;

  /** Le rang dans le classement, à partir de 1. */
  rang: number;
}

/**
 * Le diagramme en bâtons du tableau de bord (#126) : les Biens en abscisse,
 * leur score en ordonnée.
 *
 * C'est la lecture principale de l'écran. Un classement en liste dit qui
 * gagne ; le diagramme dit **de combien**, et c'est la question qui décide
 * d'une seconde visite — trois Biens à 78, 76 et 74 ne se départagent pas
 * vraiment, là où 82, 61 et 45 tranchent. Cette information n'est lisible
 * que par la hauteur comparée des bâtons.
 *
 * **En SVG et sans bibliothèque.** Un diagramme en bâtons est une suite de
 * rectangles dont la hauteur est proportionnelle à une valeur : la
 * bibliothèque qui le dessinerait ferait entrer un paquet au poids
 * disproportionné pour remplacer une multiplication. Le SVG se met à
 * l'échelle, hérite des jetons de couleur, et se lit par les lecteurs
 * d'écran dès lors qu'on lui pose les rôles — ce que fait le gabarit.
 *
 * **L'axe part de zéro**, et cela ne se discute pas : tronquer l'ordonnée
 * pour « mieux voir les écarts » multiplierait visuellement un écart de deux
 * points, et ferait paraître décisif un classement qui ne l'est pas. C'est
 * exactement la décision que l'écran doit éclairer, et non fausser.
 */
@Component({
  selector: 'app-diagramme-scores',
  styleUrl: './diagramme-scores.scss',
  templateUrl: './diagramme-scores.html',
})
export class DiagrammeScores {
  readonly barres = input.required<readonly BarreScore[]>();

  /**
   * Les seules barres que le diagramme dessine : celles qui ont un score.
   *
   * Un Bien sans score n'a pas de hauteur — pas même zéro, qui se lirait
   * comme un mauvais score alors qu'il n'y en a pas (voir `ScoreBien`).
   * L'écran les liste à la suite, en toutes lettres, plutôt que de les
   * poser à plat sur l'axe.
   */
  readonly dessinees = computed(() =>
    this.barres().filter(
      (barre): barre is BarreScore & { score: number } => barre.score !== null,
    ),
  );

  /** Vrai quand il y a au moins un bâton à dessiner. */
  readonly rempli = computed(() => this.dessinees().length > 0);

  /**
   * Les graduations de l'ordonnée, de 0 à 100 par quarts.
   *
   * Cinq lignes suffisent à situer une hauteur, et l'échelle est fixe parce
   * que le score l'est : il est déjà ramené sur 100, et une ordonnée qui
   * s'ajusterait au meilleur du carnet ferait bouger la hauteur des bâtons
   * à chaque mouvement de curseur sans que les scores aient changé de
   * rapport.
   */
  readonly graduations: readonly number[] = [0, 25, 50, 75, 100];

  /**
   * La géométrie du dessin, en unités du `viewBox`.
   *
   * Le SVG se met à l'échelle de son conteneur ; ces nombres ne sont donc
   * pas des pixels mais des proportions, et la largeur suit le nombre de
   * barres — deux Biens ne s'étalent pas sur la largeur de douze.
   */
  readonly geometrie = computed(() => {
    const barres = this.dessinees();
    const largeurBarre = 56;
    const ecart = 22;
    const marge = { gauche: 40, droite: 16, haut: 16, bas: 56 };

    const largeurTracee = Math.max(
      barres.length * largeurBarre + Math.max(0, barres.length - 1) * ecart,
      120,
    );

    return {
      largeurBarre,
      ecart,
      marge,
      hauteurTracee: 240,
      largeur: marge.gauche + largeurTracee + marge.droite,
      hauteur: marge.haut + 240 + marge.bas,
    };
  });

  /** Les bâtons, chacun avec la boîte que le gabarit n'a plus qu'à poser. */
  readonly batons = computed(() => {
    const { largeurBarre, ecart, marge, hauteurTracee } = this.geometrie();

    return this.dessinees().map((barre, index) => {
      const hauteur = (barre.score / 100) * hauteurTracee;

      return {
        ...barre,
        x: marge.gauche + index * (largeurBarre + ecart),
        // Le SVG compte depuis le haut : un bâton haut commence haut.
        y: marge.haut + hauteurTracee - hauteur,
        largeur: largeurBarre,
        // Une hauteur nulle ne dessine rien du tout : un score de 0 laisse
        // un trait, pour que la colonne reste visible sous son libellé.
        hauteur: Math.max(hauteur, 2),
        // Le rang composé ici et non dans le gabarit : le SVG n'a pas de
        // `<sup>`, et « 1er » s'y écrit d'un seul tenant.
        ordinal: barre.rang === 1 ? '1er' : `${barre.rang}e`,
        // Le premier du classement se distingue : c'est la réponse qu'on
        // vient chercher, et la couleur la donne avant la lecture des
        // chiffres.
        premier: barre.rang === 1,
      };
    });
  });

  /** L'ordonnée de chaque graduation, du bas vers le haut. */
  readonly lignes = computed(() => {
    const { marge, hauteurTracee, largeur } = this.geometrie();

    return this.graduations.map((valeur) => ({
      valeur,
      y: marge.haut + hauteurTracee - (valeur / 100) * hauteurTracee,
      finX: largeur - 16,
      departX: marge.gauche - 6,
    }));
  });

  /**
   * Ce qu'un lecteur d'écran entend à la place du dessin.
   *
   * Un diagramme est une image pour l'œil : sans cette phrase, il ne reste
   * qu'un `<svg>` muet. Elle donne l'essentiel — qui mène, et avec quel
   * écart — plutôt que d'énumérer douze scores qu'aucune oreille ne retient.
   */
  readonly description = computed(() => {
    const batons = this.dessinees();

    if (batons.length === 0) {
      return 'Aucun Bien ne peut être classé.';
    }

    const [tete] = batons;
    const dernier = batons[batons.length - 1];

    if (batons.length === 1) {
      return `${tete.libelle} obtient ${tete.score} sur 100.`;
    }

    return (
      `${batons.length} Biens classés. ${tete.libelle} mène avec ${tete.score} sur 100, ` +
      `devant ${dernier.libelle} à ${dernier.score}.`
    );
  });
}
