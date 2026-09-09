import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUTS } from '#services/statut'

/**
 * Le cycle de vie d'un Bien et les champs qui en dépendent (#7).
 *
 * Ce que ces tests décrivent tient en deux phrases : **aucune transition
 * n'est interdite**, et **reculer n'efface rien**. Ce sont les deux
 * promesses de l'issue, et les seules que l'API ait à tenir — savoir quels
 * champs s'affichent à quelle étape est un choix d'écran (ADR-0002), tenu
 * côté front et vérifié par ses propres tests.
 */
test.group('Cycle de vie d’un Bien', (group) => {
  let session: Session

  group.each.setup(async ({ context }) => {
    await db.from('biens').delete()
    session = await ouvrirSession(context.client)
  })

  /** Un Bien en base, « À contacter » sauf indication contraire. */
  async function unBien(champs: Partial<Bien> = {}) {
    return Bien.create({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: null,
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: 'aContacter',
      ...champs,
    })
  }

  test('un Bien créé est « À contacter »', async ({ client, assert }) => {
    // Le Statut ne se saisit pas : le repérage du soir doit tenir en
    // quelques secondes (ADR-0008), et un Bien qu'on vient de voir n'a par
    // définition pas encore été contacté.
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
    })

    response.assertStatus(201)
    assert.equal(response.body().statut, 'aContacter')

    const bien = await Bien.findByOrFail('libelle', 'le T3 avec la terrasse')
    assert.equal(bien.statut, 'aContacter')
  })

  test('un Bien créé n’a ni date de visite ni montant d’offre', async ({ client, assert }) => {
    // Les champs liés au Statut n'existent pas avant leur étape (ADR-0002) :
    // à la création, il n'y a rien à y mettre.
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
    })

    response.assertStatus(201)
    assert.isNull(response.body().dateVisite)
    assert.isNull(response.body().montantDerniereOffre)
  })

  test('le Statut ne se choisit pas à la création', async ({ client, assert }) => {
    // La création n'accepte que le Libellé et l'URL de l'Annonce. Un Statut
    // transmis est ignoré plutôt qu'écrit : sans cela, « Vendu » pourrait
    // être le premier état d'un Bien.
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      statut: 'vendu',
    })

    response.assertStatus(201)
    assert.equal(response.body().statut, 'aContacter')
  })

  /**
   * Chaque transition, dans les deux sens, depuis chaque état vers chaque
   * autre : trente couples, écrits par la boucle plutôt qu'à la main.
   *
   * Les énumérer un par un aurait fait trente tests qui disent tous la même
   * chose, et qu'un Statut ajouté aurait laissés incomplets sans rien
   * signaler. La boucle, elle, couvre le nouveau Statut du seul fait qu'il
   * entre dans la liste.
   */
  for (const depuis of STATUTS) {
    for (const vers of STATUTS) {
      if (depuis === vers) {
        continue
      }

      test(`passe de ${depuis} à ${vers}`, async ({ client, assert }) => {
        const bien = await unBien({ statut: depuis })

        const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
          statut: vers,
        })

        response.assertStatus(200)
        await bien.refresh()
        assert.equal(bien.statut, vers)
      })
    }
  }

  test('un Bien écarté revient dans le cycle', async ({ client, assert }) => {
    // Écarter n'est pas supprimer : un Bien écarté dont le prix baisse
    // redevient un candidat, et ce qui avait été noté est resté là.
    const bien = await unBien({ statut: 'ecarte', prixDemande: 280_000 })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      statut: 'aVisiter',
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.statut, 'aVisiter')
    assert.equal(bien.prixDemande, 280_000)
  })

  test('reculer conserve la date de visite et le montant d’offre', async ({ client, assert }) => {
    // C'est la conséquence assumée d'ADR-0002 : reculer laisse des données
    // orphelines, et on les conserve. Perdre une date de visite sur un
    // mauvais clic coûterait plus cher que d'afficher une donnée
    // hors-contexte.
    const bien = await unBien({
      statut: 'offreFaite',
      dateVisite: DateTime.fromISO('2026-09-12'),
      montantDerniereOffre: 240_000,
    })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      statut: 'aContacter',
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.statut, 'aContacter')
    assert.equal(bien.dateVisite?.toISODate(), '2026-09-12')
    assert.equal(bien.montantDerniereOffre, 240_000)
  })

  test('une offre refusée ramène le Bien à Visité sans perdre le montant', async ({
    client,
    assert,
  }) => {
    // Le cas nommé par l'issue : le montant reste, parce qu'il dit ce qui a
    // été proposé et refusé — l'information qui sert à décider de la suite.
    const bien = await unBien({ statut: 'offreFaite', montantDerniereOffre: 240_000 })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      statut: 'visite',
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.statut, 'visite')
    assert.equal(bien.montantDerniereOffre, 240_000)
  })

  test('refuse un Statut qui n’est pas une étape connue', async ({ client, assert }) => {
    // La colonne est un `string` nu : sans le validateur, « aVendre »
    // s'écrirait en base et ressortirait tel quel à l'écran, où aucun
    // libellé ne lui correspondrait.
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      statut: 'aVendre',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'statut')
    await bien.refresh()
    assert.equal(bien.statut, 'aContacter')
  })

  test('refuse de vider le Statut', async ({ client, assert }) => {
    // Le seul champ du carnet qui ne se vide pas : un Bien est toujours
    // quelque part dans la recherche, et « pas de Statut » ne veut rien dire.
    const bien = await unBien({ statut: 'visite' })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      statut: null,
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'statut')
    await bien.refresh()
    assert.equal(bien.statut, 'visite')
  })

  test('une modification qui ne parle pas du Statut le laisse tel quel', async ({
    client,
    assert,
  }) => {
    // La mise à jour partielle vaut pour le Statut comme pour le reste :
    // corriger un prix ne doit pas ramener le Bien au début du cycle.
    const bien = await unBien({ statut: 'visite' })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      prixDemande: 245_000,
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.statut, 'visite')
  })

  test('enregistre une date de visite et la rend au format AAAA-MM-JJ', async ({
    client,
    assert,
  }) => {
    // Un jour, sans heure : c'est la date du rendez-vous. La rendre en
    // `YYYY-MM-DD` évite qu'un décalage de fuseau fasse afficher la veille.
    const bien = await unBien({ statut: 'aVisiter' })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      dateVisite: '2026-09-12',
    })

    response.assertStatus(200)
    assert.equal(response.body().dateVisite, '2026-09-12')
  })

  test('la date de visite peut rester vide', async ({ client, assert }) => {
    // Le rendez-vous n'est pas toujours fixé quand le contact est établi :
    // « À visiter » sans date est l'état ordinaire du Bien qu'on vient
    // d'appeler.
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      statut: 'aVisiter',
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.statut, 'aVisiter')
    assert.isNull(bien.dateVisite)
  })

  test('vide une date de visite déjà saisie', async ({ client, assert }) => {
    // Un rendez-vous s'annule : la date doit pouvoir être retirée, et
    // redevenir « non fixé » plutôt que de rester fausse.
    const bien = await unBien({ statut: 'aVisiter', dateVisite: DateTime.fromISO('2026-09-12') })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      dateVisite: null,
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.isNull(bien.dateVisite)
  })

  test('refuse une date de visite qui n’en est pas une', async ({ client, assert }) => {
    const bien = await unBien({ statut: 'aVisiter' })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      dateVisite: 'le mois prochain',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'dateVisite')
  })

  test('enregistre et vide le montant de la dernière offre', async ({ client, assert }) => {
    const bien = await unBien({ statut: 'offreFaite' })

    const enregistre = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      montantDerniereOffre: 240_000,
    })

    enregistre.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.montantDerniereOffre, 240_000)

    const vide = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      montantDerniereOffre: null,
    })

    vide.assertStatus(200)
    await bien.refresh()
    assert.isNull(bien.montantDerniereOffre)
  })

  test('refuse un montant d’offre négatif', async ({ client, assert }) => {
    // Comme un prix négatif : c'est une saisie erronée, et elle passerait
    // pour la meilleure affaire du carnet.
    const bien = await unBien({ statut: 'offreFaite' })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      montantDerniereOffre: -1,
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'montantDerniereOffre')
  })

  test('la fiche rend le Statut et ses champs', async ({ client, assert }) => {
    // Le contrat que l'adapter du front lit (ADR-0010) : ce sont ces tests
    // qui le tiennent, le compilateur ne voyant pas les deux côtés.
    const bien = await unBien({
      statut: 'offreFaite',
      dateVisite: DateTime.fromISO('2026-09-12'),
      montantDerniereOffre: 240_000,
    })

    const response = await avecSession(client.get(`/biens/${bien.id}`), session)

    response.assertStatus(200)
    assert.deepInclude(response.body(), {
      statut: 'offreFaite',
      dateVisite: '2026-09-12',
      montantDerniereOffre: 240_000,
    })
  })

  test('la liste se filtre par Statut', async ({ client, assert }) => {
    // Le filtre est en SQL : c'est ce que la colonne permet (ADR-0004), et
    // la liste n'a pas à voyager en entier pour qu'on en regarde le quart.
    await unBien({ libelle: 'à contacter', statut: 'aContacter' })
    await unBien({ libelle: 'visité', statut: 'visite' })
    await unBien({ libelle: 'écarté', statut: 'ecarte' })

    const response = await avecSession(client.get('/biens?statut=visite'), session)

    response.assertStatus(200)
    const libelles = response.body().map((bien: { libelle: string }) => bien.libelle)
    assert.deepEqual(libelles, ['visité'])
  })

  test('un Bien écarté reste consultable et listable', async ({ client, assert }) => {
    // Écarter n'est pas supprimer : garder trace d'un refus évite de
    // reconsidérer trois fois la même annonce.
    const bien = await unBien({ libelle: 'celui du rez-de-chaussée', statut: 'ecarte' })

    const fiche = await avecSession(client.get(`/biens/${bien.id}`), session)
    fiche.assertStatus(200)

    const liste = await avecSession(client.get('/biens?statut=ecarte'), session)
    liste.assertStatus(200)
    assert.lengthOf(liste.body(), 1)
  })

  test('la liste sans filtre rend tous les Biens, sorties comprises', async ({
    client,
    assert,
  }) => {
    await unBien({ libelle: 'à contacter', statut: 'aContacter' })
    await unBien({ libelle: 'écarté', statut: 'ecarte' })
    await unBien({ libelle: 'vendu', statut: 'vendu' })

    const response = await avecSession(client.get('/biens'), session)

    response.assertStatus(200)
    assert.lengthOf(response.body(), 3)
  })

  test('un filtre sur un Statut inconnu rend la liste complète', async ({ client, assert }) => {
    // Le filtre est un paramètre d'affichage, pas une saisie : le refuser
    // laisserait l'écran sans liste pour une adresse mal recopiée, alors que
    // tout montrer est exactement ce qu'il fait sans filtre.
    await unBien({ libelle: 'à contacter' })
    await unBien({ libelle: 'visité', statut: 'visite' })

    const response = await avecSession(client.get('/biens?statut=aVendre'), session)

    response.assertStatus(200)
    assert.lengthOf(response.body(), 2)
  })

  test('chaque Statut se filtre, y compris ceux que personne ne porte', async ({
    client,
    assert,
  }) => {
    // Un Statut sans aucun Bien rend une liste vide, et non la liste
    // complète : « rien à ce stade » est une réponse, et l'écran a de quoi
    // la dire.
    await unBien({ statut: 'visite' })

    for (const statut of STATUTS) {
      const response = await avecSession(client.get(`/biens?statut=${statut}`), session)

      response.assertStatus(200)
      assert.lengthOf(response.body(), statut === 'visite' ? 1 : 0, `filtre sur ${statut}`)
    }
  })

  test('exige la session pour changer de Statut', async ({ client }) => {
    const bien = await unBien()

    const response = await client.patch(`/biens/${bien.id}`).json({ statut: 'visite' })

    response.assertStatus(401)
  })
})
