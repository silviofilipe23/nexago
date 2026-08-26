import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'sobre',
    loadComponent: () => import('./pages/sobre/sobre.page').then((m) => m.SobrePage),
  },
  {
    path: 'contato',
    loadComponent: () => import('./pages/contato/contato.page').then((m) => m.ContatoPage),
  },
  {
    path: 'ajuda',
    loadComponent: () => import('./pages/ajuda/ajuda.page').then((m) => m.AjudaPage),
  },
  {
    path: 'privacidade',
    loadComponent: () => import('./pages/privacidade/privacidade.page').then((m) => m.PrivacidadePage),
  },
  {
    path: 'termos',
    loadComponent: () => import('./pages/termos/termos.page').then((m) => m.TermosPage),
  },
  {
    path: 'excluir-conta',
    loadComponent: () => import('./pages/excluir-conta/excluir-conta.page').then((m) => m.ExcluirContaPage),
  },
  {
    // Rotas de fase 2+ (torneios, rankings, ligas, arenas, mini-sites, link pages, blog,
    // docs) ainda não existem neste app — cai pro Next.js legado até serem portadas.
    path: '**',
    redirectTo: '',
  },
];
