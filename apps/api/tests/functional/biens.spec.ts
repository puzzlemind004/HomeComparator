import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'

test.group('Biens', (group) => {
  // Chaque test part d'une base vide : la liste est assertée dans son
  // entier, ce qu'un reliquat du test précédent rendrait faux.
  group.each.setup(async () => {
    await db.from('biens').delete()
  })

  test('crée un Bien avec le seul Libellé', async ({ client, assert }) => {
    const response = await client.post('/biens').json({ libelle: 'le T3 avec la terrasse' })

    response.assertStatus(201)
    response.assertBodyContains({ libelle: 'le T3 avec la terrasse', urlAnnonce: null })

    const bien = await Bien.findByOrFail('libelle', 'le T3 avec la terrasse')
    assert.equal(bien.urlAnnonce, null)
  })

  test('refuse une création sans Libellé avec un message compréhensible', async ({
    client,
    assert,
  }) => {
    // Aucun en-tête `Accept` : le front n'en envoie pas non plus, et l'API
    // doit répondre en JSON quand même.
    const response = await client.post('/biens').json({})
    response.assertStatus(422)
    const [erreur] = response.body().errors
    assert.equal(erreur.field, 'libelle')
    // Le message doit se lire tel quel dans l'interface, sans traduction.
    assert.equal(erreur.message, 'Le Libellé est obligatoire')

    assert.lengthOf(await Bien.all(), 0)
  })

  test('refuse un Libellé vide de tout caractère visible', async ({ client, assert }) => {
    // Une saisie d'espaces n'est pas un Libellé : elle ne sert pas la
    // reconnaissance, qui est toute la raison d'être du champ.
    const response = await client.post('/biens').json({ libelle: '   ' })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'libelle')
  })

  test("crée un Bien avec l'URL de son Annonce", async ({ client }) => {
    const response = await client.post('/biens').json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: 'https://exemple.test/annonce/1',
    })

    response.assertStatus(201)
    response.assertBodyContains({ urlAnnonce: 'https://exemple.test/annonce/1' })
  })

  test("accepte une URL d'Annonce laissée vide", async ({ client }) => {
    // Le formulaire envoie une chaîne vide pour un champ non rempli : elle
    // doit valoir « pas d'Annonce », pas une erreur de validation.
    const response = await client
      .post('/biens')
      .json({ libelle: 'le T3 avec la terrasse', urlAnnonce: '' })

    response.assertStatus(201)
    response.assertBodyContains({ urlAnnonce: null })
  })

  test("refuse une URL d'Annonce qui n'en est pas une", async ({ client, assert }) => {
    const response = await client
      .post('/biens')
      .json({ libelle: 'le T3 avec la terrasse', urlAnnonce: 'pas une url' })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'urlAnnonce')
  })

  test('récupère la liste de tous les Biens enregistrés', async ({ client, assert }) => {
    await client.post('/biens').json({ libelle: 'le T3 avec la terrasse' })
    await client.post('/biens').json({ libelle: 'celui avec la cuisine refaite' })

    const response = await client.get('/biens')

    response.assertStatus(200)
    const libelles = response.body().map((bien: { libelle: string }) => bien.libelle)
    assert.sameMembers(libelles, ['le T3 avec la terrasse', 'celui avec la cuisine refaite'])
  })

  test('rend une liste vide quand aucun Bien n’est enregistré', async ({ client, assert }) => {
    const response = await client.get('/biens')

    response.assertStatus(200)
    assert.deepEqual(response.body(), [])
  })
})
