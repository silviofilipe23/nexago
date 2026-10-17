import { type Routes } from '@angular/router';
import { authGuard } from '../auth/auth.guard';

/**
 * Loja do atleta. Vitrine e produto são abertos a visitante deslogado (spec); personalizar,
 * carrinho e favoritos são do atleta e pedem login. Carrinho e favoritos ainda são o destino provisório.
 */
export const LOJA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./loja-vitrine.component').then((m) => m.LojaVitrineComponent),
  },
  {
    path: 'p/:slug',
    loadComponent: () => import('./loja-produto.component').then((m) => m.LojaProdutoComponent),
  },
  // Personalizar (02b): a arte sobe pro Storage do atleta e a linha entra pela callable — pede login.
  {
    path: 'p/:slug/personalizar',
    canActivate: [authGuard],
    data: { title: 'Personalizar' },
    loadComponent: () => import('./loja-personalizar.component').then((m) => m.LojaPersonalizarComponent),
  },
  // Link antigo da vitrine (por id) — segue valendo para quem guardou ou compartilhou.
  {
    path: 'produto/:id',
    loadComponent: () => import('./loja-produto.component').then((m) => m.LojaProdutoComponent),
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
