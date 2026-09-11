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

  /**
   * L'ordre de la galerie : le rang, puis l'`id`.
   *
   * L'`id` départage à rang égal — deux photos d'un même envoi peuvent
   * porter le même si un lot a été interrompu —, sans quoi l'ordre
   * changerait d'un chargement à l'autre.
   *
   * Écrit ici plutôt que chez chaque appelant : c'est une propriété des
   * photos, pas de l'écran qui les demande, et la liste comme la galerie
   * doivent les rendre dans le même ordre.
   */
  static ordreGalerie<T extends { orderBy(colonne: string, sens: 'asc'): T }>(requete: T): T {
    return requete.orderBy('rang', 'asc').orderBy('id', 'asc')
  }

  /** Les photos d'un Bien, de la représentative à la dernière ajoutée. */
  static duBien(bienId: number) {
    return this.ordreGalerie(this.query().where('bien_id', bienId))
  }
}
