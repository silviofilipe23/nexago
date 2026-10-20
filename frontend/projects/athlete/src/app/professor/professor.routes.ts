import type { Routes } from '@angular/router';

/** Filhas de `professor` (o pai, em `app.routes.ts`, tem os guards). `arenas` e
 *  `arenas/:linkId` são também o `webUrl` dos avisos `professor_link_*`. Arquivo sob demanda:
 *  a carga inicial ganha uma entrada de rota, não três. */
export const PROFESSOR_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'arenas' },
  {
    path: 'arenas',
    loadComponent: () => import('./professor-arenas.component').then((m) => m.ProfessorArenasComponent),
  },
  {
    path: 'arenas/:linkId',
    loadComponent: () => import('./professor-link-detail.component').then((m) => m.ProfessorLinkDetailComponent),
  },
];
