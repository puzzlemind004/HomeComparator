import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Les Commentaires d'un Bien : ce qu'on note pendant la visite, sur place.
 *
 * Distincts des **Notes**, qui sont un champ du Bien (ADR-0012) : les Notes
 * sont un texte unique qu'on relit et réécrit, le Commentaire est une
 * observation datée qui s'ajoute aux précédentes sans les toucher. « La
 * salle de bain est à refaire » et « très lumineux le matin » ne se
 * rangent pas dans le même paragraphe, et surtout ne se prennent pas au
 * même moment — chacun se saisit debout, devant ce qu'il décrit.
 *
 * **Les trois champs sont facultatifs, et c'est le point.** Une photo d'un
 * mur fissuré se passe de texte ; trois étoiles sur une chambre se passent
 * de photo. Exiger un champ ferait inventer une valeur pour pouvoir
 * enregistrer, alors que le geste doit rester d'une seconde.
 */
export default class extends BaseSchema {
  protected tableName = 'commentaires'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      /**
       * Le Bien commenté. `CASCADE` comme pour les photos : supprimer un
       * Bien emporte ses Commentaires, sans que le contrôleur y pense.
       */
      table
        .integer('bien_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('biens')
        .onDelete('CASCADE')

      /** Ce que l'acheteur a écrit, ou rien. */
      table.text('texte').nullable()

      /**
       * La photo qui illustre le Commentaire.
       *
       * Une référence à `photos` et non un fichier à part : c'est la même
       * photo du même Bien, et la ranger ailleurs aurait donné deux
       * stockages, deux façons de l'effacer, et une galerie qui ignore la
       * moitié des clichés de la visite. Elle figure donc **aussi** dans la
       * galerie, ce qui est voulu : ADR-0014 dit que rien ne distingue les
       * photos en base.
       *
       * `SET NULL` et non `CASCADE` : supprimer la photo depuis la galerie
       * ne doit pas emporter le texte et la note qu'elle illustrait. Le
       * Commentaire survit sans son image — l'inverse perdrait des mots
       * qu'on ne réécrira pas.
       */
      table
        .integer('photo_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('photos')
        .onDelete('SET NULL')

      /**
       * L'appréciation, de 1 à 5 étoiles, ou rien.
       *
       * Zéro n'existe pas : l'absence d'avis se dit par `NULL`, et une note
       * de zéro étoile se lirait comme un jugement alors qu'elle ne serait
       * qu'un champ non rempli. C'est la même distinction que partout
       * ailleurs dans le carnet entre « pas renseigné » et « vaut zéro ».
       */
      table.integer('note').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()

      /**
       * Le carrousel lit toujours les Commentaires d'un Bien, du plus
       * récent au plus ancien : c'est la seule requête que cette table sert.
       */
      table.index(['bien_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
