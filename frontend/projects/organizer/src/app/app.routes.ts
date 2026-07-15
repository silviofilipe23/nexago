import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { organizerGuard } from './auth/organizer.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Organizador',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Organizador',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Organizador',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Organizador',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar organizador — NexaGO Organizador',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel',
    canActivate: [authGuard, organizerGuard],
    loadComponent: () => import('./painel/shell/panel-shell.component').then((m) => m.PanelShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Início — NexaGO Organizador',
        loadComponent: () => import('./painel/inicio/panel-inicio.component').then((m) => m.PanelInicioComponent),
      },
      {
        path: 'eventos',
        title: 'Meus eventos — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/eventos-list.component').then((m) => m.EventosListComponent),
      },
      {
        path: 'eventos/:id',
        title: 'Torneio — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/torneio-detalhe.component').then((m) => m.TorneioDetalheComponent),
      },
      {
        path: 'eventos/:id/nova-etapa',
        title: 'Nova etapa — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/wizard/criar-etapa.component').then((m) => m.CriarEtapaComponent),
      },
      {
        path: 'eventos/:id/categorias/:catId',
        title: 'Categoria — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/categoria-detalhe.component').then((m) => m.CategoriaDetalheComponent),
      },
      {
        path: 'eventos/:id/categorias/:catId/seeds',
        title: 'Cabeças de chave — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/seeds.component').then((m) => m.SeedsComponent),
      },
      {
        path: 'novo-torneio',
        title: 'Criar torneio — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/wizard/criar-torneio.component').then((m) => m.CriarTorneioComponent),
      },
      {
        path: 'nova-liga',
        title: 'Criar liga — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/wizard/criar-liga.component').then((m) => m.CriarLigaComponent),
      },
      {
        path: 'nova-etapa',
        title: 'Nova etapa — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/wizard/criar-etapa.component').then((m) => m.CriarEtapaComponent),
      },
      {
        path: 'inscricoes',
        title: 'Inscrições — NexaGO Organizador',
        loadComponent: () => import('./painel/inscricoes/inscricoes.component').then((m) => m.InscricoesComponent),
      },
      {
        path: 'chaveamento',
        title: 'Chaveamento & Jogos — NexaGO Organizador',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'grupos' },
          {
            path: 'grupos',
            loadComponent: () => import('./painel/chaveamento/grupos.component').then((m) => m.GruposComponent),
          },
          {
            path: 'chave',
            loadComponent: () => import('./painel/chaveamento/chaveamento.component').then((m) => m.ChaveamentoComponent),
          },
          {
            path: 'jogos',
            loadComponent: () => import('./painel/chaveamento/jogos.component').then((m) => m.JogosComponent),
          },
          {
            path: 'agendamento',
            loadComponent: () => import('./painel/chaveamento/agendamento.component').then((m) => m.AgendamentoComponent),
          },
          {
            path: 'placar',
            loadComponent: () => import('./painel/chaveamento/placar.component').then((m) => m.PlacarComponent),
          },
          {
            path: 'placar/:matchId',
            loadComponent: () => import('./painel/chaveamento/placar.component').then((m) => m.PlacarComponent),
          },
        ],
      },
      {
        path: 'financeiro',
        title: 'Financeiro — NexaGO Organizador',
        loadComponent: () => import('./painel/financeiro/financeiro.component').then((m) => m.FinanceiroComponent),
      },
      {
        path: 'comunicacao',
        title: 'Comunicação — NexaGO Organizador',
        loadComponent: () => import('./painel/comunicacao/comunicacao.component').then((m) => m.ComunicacaoComponent),
      },
      {
        path: 'config',
        title: 'Configurações — NexaGO Organizador',
        loadComponent: () => import('./painel/config/config.component').then((m) => m.ConfigComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
