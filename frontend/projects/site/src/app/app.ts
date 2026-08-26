import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SiteHeader } from './shared/layout/site-header';
import { SiteFooter } from './shared/layout/site-footer';
import { ToastHost } from './shared/ui/toast';

/** Rotas que saem sem o chrome institucional (cabeçalho/rodapé do nexaGO) — mini-sites de
 *  arena e páginas de link (marca da arena/organizador, não do nexaGO). Porta de `SiteChrome`
 *  do site Next.js; aqui vira um signal derivado da URL, no mesmo padrão do app `athlete`. */
const BARE_PREFIXES = ['/a/', '/o/', '/s/'];

function pathOnly(url: string): string {
  const i = url.indexOf('?');
  return i >= 0 ? url.slice(0, i) : url;
}

function chromeHiddenForUrl(url: string): boolean {
  const path = pathOnly(url);
  return BARE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteHeader, SiteFooter, ToastHost],
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
