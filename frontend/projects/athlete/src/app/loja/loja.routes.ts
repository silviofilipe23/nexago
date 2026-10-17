import { type Routes } from '@angular/router';
import { authGuard } from '../auth/auth.guard';

/**
 * Loja do atleta. Vitrine e produto são abertos a visitante deslogado (spec); personalizar,
 * carrinho, pedidos e favoritos são do atleta e pedem login. Favoritos ainda é o destino provisório.
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
  // Carrinho + checkout (03/04/05): cotação e pedido no servidor (`docs/business-rules/loja-checkout.md`).
  {
    path: 'carrinho',
    canActivate: [authGuard],
    data: { title: 'Carrinho' },
    loadComponent: () => import('./loja-checkout.component').then((m) => m.LojaCheckoutComponent),
  },
  // Meus pedidos (06) e o pedido (Pix logo depois do checkout, acompanhamento depois).
  {
    path: 'pedidos',
    canActivate: [authGuard],
    data: { title: 'Meus pedidos' },
    loadComponent: () => import('./loja-pedidos.component').then((m) => m.LojaPedidosComponent),
  },
  {
    path: 'pedidos/:id',
    canActivate: [authGuard],
    data: { title: 'Pedido' },
    loadComponent: () => import('./loja-pedido.component').then((m) => m.LojaPedidoComponent),
  },
  {
    path: 'favoritos',
    canActivate: [authGuard],
    data: { title: 'Favoritos' },
    loadComponent: () => import('./loja-em-breve.component').then((m) => m.LojaEmBreveComponent),
  },
];
