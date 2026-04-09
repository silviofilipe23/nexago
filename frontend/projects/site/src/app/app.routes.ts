import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./landing/landing-page.component').then((m) => m.LandingPageComponent),
    data: { animation: 'home' },
  },
  {
    path: 'checkout',
    loadComponent: () =>
      import('./reservation-checkout.component').then((m) => m.ReservationCheckoutComponent),
    data: { animation: 'checkout' },
  },
  {
    path: 'disponibilidade',
    loadComponent: () =>
      import('./arena-availability.component').then((m) => m.ArenaAvailabilityComponent),
    data: { animation: 'search' },
  },
  {
    path: 'arena/:id',
    loadComponent: () => import('./arena-detail/arena-detail.component').then((m) => m.ArenaDetailComponent),
    data: { animation: 'arena' },
  },
  {
    path: 'checkout/sucesso',
    loadComponent: () =>
      import('./reservation-success.component').then((m) => m.ReservationSuccessComponent),
    data: { animation: 'success' },
  },
  { path: '**', redirectTo: '', pathMatch: 'full' },
];
