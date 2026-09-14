/**
 * Ce qui se sélectionne pour la comparaison face-à-face (#12) : quels Biens,
 * combien, et ce qu'il advient de la sélection quand l'écran change.
 *
 * Le module ne fait aucune entrée-sortie et ne dépend pas d'Angular, comme
 * ses voisins de `criteres/` : les règles de la sélection — le plafond, ce
 * que devient un Bien en trop, ce qui arrive à un Bien qui a cessé
 * d'exister — se vérifient sans monter d'écran.
 *
 * La sélection est une liste d'identifiants et non un ensemble : **l'ordre
 * porte une information**, celui des colonnes du face-à-face. Un `Set`
 * rendrait cet ordre dépendant de l'implémentation, et les colonnes
 * changeraient de place sans qu'on l'ait demandé.
 */

/** Ce qu'il faut de Biens pour qu'il y ait quelque chose à comparer. */
export const MINIMUM_COMPARAISON = 2;

/**
 * Le maximum sur écran étroit : deux Biens.
 *
 * Deux colonnes étroites restent lisibles sur un téléphone, ce qui permet de
 * trancher pendant une visite — c'est précisément là que le face-à-face sert
 * (#12). ADR-0006 pose cette limite en même temps que le choix des cartes
 * contre le tableau : une troisième colonne sur un écran de téléphone
 * ramènerait le défilement horizontal que l'ADR rejette.
 */
export const MAXIMUM_MOBILE = 2;

/**
 * Le maximum sur écran large : quatre Biens.
 *
 * La largeur disponible en autorise davantage (#12). Quatre et non pas
 * toute la liste : le face-à-face sert à départager des finalistes, et
 * au-delà de quatre colonnes il redeviendrait le tableau, qui est déjà là
 * pour parcourir toute la recherche. Le libellé de chaque Bien doit aussi
 * rester lisible en en-tête de colonne.
 */
export const MAXIMUM_DESKTOP = 4;

/**
 * La sélection après un clic sur ce Bien : il s'ajoute, ou il se retire.
 *
 * L'ajout se fait **à la fin**, ce qui fixe l'ordre des colonnes : c'est
 * l'ordre dans lequel l'acheteur les a choisies, et le seul qui ne fasse pas
 * bouger les colonnes déjà posées quand il en ajoute une.
 *
 * Au plafond, l'ajout est **refusé** plutôt que de faire sortir le plus
 * ancien. Faire tourner un Bien dehors lui ferait perdre un finaliste sans
 * qu'il l'ait demandé, et sur mobile — où le plafond est de deux — chaque
 * clic remplacerait silencieusement une colonne sur deux. C'est à l'écran de
 * dire que le plafond est atteint, et à l'acheteur de retirer ce dont il ne
 * veut plus.
 *
 * Le retrait, lui, n'est jamais borné : sans quoi une sélection pleine
 * serait un cul-de-sac.
 *
 * L'état est une valeur, jamais muté : chaque clic en rend un nouveau, comme
 * le fait le tri du tableau (#10). L'écran n'a qu'un signal à remplacer.
 */
export function basculerSelection(
  selection: readonly number[],
  bienId: number,
  maximum: number,
): number[] {
  if (selection.includes(bienId)) {
    return selection.filter((candidat) => candidat !== bienId);
  }

  if (selection.length >= maximum) {
    return [...selection];
  }

  return [...selection, bienId];
}

/**
 * La sélection ramenée à ce que l'écran peut réellement comparer : dans le
 * plafond, et sur des Biens qui existent encore.
 *
 * Deux choses la rendent caduque sans qu'on y touche, et **elles ne se
 * valent pas** (#93).
 *
 * Le **plafond se resserre** quand la fenêtre rétrécit sous le seuil : trois
 * colonnes choisies au bureau ne tiennent plus sur un téléphone. Les
 * premières choisies restent — couper par la fin laisse en place les
 * colonnes qui n'ont pas bougé, là où couper par le début les ferait toutes
 * glisser d'un cran. Ce qui dépasse est écarté pour de bon : la place
 * n'existe pas, et retenir des colonnes invisibles les ferait resurgir à
 * l'élargissement, longtemps après le geste qui les a choisies.
 *
 * Un **Bien cesse d'exister** quand il est supprimé : il ne reviendra dans
 * aucune liste, et le retenir en ferait une colonne fantôme dont l'écran
 * n'a plus les valeurs. Le tri des Biens retirés se fait avant le plafond,
 * pour qu'un Bien disparu libère une place plutôt que d'en laisser une vide.
 *
 * Ce que la fonction ne fait **pas** : conclure à la disparition d'un Bien
 * de son absence d'une liste. Un filtre par Statut est un geste de lecture,
 * pas une décision sur la comparaison — il ne dit rien de plus que « pas
 * ici, pas maintenant ». Un Bien qu'il masque garde donc sa place, revient
 * tel quel à l'ouverture du filtre, et occupe entre-temps une place sous le
 * plafond : sans cela, jouer sur les filtres ferait dépasser le maximum.
 * C'est pourquoi le paramètre nomme les Biens **retirés** et non ceux qui
 * sont disponibles ; l'appelant doit savoir qu'un Bien a disparu pour le
 * dire, là où une liste de disponibles laissait le filtrage le prétendre
 * sans que rien ne l'en empêche.
 *
 * `retires` est facultatif : l'appel qui ne fait que replier le plafond n'a
 * aucune disparition à signaler.
 */
export function selectionAjustee(
  selection: readonly number[],
  maximum: number,
  retires?: readonly number[],
): number[] {
  const existants = retires
    ? selection.filter((bienId) => !retires.includes(bienId))
    : [...selection];

  return existants.slice(0, maximum);
}

/**
 * Vrai quand il y a de quoi comparer : deux Biens au moins.
 *
 * Un Bien seul ne se compare à rien, et une colonne solitaire avec ses
 * valeurs en regard d'aucune autre n'apprendrait rien — c'est la fiche du
 * Bien, qui existe déjà. L'écran dit alors ce qu'il attend plutôt que
 * d'afficher un face-à-face qui n'en est pas un.
 *
 * Le paramètre ne dit que sa longueur, et c'est tout ce dont la règle a
 * besoin : l'appelant compte tantôt des identifiants retenus, tantôt les
 * Biens dont il a réellement les valeurs à mettre en colonne — et depuis
 * #93 les deux peuvent différer, un Bien masqué par un filtre restant
 * retenu sans être affichable.
 */
export function comparaisonPossible(colonnes: readonly unknown[]): boolean {
  return colonnes.length >= MINIMUM_COMPARAISON;
}
