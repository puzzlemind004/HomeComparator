import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Bien from '#models/bien'
import Photo from '#models/photo'

/** Les bornes de l'appréciation, en étoiles. */
export const NOTE_MIN = 1
export const NOTE_MAX = 5

/**
 * Une observation datée portée sur un Bien pendant la visite.
 *
 * Ce n'est pas un champ du Bien mais une ligne qui s'ajoute : les **Notes**
 * sont un texte unique qu'on relit et réécrit (ADR-0012), un Commentaire se
 * prend sur place devant ce qu'il décrit, et le suivant ne touche pas au
 * précédent.
 *
 * Ses trois champs sont facultatifs — texte, photo, appréciation — et au
 * moins l'un des trois doit être là : un Commentaire entièrement vide ne
 * dirait rien, mais exiger un champ précis ferait inventer une valeur pour
 * pouvoir enregistrer.
 */
export default class Commentaire extends BaseModel {
  static table = 'commentaires'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare bienId: number

  /** Ce que l'acheteur a écrit, ou `null`. */
  @column()
  declare texte: string | null

  /**
   * La photo qui illustre le Commentaire, ou `null`.
   *
   * C'est une photo du Bien comme les autres, et elle figure aussi dans la
   * galerie : rien ne les distingue en base (ADR-0014). Supprimée depuis la
   * galerie, elle laisse le Commentaire en place sans image — le texte et
   * l'appréciation ne se réécrivent pas.
   */
  @column()
  declare photoId: number | null

  /** L'appréciation, de 1 à 5 étoiles, ou `null` quand il n'y en a pas. */
  @column()
  declare note: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Bien)
  declare bien: BelongsTo<typeof Bien>

  @belongsTo(() => Photo)
  declare photo: BelongsTo<typeof Photo>

  /**
   * Les Commentaires d'un Bien, du plus récent au plus ancien.
   *
   * Le dernier pris en premier : c'est celui qu'on vient d'écrire qu'on
   * relit, et le carrousel s'ouvre dessus. L'`id` départage deux
   * Commentaires de la même seconde, que `created_at` ne sépare pas — sans
   * quoi l'ordre changerait d'un chargement à l'autre.
   */
  static duBien(bienId: number) {
    return this.query().where('bien_id', bienId).orderBy('created_at', 'desc').orderBy('id', 'desc')
  }
}
