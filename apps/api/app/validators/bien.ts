import vine, { SimpleMessagesProvider } from '@vinejs/vine'
import { DateTime } from 'luxon'
import { STATUTS } from '#services/statut'

/**
 * Un Bien se crée avec son seul Libellé (ADR-0008). L'URL de l'Annonce est
 * la seule autre donnée acceptée ici ; les Critères viennent ensuite, par la
 * fiche ou l'assistant de complétion (#6), chacun avec sa propre colonne
 * (ADR-0004).
 */

/**
 * Le Libellé : le seul champ obligatoire du carnet, parce que c'est par lui
 * qu'un Bien se retrouve dans les listes.
 *
 * `trim` avant `minLength` : une saisie d'espaces ne fait pas un Libellé,
 * elle ne sert pas la reconnaissance qui est la raison d'être du champ.
 */
const libelle = () => vine.string().trim().minLength(1).maxLength(255)

/**
 * Le Libellé sur une modification : absent, il n'est pas touché ; transmis,
 * il reste soumis aux mêmes règles qu'à la création.
 *
 * Chez Vine, `optional` admet aussi bien `undefined` que `null`, et court-
 * circuite les règles dans les deux cas. Un Libellé effacé — que
 * `convertEmptyStringsToNull` réduit précisément à `null` — ressortirait
 * donc inchangé avec un 200, là où l'acheteur attend qu'on lui dise que le
 * Libellé ne peut pas rester vide.
 *
 * `parse` ramène ce `null` à la chaîne vide, que `minLength` refuse avec le
 * message attendu. Seul un champ réellement absent reste `undefined`, et
 * c'est lui seul qui vaut « ne touche pas au Libellé ».
 */
const libelleModifie = () =>
  vine
    .string()
    .parse((valeur) => (valeur === null ? '' : valeur))
    .trim()
    .minLength(1)
    .maxLength(255)
    .optional()

/**
 * L'URL de l'Annonce, facultative et vidable.
 *
 * Un champ laissé vide vaut « pas d'Annonce » — donc `null` en base, et non
 * une erreur de saisie.
 *
 * Le corps de requête est déjà passé par `convertEmptyStringsToNull`
 * (`config/bodyparser.ts`), qui traite la chaîne vide. `parse` couvre ce qui
 * lui échappe : une saisie d'espaces, que le formulaire produit tout aussi
 * facilement. Il s'exécute avant les règles, donc `url` ne voit jamais la
 * chaîne vide qu'elle rejetterait.
 */
const urlAnnonce = () =>
  vine
    .string()
    .parse(videVersNull)
    .trim()
    // `maxLength` avant `url` : au-delà de la borne, c'est la longueur qu'il
    // faut annoncer, et non une adresse invalide.
    .maxLength(2048)
    /**
     * `require_protocol` est faux par défaut chez Vine, ce qui laisserait
     * passer `www.portail.test/annonce` — la forme exacte d'un copier-coller
     * depuis la barre d'adresse. Sans schéma, le `href` du lien devient un
     * chemin relatif, et « Voir l'Annonce » renvoie vers l'application.
     * Seuls http et https ont un sens pour une Annonce en ligne.
     */
    .url({ protocols: ['http', 'https'], require_protocol: true })
    .nullable()

/**
 * Une saisie sans caractère visible, ramenée à `null`.
 *
 * C'est ce que le formulaire envoie d'un champ effacé, et cela doit valoir
 * « non renseigné » — jamais zéro, jamais la chaîne vide. Toute la fiche
 * repose sur cette distinction (#6, ADR-0004).
 */
function videVersNull(valeur: unknown): unknown {
  return typeof valeur === 'string' && valeur.trim() === '' ? null : valeur
}

/**
 * Un Critère entier et positif : un prix, une taxe, un nombre de pièces.
 *
 * Toujours vidable, comme tous les Critères : rien ne bloque jamais sur une
 * information manquante (ADR-0008).
 *
 * Le négatif est refusé partout où il est refusé : aucun des huit Critères
 * entiers n'en admet un, et un prix négatif passerait pour la meilleure
 * affaire du carnet dans la comparaison (#12).
 */
const entierPositif = (max: number) =>
  vine.number().parse(videVersNull).withoutDecimals().min(0).max(max).nullable()

/** Un Critère décimal et positif : la surface habitable, aujourd'hui seule. */
const decimalPositif = (max: number) => vine.number().parse(videVersNull).min(0).max(max).nullable()

/** Un Critère de texte libre, borné à la colonne qui le reçoit. */
const texte = (max: number) => vine.string().parse(videVersNull).trim().maxLength(max).nullable()

/**
 * Un Critère d'énumération : seules les valeurs de la définition passent.
 *
 * La liste vit côté front (ADR-0004, ADR-0010) et est recopiée ici. C'est la
 * duplication qu'ADR-0010 assume, et les tests fonctionnels sont ce qui la
 * tient. Le validateur ne pouvait pas s'en passer : sans lui, une valeur
 * inventée s'écrirait en base, où la colonne est un `string` nu, et
 * ressortirait telle quelle à l'écran.
 */
const enumeration = (valeurs: readonly string[]) =>
  vine.enum(valeurs).parse(videVersNull).nullable()

/**
 * Le Statut, seul champ du carnet qui soit obligatoire sans être le Libellé
 * (#7).
 *
 * Il n'est **pas** `nullable`, à la différence de tout ce qui précède : un
 * Bien est toujours quelque part dans la recherche, et le vider ne
 * signifierait rien. Il reste `optional` sur une modification, où un champ
 * absent vaut « ne touche pas au Statut ».
 *
 * Aucune transition n'est vérifiée. Toutes sont permises depuis n'importe
 * quel état, retours arrière compris (#7) : la seule règle est que la valeur
 * soit un Statut connu.
 */
const statut = () =>
  vine
    .enum(STATUTS)
    /**
     * `parse` avant les règles, pour la même raison que sur le Libellé :
     * chez Vine, `optional` admet aussi bien `undefined` que `null` et
     * court-circuite les règles dans les deux cas. Un Statut à `null`
     * ressortirait donc inchangé avec un 200, là où l'acheteur attend qu'on
     * lui dise que le Statut ne se vide pas.
     *
     * La chaîne vide, elle, ne passe aucune des valeurs de l'énumération :
     * c'est `enum` qui la refuse, avec le message attendu. Seul un champ
     * réellement absent reste `undefined`, et lui seul vaut « ne touche pas
     * au Statut ».
     */
    .parse((valeur) => (valeur === null ? '' : valeur))

/**
 * La date de visite, à partir de « À visiter » (ADR-0002).
 *
 * Vidable comme un Critère : le rendez-vous se décale, s'annule, et la date
 * saisie doit pouvoir être retirée.
 *
 * Le format est `YYYY-MM-DD`, celui d'un champ `date` HTML et celui que
 * l'API rend. `formats` explicite plutôt que d'accepter tout ce que Vine
 * sait lire : une saisie ambiguë — « 03/04/2026 » — ne doit pas être
 * interprétée dans un ordre plutôt qu'un autre.
 */
const dateVisite = () =>
  vine
    .date({ formats: ['YYYY-MM-DD'] })
    .parse(videVersNull)
    .nullable()
    /**
     * Vine rend un `Date` de JavaScript ; la colonne Lucid est déclarée
     * `@column.date()` et n'accepte qu'un `DateTime` de Luxon, faute de quoi
     * l'écriture lève — une 500 sur une saisie pourtant valide.
     *
     * La conversion se fait ici plutôt qu'au contrôleur : celui-ci passe
     * l'objet validé à `merge` sans le parcourir, et un champ à convertir
     * au cas par cas l'obligerait à connaître chacun d'eux.
     */
    .transform((valeur) => (valeur === null ? null : DateTime.fromJSDate(valeur)))

/**
 * Les bornes hautes des Critères numériques.
 *
 * Elles ne prétendent pas juger de ce qui est un prix vraisemblable : elles
 * arrêtent la saisie qui déborderait la colonne. Un `integer` PostgreSQL
 * s'arrête à 2 147 483 647, et une valeur au-delà passerait la validation
 * pour faire échouer l'écriture — l'erreur serveur au lieu du refus lisible,
 * exactement le piège déjà rencontré sur `urlAnnonce`.
 */
const ENTIER_MAX = 2_147_483_647

/** `decimal(8, 2)` : huit chiffres au total, dont deux après la virgule. */
const SURFACE_MAX = 999_999.99

/** Les colonnes `string` sans longueur explicite sont des `varchar(255)`. */
const TEXTE_MAX = 255

export const creerBienValidator = vine.compile(
  vine.object({
    libelle: libelle(),
    urlAnnonce: urlAnnonce().optional(),
  })
)

/**
 * La modification d'un Bien depuis sa fiche ou l'assistant (#6).
 *
 * **Tous les champs sont optionnels**, y compris le Libellé : c'est ce qui
 * fait la mise à jour partielle. Un champ absent n'est pas touché ; un champ
 * à `null` est vidé. Les deux se distinguent au contrôleur, qui n'écrit que
 * les clés réellement transmises.
 *
 * Un nom de champ inconnu doit être refusé plutôt qu'ignoré — une faute de
 * frappe qui passerait en silence ferait croire à l'acheteur qu'il a saisi
 * une valeur — mais Vine laisse passer les clés qu'il ne connaît pas : c'est
 * `champInconnu` plus bas, appelé par le contrôleur, qui s'en charge.
 *
 * Chaque Critère de la définition centralisée a son entrée ici, dans le même
 * ordre (ADR-0004). Ajouter un Critère demande donc un troisième geste côté
 * API — la colonne, le champ Lucid, la règle — mais aucun côté écrans.
 *
 * Le schéma est nommé plutôt qu'écrit dans l'appel à `compile` : la liste des
 * champs acceptés s'en déduit juste en dessous, au lieu d'être recopiée dans
 * un tableau qu'un Critère ajouté oublierait.
 */
const schemaModification = vine.object({
  libelle: libelleModifie(),
  urlAnnonce: urlAnnonce().optional(),

  /**
   * Le cycle de vie (#7). Il n'est pas dans la définition des Critères et
   * n'apparaît donc dans aucun des groupes qui suivent : le Statut ne se
   * compare pas d'un Bien à l'autre, il décide de ce qui est pertinent.
   */
  statut: statut().optional(),
  dateVisite: dateVisite().optional(),
  montantDerniereOffre: entierPositif(ENTIER_MAX).optional(),

  // Budget
  prixDemande: entierPositif(ENTIER_MAX).optional(),
  taxeFonciere: entierPositif(ENTIER_MAX).optional(),
  chargesCopropriete: entierPositif(ENTIER_MAX).optional(),

  // Logement
  surfaceHabitable: decimalPositif(SURFACE_MAX).optional(),
  nombrePieces: entierPositif(ENTIER_MAX).optional(),
  typeBien: enumeration(['appartement', 'maison', 'loft', 'autre']).optional(),
  anneeConstruction: entierPositif(ENTIER_MAX).optional(),
  travauxAPrevoir: enumeration(['aucun', 'rafraichissement', 'importants', 'lourds']).optional(),

  // Localisation
  adresse: texte(TEXTE_MAX).optional(),
  villeQuartier: texte(TEXTE_MAX).optional(),
  tempsTrajetTravail: entierPositif(ENTIER_MAX).optional(),

  // Confort
  capaciteStationnement: entierPositif(ENTIER_MAX).optional(),
  dpe: enumeration(['A', 'B', 'C', 'D', 'E', 'F', 'G']).optional(),
  typeChauffage: enumeration([
    'individuelGaz',
    'individuelElectrique',
    'pompeAChaleur',
    'collectif',
    'bois',
    'autre',
  ]).optional(),
  exterieur: enumeration(['aucun', 'balcon', 'terrasse', 'jardin']).optional(),
})

export const modifierBienValidator = vine.compile(schemaModification)

/**
 * Les champs qu'une modification accepte : les quinze Critères, plus le
 * Libellé et l'URL de l'Annonce, que la fiche modifie comme les autres.
 *
 * Vine laisse passer les clés qu'il ne connaît pas plutôt que de les refuser,
 * et `champInconnu` sert au contrôleur à les rejeter quand même. Sans ce
 * refus, `prixNegocie` s'enverrait sans rien changer et sans rien dire —
 * l'acheteur croirait avoir saisi un prix.
 *
 * La liste est **dérivée du schéma** et non réécrite : recopiée, elle
 * finirait par diverger, et un Critère ajouté serait refusé à la modification
 * alors même que sa règle existe — le genre d'écart qui ne se voit qu'à
 * l'usage.
 */
export const CHAMPS_MODIFIABLES: readonly string[] = Object.keys(
  schemaModification.toJSONSchema().properties ?? {}
)

/**
 * Le premier champ de cette saisie que la modification n'accepte pas, ou
 * `undefined` si tout est reconnu. Un seul suffit à refuser la requête : la
 * réponse désigne un champ fautif, comme le fait Vine.
 */
export function champInconnu(corps: Record<string, unknown>): string | undefined {
  return Object.keys(corps).find((champ) => !CHAMPS_MODIFIABLES.includes(champ))
}

/**
 * Les messages sont rédigés pour être lus tels quels par l'acheteur : ils
 * remontent jusqu'au formulaire sans traduction intermédiaire.
 *
 * Ils désignent le Critère par le libellé de la définition, celui-là même
 * que l'écran affiche à côté du champ fautif.
 */
const MESSAGES = {
  'libelle.required': 'Le Libellé est obligatoire',
  'libelle.minLength': 'Le Libellé est obligatoire',
  // Une saisie qui n'est pas du texte ne vient pas du formulaire, mais le
  // message part quand même vers une interface : il se lit comme les autres.
  'libelle.string': 'Le Libellé est obligatoire',
  'libelle.maxLength': 'Le Libellé ne doit pas dépasser 255 caractères',
  'urlAnnonce.string': "L'URL de l'Annonce n'est pas une adresse valide",
  'urlAnnonce.url': "L'URL de l'Annonce n'est pas une adresse valide",
  'urlAnnonce.maxLength': "L'URL de l'Annonce ne doit pas dépasser 2048 caractères",

  // Le Statut est le seul champ qui refuse d'être vidé : un Bien est
  // toujours quelque part dans la recherche (#7).
  'statut.enum': 'Le Statut n’est pas une étape connue du cycle',
  'statut.required': 'Le Statut est obligatoire',
  'statut.string': 'Le Statut n’est pas une étape connue du cycle',
  'dateVisite.date': 'La Date de visite doit être une date au format AAAA-MM-JJ',

  'adresse.maxLength': 'L’Adresse ne doit pas dépasser 255 caractères',
  'adresse.string': 'L’Adresse doit être du texte',
  'villeQuartier.maxLength': 'La Ville ou quartier ne doit pas dépasser 255 caractères',
  'villeQuartier.string': 'La Ville ou quartier doit être du texte',
}

creerBienValidator.messagesProvider = new SimpleMessagesProvider(MESSAGES)

/**
 * Le libellé affiché de chaque Critère, tel que la définition le déclare.
 *
 * Les messages des Critères s'engendrent à partir de ces libellés plutôt que
 * de s'écrire un par un : soixante lignes qui ne diraient rien de plus, et
 * dont un Critère ajouté en oublierait la moitié.
 */
const LIBELLES: Record<string, string> = {
  prixDemande: 'Le Prix demandé',
  // Le montant d'offre n'est pas un Critère, mais ses refus se formulent
  // comme les leurs : c'est un entier positif, refusé pour les mêmes
  // raisons et lu par le même acheteur.
  montantDerniereOffre: 'Le Montant de la dernière offre',
  taxeFonciere: 'La Taxe foncière',
  chargesCopropriete: 'Les Charges de copropriété',
  surfaceHabitable: 'La Surface habitable',
  nombrePieces: 'Le Nombre de pièces',
  typeBien: 'Le Type de Bien',
  anneeConstruction: 'L’Année de construction',
  travauxAPrevoir: 'Les Travaux à prévoir',
  tempsTrajetTravail: 'Le Trajet domicile-travail',
  capaciteStationnement: 'Le Stationnement',
  dpe: 'Le DPE',
  typeChauffage: 'Le Type de chauffage',
  exterieur: 'L’Extérieur',
}

/** Les règles numériques et leur formulation, la même pour tout Critère. */
const REFUS: Record<string, (critere: string) => string> = {
  number: (critere) => `${critere} doit être un nombre`,
  withoutDecimals: (critere) => `${critere} doit être un nombre entier`,
  min: (critere) => `${critere} ne peut pas être négatif`,
  max: (critere) => `${critere} dépasse la valeur maximale acceptée`,
  enum: (critere) => `${critere} n’est pas une valeur proposée`,
}

const MESSAGES_CRITERES = Object.fromEntries(
  Object.entries(LIBELLES).flatMap(([champ, libelleCritere]) =>
    Object.entries(REFUS).map(([regle, message]) => [`${champ}.${regle}`, message(libelleCritere)])
  )
)

modifierBienValidator.messagesProvider = new SimpleMessagesProvider({
  ...MESSAGES,
  ...MESSAGES_CRITERES,
})
