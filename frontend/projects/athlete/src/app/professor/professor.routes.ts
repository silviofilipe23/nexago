import type { Routes } from '@angular/router';

/** Filhas de `professor` (o pai, em `app.routes.ts`, tem os guards). `arenas` e
 *  `arenas/:linkId` são também o `webUrl` dos avisos `professor_link_*`; `aulas/:sessionId` é a
 *  chamada do professor. Arquivo sob demanda: a carga inicial ganha uma entrada de rota, não
 *  quatro. */
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
  {
    // Grade de horas abertas para particular, regras e pedidos (`PrDisponibilidadeScreen`).
    path: 'disponibilidade',
    loadComponent: () =>
      import('./disponibilidade/professor-availability.component').then((m) => m.ProfessorAvailabilityComponent),
  },
  {
    // Chamada de uma aula minha — o "Fazer chamada" da agenda (vínculo com "Gerenciar as
    // próprias aulas"; o servidor decide).
    path: 'aulas/:sessionId',
    loadComponent: () => import('./aulas/teacher-attendance.component').then((m) => m.TeacherAttendanceComponent),
  },
];
