import { Injectable, computed, inject, signal } from '@angular/core';
import { LargeurEcran } from '../criteres/largeur-ecran';
import {
  MINIMUM_COMPARAISON,
  basculerSelection,
  comparaisonPossible,
  selectionAjustee,
} from '../criteres/selection-comparaison';

/**
 * Les Biens retenus pour le face-à-face (#12), tenus hors des écrans qui les
 * montrent (#124).
 *
 * La sélection vivait dans `BiensPage`, ce qui suffisait tant que le
 * face-à-face était une section de cette page. Il a maintenant sa route, et
 * la navigation en affiche le compte depuis n'importe quel écran : deux
 * lecteurs de plus, dont aucun n'est un descendant du carnet. Un état lu par
 * trois écrans qui ne s'emboîtent pas est un service, pas un signal de
 * composant — le faire redescendre par des entrées demanderait que la coque
 * de l'application connaisse la sélection pour la passer, alors qu'elle n'en
 * fait rien.
 *
 * **Le service tient le choix, pas ce qu'on en montre.** Il ne connaît que
 * des identifiants : quels Biens leur correspondent, et lesquels sont
 * affichables à cet instant, c'est l'affaire de l'écran qui a la liste. Sans
 * cette limite, le service devrait charger les Biens et deviendrait un
 * second `BienService` tenant sa propre copie de la liste.
 *
 * **Rien n'est persisté**, ni en session ni dans l'URL. Le plafond dépend de
 * la largeur de l'écran (ADR-0006) : une adresse recopiée d'un téléphone au
 * bureau porterait une sélection que l'écran d'arrivée n'honore pas, et
 * l'inverse en tronquerait une sans le dire. C'est ce qui a fait écarter le
 * paramètre d'URL que #124 mettait en balance — la sélection partageable
 * coûtait de rendre le plafond mensonger, pour un carnet qui n'a qu'un
 * lecteur et n'a donc personne à qui partager un lien.
 */
@Injectable({ providedIn: 'root' })
export class SelectionComparaison {
  private readonly largeurEcran = inject(LargeurEcran);

  /**
   * Ce que l'acheteur a coché, dans l'ordre. C'est l'état écrit ; ce qui se
   * lit est `selection`, qui le ramène à ce que l'écran peut honorer.
   */
  private readonly choix = signal<readonly number[]>([]);

  /** Combien de Biens l'écran courant permet de comparer (ADR-0006). */
  readonly maximum = computed(() => this.largeurEcran.maximumComparaison());

  /** Ce qu'il faut de Biens pour qu'il y ait quelque chose à comparer. */
  readonly minimum = MINIMUM_COMPARAISON;

  /**
   * La sélection telle que l'écran peut réellement l'honorer : ce qui a été
   * coché, ramené au plafond.
   *
   * Elle est **dérivée** et non écrite, là où un `effect` qui corrigerait le
   * signal aurait fait la même chose : la fenêtre qui rétrécit sous le seuil
   * la rend caduque sans qu'on y touche. Un état corrigé après coup existe
   * brièvement faux, et la page qui se lirait pendant cet instant montrerait
   * une colonne de plus que l'écran ne tient.
   */
  readonly selection = computed<readonly number[]>(() =>
    selectionAjustee(this.choix(), this.maximum()),
  );

  /**
   * Combien de Biens sont retenus — le « (2) » que la navigation porte en
   * permanence (#124).
   *
   * Il compte la sélection effective et non le choix brut : c'est le nombre
   * de colonnes que le face-à-face aura, et annoncer trois là où l'écran en
   * tient deux ferait chercher la troisième.
   */
  readonly compte = computed(() => this.selection().length);

  /** Vrai quand le plafond est atteint : plus rien ne peut s'ajouter. */
  readonly pleine = computed(() => this.compte() >= this.maximum());

  /**
   * Vrai dès que deux Biens sont retenus.
   *
   * C'est une réponse sur le **choix**, pas sur ce qui est affichable : un
   * Bien retenu que le filtre du carnet masque compte ici. L'écran de
   * comparaison, lui, décide sur les Biens dont il a les valeurs — les deux
   * peuvent différer (#93), et c'est à celui qui tient la liste de le voir.
   */
  readonly comparable = computed(() => comparaisonPossible(this.selection()));

  /**
   * Le clic sur la case d'un Bien : il rejoint la comparaison, ou il en sort.
   *
   * Au plafond, l'ajout est refusé et la sélection ne bouge pas — c'est ce
   * que dit `basculerSelection`, et c'est à l'écran de l'annoncer.
   *
   * La bascule repart de la sélection **effective** et non du choix brut :
   * un Bien coché au bureau puis écarté par le rétrécissement de la fenêtre
   * ne doit pas occuper une place sur le téléphone. Ce que le plafond a mis
   * de côté est donc abandonné pour de bon au clic suivant, et c'est voulu —
   * retenir indéfiniment des colonnes invisibles les ferait resurgir à
   * l'élargissement, longtemps après le geste qui les a choisies.
   */
  basculer(bienId: number): void {
    this.choix.set(basculerSelection(this.selection(), bienId, this.maximum()));
  }

  /**
   * Le constat qu'un Bien a été supprimé : il quitte la comparaison (#93).
   *
   * La disparition se **déclare** plutôt que de se déduire de l'absence du
   * Bien dans une liste : cette absence-là ne distingue pas une suppression
   * d'un filtrage. Rien n'est mémorisé du Bien retiré — une liste d'oubliés
   * rejouée à chaque recalcul rendrait l'identifiant non-cochable pour
   * toujours, et un Bien déclaré supprimé à tort laisserait une case qui ne
   * répond plus sans que rien ne le dise.
   */
  oublier(bienId: number): void {
    this.choix.update((choix) => choix.filter((candidat) => candidat !== bienId));
  }

  /** Le bouton qui vide la comparaison, sans toucher à la liste. */
  vider(): void {
    this.choix.set([]);
  }
}
