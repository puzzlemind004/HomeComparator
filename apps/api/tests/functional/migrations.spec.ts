import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'

/**
 * Les colonnes des quinze Critères, écrites ici plutôt que déduites du
 * modèle : la liste est le contrat que la migration doit tenir, et la
 * déduire du code qu'elle vérifie ne vérifierait plus rien.
 *
 * L'ordre, les libellés et les valeurs admises ne sont pas ici — ils vivent
 * dans la définition centralisée, côté front (ADR-0004, ADR-0010).
 */
const CRITERES = [
  'prix_demande',
  'taxe_fonciere',
  'charges_copropriete',
  'surface_habitable',
  'nombre_pieces',
  'capacite_stationnement',
  'temps_trajet_travail',
  'annee_construction',
  'adresse',
  'ville_quartier',
  'dpe',
  'type_chauffage',
  'type_bien',
  'exterieur',
  'travaux_a_prevoir',
] as const

test.group('Migrations', () => {
  test('les migrations sont jouées avant les tests', async ({ assert }) => {
    // Le même mécanisme est joué au démarrage du conteneur par
    // docker-entrypoint.sh : ce test garantit qu'il produit un schéma.
    const hasBiens = await db.connection().schema.hasTable('biens')

    assert.isTrue(hasBiens)
  })

  test('la colonne de propriétaire est en place et obligatoire', async ({ assert }) => {
    // Elle ne sert aucun écran : c'est la migration seule qui la porte, et
    // rien d'autre ne signalerait sa disparition (#4).
    const colonne = await db.connection().columnsInfo('biens', 'proprietaire_id')

    assert.isFalse(colonne.nullable)
  })

  test('chaque Critère a sa colonne', async ({ assert }) => {
    // Un Critère est une vraie colonne typée, pas une entrée dans un objet
    // JSON (ADR-0004) : c'est ce qui permettra au tableau desktop de trier
    // et de filtrer en SQL (#10).
    const colonnes = await db.connection().columnsInfo('biens')

    for (const critere of CRITERES) {
      assert.property(colonnes, critere, `le Critère ${critere} n'a pas de colonne`)
    }
  })

  test("aucun Critère n'est obligatoire", async ({ assert }) => {
    // Créer un Bien ne demande qu'un Libellé (ADR-0008) : un Critère
    // obligatoire ferait échouer le repérage du soir, celui qui doit tenir
    // en quelques secondes.
    const colonnes = await db.connection().columnsInfo('biens')

    for (const critere of CRITERES) {
      assert.isTrue(colonnes[critere].nullable, `le Critère ${critere} est obligatoire`)
    }
  })

  test('aucun Critère ne porte de valeur par défaut', async ({ assert }) => {
    // « Non renseigné » et « zéro » disent des choses différentes : un
    // défaut à 0 ferait passer un prix jamais saisi pour le moins cher, et
    // le tableau doit ranger les absents en fin de tri (#10).
    const colonnes = await db.connection().columnsInfo('biens')

    for (const critere of CRITERES) {
      assert.isNull(colonnes[critere].defaultValue, `le Critère ${critere} a un défaut`)
    }
  })

  test('un Bien se crée sans aucun Critère', async ({ assert }) => {
    // La contrepartie en base des deux tests précédents : c'est l'insertion
    // qui dit si le schéma tient la promesse, pas la seule introspection.
    const bien = await Bien.create({
      libelle: 'le T3 sans rien de saisi',
      // Le propriétaire n'est pas un Critère : il est rempli à la création
      // avec la même valeur constante que le contrôleur écrit (#4).
      proprietaireId: PROPRIETAIRE_UNIQUE,
    })

    // Relu depuis la base : l'instance en mémoire ne porte que ce qui lui a
    // été passé, alors que c'est bien la colonne qu'on veut voir à `null`.
    const relu = await Bien.findOrFail(bien.id)

    assert.isNull(relu.prixDemande)
    assert.isNull(relu.surfaceHabitable)
    assert.isNull(relu.dpe)

    await relu.delete()
  })

  test('la surface habitable revient sous forme de nombre', async ({ assert }) => {
    // `pg` rend les décimaux en chaîne : sans conversion, le front
    // recevrait `"72.50"` là où il attend une valeur à comparer, et le prix
    // au m² se calculerait sur une chaîne.
    const cree = await Bien.create({
      libelle: 'le T3 avec la terrasse',
      surfaceHabitable: 72.5,
      proprietaireId: PROPRIETAIRE_UNIQUE,
    })
    const relu = await Bien.findOrFail(cree.id)

    assert.isNumber(relu.surfaceHabitable)
    assert.equal(relu.surfaceHabitable, 72.5)

    await relu.delete()
  })
})
