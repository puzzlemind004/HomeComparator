# Qualité professionnelle, malgré un usage strictement personnel

HomeComparator n'a qu'un utilisateur. La tentation habituelle serait d'en tirer les raccourcis correspondants : tableaux illisibles sur mobile, déploiement à la main, tests absents, « ça suffit pour moi ». Ce projet fait le choix inverse, et cette exigence prime sur les arbitrages de simplicité.

Concrètement, cela s'est déjà traduit par le rejet du tableau à défilement horizontal sur mobile au profit d'une présentation en cartes (ADR-0006), et par la mise en place d'une CI GitHub Actions plutôt qu'un `git pull` manuel sur le VPS. Toute proposition future justifiée par « c'est perso, ça suffira » doit être considérée comme non conforme à cette décision.

Conséquence assumée : certaines fonctionnalités arriveront plus lentement que si l'outil était bâclé. C'est le prix accepté.
