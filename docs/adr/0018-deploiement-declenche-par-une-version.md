# Déploiement déclenché par une version, vérifié depuis l'extérieur, sans retour en arrière

ADR-0007 avait tranché le principe — « GitHub Actions plutôt qu'un `git pull`
manuel » — et s'arrêtait là. Cet ADR consigne le mécanisme (#70).

L'acheteur pose une version depuis l'onglet Actions en saisissant un numéro.
Un premier workflow éprouve `main`, puis inscrit le numéro dans les deux
`package.json`, commite sur `main`, pose le tag. Un second vérifie la
provenance, rejoue toutes les vérifications, publie les images sur GHCR, fait
tourner la pile sur le VPS, puis interroge le carnet **par son URL publique**
jusqu'à réponse favorable.

## Rien n'est écrit avant que `main` ne soit vert

Le numéro est consommé dès que le tag est poussé : reposer un tag existant
déplacerait un numéro publié sur un autre commit, ce que le workflow refuse.
Tout échec postérieur à la pose du tag coûte donc le numéro, et non une
relance.

Les vérifications passent pour cette raison **avant** le job qui commite et
tague, sur `main` tel qu'il est — le code qu'on s'apprête à publier, au
numéro près. Elles construisent les images sans les pousser : la publication
appartient au déploiement, où le numéro est figé dans l'image de l'API.

C'est ce qui a coûté `v0.2.1` : des tests instables (#99) ont fait échouer le
déploiement après la pose du tag, et le numéro a été perdu pour un défaut
sans rapport avec la version qu'il désignait.

**Cette barrière ne couvre pas tout, et c'est assumé.** Un échec du
déploiement lui-même — le VPS, le registre, les contrôles d'après-déploiement
— survient après la pose du tag et brûle encore le numéro ; `v0.2.2` à
`v0.2.4` y sont passées (#104). Le fermer demanderait de ne taguer qu'après
un déploiement réussi, donc de déployer un commit que le tag ne désigne pas
encore : le `checkout` du déploiement, la vérification d'ascendance et le
nom des images s'appuient tous sur ce tag. L'ordre retenu couvre ce qui se
couvre sans défaire celui dont le reste de cet ADR dépend.

## Le tag désigne la version, mais ne déclenche pas le déploiement

Le tag reste ce qui nomme ce qui est déployé, et la vérification d'ascendance
ci-dessous porte sur le commit qu'il désigne.

Il ne réveille pourtant pas le déploiement, et l'écart avec l'intention
initiale de #70 mérite d'être écrit : **GitHub refuse de déclencher un workflow
sur un événement produit par le `GITHUB_TOKEN` d'une exécution**, garde contre
les boucles récursives. Un tag poussé par le workflow qui le pose ne réveille
donc rien, et la chaîne serait restée immobile sans que rien ne le signale.

Les deux contournements documentés — un jeton personnel, une application GitHub
— supposent tous deux un **secret durable qui expire**. C'est exactement le
mode de panne qu'ADR-0017 a écarté pour le registre, et pour la même raison :
la panne arrive des mois plus tard, sur un message dont la cause est distante de
l'effet, et rien ne prévient avant.

Le workflow qui pose la version appelle donc directement celui qui déploie. Cela
ne coûte aucun secret nouveau. Le déploiement conserve néanmoins son déclencheur
par tag, pour le cas — rare mais réel — d'un tag poussé à la main depuis un
clone ; c'est précisément le cas que la vérification suivante arrête.

## L'ascendance est vérifiée parce que rien d'autre ne la garantit

Le dépôt est privé, et la protection de branche n'y est pas disponible sans
abonnement. Aucun mécanisme côté serveur n'empêche donc un tag d'être posé sur
une branche de travail, et ce tag partirait en production.

Le déploiement vérifie que le commit tagué est un ancêtre de `origin/main` et
s'arrête sinon. Le sens de la question compte : un tag posé sur un commit *en
avance* sur `main` — la branche de travail — échoue, tandis qu'un tag posé sur
un commit ancien de `main` passe, ce qui est correct puisque redéployer une
version antérieure est le geste de retour en arrière.

## La CI est rejouée sur un commit déjà vert

ADR-0007 exige de ne déployer que si lint, types, tests et construction passent.
Les jobs de la CI ne se déclenchent que sur `main` et les pull requests : un tag
ne les déclencherait pas du tout, et le déploiement partirait sans rien vérifier.

Les trois jobs sont donc extraits dans un workflow **appelable**, que la CI et le
déploiement invoquent tous deux. C'est le même code qui tourne des deux côtés :
une vérification ajoutée part en production sans qu'on ait à y penser, là où deux
copies divergeraient en silence.

Rejouer un commit déjà vert n'est pas redondant. Ce que la CI a vérifié est le
commit ; ce qu'on déploie est ce commit *avec ce numéro de version*, et la
construction des images n'est pas la même — elle fige le numéro dans l'image et
pousse vers le registre.

## La vérification finale passe par le dehors

Le déploiement démarre la pile en attendant que **chaque service soit sain** —
le healthcheck de l'image de l'API (#67), dont la `start-period` couvre les
migrations jouées par l'entrypoint. Puis le workflow interroge la route de santé
par son URL publique, avec son vrai nom de domaine et son vrai certificat.

Interroger depuis l'extérieur est ce qui donne son sens à l'étape : la requête
exerce toute la chaîne — résolution DNS, Caddy, certificat, nginx, API, base —,
et chacun de ces maillons peut tomber sans que la pile Docker ait l'air malade.
Une interrogation locale sur le VPS déclarerait le succès alors que le site
serait inatteignable, ce qui est le pire résultat possible : croire en ligne un
carnet en panne.

Le certificat n'est pas contourné (`curl` sans `-k`), et c'est délibéré : il est
une partie de ce qu'on vérifie. Un certificat expiré doit être découvert par le
déploiement, pas par l'acheteur devant un avertissement du navigateur.

## Aucun retour en arrière automatique

Le workflow échoue bruyamment et ne tente rien. **Les migrations ne se défont
pas** : redescendre une image sur un schéma déjà migré casse plus sûrement que
de rester en panne, et le fait sur une base qui contient des données saisies à
la main et irrécupérables (ADR-0001).

Rester en panne est un état lisible, dont l'acheteur décide de sortir en
connaissance de cause — en redéployant un numéro antérieur si le schéma le
permet, ou en corrigeant. Un retour en arrière automatique produirait un état
que personne n'a choisi, sur une base dont le schéma ne correspond plus au code.

## Alternatives écartées

**Construction sur le VPS.** Écarté : la machine a un cœur et pas de swap, et y
compiler un bundle Angular expose à l'arrêt du processus par l'OOM killer, sur
le serveur qui sert le carnet au même moment. La production ne tournerait en
outre plus l'artefact exact que la CI a validé. Déjà consigné en ADR-0017.

**Retour en arrière automatique.** Écarté pour la raison de fond ci-dessus, et
non par manque de temps.

**nginx avec certbot sur l'hôte.** Écarté au profit de Caddy dans la pile (#69) :
ACME sans configuration ni tâche planifiée, et tout ce qui décrit la production
vit dans le dépôt plutôt que dans un mécanisme entretenu en parallèle sur le
serveur.

**Un jeton personnel ou une application GitHub pour relancer la chaîne par le
tag.** Écarté : un secret durable qui expire, pour n'acheter qu'un déclenchement
que l'appel direct procure sans secret.

**Faire transiter les secrets de production à chaque déploiement.** Écarté : le
`.env` du serveur ne change pas d'un déploiement à l'autre, et le faire voyager
multiplierait les endroits où ces valeurs existent sans rien acheter. Le
déploiement ne touche que `VERSION`, qui n'est pas un secret.
