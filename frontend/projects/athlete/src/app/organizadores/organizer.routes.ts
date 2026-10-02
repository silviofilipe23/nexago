import type { Routes } from '@angular/router';

/** Filhas de `organizadores` (o pai, em `app.routes.ts`, tem os guards). Ficam neste arquivo, que
 *  só carrega sob demanda, para a carga inicial ganhar uma entrada de rota, não duas. */
export const ORGANIZER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./organizer-directory.component').then((m) => m.OrganizerDirectoryComponent),
  },
  {
    path: ':organizerId',
    loadComponent: () => import('./organizer-profile.component').then((m) => m.OrganizerProfileComponent),
  },
];
