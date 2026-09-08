# Mot de passe unique en variable d'environnement, session en base

L'accès à l'outil est protégé par un seul mot de passe, lu dans la variable d'environnement `APP_PASSWORD`. Il n'y a ni inscription, ni réinitialisation, ni fournisseur d'identité externe, ni table d'utilisateurs : un unique utilisateur ne justifie pas un système de comptes, et chacun de ces mécanismes n'existerait que pour lui-même.

La protection tient dans l'API, qui refuse tout appel dont la session n'atteste pas du mot de passe. Le garde de route du front ne protège rien — il évite seulement d'ouvrir un écran que l'API remplirait de 401. Mettre la décision d'accès dans le navigateur reviendrait à ne pas la prendre.

Le middleware s'applique par défaut, les routes qui s'en dispensent le déclarant explicitement (`start/routes.ts`). L'oubli produit alors une route protégée de trop, jamais une route ouverte par mégarde.

Quatre routes s'en dispensent, et chacune doit se justifier :

- `POST /auth/session`, la connexion : elle ne peut évidemment pas exiger d'être déjà connecté.
- `GET /auth/session`, l'état de session : elle ne révèle que ce que l'appelant sait déjà, s'il est connecté ou non. Elle évite au front de provoquer un 401 pour l'apprendre.
- `DELETE /auth/session`, la déconnexion : refermer une session qu'on n'a pas est sans effet, et l'exiger authentifiée n'ajouterait rien.
- `GET /health`, la santé du service : la supervision et le healthcheck Docker l'interrogent sans pouvoir se connecter.

`GET /health` est la plus discutable des quatre : elle divulgue à un appelant anonyme que la base répond ou non. C'est un arbitrage assumé et non une nécessité — le healthcheck Docker tourne dans le réseau du conteneur et se passerait d'une exposition publique. Elle reste ouverte parce que c'est précisément la route qu'on interroge quand plus rien ne répond, y compris la connexion ; la refermer la rendrait inutile au moment où elle sert. Si le carnet sortait un jour d'un usage strictement personnel, c'est la première à reconsidérer.

Tous les refus de connexion rendent la même réponse, même statut et même message, que le mot de passe soit erroné, le champ absent, ou le corps de requête d'un autre type. Un écart de statut entre ces cas renseignerait déjà celui qui cherche à entrer. La comparaison du mot de passe est à temps constant, une comparaison ordinaire s'arrêtant au premier caractère différent et trahissant par sa durée le préfixe correct.

## La session vit en base, pas dans le cookie seul

Le magasin de session est PostgreSQL, alors que la session ne porte qu'un booléen — un magasin cookie, signé et chiffré par `APP_KEY`, aurait suffi à le transporter et n'aurait rien coûté.

Il a pourtant été écarté, parce qu'il rend la déconnexion illusoire. Rien n'existant côté serveur, il n'y a rien à révoquer : un cookie recopié avant la déconnexion continue d'ouvrir la session jusqu'à son expiration. Le test qui rejoue le cookie d'avant la déconnexion l'a montré, et c'est le genre de raccourci que ADR-0005 refuse. Une ligne en base se supprime, elle. PostgreSQL étant déjà dans la pile (ADR-0003), cela ne coûte qu'une table.

Cette table n'est pas une donnée du carnet : elle se reconstitue par une reconnexion, et une sauvegarde qui l'omettrait ne perdrait rien d'irremplaçable (ADR-0007).

La session dure trente jours. L'acheteur revient sur son carnet au fil des semaines d'une recherche immobilière, et se reconnecter à chaque consultation n'apporterait rien face au seul risque réel, un appareil personnel perdu.

## L'identifiant de propriétaire arrive dès maintenant

Les Biens portent un identifiant de propriétaire, rempli à la création avec une valeur constante. Il n'existe aucun écran de gestion de comptes et il n'en existera pas : cette colonne ne sert pas l'outil tel qu'il est.

Elle sert le cas où le multi-utilisateurs arriverait. Le travail coûteux ne serait alors pas d'ajouter la colonne, mais de rattacher après coup des Biens existants à des propriétaires — question qui ne se pose jamais si la colonne est écrite dès le premier Bien. Elle ne porte pas de clé étrangère : il n'y a pas de table à référencer, et il n'y en aura pas tant que le multi-utilisateurs n'est pas décidé.

## Conséquences

Changer `APP_PASSWORD` n'invalide pas les sessions déjà ouvertes : elles vivent en base et ne référencent pas le mot de passe. Vider la table `sessions` déconnecte tout le monde, et c'est le geste à faire si le mot de passe a fui.

Ce ticket vient tôt délibérément : sans lui, tout ce qui suit serait développé et déployé en accès public.
