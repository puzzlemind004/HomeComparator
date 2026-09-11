import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Les photos d'un Bien : celles de l'annonce, et surtout celles prises
 * pendant la visite (#13).
 *
 * Une table à part et non une colonne du Bien : un Bien en porte plusieurs,
 * chacune avec son fichier et son rang, et c'est très exactement ce qu'une
 * table sait dire. Une colonne JSON l'aurait dit aussi, mais sans clé
 * étrangère — donc sans le `ON DELETE CASCADE` qui suit, et sans que le
 * test-sentinelle de #9 ait de quoi s'accrocher.
 *
 * Ce que la table stocke est un **nom de fichier**, jamais un chemin : la
 * racine du stockage est une affaire de configuration (`STOCKAGE_PHOTOS`) et
 * change d'un environnement à l'autre. L'écrire en base figerait le
 * déploiement dans la donnée, et déplacer le volume demanderait une
 * migration là où il suffit d'une variable.
 */
export default class extends BaseSchema {
  protected tableName = 'photos'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      /**
       * Le Bien dont la photo montre le logement.
       *
       * `onDelete('CASCADE')` : supprimer un Bien supprime ses photos, sans
       * que le contrôleur ait à y penser. Les **fichiers**, eux, n'ont pas
       * d'équivalent en base et restent à la charge du contrôleur, qui les
       * efface avant de supprimer la ligne (#9, #13).
       */
      table
        .integer('bien_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('biens')
        .onDelete('CASCADE')

      /**
       * Le nom du fichier sur le volume, tel que le stockage l'a choisi —
       * jamais celui que le téléphone a envoyé. Un nom venu du client
       * traverserait les dossiers (`../`) et se heurterait aux collisions
       * dès la deuxième photo nommée `IMG_0001.jpg`.
       */
      table.string('fichier').notNullable()

      /**
       * Le nom du fichier de la vignette, dérivé du même envoi.
       *
       * Une colonne propre plutôt qu'un suffixe déduit à la lecture : la
       * convention de nommage vivrait alors à la fois dans le code qui
       * écrit et dans celui qui lit, et un changement de l'une sans l'autre
       * casserait des photos déjà stockées.
       */
      table.string('fichier_vignette').notNullable()

      /**
       * Le rang de la photo dans la galerie, et ce qui désigne la photo
       * représentative : c'est la première, rang le plus petit.
       *
       * Un rang explicite plutôt que l'ordre d'insertion : deux photos
       * envoyées dans la même seconde ne se départagent pas par
       * `created_at`, et la galerie afficherait un ordre instable d'un
       * chargement à l'autre.
       */
      table.integer('rang').notNullable().defaultTo(0)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      /**
       * La galerie lit toujours les photos d'un Bien, dans l'ordre : c'est
       * la seule requête que cette table sert.
       */
      table.index(['bien_id', 'rang'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
