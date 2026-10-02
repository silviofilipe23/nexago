import type { RedirectFunction, Routes } from '@angular/router';
import { reviewRedirect } from './review/review-redirect';
import { TournamentLiveStore } from './tournament-live.store';

/** As abas "Partidas & tabela" e "Chaves" viraram sub-visões da categoria. O link antigo já
 *  carregava a categoria em `?categoria=`, então o redirect entrega a MESMA vista; sem o
 *  parâmetro não há como adivinhar a categoria e a lista assume. */
function legacyCategoryRedirect(view: 'partidas' | 'chave'): RedirectFunction {
  return ({ queryParams }) => {
    const categoria = queryParams['categoria'];
    return typeof categoria === 'string' && categoria.length > 0 ? `categorias/${categoria}/${view}` : 'categorias';
  };
}

/** Filhas de `torneios/:id` (`app.routes.ts`), carregadas por `loadChildren`: o
 *  `TournamentLiveStore` (e o Firestore, as avaliações e a reputação que ele arrasta) só baixa
 *  quando alguém abre um torneio, em vez de inchar o bundle inicial do portal inteiro. */
export const tournamentRoutes: Routes = [
  {
    // Um único `TournamentLiveStore` para a casca de abas E para a tela de partida (que é irmã,
    // não filha): carregado uma vez ao entrar no torneio e descartado ao sair. Sem isso, cada
    // aba refaria a mesma cadeia de leituras de partidas, equipes e perfis.
    //
    // O store mora nesta rota vazia, e não em `torneios/:id`, porque `providers` exige a classe
    // na hora de declarar a rota — lá ela iria para o bundle inicial. Vazia e sem componente,
    // ela é transparente: não muda a URL, nem a herança do `:id` (as filhas abaixo seguem filhas
    // de uma rota componentless), nem a navegação relativa.
    path: '',
    providers: [TournamentLiveStore],
    children: [
      {
        path: 'partida/:matchId',
        loadComponent: () => import('./match/match-detail.component').then((m) => m.MatchDetailComponent),
      },
      {
        // O Focus é irmão da casca de abas, não filho: assim herda a mesma instância de
        // `TournamentLiveStore` sem refazer leitura, e não carrega o `AtPanelShellComponent` que
        // toda tela do portal usa — é isso que faz o resto do portal sumir.
        path: 'focus',
        loadComponent: () => import('./focus/focus-shell.component').then((m) => m.FocusShellComponent),
        children: [
          { path: 'agora', loadComponent: () => import('./focus/now/focus-now.component').then((m) => m.FocusNowComponent) },
          {
            path: 'trajetoria',
            loadComponent: () => import('./focus/journey/focus-journey.component').then((m) => m.FocusJourneyComponent),
          },
          { path: 'grupo', loadComponent: () => import('./focus/group/focus-group.component').then((m) => m.FocusGroupComponent) },
          {
            // Wrapper fino: só alimenta `categoryIdInput` de `CategoryBracketComponent` com
            // `store.focusCategoryId()`, já que esta rota não tem `:categoriaId` (Task 10).
            path: 'chave',
            loadComponent: () => import('./focus/bracket/focus-bracket.component').then((m) => m.FocusBracketComponent),
          },
          { path: '', pathMatch: 'full', redirectTo: 'agora' },
        ],
      },
      {
        // Link antigo da aba Hoje, aposentada: o dia do atleta em jogo agora vive no Modo Focus.
        // Fica AQUI, irmã de `focus` — filha da rota vazia acima, que é componentless — e
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
        // Resolvido subindo `hoje` para o nível de `focus`: herda `id` de `torneios/:id` pela
        // rota vazia (as duas componentless) como `partida/:matchId` e `focus` já herdam.
        path: 'hoje',
        pathMatch: 'full',
        redirectTo: ({ params }) => `/torneios/${params['id']}/focus/agora`,
      },
      {
        // Link da avaliação (spec 2026-10-01). Irmã de `hoje` pelo mesmo motivo documentado
        // acima: aqui o `id` chega na função; dentro da casca de abas chegaria `undefined`.
        path: 'avaliar',
        pathMatch: 'full',
        redirectTo: reviewRedirect,
      },
      {
        path: '',
        loadComponent: () => import('./tournament-shell.component').then((m) => m.TournamentShellComponent),
        children: [
          {
            path: 'categorias',
            loadComponent: () => import('./category/category-list.component').then((m) => m.CategoryListComponent),
          },
          {
            // A categoria vive na URL: trocar de sub-visão (partidas/grupos/chave) não troca mais
            // a categoria que o atleta está acompanhando, e o link compartilhado abre na mesma
            // vista. A casca resolve `/categorias/:id` sem sub-visão para a primeira disponível.
            path: 'categorias/:categoriaId',
            loadComponent: () => import('./category/category-shell.component').then((m) => m.CategoryShellComponent),
            children: [
              {
                path: 'partidas',
                loadComponent: () => import('./category/category-matches.component').then((m) => m.CategoryMatchesComponent),
              },
              {
                path: 'grupos',
                loadComponent: () => import('./category/category-groups.component').then((m) => m.CategoryGroupsComponent),
              },
              {
                path: 'chave',
                loadComponent: () => import('./category/category-bracket.component').then((m) => m.CategoryBracketComponent),
              },
            ],
          },
          // Rotas antigas (`/partidas`, `/chaves`) continuam válidas: eram abas do torneio e hoje
          // são sub-visões de categoria. Links com `?categoria=` abrem exatamente a mesma vista
          // de antes; sem ele, cai na lista de categorias.
          { path: 'partidas', pathMatch: 'full', redirectTo: legacyCategoryRedirect('partidas') },
          { path: 'chaves', pathMatch: 'full', redirectTo: legacyCategoryRedirect('chave') },
          {
            // Roster público — a aba só aparece quando o organizador expõe (`enrolledTeamsVisible`),
            // mas a rota fica sempre de pé: o portão mora no componente, como no app.
            path: 'equipes',
            loadComponent: () => import('./tabs/enrolled-teams-tab.component').then((m) => m.EnrolledTeamsTabComponent),
          },
          {
            path: 'minha-inscricao',
            loadComponent: () => import('./tabs/registration-tab.component').then((m) => m.RegistrationTabComponent),
          },
          {
            path: 'palpites',
            loadComponent: () => import('./predictions/predictions-tab.component').then((m) => m.PredictionsTabComponent),
          },
          {
            // A casca redireciona para a aba mais relevante assim que os dados chegam; até lá,
            // a visão geral é o que aparece.
            path: '',
            loadComponent: () => import('./tabs/overview-tab.component').then((m) => m.OverviewTabComponent),
          },
          {
            path: 'visao-geral',
            loadComponent: () => import('./tabs/overview-tab.component').then((m) => m.OverviewTabComponent),
          },
        ],
      },
    ],
  },
];
