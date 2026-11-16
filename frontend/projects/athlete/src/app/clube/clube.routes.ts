import { type Routes } from '@angular/router';
import { ClubStore } from './data/clube.store';

/**
 * Clube de Vantagens Nexa no portal do atleta. A rota vazia componentless provê UM `ClubStore` para
 * a lista e o parceiro: abrir um parceiro e voltar não relê a vitrine. O store mora aqui, e não no
 * `app.routes.ts`, para o SDK do Firestore ficar fora do bundle inicial.
 */
export const CLUBE_ROUTES: Routes = [
  {
    path: '',
    providers: [ClubStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./clube-list.component').then((m) => m.ClubeListComponent),
      },
      {
        path: ':partnerId',
        loadComponent: () => import('./clube-partner.component').then((m) => m.ClubePartnerComponent),
      },
    ],
  },
];
