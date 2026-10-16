import { type Routes } from '@angular/router';
import { authGuard } from '../auth/auth.guard';

/**
 * Loja do atleta. A vitrine é aberta a visitante deslogado (spec); carrinho e favoritos são
 * do atleta e pedem login. Produto, carrinho e favoritos ainda são o destino provisório.
 */
export const LOJA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./loja-vitrine.component').then((m) => m.LojaVitrineComponent),
  },
  {
    path: 'produto/:id',
    data: { title: 'Página do produto' },
    loadComponent: () => import('./loja-em-breve.component').then((m) => m.LojaEmBreveComponent),
  },
  {
    path: 'carrinho',
    canActivate: [authGuard],
    data: { title: 'Carrinho' },
    loadComponent: () => import('./loja-em-breve.component').then((m) => m.LojaEmBreveComponent),
  },
  {
    path: 'favoritos',
    canActivate: [authGuard],
    data: { title: 'Favoritos' },
    loadComponent: () => import('./loja-em-breve.component').then((m) => m.LojaEmBreveComponent),
  },
];
