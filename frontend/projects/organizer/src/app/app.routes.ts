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
    // Fora do shell do painel: fica aberta na TV da arena em tela cheia. Sem organizerGuard
    // de propósito — staff logado sem a role organizer também pode exibir o telão.
    path: 'telao/:tournamentId',
    canActivate: [authGuard],
    title: 'Telão ao vivo — NexaGO Organizador',
    loadComponent: () => import('./painel/telao/telao-page.component').then((m) => m.TelaoPageComponent),
  },
  {
    path: 'painel',
    canActivate: [authGuard, organizerGuard],
    loadComponent: () => import('./painel/shell/panel-shell.component').then((m) => m.PanelShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },

      // ── Nível 1 · Portal (global) ────────────────────────────
      {
        path: 'inicio',
        title: 'Início — NexaGO Organizador',
        loadComponent: () => import('./painel/inicio/panel-inicio.component').then((m) => m.PanelInicioComponent),
      },
      {
        path: 'eventos',
        title: 'Meus torneios — NexaGO Organizador',
        loadComponent: () => import('./painel/eventos/eventos-list.component').then((m) => m.EventosListComponent),
      },
      {
        path: 'financeiro',
        title: 'Financeiro — NexaGO Organizador',
        loadComponent: () => import('./painel/financeiro/financeiro.component').then((m) => m.FinanceiroComponent),
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
        path: 'links',
        title: 'Links — NexaGO Organizador',
        loadComponent: () => import('./painel/links/links.component').then((m) => m.LinksComponent),
      },
      {
        path: 'telao',
        title: 'Telão ao vivo — NexaGO Organizador',
        loadComponent: () => import('./painel/telao/telao-config.component').then((m) => m.TelaoConfigComponent),
      },
      {
        path: 'config',
        title: 'Configurações — NexaGO Organizador',
        loadComponent: () => import('./painel/config/config.component').then((m) => m.ConfigComponent),
      },

      // ── Nível 2 · Liga selecionada ───────────────────────────
      {
        path: 'ligas/:leagueId',
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Liga — NexaGO Organizador',
            loadComponent: () => import('./painel/ligas/liga-visao-geral.component').then((m) => m.LigaVisaoGeralComponent),
          },
          {
            path: 'etapas',
            title: 'Etapas da liga — NexaGO Organizador',
            loadComponent: () => import('./painel/ligas/liga-etapas.component').then((m) => m.LigaEtapasComponent),
          },
          {
            path: 'ranking',
            title: 'Ranking da liga — NexaGO Organizador',
            loadComponent: () => import('./painel/ligas/liga-ranking.component').then((m) => m.LigaRankingComponent),
          },
          {
            path: 'nova-etapa',
            title: 'Nova etapa — NexaGO Organizador',
            loadComponent: () => import('./painel/eventos/wizard/criar-etapa.component').then((m) => m.CriarEtapaComponent),
          },
        ],
      },

      // Rotas antigas (pré-cascata) — telas globais que agora vivem no contexto do torneio.
      { path: 'inscricoes', redirectTo: 'eventos' },
      { path: 'comunicacao', redirectTo: 'eventos' },
      {
        path: 'chaveamento',
        children: [
          { path: '', pathMatch: 'full', redirectTo: '/painel/eventos' },
          { path: '**', redirectTo: '/painel/eventos' },
        ],
      },

      // ── Nível 2 · Torneio selecionado ────────────────────────
      {
        path: 'eventos/:id',
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Torneio — NexaGO Organizador',
            loadComponent: () => import('./painel/eventos/torneio-detalhe.component').then((m) => m.TorneioDetalheComponent),
          },
          {
            path: 'inscricoes',
            title: 'Inscrições — NexaGO Organizador',
            loadComponent: () => import('./painel/inscricoes/inscricoes.component').then((m) => m.InscricoesComponent),
          },
          {
            path: 'agendamento',
            title: 'Agendamento — NexaGO Organizador',
            loadComponent: () => import('./painel/chaveamento/agendamento.component').then((m) => m.AgendamentoComponent),
          },
          {
            path: 'comunicacao',
            title: 'Comunicação — NexaGO Organizador',
            loadComponent: () => import('./painel/comunicacao/comunicacao.component').then((m) => m.ComunicacaoComponent),
          },
          {
            path: 'equipe',
            title: 'Equipe — NexaGO Organizador',
            loadComponent: () => import('./painel/equipe/equipe.component').then((m) => m.EquipeComponent),
          },
          {
            path: 'nova-etapa',
            title: 'Nova etapa — NexaGO Organizador',
            loadComponent: () => import('./painel/eventos/wizard/criar-etapa.component').then((m) => m.CriarEtapaComponent),
          },

          // ── Nível 3 · Categoria selecionada ──────────────────
          {
            path: 'categorias/:catId',
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'duplas' },
              {
                path: 'duplas',
                title: 'Duplas — NexaGO Organizador',
                loadComponent: () => import('./painel/eventos/categoria-detalhe.component').then((m) => m.CategoriaDetalheComponent),
              },
              {
                path: 'seeds',
                title: 'Gerar chave — NexaGO Organizador',
                loadComponent: () => import('./painel/eventos/seeds.component').then((m) => m.SeedsComponent),
              },
              {
                path: 'grupos',
                title: 'Fase de grupos — NexaGO Organizador',
                loadComponent: () => import('./painel/chaveamento/grupos.component').then((m) => m.GruposComponent),
              },
              {
                path: 'chave',
                title: 'Chaveamento — NexaGO Organizador',
                loadComponent: () => import('./painel/chaveamento/chaveamento.component').then((m) => m.ChaveamentoComponent),
              },
              {
                path: 'jogos',
                title: 'Jogos & placares — NexaGO Organizador',
                loadComponent: () => import('./painel/chaveamento/jogos.component').then((m) => m.JogosComponent),
              },
              {
                path: 'agendamento',
                title: 'Agendamento — NexaGO Organizador',
                loadComponent: () => import('./painel/chaveamento/agendamento.component').then((m) => m.AgendamentoComponent),
              },
              {
                path: 'comunicacao',
                title: 'Comunicação — NexaGO Organizador',
                loadComponent: () => import('./painel/comunicacao/comunicacao.component').then((m) => m.ComunicacaoComponent),
              },
              {
                path: 'placar/:matchId',
                title: 'Placar — NexaGO Organizador',
                loadComponent: () => import('./painel/chaveamento/placar.component').then((m) => m.PlacarComponent),
              },
              {
                path: 'ao-vivo/:matchId',
                title: 'Mesa ao vivo — NexaGO Organizador',
                loadComponent: () => import('./painel/chaveamento/mesa-ao-vivo.component').then((m) => m.MesaAoVivoComponent),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
