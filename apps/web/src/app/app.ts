import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { HealthService } from './health/health.service';
import { AuthService } from './auth/auth.service';
import { ROUTE_CONNEXION } from './auth/auth.guard';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly healthService = inject(HealthService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly title = signal('HomeComparator');

  /**
   * L'état de la session, pour n'offrir la déconnexion qu'à qui est connecté.
   * Le garde de route l'a déjà renseigné avant d'ouvrir un écran.
   */
  readonly authentifie = this.auth.authentifie;

  /**
   * L'état de l'API, affiché sous le carnet. La route de santé se passe de
   * session : elle reste consultable même déconnecté, ce qui est
   * précisément ce qu'on veut quand plus rien ne répond.
   */
  protected readonly health = toSignal(this.healthService.check());

  deconnecter(): void {
    this.auth.deconnecter().subscribe(() => {
      void this.router.navigateByUrl(ROUTE_CONNEXION);
    });
  }
}
