import { Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { NxToastHostComponent } from './shared/feedback';
import { captureSquadParam, flushSquadRef, pendingSquadRef } from './shared/squad/squad-link';

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

const SHELL_ROUTE_PREFIXES = [
  '/painel',
  '/agenda',
  '/reservar',
  '/torneios',
  '/ligas',
  '/ranking',
  '/equipes',
  '/atletas',
  '/perfil',
  '/comunidade',
  '/bora-jogar',
  '/notificacoes',
  '/historico',
  '/clubinho',
  '/mesa',
  '/cashback',
  '/organizadores',
  '/loja',
  '/squad',
  '/convite',
  '/professor',
];
const AUTH_ROUTES = [
  '/entrar',
  '/cadastro',
  '/esqueci-senha',
  '/email-enviado',
  '/redefinir-senha',
  '/onboarding',
];

/** Exportada só para o spec: decide a moldura do painel por rota, sem montar o Router. */
export function chromeHiddenForUrl(url: string): boolean {
  const p = pathOnly(url);
  if (AUTH_ROUTES.includes(p)) {
    return true;
  }
  return SHELL_ROUTE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NxToastHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  constructor() {
    // Link/QR de embaixador (`?squad=CODIGO`): guarda o clique já na carga, com ou sem login, e
    // grava na conta quando houver sessão. Navegação interna não traz o parâmetro de novo.
    if (typeof window !== 'undefined') captureSquadParam(window.location.search);
    effect(() => {
      if (this.auth.user() && pendingSquadRef()) void flushSquadRef();
    });
  }

  protected readonly hideChrome = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => chromeHiddenForUrl(this.router.url)),
      startWith(chromeHiddenForUrl(this.router.url)),
    ),
    { initialValue: chromeHiddenForUrl(this.router.url) },
  );
}
