import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sessions'

  async up() {
    /**
     * Les sessions ouvertes par le mot de passe unique (#4).
     *
     * Elles vivent en base plutôt que dans le cookie seul (`config/session.ts`)
     * pour que la déconnexion supprime vraiment quelque chose : sans ligne à
     * effacer, un cookie recopié auparavant resterait valable.
     *
     * La table n'est pas une donnée du carnet : elle se reconstitue par une
     * reconnexion, et une sauvegarde qui l'omettrait ne perdrait rien
     * d'irremplaçable (ADR-0007).
     */
    this.schema.createTable(this.tableName, (table) => {
      // L'identifiant est un UUID engendré par la session, pas une séquence.
      table.string('id').notNullable().primary()
      table.text('data').notNullable()

      /**
       * Indexée : le ramasse-miettes du magasin balaie les sessions expirées
       * par cette colonne, à chaque écriture ou presque.
       */
      table.timestamp('expires_at').notNullable().index()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
