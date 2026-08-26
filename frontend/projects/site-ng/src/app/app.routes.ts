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
    path: 'rankings',
    loadComponent: () => import('./pages/rankings/rankings.page').then((m) => m.RankingsPage),
  },
  {
    path: 'torneios',
    loadComponent: () => import('./pages/torneios/torneios.page').then((m) => m.TorneiosPage),
  },
  {
    path: 'torneios/:id',
    loadComponent: () => import('./pages/torneios/torneio-detail.page').then((m) => m.TorneioDetailPage),
  },
  {
    path: 'ligas',
    loadComponent: () => import('./pages/ligas/ligas.page').then((m) => m.LigasPage),
  },
  {
    path: 'ligas/:slug',
    loadComponent: () => import('./pages/ligas/liga-detail.page').then((m) => m.LigaDetailPage),
  },
  {
    path: 'arenas',
    loadComponent: () => import('./pages/arenas/arenas.page').then((m) => m.ArenasPage),
  },
  {
    path: 'arena/:id',
    loadComponent: () => import('./pages/arena/arena-detail.page').then((m) => m.ArenaDetailPage),
  },
  {
    // Rotas de fase 3+ (mini-sites, link pages, blog, docs) ainda não existem neste app —
    // cai pro Next.js legado até serem portadas.
    path: '**',
    redirectTo: '',
  },
];
