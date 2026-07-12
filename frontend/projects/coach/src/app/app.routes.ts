import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { coachGuard } from './auth/coach.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'entrar' },
  {
    path: 'entrar',
    title: 'Entrar — NexaGO Treinador',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'entrar/recuperar',
    title: 'Recuperar senha — NexaGO Treinador',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'entrar/enviado',
    title: 'E-mail enviado — NexaGO Treinador',
    loadComponent: () => import('./auth/email-sent.component').then((m) => m.EmailSentComponent),
  },
  {
    path: 'entrar/redefinir',
    title: 'Redefinir senha — NexaGO Treinador',
    loadComponent: () =>
      import('./auth/reset-password.component').then((m) => m.ResetPasswordComponent),
  },
  {
    path: 'cadastro',
    title: 'Cadastrar treinador — NexaGO Treinador',
    loadComponent: () => import('./auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'painel',
    title: 'Painel — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/home/panel-inicio.component').then((m) => m.PanelInicioComponent),
  },
  {
    path: 'painel/equipes',
    title: 'Equipes — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/equipes/panel-equipes.component').then((m) => m.PanelEquipesComponent),
  },
  {
    path: 'painel/equipes/nova',
    title: 'Nova equipe — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/equipes/panel-nova-equipe.component').then((m) => m.PanelNovaEquipeComponent),
  },
  {
    path: 'painel/atletas',
    title: 'Atletas — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/atletas/panel-atletas.component').then((m) => m.PanelAtletasComponent),
  },
  {
    path: 'painel/atletas/novo',
    title: 'Convidar atleta — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/atletas/panel-novo-atleta.component').then((m) => m.PanelNovoAtletaComponent),
  },
  {
    path: 'convite-atleta/:id',
    title: 'Convite de treinador — NexaGO Treinador',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./convites/convite-atleta.component').then((m) => m.ConviteAtletaComponent),
  },
  {
    path: 'painel/treinos',
    title: 'Treinos — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/treinos/panel-treinos.component').then((m) => m.PanelTreinosComponent),
  },
  {
    path: 'painel/treinos/novo',
    title: 'Novo treino — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/treinos/panel-novo-treino.component').then((m) => m.PanelNovoTreinoComponent),
  },
  {
    path: 'painel/presenca',
    title: 'Presença — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/presenca/panel-presenca.component').then((m) => m.PanelPresencaComponent),
  },
  {
    path: 'painel/convocacoes',
    title: 'Convocações — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/convocacoes/panel-convocacoes.component').then((m) => m.PanelConvocacoesComponent),
  },
  {
    path: 'painel/convocacoes/nova',
    title: 'Nova convocação — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/convocacoes/panel-nova-convocacao.component').then((m) => m.PanelNovaConvocacaoComponent),
  },
  {
    path: 'convocacao/:coachUid/:callUpId',
    title: 'Convocação — NexaGO Treinador',
    canActivate: [authGuard],
    loadComponent: () => import('./convocacao/convocacao.component').then((m) => m.ConvocacaoComponent),
  },
  {
    path: 'painel/avaliacoes',
    title: 'Avaliações — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/panel-avaliacoes.component').then((m) => m.PanelAvaliacoesComponent),
  },
  {
    path: 'painel/avaliacoes/nova',
    title: 'Nova avaliação — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/avaliacoes/panel-nova-avaliacao.component').then((m) => m.PanelNovaAvaliacaoComponent),
  },
  {
    path: 'painel/historico',
    title: 'Histórico — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/historico/panel-historico.component').then((m) => m.PanelHistoricoComponent),
  },
  {
    path: 'painel/torneios',
    title: 'Torneios — NexaGO Treinador',
    canActivate: [authGuard, coachGuard],
    loadComponent: () =>
      import('./painel/torneios/panel-torneios.component').then((m) => m.PanelTorneiosComponent),
  },
  { path: '**', redirectTo: '' },
];
