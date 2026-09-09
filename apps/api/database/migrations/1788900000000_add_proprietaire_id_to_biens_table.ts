import { BaseSchema } from '@adonisjs/lucid/schema'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'

export default class extends BaseSchema {
  protected tableName = 'biens'

  async up() {
    /**
     * L'identifiant de propriétaire d'un Bien (#4).
     *
     * Il n'existe aucun écran de gestion de comptes et il n'en existera pas :
     * cette colonne ne sert pas l'outil tel qu'il est, où un seul mot de
     * passe protège l'accès. Elle sert le cas où le multi-utilisateurs
     * arriverait, dont le travail coûteux ne serait pas d'ajouter la colonne
     * mais de rattacher après coup des Biens existants à des propriétaires.
     * Écrite dès maintenant, cette question ne se pose jamais.
     *
     * Pas de clé étrangère : il n'y a pas de table à référencer, et il n'y
     * en aura pas tant que le multi-utilisateurs n'est pas décidé.
     */
    this.schema.alterTable(this.tableName, (table) => {
      table.string('proprietaire_id').nullable()
    })

    // Les Biens déjà saisis appartiennent au seul acheteur qui ait pu les
    // saisir : ils reçoivent la même valeur constante que les suivants.
    this.defer(async (db) => {
      await db.from(this.tableName).whereNull('proprietaire_id').update({
        proprietaire_id: PROPRIETAIRE_UNIQUE,
      })
    })

    // `notNullable` seulement une fois les lignes existantes remplies :
    // l'ordre inverse échouerait sur une base qui porte déjà des Biens.
    this.schema.alterTable(this.tableName, (table) => {
      table.string('proprietaire_id').notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('proprietaire_id')
    })
  }
}
