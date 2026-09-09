import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BienService, type ListeBiens } from './bien.service';
import { STATUTS, libelleStatut, type Statut } from '../criteres/statut';

/**
 * L'écran de repérage : saisir un Libellé, et retrouver le Bien dans la
 * liste. Le geste doit tenir en quelques secondes (ADR-0008), donc le
 * formulaire ne demande rien d'autre — l'URL de l'Annonce reste facultative.
 */
@Component({
  selector: 'app-biens-page',
  imports: [FormsModule, RouterLink],
  styleUrl: './biens-page.scss',
  templateUrl: './biens-page.html',
})
export class BiensPage {
  private readonly bienService = inject(BienService);

  /**
   * L'état lu par le gabarit. Il est public plutôt que `protected` pour
   * rester lisible par les tests, qui l'interrogent là où ils devraient
   * sinon inspecter le DOM rendu.
   */
  readonly libelle = signal('');
  readonly urlAnnonce = signal('');

  /**
   * La liste, ou l'aveu qu'on n'a pas pu la charger. `null` tant que l'API
   * n'a pas répondu : les trois états sont distincts à l'écran, une liste
   * vide ne devant jamais être confondue avec un chargement raté.
   */
  readonly liste = signal<ListeBiens | null>(null);
  readonly erreurs = signal<string[]>([]);
  readonly enregistrement = signal(false);

  /** Les six Statuts, tels que le filtre les propose. */
  readonly statuts = STATUTS;

  /**
   * Le Statut sur lequel la liste est filtrée, ou `null` pour tout voir.
   *
   * `null` est le défaut : ouvrir le carnet montre tous les Biens, sorties
   * comprises. Un filtre par défaut cacherait des Biens sans le dire, et
   * c'est précisément ce qu'un carnet ne doit pas faire (#7).
   */
  readonly filtre = signal<Statut | null>(null);

  constructor() {
    this.rafraichir();
  }

  /**
   * Le libellé sous lequel un Statut s'affiche, pour la pastille de chaque
   * Bien de la liste.
   */
  readonly libelleStatut = libelleStatut;

  /**
   * Le changement de filtre, qui relance le chargement.
   *
   * La liste est rechargée plutôt que filtrée en mémoire : le filtre est en
   * SQL (ADR-0004), et l'écran ne détient de toute façon que ce que le
   * filtre précédent lui a rendu.
   */
  filtrer(statut: Statut | null): void {
    this.filtre.set(statut);
    this.liste.set(null);
    this.rafraichir();
  }

  creer(): void {
    if (this.enregistrement()) {
      return;
    }

    this.enregistrement.set(true);
    this.erreurs.set([]);

    this.bienService
      .creer({ libelle: this.libelle(), urlAnnonce: this.urlAnnonce() })
      .subscribe((resultat) => {
        this.enregistrement.set(false);

        if (!resultat.cree) {
          this.erreurs.set(resultat.erreurs);
          return;
        }

        /**
         * Le Bien créé rejoint la liste sans nouvel aller-retour : il
         * apparaît immédiatement, ce qui est tout l'objet de l'écran.
         *
         * Sauf si la liste est filtrée sur un autre Statut que le sien : un
         * Bien créé est « À contacter » (#7), et l'ajouter à une liste
         * « Visité » y ferait figurer un Bien que le filtre exclut.
         */
        const filtre = this.filtre();
        const aSaPlace = filtre === null || filtre === resultat.bien.statut;

        this.liste.update((liste) =>
          liste?.chargee && aSaPlace
            ? { chargee: true, biens: [resultat.bien, ...liste.biens] }
            : liste,
        );
        this.libelle.set('');
        this.urlAnnonce.set('');
      });
  }

  private rafraichir(): void {
    this.bienService
      .lister(this.filtre() ?? undefined)
      .subscribe((liste) => this.liste.set(liste));
  }
}
