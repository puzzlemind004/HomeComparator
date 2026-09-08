import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
