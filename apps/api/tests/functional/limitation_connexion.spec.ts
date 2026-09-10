import { test } from '@japa/runner'
import limiter from '@adonisjs/limiter/services/main'
import { avecSession, connecter, sessionDe } from '#tests/session'
import { TENTATIVES, cle, compteur } from '#services/limitation_connexion'
import { estAdresseInterne } from '#services/adresses_internes'

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

    // Le compteur réel et sa vraie clé, pas une reconstruction : deux
    // définitions qui divergeraient laisseraient ce test au vert sur un
    // quota qui n'est plus celui de l'application.
    const restant = await compteur().availableIn(cle(ip))

    // Une expiration existe, et elle ne dépasse pas la fenêtre annoncée.
    // La borne est déduite de `FENETRE`, jamais recopiée : la changer sans
    // changer ce test laisserait passer une fenêtre bien plus longue.
    assert.isAbove(restant, 0)
    assert.isAtMost(restant, compteur().duration)
  })

  test('un compteur expiré ne bloque plus', async ({ assert }) => {
    // Le pendant du test précédent, qui ne vérifiait que l'existence d'une
    // expiration. Ici on l'observe jouer, sur une fenêtre d'une seconde :
    // le mécanisme est celui de la fenêtre réelle, seule sa durée change.
    const bref = limiter.use({ requests: TENTATIVES, duration: '1 second' })
    const ip = adresse()

    for (let essai = 0; essai < TENTATIVES; essai += 1) {
      await bref.increment(cle(ip))
    }

    // Quota épuisé : c'est l'état dans lequel une tentative est refusée.
    assert.equal(await bref.remaining(cle(ip)), 0)

    await new Promise((suite) => setTimeout(suite, 1200))

    // La fenêtre écoulée, le compteur a disparu de lui-même et l'adresse
    // retrouve son quota entier — c'est ce qui rouvre la porte.
    assert.isNull(await bref.get(cle(ip)))
    assert.equal(await bref.remaining(cle(ip)), TENTATIVES)
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

  test('un client interne pourrait se renommer si nginx allongeait la chaîne', async ({
    client,
  }) => {
    // Ce test défend une limite, pas une protection : il montre ce que
    // l'API *ne* peut *pas* faire seule, et donc pourquoi `nginx.conf`
    // remplace `X-Forwarded-For` au lieu de l'allonger.
    //
    // `proxy-addr` remonte la chaîne de droite à gauche, franchit les
    // maillons fiables et retient le premier qui ne l'est pas. Une adresse
    // privée est fiable — c'est de là que nginx appelle. Un client déjà sur
    // le réseau interne, soit le déploiement visé, verrait donc nginx
    // ajouter *sa* propre adresse privée à droite de ce qu'il a déclaré :
    // `proxy-addr` la franchirait et retiendrait sa déclaration à lui.
    //
    // On reproduit ici cette chaîne allongée. Chaque déclaration ouvre un
    // compteur neuf, et le quota ne retient plus rien : c'est ce que le
    // remplacement dans `nginx.conf` rend impossible. Si ce test venait à
    // finir sur un refus, c'est que la chaîne serait de nouveau transmise
    // et que la limitation entière serait à reprendre.
    const interne = '192.168.1.50'

    for (let essai = 0; essai < TENTATIVES; essai += 1) {
      await connecter(client, 'pas le bon').header('X-Forwarded-For', `10.0.0.1, ${interne}`)
    }

    // Le quota de l'adresse déclarée est bien épuisé…
    const epuisee = await connecter(client).header('X-Forwarded-For', `10.0.0.1, ${interne}`)
    epuisee.assertStatus(401)

    // …mais il a suffi d'en déclarer une autre pour repartir de zéro.
    const neuve = await connecter(client).header('X-Forwarded-For', `10.9.9.9, ${interne}`)

    neuve.assertStatus(200)
  })

  test("une adresse qui n'en est pas une reste un refus ordinaire", async ({ client, assert }) => {
    // `X-Forwarded-For` n'est validé par personne : `proxy-addr` retient le
    // premier maillon non fiable tel quel, fût-il du texte arbitraire. Ce
    // texte servait de clé au compteur, et une clé trop longue faisait
    // remonter l'erreur de PostgreSQL — un 500 portant le texte de la
    // contrainte, là où toute la route s'applique à ne rendre qu'un 401.
    //
    // C'est le motif que `start/routes.ts` documente avoir déjà corrigé
    // pour `/biens/:id` : ce qui n'a pas la forme attendue doit rendre le
    // refus ordinaire, pas une erreur qui en dit trop.
    const refus = await connecter(client, 'pas le bon').header('X-Forwarded-For', 'ceci, 10.0.0.1')

    refus.assertStatus(401)
    assert.deepEqual(Object.keys(refus.body()), ['message'])

    // Une clé bien plus longue que ce que la colonne accepte : c'est le cas
    // qui rendait 500 avec le texte de la contrainte.
    const longue = `${'A'.repeat(400)}, 10.0.0.1`
    const trop = await connecter(client, 'pas le bon').header('X-Forwarded-For', longue)

    trop.assertStatus(401)
    assert.deepEqual(trop.body(), refus.body())

    // Rien n'a été compté : ce qui n'a pas la forme d'une adresse n'en est
    // pas une, et n'ouvre pas de compteur. Ce n'est pas un contournement —
    // qui joint l'API directement s'en donne déjà d'autres, avec des
    // adresses valables celles-là (#18) ; ce n'en est pas un de plus.
    assert.isNull(await compteur().get(cle('ceci')))
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

    // IPv6 : boucle locale, adresses uniques locales et lien local — y
    // compris sous leur forme abrégée, `fc::1` valant `fc00::1`.
    for (const adresse of ['::1', 'fc00::1', 'fd00::1', 'fc::1', 'fe80::1']) {
      assert.isTrue(estAdresseInterne(adresse), `${adresse} aurait dû être interne`)
    }
  })

  test('refuse sa confiance à une adresse publique', ({ assert }) => {
    // Le cœur de la limitation : faire confiance à celles-là laisserait
    // n'importe qui s'attribuer une adresse neuve à chaque tentative.
    for (const adresse of ['203.0.113.5', '8.8.8.8', '172.15.0.1', '172.32.0.1', '11.0.0.1']) {
      assert.isFalse(estAdresseInterne(adresse), `${adresse} n'aurait pas dû être interne`)
    }

    // Les voisines des plages IPv6 internes, que des bornes trop larges
    // avaleraient : `face::` commence par les mêmes lettres qu'une adresse
    // unique locale, et `fec0::` est l'ancien site-local, aujourd'hui
    // routable comme le reste.
    for (const adresse of ['2001:db8::1', 'face::1', 'fec0::1', 'ff02::1', '::123']) {
      assert.isFalse(estAdresseInterne(adresse), `${adresse} n'aurait pas dû être interne`)
    }
  })
})
