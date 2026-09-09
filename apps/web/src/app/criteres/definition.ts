import type { Critere, GroupeCritere } from './critere';

/**
 * La définition centralisée des Critères : chacun déclaré une seule fois,
 * avec son type, son unité, son groupe, son ordre et son sens de comparaison
 * (ADR-0004).
 *
 * C'est le fichier dont dérivent le formulaire, la fiche, le tableau
 * desktop, les cartes mobiles, la comparaison et l'assistant de complétion.
 * Aucun de ces écrans n'énumère les Critères à la main ; ils lisent cette
 * liste. Sans cela, ajouter un Critère toucherait quatre écrans et ne se
 * ferait jamais.
 *
 * **Ajouter un Critère demande deux gestes** : une entrée ici, et une ligne
 * de colonne nullable dans une migration côté API (ADR-0004). L'`id` doit
 * être le nom du champ tel que l'API l'échange.
 *
 * La migration s'accompagne de son champ `@column()` dans le modèle Lucid,
 * sans lequel la colonne existerait sans être lue : c'est la même intention
 * écrite deux fois, du côté du schéma et du côté de l'ORM, et non un
 * troisième endroit où décider quoi que ce soit. Aucun écran n'est touché,
 * ce qui est tout l'objet de ce fichier.
 *
 * Ce fichier ne stocke aucune donnée de Bien : rien que des métadonnées de
 * présentation et de comparaison.
 */
export const CRITERES: readonly Critere[] = [
  {
    id: 'prixDemande',
    libelle: 'Prix demandé',
    type: 'entier',
    unite: '€',
    groupe: 'budget',
    ordre: 10,
    sensComparaison: 'plusPetitEstMeilleur',
    valeurs: null,
  },
  {
    id: 'taxeFonciere',
    libelle: 'Taxe foncière',
    type: 'entier',
    unite: '€/an',
    groupe: 'budget',
    ordre: 20,
    sensComparaison: 'plusPetitEstMeilleur',
    valeurs: null,
  },
  {
    id: 'chargesCopropriete',
    libelle: 'Charges de copropriété',
    type: 'entier',
    unite: '€/mois',
    groupe: 'budget',
    ordre: 30,
    sensComparaison: 'plusPetitEstMeilleur',
    valeurs: null,
  },
  {
    id: 'surfaceHabitable',
    libelle: 'Surface habitable',
    type: 'decimal',
    unite: 'm²',
    groupe: 'logement',
    ordre: 40,
    sensComparaison: 'plusGrandEstMeilleur',
    valeurs: null,
  },
  {
    id: 'nombrePieces',
    libelle: 'Nombre de pièces',
    type: 'entier',
    unite: null,
    groupe: 'logement',
    ordre: 50,
    sensComparaison: 'plusGrandEstMeilleur',
    valeurs: null,
  },
  {
    id: 'typeBien',
    libelle: 'Type de Bien',
    type: 'enumeration',
    unite: null,
    groupe: 'logement',
    ordre: 60,
    // Une maison ne vaut pas mieux qu'un appartement : c'est une préférence,
    // pas un classement.
    sensComparaison: 'aucun',
    valeurs: [
      { valeur: 'appartement', libelle: 'Appartement' },
      { valeur: 'maison', libelle: 'Maison' },
      { valeur: 'loft', libelle: 'Loft' },
      { valeur: 'autre', libelle: 'Autre' },
    ],
  },
  {
    id: 'anneeConstruction',
    libelle: 'Année de construction',
    type: 'entier',
    unite: null,
    groupe: 'logement',
    ordre: 70,
    // Le récent demande moins de travaux et isole mieux ; à défaut d'un
    // critère plus fin, c'est le sens qui rend service au premier coup d'œil.
    sensComparaison: 'plusGrandEstMeilleur',
    valeurs: null,
  },
  {
    id: 'travauxAPrevoir',
    libelle: 'Travaux à prévoir',
    type: 'enumeration',
    unite: null,
    groupe: 'logement',
    ordre: 80,
    // Ordonné du meilleur au pire : moins il y a de travaux, mieux c'est.
    sensComparaison: 'plusPetitEstMeilleur',
    valeurs: [
      { valeur: 'aucun', libelle: 'Aucun' },
      { valeur: 'rafraichissement', libelle: 'Rafraîchissement' },
      { valeur: 'importants', libelle: 'Importants' },
      { valeur: 'lourds', libelle: 'Lourds' },
    ],
  },
  {
    id: 'adresse',
    libelle: 'Adresse',
    type: 'texte',
    unite: null,
    groupe: 'localisation',
    ordre: 90,
    sensComparaison: 'aucun',
    valeurs: null,
  },
  {
    id: 'villeQuartier',
    libelle: 'Ville ou quartier',
    type: 'texte',
    unite: null,
    groupe: 'localisation',
    ordre: 100,
    sensComparaison: 'aucun',
    valeurs: null,
  },
  {
    id: 'tempsTrajetTravail',
    libelle: 'Trajet domicile-travail',
    type: 'entier',
    unite: 'min',
    groupe: 'localisation',
    ordre: 110,
    sensComparaison: 'plusPetitEstMeilleur',
    valeurs: null,
  },
  {
    id: 'capaciteStationnement',
    libelle: 'Stationnement',
    type: 'entier',
    // Un nombre de véhicules : « 2 » se lit sans unité, et « 2 places »
    // s'écrirait deux fois si la colonne portait déjà l'unité.
    unite: null,
    groupe: 'confort',
    ordre: 120,
    sensComparaison: 'plusGrandEstMeilleur',
    valeurs: null,
  },
  {
    id: 'dpe',
    libelle: 'DPE',
    type: 'enumeration',
    unite: null,
    groupe: 'confort',
    ordre: 130,
    // A vaut mieux que G, et l'ordre de la liste le dit : la comparaison lit
    // le rang, pas la lettre.
    sensComparaison: 'plusPetitEstMeilleur',
    valeurs: [
      { valeur: 'A', libelle: 'A' },
      { valeur: 'B', libelle: 'B' },
      { valeur: 'C', libelle: 'C' },
      { valeur: 'D', libelle: 'D' },
      { valeur: 'E', libelle: 'E' },
      { valeur: 'F', libelle: 'F' },
      { valeur: 'G', libelle: 'G' },
    ],
  },
  {
    id: 'typeChauffage',
    libelle: 'Type de chauffage',
    type: 'enumeration',
    unite: null,
    groupe: 'confort',
    ordre: 140,
    // Le coût et le confort d'une énergie dépendent trop du logement pour
    // qu'un classement général ait du sens ; le DPE porte déjà ce jugement.
    sensComparaison: 'aucun',
    valeurs: [
      { valeur: 'individuelGaz', libelle: 'Individuel gaz' },
      { valeur: 'individuelElectrique', libelle: 'Individuel électrique' },
      { valeur: 'pompeAChaleur', libelle: 'Pompe à chaleur' },
      { valeur: 'collectif', libelle: 'Collectif' },
      { valeur: 'bois', libelle: 'Bois' },
      { valeur: 'autre', libelle: 'Autre' },
    ],
  },
  {
    id: 'exterieur',
    libelle: 'Extérieur',
    type: 'enumeration',
    unite: null,
    groupe: 'confort',
    ordre: 150,
    // Ordonné du moins au plus : un jardin est l'extérieur le plus ample,
    // donc le sens va vers le plus grand rang.
    sensComparaison: 'plusGrandEstMeilleur',
    valeurs: [
      { valeur: 'aucun', libelle: 'Aucun' },
      { valeur: 'balcon', libelle: 'Balcon' },
      { valeur: 'terrasse', libelle: 'Terrasse' },
      { valeur: 'jardin', libelle: 'Jardin' },
    ],
  },
];

/**
 * Les Critères dans l'ordre où les écrans les affichent. La liste est déjà
 * écrite dans cet ordre ; ce tri la rend indépendante de l'ordre du fichier,
 * pour qu'insérer une entrée au mauvais endroit n'ait aucun effet visible.
 */
export const CRITERES_ORDONNES: readonly Critere[] = [...CRITERES].sort(
  (a, b) => a.ordre - b.ordre,
);

/** Le Critère portant cet identifiant, ou `undefined` s'il n'existe pas. */
export function critereParId(id: string): Critere | undefined {
  return CRITERES.find((critere) => critere.id === id);
}

/**
 * Les Critères d'un groupe, dans l'ordre d'affichage. Les sections du
 * formulaire et les blocs de la fiche s'en servent (#6).
 */
export function criteresDuGroupe(groupe: Critere['groupe']): readonly Critere[] {
  return CRITERES_ORDONNES.filter((critere) => critere.groupe === groupe);
}

/**
 * Les groupes dans l'ordre où les écrans les présentent, avec le titre sous
 * lequel ils s'affichent.
 *
 * L'ordre est celui d'un déroulé de visite : ce que ça coûte, ce que c'est,
 * où c'est, comment on y vit.
 *
 * Le titre vit ici et non dans la fiche, pour la même raison que le libellé
 * d'un Critère (ADR-0004) : un groupe ajouté à `GroupeCritere` doit traverser
 * les écrans sans qu'aucun soit retouché. Déclaré dans la fiche, il aurait
 * fallu penser à l'y ajouter, et ses Critères auraient disparu en silence.
 */
export const GROUPES: readonly { groupe: GroupeCritere; libelle: string }[] = [
  { groupe: 'budget', libelle: 'Budget' },
  { groupe: 'logement', libelle: 'Logement' },
  { groupe: 'localisation', libelle: 'Localisation' },
  { groupe: 'confort', libelle: 'Confort' },
];
