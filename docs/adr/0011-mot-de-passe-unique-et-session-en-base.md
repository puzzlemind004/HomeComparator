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

## Le nombre de tentatives est limité, et le refus reste le même

Les deux protections ci-dessus visent l'attaquant qui **infère** quelque chose de la réponse : ce qu'elle dit, et le temps qu'elle met à le dire. Ni l'une ni l'autre ne gêne celui qui n'a rien à inférer et se contente d'essayer vite et longtemps. C'était un angle mort de cette décision, et non un arbitrage : la force brute est pourtant le mode d'attaque naturel contre ce que l'outil expose — un mot de passe unique, choisi à la main, sans identifiant à deviner à côté, sans second facteur, sans verrouillage.

Au-delà de **dix tentatives échouées par adresse et par fenêtre de quinze minutes**, la connexion est refusée sans que le mot de passe soit comparé. Quinze minutes ramènent un attaquant à quarante tentatives par heure, un rythme auquel une liste de mots de passe courants prend des années ; dix tentatives laissent largement place au propriétaire qui hésite sur le sien.

Seules les tentatives **échouées** consomment le quota, et une connexion réussie remet le compteur de l'adresse à zéro. Sans cela, un usage normal finirait par s'épuiser lui-même : qui se trompe régulièrement se verrouillerait sans avoir jamais été attaqué.

### La tentative bloquée est indiscernable d'un refus ordinaire

C'est le point qui méritait d'être tranché, et il l'est dans le prolongement direct du message unique : une tentative bloquée rend **exactement la même réponse** que le mot de passe erroné — même statut 401, même message, mêmes en-têtes. Pas de 429, pas de `Retry-After`.

Un 429 est pourtant le statut juste, et le taire a un coût réel : le propriétaire légitime qui s'est trompé dix fois attend le quart d'heure sans que l'écran lui dise pourquoi. Il est assumé, parce que l'écart renseignerait celui qui essaie — il lui apprendrait qu'il a été repéré, donc que la limite existe, où elle se situe, et à quel rythme la contourner. C'est exactement ce que le message unique refuse déjà de dire sur le mot de passe ; le dire sur le quota reviendrait à le reprendre d'une main après l'avoir donné de l'autre.

### Le comptage est par adresse, ce qui suppose de savoir laquelle

Un compteur par adresse ne vaut que si l'adresse est la bonne. L'API tourne derrière nginx, et par défaut AdonisJS ne fait confiance qu'à la boucle locale — d'où nginx n'arrive pas. L'adresse vue par l'application serait donc celle de nginx pour tout le monde : le « par IP » deviendrait silencieusement un compteur global, que n'importe qui pourrait épuiser pour verrouiller le propriétaire.

La confiance au proxy est donc déclarée (`config/app.ts`), et **restreinte au réseau interne** — la boucle locale et les plages privées, les seules d'où nginx joint l'API. La liste de ces plages vit dans `app/services/adresses_internes.ts` et non dans la configuration : c'est une règle, pas un réglage, et c'est à ce titre que les tests en fixent les bornes. L'étendre à tous annulerait la limitation au lieu de la corriger : l'en-tête se forge à volonté, et chaque tentative s'attribuerait une adresse neuve.

Cela ne suffit pourtant pas. `proxy-addr` remonte la chaîne de droite à gauche et s'arrête au premier maillon non fiable ; tant que nginx **allonge** `X-Forwarded-For`, ce qu'un client déclare de lui-même arrive jusqu'à l'API. Un client venu d'Internet n'y gagne rien, son adresse réelle étant ajoutée à droite de la sienne. Mais un client **déjà sur le réseau interne** — soit très exactement le déploiement visé, à la maison — n'aurait qu'à annoncer une adresse privée, tenue pour fiable, pour s'attribuer un compteur neuf à chaque tentative.

nginx **remplace** donc l'en-tête au lieu de l'allonger (`proxy_set_header X-Forwarded-For $remote_addr`). L'API ne reçoit plus qu'une adresse : celle que nginx a posée, la seule que le client ne choisisse pas. Le prix en est de perdre la chaîne d'un proxy en amont — il n'y en a pas, et le jour où il y en aurait un, c'est dans `nginx.conf` que cette confiance devrait se déclarer explicitement plutôt que de s'hériter.

Tout cela repose sur une hypothèse qu'il faut énoncer : **l'API n'est jointe que par le proxy.** Une requête qui l'atteint directement arrive avec le `X-Forwarded-For` que son auteur a écrit, puisque nginx n'est pas là pour l'écraser ; venue d'une adresse tenue pour interne, elle s'attribue le compteur qu'elle veut, et la limitation ne compte plus rien. C'est ce qui rend la liaison du port de l'API à la boucle locale (`docker-compose.yml`, #18) constitutive de cette protection et non une simple hygiène de configuration : la fermeture du chemin direct est ce qui rend le comptage par adresse vrai.

Cette fermeture a une portée précise, et il vaut mieux l'écrire que la surestimer. Elle retire le chemin direct **au réseau**, ce qui est le cas qui comptait : le port ne répond plus qu'à l'hôte. Elle ne le retire pas à qui a déjà un accès à cette machine — la boucle locale figure parmi les adresses internes, et une requête partie de l'hôte reste donc crue sur parole. Le contournement s'y reproduit à l'identique. C'est assumé : le développement a besoin de ce port, et quelqu'un qui exécute des commandes sur le serveur lit de toute façon le `.env` et la base sans passer par la connexion. La limitation protège la serrure contre le réseau, elle n'a jamais prétendu protéger contre l'intérieur.

### Ce que la limitation ne fait pas

Elle ne journalise ni n'alerte : rien ne signale au propriétaire qu'on essaie d'entrer, ce qui reste un manque et mérite son propre ticket. Elle ne verrouille pas non plus au-delà de la fenêtre, et ne s'applique qu'à la connexion — les autres routes sont derrière la session, et la connexion est la seule serrure.

La fenêtre est **fixe et non glissante** : le premier échec ouvre un quart d'heure, les suivants s'y accumulent sans le prolonger, et tout retombe à zéro à l'échéance. Un attaquant peut donc placer dix tentatives à la fin d'une fenêtre et dix au début de la suivante, soit vingt en peu de temps. C'est sans portée ici : ce qui compte face à une liste de mots de passe est le débit moyen, quarante tentatives par heure, que ce regroupement ne change pas. La fenêtre glissante coûterait une écriture de plus par tentative pour fermer une brèche qui n'en est pas une à cette échelle.

Le compteur vit en base, dans une table `rate_limits`, pour la même raison que les sessions : la mémoire repartirait à zéro à chaque redémarrage, et qui essaie longtemps finirait par tomber sur un déploiement. Comme la table `sessions`, ce n'est pas une donnée du carnet : elle se reconstitue d'elle-même, et une sauvegarde qui l'omettrait ne perdrait rien (ADR-0007).

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
