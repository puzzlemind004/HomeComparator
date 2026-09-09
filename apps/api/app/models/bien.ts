import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Un décimal rendu par `pg`, ramené au nombre que le JSON doit porter — ou
 * `null` quand il n'y a pas de nombre à en tirer.
 *
 * `Number()` seul ne suffirait pas : `Number('')` vaut `0`, et c'est
 * précisément la confusion que tout le reste s'emploie à éviter — un Critère
 * non renseigné qui passerait pour un Critère à zéro, donc pour le plus petit
 * de tous sur un tri par prix. `Number('abc')` rend `NaN`, qui s'écrirait
 * « NaN » à l'écran.
 */
function versNombreOuNull(valeur: string | number | null): number | null {
  if (valeur === null || valeur === undefined || valeur === '') {
    return null
  }

  const nombre = Number(valeur)

  return Number.isFinite(nombre) ? nombre : null
}

/**
 * Un logement que l'acheteur envisage d'acheter : l'objet que l'on compare.
 *
 * Chaque Critère à venir ajoutera sa propre colonne (ADR-0004), donc son
 * propre champ ici. Seul le Libellé est obligatoire (ADR-0008).
 */
export default class Bien extends BaseModel {
  static table = 'biens'

  @column({ isPrimary: true })
  declare id: number

  /** Le nom sous lequel le Bien apparaît dans les listes, saisi à la main. */
  @column()
  declare libelle: string

  /**
   * L'URL de l'Annonce par laquelle le Bien a été repéré. Vide tant qu'elle
   * n'a pas été renseignée — une Annonce peut d'ailleurs disparaître alors
   * que le Bien reste pertinent.
   */
  @column()
  declare urlAnnonce: string | null

  /**
   * Le propriétaire du Bien, rempli à la création avec une valeur constante
   * (#4). L'outil n'a qu'un utilisateur et n'offre aucune gestion de
   * comptes ; cette colonne n'existe que pour qu'un éventuel passage au
   * multi-utilisateurs n'ait pas à rattacher après coup des Biens existants.
   */
  @column()
  declare proprietaireId: string

  /**
   * Les Critères, un champ par colonne (ADR-0004). Tous facultatifs : la
   * création ne demande qu'un Libellé (ADR-0008) et la complétion arrive
   * plus tard, au téléphone ou pendant la visite.
   *
   * `null` veut dire « pas encore renseigné », et jamais « zéro » : c'est
   * cette distinction que le tableau (#10) et la comparaison (#12) lisent
   * pour ne pas désigner un Critère absent comme la meilleure valeur.
   *
   * L'ordre, les libellés affichés et les valeurs admises par les
   * énumérations ne sont pas ici : ils vivent dans la définition
   * centralisée, côté front, que les écrans lisent (ADR-0004, ADR-0010).
   */

  /** Le prix affiché par l'annonce, en euros. */
  @column()
  declare prixDemande: number | null

  /**
   * La surface habitable en m². `pg` rend les décimaux sous forme de chaîne
   * pour ne pas perdre de précision ; on les ramène au nombre que le JSON
   * doit porter, faute de quoi le front recevrait `"72.50"` là où il attend
   * une valeur à comparer.
   */
  @column({
    consume: (valeur: string | number | null) => versNombreOuNull(valeur),
  })
  declare surfaceHabitable: number | null

  @column()
  declare nombrePieces: number | null

  /** L'adresse, souvent inconnue au repérage : les annonces la taisent. */
  @column()
  declare adresse: string | null

  /** La ville ou le quartier, ce que l'annonce donne quand elle tait l'adresse. */
  @column()
  declare villeQuartier: string | null

  /** La taxe foncière, en euros par an. */
  @column()
  declare taxeFonciere: number | null

  /** Les charges de copropriété, en euros par mois. */
  @column()
  declare chargesCopropriete: number | null

  /** Le nombre de véhicules que le Bien permet de garer. */
  @column()
  declare capaciteStationnement: number | null

  /** Le temps de trajet jusqu'au lieu de travail, en minutes (ADR-0009). */
  @column()
  declare tempsTrajetTravail: number | null

  /** La classe énergétique, de A à G. */
  @column()
  declare dpe: string | null

  @column()
  declare typeChauffage: string | null

  @column()
  declare anneeConstruction: number | null

  @column()
  declare typeBien: string | null

  /** Ce dont le Bien dispose à l'extérieur : rien, balcon, terrasse, jardin. */
  @column()
  declare exterieur: string | null

  /** L'ampleur des travaux à prévoir, telle que l'acheteur l'estime. */
  @column()
  declare travauxAPrevoir: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
