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
    path: 's/:slug',
    loadComponent: () => import('./pages/s/arena-site.page').then((m) => m.ArenaSitePage),
  },
  {
    path: 'a/:slug',
    loadComponent: () => import('./pages/a/athlete-link.page').then((m) => m.AthleteLinkPage),
  },
  {
    path: 'o/:slug',
    loadComponent: () => import('./pages/o/organizer-link.page').then((m) => m.OrganizerLinkPage),
  },
  {
    path: 'blog',
    loadComponent: () => import('./pages/blog/blog.page').then((m) => m.BlogPage),
  },
  {
    path: 'blog/:slug',
    loadComponent: () => import('./pages/blog/blog-post.page').then((m) => m.BlogPostPage),
  },
  {
    path: 'docs',
    loadComponent: () => import('./pages/docs/docs.page').then((m) => m.DocsPage),
  },
  {
    path: 'docs/:audience',
    loadComponent: () => import('./pages/docs/docs-audience.page').then((m) => m.DocsAudiencePage),
  },
  {
    // Fase 4 (OG dinâmico + corte de deploy) não muda rotas — este é o fim do catálogo
    // migrado. Qualquer rota fora daqui cai pro Next.js legado.
    path: '**',
    redirectTo: '',
  },
];
