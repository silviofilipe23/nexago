import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

const SHELL_ROUTE_PREFIXES = ['/painel', '/agenda', '/torneios', '/ligas', '/perfil'];
const AUTH_ROUTES = ['/entrar', '/cadastro', '/esqueci-senha', '/email-enviado', '/redefinir-senha'];

function chromeHiddenForUrl(url: string): boolean {
  const p = pathOnly(url);
  if (AUTH_ROUTES.includes(p)) {
    return true;
  }
  return SHELL_ROUTE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);

  protected readonly hideChrome = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => chromeHiddenForUrl(this.router.url)),
      startWith(chromeHiddenForUrl(this.router.url)),
    ),
    { initialValue: chromeHiddenForUrl(this.router.url) },
  );
}
