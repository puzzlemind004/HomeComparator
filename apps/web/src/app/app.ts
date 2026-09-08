import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HealthService } from './health/health.service';

@Component({
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly healthService = inject(HealthService);

  protected readonly title = signal('HomeComparator');

  /**
   * L'état de l'API, affiché sur la page d'accueil. C'est pour l'instant
   * la seule fonction de cet écran : vérifier que la chaîne front → API
   * → base est bien montée.
   */
  protected readonly health = toSignal(this.healthService.check());
}
