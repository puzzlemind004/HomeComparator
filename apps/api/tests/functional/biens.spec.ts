import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'

test.group('Biens', (group) => {
  // Toutes les routes de Biens exigent la session (#4) : chaque test en
  // ouvre une, comme l'acheteur qui se connecte puis saisit.
  let session: Session

  // Chaque test part aussi d'une base vide : la liste est assertée dans son
  // entier, ce qu'un reliquat du test précédent rendrait faux.
  group.each.setup(async ({ context }) => {
    await db.from('biens').delete()
    session = await ouvrirSession(context.client)
  })

  test('crée un Bien avec le seul Libellé', async ({ client, assert }) => {
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
    })

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
    const response = await avecSession(client.post('/biens'), session).json({})
    response.assertStatus(422)
    const [erreur] = response.body().errors
    assert.equal(erreur.field, 'libelle')
    // Le message doit se lire tel quel dans l'interface, sans traduction.
    assert.equal(erreur.message, 'Le Libellé est obligatoire')

    assert.lengthOf(await Bien.all(), 0)
  })

  test('refuse un Libellé vide', async ({ client, assert }) => {
    // Le geste le plus fréquent : valider le formulaire sans rien saisir.
    // La chaîne vide est ramenée à `null` par `convertEmptyStringsToNull`
    // avant le validateur, donc c'est `required` qui la refuse.
    const response = await avecSession(client.post('/biens'), session).json({ libelle: '' })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].message, 'Le Libellé est obligatoire')
  })

  test('refuse un Libellé vide de tout caractère visible', async ({ client, assert }) => {
    // Une saisie d'espaces n'est pas un Libellé : elle ne sert pas la
    // reconnaissance, qui est toute la raison d'être du champ.
    const response = await avecSession(client.post('/biens'), session).json({ libelle: '   ' })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'libelle')
  })

  test('refuse un Libellé qui n’est pas du texte, dans la même langue', async ({
    client,
    assert,
  }) => {
    // Le message part vers une interface quelle que soit l'origine de la
    // saisie : il ne doit pas retomber sur le message anglais par défaut.
    const response = await avecSession(client.post('/biens'), session).json({ libelle: 42 })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].message, 'Le Libellé est obligatoire')
  })

  test("crée un Bien avec l'URL de son Annonce", async ({ client }) => {
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: 'https://exemple.test/annonce/1',
    })

    response.assertStatus(201)
    response.assertBodyContains({ urlAnnonce: 'https://exemple.test/annonce/1' })
  })

  test("accepte une URL d'Annonce laissée vide", async ({ client }) => {
    // Le formulaire envoie une chaîne vide pour un champ non rempli : elle
    // doit valoir « pas d'Annonce », pas une erreur de validation.
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: '',
    })

    response.assertStatus(201)
    response.assertBodyContains({ urlAnnonce: null })
  })

  test("accepte une URL d'Annonce plus longue que 255 caractères", async ({ client }) => {
    // Les portails immobiliers produisent de longues URL de suivi. La colonne
    // doit accepter tout ce que le validateur accepte, sans quoi la création
    // échoue en erreur serveur après avoir passé la validation.
    const urlAnnonce = `https://exemple.test/annonce/${'a'.repeat(300)}`

    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce,
    })

    response.assertStatus(201)
    response.assertBodyContains({ urlAnnonce })
  })

  test("refuse une URL d'Annonce plus longue que la colonne", async ({ client, assert }) => {
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: `https://exemple.test/${'a'.repeat(2100)}`,
    })

    response.assertStatus(422)
    // Le message doit désigner la longueur, et non une adresse invalide.
    assert.deepInclude(response.body().errors[0], {
      field: 'urlAnnonce',
      message: "L'URL de l'Annonce ne doit pas dépasser 2048 caractères",
    })
  })

  test("refuse une URL d'Annonce sans schéma", async ({ client, assert }) => {
    // C'est la forme d'un copier-coller depuis la barre d'adresse. Stockée
    // telle quelle, elle produirait un lien relatif pointant vers
    // l'application elle-même plutôt que vers l'Annonce.
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: 'www.portail.test/annonce/123',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'urlAnnonce')
  })

  test("refuse une URL d'Annonce dont le schéma n'est pas http", async ({ client, assert }) => {
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: 'ftp://portail.test/annonce',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'urlAnnonce')
  })

  test("refuse une URL d'Annonce qui n'en est pas une", async ({ client, assert }) => {
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: 'pas une url',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'urlAnnonce')
  })

  test('rattache le Bien créé au propriétaire unique', async ({ client, assert }) => {
    // L'outil n'a qu'un utilisateur et aucun écran de comptes : la colonne
    // n'est là que pour qu'un passage au multi-utilisateurs n'ait pas à
    // rattacher après coup des Biens existants (#4). Encore faut-il qu'elle
    // soit remplie dès la création, sinon elle ne sert à rien.
    await avecSession(client.post('/biens'), session).json({ libelle: 'le T3 avec la terrasse' })

    const bien = await Bien.findByOrFail('libelle', 'le T3 avec la terrasse')
    assert.equal(bien.proprietaireId, PROPRIETAIRE_UNIQUE)
  })

  test('récupère la liste de tous les Biens enregistrés', async ({ client, assert }) => {
    await avecSession(client.post('/biens'), session).json({ libelle: 'le T3 avec la terrasse' })
    await avecSession(client.post('/biens'), session).json({
      libelle: 'celui avec la cuisine refaite',
    })

    const response = await avecSession(client.get('/biens'), session)

    response.assertStatus(200)
    const libelles = response.body().map((bien: { libelle: string }) => bien.libelle)
    // L'ordre est antéchronologique, et le front s'y aligne en insérant le
    // Bien créé en tête de liste : c'est un contrat, pas un hasard.
    assert.deepEqual(libelles, ['celui avec la cuisine refaite', 'le T3 avec la terrasse'])
  })

  test('rend chaque Bien avec exactement les champs du contrat', async ({ client, assert }) => {
    /**
     * Le front décrit ses propres modèles et ne partage aucune source
     * TypeScript avec l'API (ADR-0010) : ce sont ces tests, et eux seuls,
     * qui tiennent le contrat entre les deux formes.
     *
     * L'assertion porte sur la liste *exacte* des clés, et non sur un
     * sous-ensemble : un Critère ajouté à la définition côté front sans sa
     * colonne ici — ou l'inverse — ne se verrait autrement qu'à l'écran, sur
     * une valeur qui n'arrive jamais.
     *
     * Les quinze identifiants sont recopiés à la main plutôt que lus depuis
     * la définition, qui vit côté front et n'est pas importable ici. C'est
     * précisément le point de la duplication : elle rend la divergence
     * visible au lieu de la laisser filer.
     */
    await avecSession(client.post('/biens'), session).json({ libelle: 'le T3 avec la terrasse' })

    const response = await avecSession(client.get('/biens'), session)

    response.assertStatus(200)
    const [bien] = response.body()
    assert.sameMembers(Object.keys(bien), [
      'id',
      'libelle',
      'urlAnnonce',
      'proprietaireId',
      'createdAt',
      'updatedAt',
      // Les quinze Critères de la définition centralisée (ADR-0004).
      'prixDemande',
      'taxeFonciere',
      'chargesCopropriete',
      'surfaceHabitable',
      'nombrePieces',
      'typeBien',
      'anneeConstruction',
      'travauxAPrevoir',
      'adresse',
      'villeQuartier',
      'tempsTrajetTravail',
      'capaciteStationnement',
      'dpe',
      'typeChauffage',
      'exterieur',
      // Le cycle de vie (#7). Le Statut n'est pas un Critère — il ne se
      // compare pas d'un Bien à l'autre, il décide de ce qui est pertinent
      // — et les deux champs qui suivent n'existent qu'à partir d'une étape
      // (ADR-0002). Ils figurent au contrat quand même : l'adapter les lit
      // sur tout Bien, et « pas encore » doit y arriver comme `null`.
      'statut',
      'dateVisite',
      'montantDerniereOffre',
      /**
       * La photo représentative, et elle seule (#13). Ce n'est pas un
       * Critère — elle ne se compare pas, elle fait reconnaître — mais elle
       * entre au contrat parce que la liste et les cartes l'affichent.
       *
       * Un tableau, d'au plus un élément : la forme reste celle d'une
       * collection parce que c'en est une, et un Bien sans photo y arrive
       * vide plutôt qu'à `null`. L'écran n'a ainsi qu'un cas à écrire.
       */
      'photos',
    ])
  })

  test('rend la photo représentative sous forme de tableau, vide sans photo', async ({
    client,
    assert,
  }) => {
    // La forme du champ tient le contrat autant que sa présence : l'adapter
    // du front lit un tableau, et un `null` le prendrait au dépourvu
    // (ADR-0010).
    await avecSession(client.post('/biens'), session).json({ libelle: 'le T3 avec la terrasse' })

    const response = await avecSession(client.get('/biens'), session)

    const [bien] = response.body()
    assert.isArray(bien.photos)
    assert.isEmpty(bien.photos)
  })

  test('ne fait pas voyager les Notes avec la liste', async ({ client, assert }) => {
    /**
     * La liste n'affiche pas les Notes, et n'a donc pas à les rapatrier : un
     * seul Bien bien rempli pèserait à lui seul plus lourd que tout le reste
     * de la liste réunie (#8). Elles restent lisibles par la fiche, qui est
     * l'écran qui les montre.
     *
     * C'est un contrat, pas une optimisation opportuniste : le front construit
     * ses lignes de liste depuis ce que l'API rend, et #10 comme #11 y
     * reviendront chercher leurs colonnes.
     */
    const creation = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
    })
    await avecSession(client.patch(`/biens/${creation.body().id}`), session).json({
      notes: 'Chaudière à remplacer.',
    })

    const liste = await avecSession(client.get('/biens'), session)

    liste.assertStatus(200)
    const [depuisLaListe] = liste.body()
    assert.notProperty(depuisLaListe, 'notes')

    // Absentes de la liste, mais bien conservées : c'est la fiche qui les rend.
    const fiche = await avecSession(client.get(`/biens/${creation.body().id}`), session)
    assert.equal(fiche.body().notes, 'Chaudière à remplacer.')
  })

  test('rend les Critères non renseignés à null, et non absents', async ({ client, assert }) => {
    // Un Critère absent de la charge utile et un Critère à `null` se lisent
    // pareil en JavaScript, mais pas au raisonnement : le front construit
    // sa fiche depuis la définition, et attend une clé par Critère.
    await avecSession(client.post('/biens'), session).json({ libelle: 'le T3 avec la terrasse' })

    const response = await avecSession(client.get('/biens'), session)

    const [bien] = response.body()
    assert.isNull(bien.prixDemande)
    assert.isNull(bien.surfaceHabitable)
    assert.isNull(bien.dpe)
    assert.isNull(bien.exterieur)
  })

  test('rend les Notes à la création, et non seulement à la relecture', async ({
    client,
    assert,
  }) => {
    /**
     * La réponse de création n'est pas une relecture de la base : Lucid ne
     * sérialise que ce qui a été assigné à l'instance, et un champ laissé
     * absent du `create` manque à la réponse alors que la liste le porte.
     *
     * Le front insère le Bien créé en tête de liste sans le recharger : des
     * Notes manquantes y arriveraient `undefined` là où l'adapter attend
     * « rien d'écrit » (#8).
     *
     * Les quinze Critères manquent eux aussi à cette réponse, et l'adapter
     * les ramène de la même façon. Les écrire un par un dans `store` irait
     * contre ce qu'est la création — un Libellé, et rien d'autre (ADR-0008) :
     * c'est l'adapter qui tient ce cas, et le contrat porté par la liste.
     */
    const response = await avecSession(client.post('/biens'), session).json({
      libelle: 'le T3 avec la terrasse',
    })

    response.assertStatus(201)
    // Les trois champs qui ne sont ni Critère ni Libellé, et que seule une
    // assignation explicite fait figurer dans la réponse (#7, #8).
    assert.property(response.body(), 'notes')
    assert.isNull(response.body().notes)
    // La liste, elle, ne les rapatrie pas : voir le test dédié plus bas.
    assert.isNull(response.body().dateVisite)
    assert.isNull(response.body().montantDerniereOffre)
  })

  test('rend une liste vide quand aucun Bien n’est enregistré', async ({ client, assert }) => {
    const response = await avecSession(client.get('/biens'), session)

    response.assertStatus(200)
    assert.deepEqual(response.body(), [])
  })
})
