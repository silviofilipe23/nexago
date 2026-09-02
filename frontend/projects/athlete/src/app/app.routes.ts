import { type RedirectFunction, type Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { onboardingGuard } from './auth/onboarding.guard';
import { staffGuard } from './auth/staff.guard';
import { TournamentLiveStore } from './tournaments/tournament-live.store';
import { RegistrationWizardStore } from './tournaments/registration/wizard/registration-wizard.store';

/** As abas "Partidas & tabela" e "Chaves" viraram sub-visões da categoria. O link antigo já
 *  carregava a categoria em `?categoria=`, então o redirect entrega a MESMA vista; sem o
 *  parâmetro não há como adivinhar a categoria e a lista assume. */
function legacyCategoryRedirect(view: 'partidas' | 'chave'): RedirectFunction {
  return ({ queryParams }) => {
    const categoria = queryParams['categoria'];
    return typeof categoria === 'string' && categoria.length > 0 ? `categorias/${categoria}/${view}` : 'categorias';
  };
}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'entrar',
  },
  {
    path: 'atletas',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./atletas/athlete-directory.component').then((m) => m.AthleteDirectoryComponent),
  },
  {
    // Link de perfil compartilhado. Exige login porque as rules de `public_profiles` só
    // liberam leitura autenticada (anti-scraping) — sem o guard, o visitante deslogado
    // tomava permission-denied e via o card "LINK INVÁLIDO / PERFIL_404" em vez do login.
    // Sem `onboardingGuard` de propósito: quem se cadastra pelo link volta direto ao perfil.
    path: 'atletas/:handle',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./profile/athlete-public-profile.component').then(
        (m) => m.AthletePublicProfileComponent,
      ),
  },
  {
    path: 'entrar',
    loadComponent: () =>
      import('./login/athlete-login.component').then((m) => m.AthleteLoginComponent),
  },
  {
    path: 'cadastro',
    loadComponent: () =>
      import('./register/athlete-register.component').then((m) => m.AthleteRegisterComponent),
  },
  {
    path: 'esqueci-senha',
    loadComponent: () =>
      import('./auth/forgot-password/athlete-forgot-password.component').then(
        (m) => m.AthleteForgotPasswordComponent,
      ),
  },
  {
    path: 'email-enviado',
    loadComponent: () =>
      import('./auth/reset-sent/athlete-reset-sent.component').then(
        (m) => m.AthleteResetSentComponent,
      ),
  },
  {
    path: 'redefinir-senha',
    loadComponent: () =>
      import('./auth/reset-password/athlete-reset-password.component').then(
        (m) => m.AthleteResetPasswordComponent,
      ),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./onboarding/athlete-onboarding.component').then(
        (m) => m.AthleteOnboardingComponent,
      ),
  },
  {
    path: 'painel',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./athlete-painel.component').then((m) => m.AthletePainelComponent),
  },
  {
    path: 'agenda',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./agenda/athlete-agenda.component').then((m) => m.AthleteAgendaComponent),
  },
  {
    path: 'agenda/reserva/:bookingId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./agenda/booking-detail/athlete-booking-detail.component').then(
        (m) => m.AthleteBookingDetailComponent,
      ),
  },
  {
    path: 'reservar',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/athlete-reservar.component').then((m) => m.AthleteReservarComponent),
  },
  {
    path: 'reservar/:arenaId/agendar/pagamento/confirmada',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-booking-confirmed.component').then(
        (m) => m.ArenaBookingConfirmedComponent,
      ),
  },
  {
    path: 'reservar/:arenaId/agendar/pagamento',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-payment.component').then((m) => m.ArenaPaymentComponent),
  },
  {
    path: 'reservar/:arenaId/agendar',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-booking.component').then((m) => m.ArenaBookingComponent),
  },
  {
    path: 'clubinho',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./clubinho/clubinho-hub.component').then((m) => m.ClubinhoHubComponent),
  },
  {
    path: 'reservar/:arenaId/clubinho/:sessionId/pagamento',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./clubinho/club-session-payment.component').then((m) => m.ClubSessionPaymentComponent),
  },
  {
    path: 'reservar/:arenaId/clubinho/:sessionId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./clubinho/club-session-detail.component').then((m) => m.ClubSessionDetailComponent),
  },
  {
    path: 'reservar/:arenaId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./reservar/arena-detail.component').then((m) => m.ArenaDetailComponent),
  },
  {
    path: 'ranking',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./ranking/athlete-ranking.component').then((m) => m.AthleteRankingComponent),
  },
  {
    path: 'historico',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./history/athlete-history.component').then((m) => m.AthleteHistoryComponent),
  },
  {
    path: 'equipes',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./equipes/athlete-equipes.component').then((m) => m.AthleteEquipesComponent),
  },
  {
    path: 'equipes/:teamId',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./equipes/team-public-profile.component').then((m) => m.TeamPublicProfileComponent),
  },
  {
    path: 'competir',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./competir/competir-hub.component').then((m) => m.CompetirHubComponent),
  },
  {
    // Operação do mesário (e do gestor) — os torneios em que ELE é equipe, não em que joga.
    // O `staffGuard` só evita tela vazia por link solto; quem autoriza a escrita são as rules
    // (`canScoreTournament`) e o `assertCanScoreTournament` dos callables.
    path: 'mesa',
    canActivate: [authGuard, onboardingGuard, staffGuard],
    loadComponent: () => import('./mesa/mesa-tournaments.component').then((m) => m.MesaTournamentsComponent),
  },
  {
    path: 'mesa/:tournamentId/partida/:matchId',
    canActivate: [authGuard, onboardingGuard, staffGuard],
    loadComponent: () => import('./mesa/mesa-live.component').then((m) => m.MesaLiveComponent),
  },
  {
    path: 'mesa/:tournamentId',
    canActivate: [authGuard, onboardingGuard, staffGuard],
    loadComponent: () => import('./mesa/mesa-matches.component').then((m) => m.MesaMatchesComponent),
  },
  {
    path: 'notificacoes',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./notificacoes/athlete-notifications.component').then(
        (m) => m.AthleteNotificationsComponent,
      ),
  },
  {
    path: 'comunidade',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./comunidade/athlete-community.component').then((m) => m.AthleteCommunityComponent),
  },
  {
    path: 'bora-jogar',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./bora-jogar/bora-jogar.component').then((m) => m.BoraJogarComponent),
  },
  {
    path: 'torneios',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/tournament-discovery.component').then(
        (m) => m.TournamentDiscoveryComponent,
      ),
  },
  {
    path: 'ligas/:id',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./tournaments/league-detail-shell.component').then((m) => m.LeagueDetailShellComponent),
  },
  {
    // Wizard de inscrição: uma rota por etapa, sob `torneios/:id/inscricao`.
    //
    // A rota-mãe é COMPONENTLESS de propósito. Duas consequências, as duas necessárias: o
    // `RegistrationWizardStore` vive uma instância por entrada no fluxo (os seis passos leem o
    // mesmo torneio, as mesmas inscrições e os mesmos convites, sem refazer a cadeia de
    // leituras a cada navegação), e o `:id` é herdado pelos filhos sem
    // `paramsInheritanceStrategy`.
    //
    // `''` é o PORTEIRO, não uma tela: ele deriva a etapa do Firestore e se substitui pela rota
    // dela. É por isso que os ~8 pontos de entrada do portal (painel, agenda, anunciador de
    // convite, aba do torneio, liga, "continuar inscrição") continuam apontando para
    // `torneios/:id/inscricao` sem nenhuma mudança.
    path: 'torneios/:id/inscricao',
    canActivate: [authGuard, onboardingGuard],
    providers: [RegistrationWizardStore],
    children: [
      {
        path: 'categoria',
        loadComponent: () =>
          import('./tournaments/registration/wizard/steps/registration-category.component').then(
            (m) => m.RegistrationCategoryComponent,
          ),
      },
      {
        path: 'consentimento',
        loadComponent: () =>
          import('./tournaments/registration/wizard/steps/registration-consent.component').then(
            (m) => m.RegistrationConsentComponent,
          ),
      },
      {
        path: 'condicoes',
        loadComponent: () =>
          import('./tournaments/registration/wizard/steps/registration-terms.component').then(
            (m) => m.RegistrationTermsComponent,
          ),
      },
      {
        path: 'parceiro',
        loadComponent: () =>
          import('./tournaments/registration/wizard/steps/registration-partner.component').then(
            (m) => m.RegistrationPartnerComponent,
          ),
      },
      {
        path: 'aguardando',
        loadComponent: () =>
          import('./tournaments/registration/wizard/steps/registration-waiting.component').then(
            (m) => m.RegistrationWaitingComponent,
          ),
      },
      {
        path: 'uniforme',
        loadComponent: () =>
          import('./tournaments/registration/wizard/steps/registration-uniform.component').then(
            (m) => m.RegistrationUniformComponent,
          ),
      },
      {
        // Já existia como rota irmã; virou filha para herdar o store e o `:id`. A URL é a
        // mesma, então os links de "pagar" do painel e da aba do torneio seguem valendo.
        path: 'pagamento',
        loadComponent: () =>
          import('./tournaments/registration/tournament-payment.component').then(
            (m) => m.TournamentPaymentComponent,
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./tournaments/registration/wizard/registration-gate.component').then(
            (m) => m.RegistrationGateComponent,
          ),
      },
    ],
  },
  {
    // Um único `TournamentLiveStore` para a casca de abas E para a tela de partida (que é irmã,
    // não filha): carregado uma vez ao entrar no torneio e descartado ao sair. Sem isso, cada
    // aba refaria a mesma cadeia de leituras de partidas, equipes e perfis.
    path: 'torneios/:id',
    canActivate: [authGuard, onboardingGuard],
    providers: [TournamentLiveStore],
    children: [
      {
        path: 'partida/:matchId',
        loadComponent: () => import('./tournaments/match/match-detail.component').then((m) => m.MatchDetailComponent),
      },
      {
        // O Focus é irmão da casca de abas, não filho: assim herda a mesma instância de
        // `TournamentLiveStore` sem refazer leitura, e não carrega o `AtPanelShellComponent` que
        // toda tela do portal usa — é isso que faz o resto do portal sumir.
        path: 'focus',
        loadComponent: () => import('./tournaments/focus/focus-shell.component').then((m) => m.FocusShellComponent),
        children: [
          { path: 'agora', loadComponent: () => import('./tournaments/focus/now/focus-now.component').then((m) => m.FocusNowComponent) },
          {
            path: 'trajetoria',
            loadComponent: () => import('./tournaments/focus/journey/focus-journey.component').then((m) => m.FocusJourneyComponent),
          },
          { path: 'grupo', loadComponent: () => import('./tournaments/focus/group/focus-group.component').then((m) => m.FocusGroupComponent) },
          {
            // Wrapper fino: só alimenta `categoryIdInput` de `CategoryBracketComponent` com
            // `store.focusCategoryId()`, já que esta rota não tem `:categoriaId` (Task 10).
            path: 'chave',
            loadComponent: () => import('./tournaments/focus/bracket/focus-bracket.component').then((m) => m.FocusBracketComponent),
          },
          { path: '', pathMatch: 'full', redirectTo: 'agora' },
        ],
      },
      {
        // Link antigo da aba Hoje, aposentada: o dia do atleta em jogo agora vive no Modo Focus.
        // Fica AQUI, irmã de `focus` — filha direta de `torneios/:id`, que é componentless — e
        // não aninhada dentro da casca de abas (como a aba Hoje vivia antes). Duas armadilhas
        // do router descartaram as alternativas mais óbvias, as duas confirmadas com um teste
        // isolado via `RouterTestingHarness` antes de escrever esta rota:
        // 1) `redirectTo: '../focus/agora'` (relativo): o router NÃO resolve `..` como "suba um
        //    nível" — trata como segmento literal a casar contra as rotas IRMÃS do próprio nível
        //    de `hoje`, nunca casa, e a navegação falha com NG04002.
        // 2) Deixar `hoje` aninhada dentro do `path: ''` da casca de abas (como estava) e usar a
        //    forma de função só troca o sintoma: o `parentRoute` ali É a própria casca de abas,
        //    que TEM `loadComponent` — não é componentless — então a herança `emptyOnly` de
        //    params não repassa o `id` do avô, e `params['id']` chega `undefined` na função.
        // Resolvido subindo `hoje` para o nível de `focus`: herda `id` de `torneios/:id`
        // (componentless) como `partida/:matchId` e `focus` já herdam.
        path: 'hoje',
        pathMatch: 'full',
        redirectTo: ({ params }) => `/torneios/${params['id']}/focus/agora`,
      },
      {
        path: '',
        loadComponent: () => import('./tournaments/tournament-shell.component').then((m) => m.TournamentShellComponent),
        children: [
          {
            path: 'categorias',
            loadComponent: () => import('./tournaments/category/category-list.component').then((m) => m.CategoryListComponent),
          },
          {
            // A categoria vive na URL: trocar de sub-visão (partidas/grupos/chave) não troca mais
            // a categoria que o atleta está acompanhando, e o link compartilhado abre na mesma
            // vista. A casca resolve `/categorias/:id` sem sub-visão para a primeira disponível.
            path: 'categorias/:categoriaId',
            loadComponent: () => import('./tournaments/category/category-shell.component').then((m) => m.CategoryShellComponent),
            children: [
              {
                path: 'partidas',
                loadComponent: () => import('./tournaments/category/category-matches.component').then((m) => m.CategoryMatchesComponent),
              },
              {
                path: 'grupos',
                loadComponent: () => import('./tournaments/category/category-groups.component').then((m) => m.CategoryGroupsComponent),
              },
              {
                path: 'chave',
                loadComponent: () => import('./tournaments/category/category-bracket.component').then((m) => m.CategoryBracketComponent),
              },
            ],
          },
          // Rotas antigas (`/partidas`, `/chaves`) continuam válidas: eram abas do torneio e hoje
          // são sub-visões de categoria. Links com `?categoria=` abrem exatamente a mesma vista
          // de antes; sem ele, cai na lista de categorias.
          { path: 'partidas', pathMatch: 'full', redirectTo: legacyCategoryRedirect('partidas') },
          { path: 'chaves', pathMatch: 'full', redirectTo: legacyCategoryRedirect('chave') },
          {
            path: 'minha-inscricao',
            loadComponent: () => import('./tournaments/tabs/registration-tab.component').then((m) => m.RegistrationTabComponent),
          },
          {
            path: 'palpites',
            loadComponent: () => import('./tournaments/predictions/predictions-tab.component').then((m) => m.PredictionsTabComponent),
          },
          {
            // A casca redireciona para a aba mais relevante assim que os dados chegam; até lá,
            // a visão geral é o que aparece.
            path: '',
            loadComponent: () => import('./tournaments/tabs/overview-tab.component').then((m) => m.OverviewTabComponent),
          },
          {
            path: 'visao-geral',
            loadComponent: () => import('./tournaments/tabs/overview-tab.component').then((m) => m.OverviewTabComponent),
          },
        ],
      },
    ],
  },
  {
    path: 'perfil',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./profile/athlete-profile-settings.component').then(
        (m) => m.AthleteProfileSettingsComponent,
      ),
  },
  {
    path: 'perfil/esportes',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./profile/athlete-sports-levels.component').then(
        (m) => m.AthleteSportsLevelsComponent,
      ),
  },
  // Fallback: URL desconhecida cai no painel (deslogado, o authGuard manda pro login).
  { path: '**', redirectTo: 'painel' },
];
