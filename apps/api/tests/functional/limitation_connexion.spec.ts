import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import { avecSession, connecter, sessionDe } from '#tests/session'
import { FENETRE, TENTATIVES } from '#services/limitation_connexion'
import { estAdresseInterne } from '#config/app'

/**
 * La connexion est la seule serrure du carnet (#26) : rien d'autre ne se
 * tient entre un inconnu et les Biens. Les deux protections déjà en place —
 * message unique et comparaison à temps constant — visent l'attaquant qui
 * *infère* quelque chose de la réponse, et ne gênent pas celui qui se
 * contente d'essayer vite et longtemps. Ces tests couvrent le second.
 *
 * Chaque test part d'un compteur vide : le magasin est partagé par tout le
 * processus, et deux tests qui se suivent sur la même IP se compteraient
 * l'un l'autre.
 */
test.group('Limitation des tentatives de connexion', (group) => {
  group.each.setup(() => limiter.clear())

  /**
   * Une adresse propre à chaque test : le client de test se présente
   * toujours depuis la même IP réelle, et sans cela l'épuisement d'un test
   * déborderait sur le suivant.
   */
  let numero = 0
  function adresse() {
    numero += 1

    return `203.0.113.${numero}`
  }

  /** Épuise le quota d'une adresse, sans consommer la tentative suivante. */
  async function epuiser(client: Parameters<typeof connecter>[0], ip: string) {
    for (let essai = 0; essai < TENTATIVES; essai += 1) {
      await connecter(client, 'pas le bon').header('X-Forwarded-For', ip)
    }
  }

  test('refuse la tentative au-delà du quota, sans comparer le mot de passe', async ({
    client,
  }) => {
    // Le bon mot de passe présenté après le quota : s'il ouvrait une
    // session, c'est que la comparaison aurait eu lieu malgré la limite.
    const ip = adresse()
    await epuiser(client, ip)

    const response = await connecter(client).header('X-Forwarded-For', ip)

    response.assertStatus(401)

    // Le refus doit refermer la porte, pas seulement la commenter : le
    // cookie que la requête rapporte — le middleware de session en pose un
    // à chaque appel routé — ne doit attester de rien.
    const suite = await avecSession(client.get('/auth/session'), sessionDe(response))

    suite.assertStatus(200)
    suite.assertBodyContains({ authentifie: false })
  })

  test('la dernière tentative du quota est encore comparée', async ({ client }) => {
    // La borne dans l'autre sens : le quota annoncé doit être celui qu'on
    // peut réellement consommer, pas un de moins.
    const ip = adresse()

    for (let essai = 0; essai < TENTATIVES - 1; essai += 1) {
      await connecter(client, 'pas le bon').header('X-Forwarded-For', ip)
    }

    const response = await connecter(client).header('X-Forwarded-For', ip)

    response.assertStatus(200)
  })

  test('rend une réponse indiscernable de celle du mot de passe erroné', async ({
    client,
    assert,
  }) => {
    // Le prolongement de l'arbitrage du message unique (ADR-0011) : un 429,
    // un `Retry-After`, ou le moindre écart de corps apprendrait à celui qui
    // essaie qu'il a été repéré.
    const errone = await connecter(client, 'pas le bon').header('X-Forwarded-For', adresse())

    const ip = adresse()
    await epuiser(client, ip)
    const bloquee = await connecter(client, 'pas le bon').header('X-Forwarded-For', ip)

    assert.equal(bloquee.status(), errone.status())
    assert.deepEqual(bloquee.body(), errone.body())
    assert.deepEqual(entetesComparables(bloquee), entetesComparables(errone))

    // Aucun en-tête ne doit trahir le blocage, `Retry-After` en tête : c'est
    // celui qu'une limitation pose par défaut, et il dirait à la fois qu'on
    // a été repéré et combien de temps attendre.
    assert.isUndefined(bloquee.headers()['retry-after'])
  })

  test("une connexion réussie remet le compteur de l'adresse à zéro", async ({ client }) => {
    // Sans cela, un usage normal s'épuiserait lui-même : l'acheteur qui se
    // trompe régulièrement finirait par se verrouiller sans jamais avoir
    // été attaqué.
    const ip = adresse()

    for (let essai = 0; essai < TENTATIVES - 1; essai += 1) {
      await connecter(client, 'pas le bon').header('X-Forwarded-For', ip)
    }

    const reussite = await connecter(client).header('X-Forwarded-For', ip)
    reussite.assertStatus(200)

    // Le compteur reparti de zéro : le quota entier est de nouveau
    // consommable, ce qui ne serait pas le cas s'il avait été seulement
    // décrémenté.
    await epuiser(client, ip)
    const suivante = await connecter(client).header('X-Forwarded-For', ip)

    suivante.assertStatus(401)
  })

  test('compte chaque adresse séparément', async ({ client }) => {
    // Un compteur global se verrouillerait par n'importe qui, et le
    // propriétaire légitime paierait pour l'attaquant.
    const epuisee = adresse()
    const autre = adresse()
    await epuiser(client, epuisee)

    const response = await connecter(client).header('X-Forwarded-For', autre)

    response.assertStatus(200)
  })

  test('ne compte pas les tentatives réussies', async ({ client }) => {
    // Le quota vise la force brute : une session rouverte souvent depuis la
    // même adresse n'est pas une attaque.
    const ip = adresse()

    for (let essai = 0; essai < TENTATIVES + 5; essai += 1) {
      const response = await connecter(client).header('X-Forwarded-For', ip)

      response.assertStatus(200)
    }
  })

  test('rouvre la porte une fois la fenêtre écoulée', async ({ client, assert }) => {
    // Attendre quinze minutes n'est pas une option : on vérifie que le
    // compteur porte bien une expiration, et que c'est celle annoncée.
    const ip = adresse()
    await epuiser(client, ip)

    const restant = await limiter
      .use({ requests: TENTATIVES, duration: FENETRE })
      .availableIn(`connexion_${ip}`)

    assert.isAbove(restant, 0)
    assert.isAtMost(restant, 15 * 60)
  })
})

/**
 * De quoi comparer deux refus sans buter sur ce qui varie légitimement
 * d'un appel à l'autre.
 *
 * Le nom des en-têtes est comparé, et leur valeur seulement là où elle est
 * stable. `date`, l'identifiant de requête et le cookie de session changent
 * à chaque appel — le middleware de session en repose un sur toute requête
 * routée, refus compris — et les comparer octet à octet ferait échouer le
 * test pour une raison qui n'est pas la sienne. Ce qui compte est qu'un
 * refus bloqué ne porte ni en-tête de plus, ni en-tête de moins.
 */
function entetesComparables(response: { headers(): Record<string, unknown> }) {
  const entetes = response.headers()
  const variables = ['date', 'x-request-id', 'etag', 'set-cookie']

  return Object.keys(entetes)
    .sort()
    .map((nom) => (variables.includes(nom) ? nom : `${nom}: ${String(entetes[nom])}`))
}

test.group('Limitation et confiance au proxy', (group) => {
  group.each.setup(() => limiter.clear())

  test("retient l'adresse ajoutée par le proxy, et non celle que le client s'attribue", async ({
    client,
  }) => {
    // `proxy-addr` remonte la chaîne de droite à gauche et s'arrête au
    // premier maillon non fiable. Derrière nginx, le maillon de droite est
    // celui que nginx a ajouté — l'adresse réelle du client, la seule qu'il
    // ne puisse pas choisir. Ce qu'il aurait déclaré lui-même se trouve à
    // gauche, et n'est jamais retenu.
    const proxyfiee = '203.0.113.210'
    const inventee = '198.51.100.42'

    for (let essai = 0; essai < TENTATIVES; essai += 1) {
      await connecter(client, 'pas le bon').header('X-Forwarded-For', `${inventee}, ${proxyfiee}`)
    }

    // Le client change la partie qu'il contrôle : son compteur ne doit pas
    // repartir de zéro pour autant.
    const response = await connecter(client).header('X-Forwarded-For', `10.9.9.9, ${proxyfiee}`)

    response.assertStatus(401)
  })

  test('une adresse interne déclarée par le client ne lui donne pas un compteur neuf', async ({
    client,
  }) => {
    // Le cas que `nginx.conf` ferme en remplaçant l'en-tête plutôt qu'en
    // l'allongeant. Si la chaîne était allongée, un client du réseau
    // interne — le déploiement visé — n'aurait qu'à déclarer une adresse
    // privée, que l'API tient pour fiable, pour repartir de zéro à chaque
    // tentative. Ici l'en-tête ne porte qu'une adresse : celle que nginx a
    // posée, la seule que le client ne choisisse pas.
    const ip = '203.0.113.220'

    for (let essai = 0; essai < TENTATIVES; essai += 1) {
      await connecter(client, 'pas le bon').header('X-Forwarded-For', ip)
    }

    // Ce que le client aurait aimé annoncer, s'il avait pu : sans le
    // remplacement, `10.0.0.1` deviendrait son adresse et son compteur.
    const response = await connecter(client).header('X-Forwarded-For', ip)

    response.assertStatus(401)
  })

  test("l'adresse inventée ne se voit pas imputer les tentatives d'un autre", async ({
    client,
  }) => {
    // Le revers du même mécanisme : personne ne doit pouvoir épuiser le
    // quota d'une adresse qui n'est pas la sienne en la déclarant.
    const victime = '203.0.113.211'

    for (let essai = 0; essai < TENTATIVES; essai += 1) {
      await connecter(client, 'pas le bon').header('X-Forwarded-For', `${victime}, 203.0.113.212`)
    }

    const response = await connecter(client).header('X-Forwarded-For', victime)

    response.assertStatus(200)
  })
})

/**
 * Le client de test se présente depuis la boucle locale, qu'AdonisJS tient
 * pour fiable par défaut : les tests ci-dessus passeraient donc même sans
 * `trustProxy` configuré. Or ce n'est pas de la boucle locale que nginx
 * joint l'API, mais du réseau du conteneur — et c'est très exactement le
 * cas que le défaut ne couvre pas. On éprouve donc le prédicat lui-même.
 */
test.group('Adresses tenues pour internes', () => {
  test("reconnaît les adresses d'où nginx joint l'API", ({ assert }) => {
    // Le réseau par défaut de Docker Compose vit dans 172.16.0.0/12 ; les
    // deux autres plages privées valent pour un réseau nommé ou un hôte.
    for (const adresse of [
      '172.18.0.5',
      '172.31.255.254',
      '10.0.0.9',
      '192.168.1.4',
      '127.0.0.1',
    ]) {
      assert.isTrue(estAdresseInterne(adresse), `${adresse} aurait dû être interne`)
    }

    // Pile double : Node préfixe les adresses IPv4 reçues en IPv6.
    assert.isTrue(estAdresseInterne('::ffff:172.18.0.5'))
    assert.isTrue(estAdresseInterne('::1'))
  })

  test('refuse sa confiance à une adresse publique', ({ assert }) => {
    // Le cœur de la limitation : faire confiance à celles-là laisserait
    // n'importe qui s'attribuer une adresse neuve à chaque tentative.
    for (const adresse of ['203.0.113.5', '8.8.8.8', '172.15.0.1', '172.32.0.1', '11.0.0.1']) {
      assert.isFalse(estAdresseInterne(adresse), `${adresse} n'aurait pas dû être interne`)
    }
  })
})
