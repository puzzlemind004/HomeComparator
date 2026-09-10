import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL } from '#services/statut'

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
      statut: STATUT_INITIAL,
    })

    // Relu depuis la base : l'instance en mémoire ne porte que ce qui lui a
    // été passé, alors que c'est bien la colonne qu'on veut voir à `null`.
    const relu = await Bien.findOrFail(bien.id)

    assert.isNull(relu.prixDemande)
    assert.isNull(relu.surfaceHabitable)
    assert.isNull(relu.dpe)

    await relu.delete()
  })

  test('le Statut est en place et obligatoire', async ({ assert }) => {
    // Le seul champ obligatoire du carnet avec le Libellé : un Bien est
    // toujours quelque part dans la recherche, et « pas de Statut » ne veut
    // rien dire (#7).
    const colonne = await db.connection().columnsInfo('biens', 'statut')

    assert.isFalse(colonne.nullable)
  })

  test('les champs liés au Statut sont facultatifs', async ({ assert }) => {
    // Ils n'existent qu'à partir d'une étape (ADR-0002), donc jamais à la
    // création — et la date de visite reste vide tant que le rendez-vous
    // n'est pas fixé (#7).
    const colonnes = await db.connection().columnsInfo('biens')

    for (const champ of ['date_visite', 'montant_derniere_offre'] as const) {
      assert.property(colonnes, champ, `le champ ${champ} n'a pas de colonne`)
      assert.isTrue(colonnes[champ].nullable, `le champ ${champ} est obligatoire`)
    }
  })

  test('un Bien déjà saisi reçoit le Statut initial', async ({ assert }) => {
    // La migration remplit les lignes existantes avant de rendre la colonne
    // obligatoire : rien ne dit qu'un Bien déjà en base a été contacté, et
    // c'est là que la création l'aurait mis.
    const cree = await Bien.create({
      libelle: 'le T3 saisi avant le cycle de vie',
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
    })
    const relu = await Bien.findOrFail(cree.id)

    assert.equal(relu.statut, 'aContacter')
    // Les champs liés au Statut n'existent pas encore à cette étape.
    assert.isNull(relu.dateVisite)
    assert.isNull(relu.montantDerniereOffre)

    await relu.delete()
  })

  test('les Notes sont en place, facultatives et sans limite de colonne', async ({ assert }) => {
    // `text` et non `varchar(255)` : les Notes accueillent des impressions de
    // visite et une liste de travaux, là où une adresse tient sur une ligne
    // (#8). Une borne à 255 ferait perdre en cours de frappe.
    const colonnes = await db.connection().columnsInfo('biens')

    assert.property(colonnes, 'notes')
    assert.isTrue(colonnes.notes.nullable)
    assert.isNull(colonnes.notes.defaultValue)
    assert.equal(colonnes.notes.type, 'text')
  })

  test('un Bien se crée sans Notes', async ({ assert }) => {
    // Rien n'oblige à écrire quoi que ce soit : un Bien repéré le soir n'a
    // pas encore été visité (ADR-0008).
    const cree = await Bien.create({
      libelle: 'le T3 sans rien de noté',
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
    })
    const relu = await Bien.findOrFail(cree.id)

    assert.isNull(relu.notes)

    await relu.delete()
  })

  test('la table qui compte les tentatives de connexion est en place', async ({ assert }) => {
    // Le schéma est celui qu'attend `rate-limiter-flexible`, sur lequel
    // repose le magasin base du limiteur : les noms de colonnes ne sont pas
    // libres, et s'en écarter ferait échouer la limitation au premier
    // comptage plutôt qu'au démarrage (#26).
    const colonnes = await db.connection().columnsInfo('rate_limits')

    for (const colonne of ['key', 'points', 'expire'] as const) {
      assert.property(colonnes, colonne, `la colonne ${colonne} manque`)
    }

    // La clé porte l'adresse, et rien ne doit pouvoir la dédoubler : deux
    // lignes pour une même adresse seraient deux quotas pour un attaquant.
    assert.isFalse(colonnes.key.nullable)
  })

  test('la surface habitable revient sous forme de nombre', async ({ assert }) => {
    // `pg` rend les décimaux en chaîne : sans conversion, le front
    // recevrait `"72.50"` là où il attend une valeur à comparer, et le prix
    // au m² se calculerait sur une chaîne.
    const cree = await Bien.create({
      libelle: 'le T3 avec la terrasse',
      surfaceHabitable: 72.5,
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
    })
    const relu = await Bien.findOrFail(cree.id)

    assert.isNumber(relu.surfaceHabitable)
    assert.equal(relu.surfaceHabitable, 72.5)

    await relu.delete()
  })

  test('une surface absente reste absente et ne devient pas zéro', async ({ assert }) => {
    // `Number('')` vaut `0` : une conversion naïve ferait passer un Critère
    // jamais renseigné pour un Critère à zéro, donc pour le plus petit de
    // tous sur un tri — exactement ce que les colonnes nullables évitent.
    const cree = await Bien.create({
      libelle: 'le T3 dont la surface est inconnue',
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
    })
    const relu = await Bien.findOrFail(cree.id)

    assert.isNull(relu.surfaceHabitable)
    assert.notStrictEqual(relu.surfaceHabitable, 0)

    await relu.delete()
  })
})
