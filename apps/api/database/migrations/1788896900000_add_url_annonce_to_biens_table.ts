import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'biens'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      /**
       * L'URL de l'Annonce peut être renseignée à la création comme rester
       * vide : le repérage du soir doit tenir en quelques secondes, et
       * l'annonce n'est pas toujours sous la main (ADR-0008).
       *
       * Un Bien peut faire l'objet de plusieurs Annonces (CONTEXT.md) ; cette
       * colonne n'en garde qu'une, celle par laquelle le Bien a été repéré.
       *
       * 2048 caractères, et non les 255 par défaut de `string()` : les URL
       * des portails immobiliers portent de longues chaînes de suivi. La
       * borne est la même que celle du validateur (`app/validators/bien.ts`),
       * sans quoi une URL trop longue passerait la validation puis ferait
       * échouer l'insertion — une erreur serveur au lieu d'un refus lisible.
       */
      table.string('url_annonce', 2048).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('url_annonce')
    })
  }
}
