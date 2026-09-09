import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { COOKIE_SESSION, avecSession, connecter, ouvrirSession, sessionDe } from '#tests/session'

const MOT_DE_PASSE = env.get('APP_PASSWORD')

test.group('Authentification', () => {
  test("ouvre une session sur le mot de passe de l'environnement", async ({ client }) => {
    const response = await connecter(client)

    response.assertStatus(200)
    response.assertBodyContains({ authentifie: true })
    response.assertCookie(COOKIE_SESSION)
  })

  test('refuse un mot de passe erroné', async ({ client }) => {
    const response = await connecter(client, 'pas le bon')

    response.assertStatus(401)
    response.assertBodyContains({ message: 'Mot de passe incorrect' })
  })

  test("n'ouvre aucune session sur un mot de passe erroné", async ({ client }) => {
    // Le refus doit refermer la porte, pas seulement la commenter : sans
    // cette vérification, un 401 accompagné d'une session valide passerait.
    const refus = await connecter(client, 'pas le bon')

    // Le refus n'ouvre rien, mais la requête a bien traversé le middleware de
    // session : les cookies qu'elle rapporte sont rejoués tels quels.
    const response = await avecSession(client.get('/auth/session'), sessionDe(refus))

    response.assertStatus(200)
    response.assertBodyContains({ authentifie: false })
  })

  test('refuse un mot de passe absent comme un mot de passe erroné', async ({ client, assert }) => {
    // Même statut, même corps : un écart renseignerait sur ce qui n'a pas
    // convenu dans la tentative.
    const absent = await client.post('/auth/session').json({})
    const errone = await connecter(client, 'pas le bon')

    absent.assertStatus(401)
    assert.deepEqual(absent.body(), errone.body())
  })

  test("refuse un mot de passe qui n'est pas du texte", async ({ client }) => {
    const response = await client.post('/auth/session').json({ motDePasse: 42 })

    response.assertStatus(401)
    response.assertBodyContains({ message: 'Mot de passe incorrect' })
  })

  test("refuse un mot de passe qui n'est qu'un préfixe du bon", async ({ client }) => {
    const response = await connecter(client, MOT_DE_PASSE.slice(0, -1))

    response.assertStatus(401)
  })

  test('ne révèle rien du mot de passe attendu dans sa réponse', async ({ client, assert }) => {
    const response = await connecter(client, 'pas le bon')

    // Ni le mot de passe, ni le champ fautif : la réponse ne porte qu'un
    // message, le même pour tous les refus.
    assert.notInclude(JSON.stringify(response.body()), MOT_DE_PASSE)
    assert.deepEqual(Object.keys(response.body()), ['message'])
  })

  test('rapporte une session absente sans la refuser', async ({ client }) => {
    // Le front interroge cette route pour savoir s'il doit afficher la
    // connexion : c'est une question, pas un accès.
    const response = await client.get('/auth/session')

    response.assertStatus(200)
    response.assertBodyContains({ authentifie: false })
  })

  test('rapporte une session ouverte', async ({ client }) => {
    const session = await ouvrirSession(client)

    const response = await avecSession(client.get('/auth/session'), session)

    response.assertStatus(200)
    response.assertBodyContains({ authentifie: true })
  })

  test('referme la session à la déconnexion', async ({ client }) => {
    const session = await ouvrirSession(client)

    const deconnexion = await avecSession(client.delete('/auth/session'), session)
    deconnexion.assertStatus(200)

    // Le cookie d'avant la déconnexion ne doit plus rien ouvrir : refermer
    // côté serveur sans invalider ce que le client détient ne referme rien.
    const response = await avecSession(client.get('/biens'), session)
    response.assertStatus(401)
  })
})

test.group('Routes protégées', () => {
  test('refuse la liste des Biens sans session', async ({ client }) => {
    const response = await client.get('/biens')

    response.assertStatus(401)
    response.assertBodyContains({ message: 'Authentification requise' })
  })

  test("refuse la création d'un Bien sans session", async ({ client }) => {
    const response = await client.post('/biens').json({ libelle: 'le T3 avec la terrasse' })

    response.assertStatus(401)
  })

  test('refuse la création avant même de valider la saisie', async ({ client }) => {
    // Un 422 sur une saisie invalide renseignerait un appelant non
    // authentifié sur la forme attendue par l'API : l'authentification
    // passe avant la validation.
    const response = await client.post('/biens').json({})

    response.assertStatus(401)
  })

  test('refuse une session forgée', async ({ client }) => {
    // Le cookie est signé et chiffré par `APP_KEY` : une valeur inventée ne
    // doit pas se lire comme une session, seulement comme son absence.
    const response = await client.get('/biens').cookie(COOKIE_SESSION, 'authentifie')

    response.assertStatus(401)
  })

  test('laisse passer la santé du service sans session', async ({ client }) => {
    // La supervision et le healthcheck Docker l'interrogent sans pouvoir se
    // connecter, et elle ne rend rien d'autre que « ça répond ».
    const response = await client.get('/health')

    response.assertStatus(200)
  })

  test('donne accès aux Biens une fois la session ouverte', async ({ client }) => {
    const session = await ouvrirSession(client)

    const response = await avecSession(client.get('/biens'), session)

    response.assertStatus(200)
  })

  test("la session vaut d'une visite à l'autre, sans reconnexion", async ({ client, assert }) => {
    // Le même cookie, présenté à plusieurs reprises : c'est ce qui distingue
    // une session persistante d'une connexion redemandée à chaque écran.
    const session = await ouvrirSession(client)

    for (const visite of [1, 2, 3]) {
      const response = await avecSession(client.get('/biens'), session)

      assert.equal(response.status(), 200, `La visite n°${visite} aurait dû passer`)
    }
  })

  test('la session est enregistrée en base, et non portée par le seul cookie', async ({
    client,
    assert,
  }) => {
    // Ce qui rend la déconnexion réelle (ADR-0011) : une ligne à supprimer.
    // Sans cette assertion, revenir à un magasin cookie laisserait presque
    // toute la suite au vert alors que le cookie redeviendrait irrévocable.
    const session = await ouvrirSession(client)

    const ligne = await db.from('sessions').where('id', session.identifiant).first()

    assert.exists(ligne)
  })

  test('la déconnexion supprime la session de la base', async ({ client, assert }) => {
    const session = await ouvrirSession(client)

    await avecSession(client.delete('/auth/session'), session)

    const ligne = await db.from('sessions').where('id', session.identifiant).first()

    assert.notExists(ligne)
  })

  test('la session survit à une création de Bien', async ({ client }) => {
    // Une session réécrite à chaque réponse ne doit pas se perdre en route :
    // l'acheteur saisit plusieurs Biens d'affilée.
    const session = await ouvrirSession(client)

    const creation = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
    })
    creation.assertStatus(201)

    const response = await avecSession(client.get('/biens'), session)
    response.assertStatus(200)
  })
})
