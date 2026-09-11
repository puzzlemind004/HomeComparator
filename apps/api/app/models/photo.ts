import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Bien from '#models/bien'

/**
 * Une photo d'un Bien : celle de l'annonce, ou celle prise pendant la
 * visite (#13).
 *
 * C'est la photo de visite qui porte l'essentiel — elle montre ce que
 * l'annonce tait, le défaut du mur ou la vue réelle depuis le balcon — mais
 * rien ne les distingue en base : elles s'affichent dans la même galerie, et
 * une marque d'origine serait une saisie de plus pendant la visite, là où le
 * geste doit rester rapide.
 *
 * Le modèle ne porte **aucun chemin**, seulement des noms de fichiers : la
 * racine du stockage est une affaire de configuration et change d'un
 * environnement à l'autre (`stockage_photos.ts`).
 */
export default class Photo extends BaseModel {
  static table = 'photos'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare bienId: number

  /** Le nom du fichier de la version consultable, sur le volume. */
  @column()
  declare fichier: string

  /** Le nom du fichier de la vignette, celle que portent liste et cartes. */
  @column()
  declare fichierVignette: string

  /**
   * Le rang dans la galerie. La photo représentative est celle de rang le
   * plus petit : « représentative » ne se choisit pas, c'est la première,
   * et un drapeau à cocher serait un geste de plus pour un carnet où la
   * première photo prise est justement celle qu'on reconnaît.
   */
  @column()
  declare rang: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Bien)
  declare bien: BelongsTo<typeof Bien>
}
