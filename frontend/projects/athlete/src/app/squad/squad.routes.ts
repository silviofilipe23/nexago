import { type Routes } from '@angular/router';
import { SquadStore } from './data/squad.store';

/**
 * NexaSquad no portal do atleta. A rota vazia componentless provê UM `SquadStore` para as três
 * abas (Painel, Ganhos, Nível): trocar de aba não relê o servidor. O store mora aqui, e não no
 * `app.routes.ts`, para o SDK do Functions ficar fora do bundle inicial.
 */
export const SQUAD_ROUTES: Routes = [
  {
    path: '',
    providers: [SquadStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./squad-home.component').then((m) => m.SquadHomeComponent),
      },
      {
        path: 'ganhos',
        loadComponent: () => import('./squad-ganhos.component').then((m) => m.SquadGanhosComponent),
      },
      {
        path: 'nivel',
        loadComponent: () => import('./squad-nivel.component').then((m) => m.SquadNivelComponent),
      },
    ],
  },
];
