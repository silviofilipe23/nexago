import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./landing/landing-page.component').then((m) => m.LandingPageComponent),
    data: { animation: 'home' },
  },
  {
    path: 'entrar',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
    data: { animation: 'login' },
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./plan-flow/auth-register-redirect.component').then((m) => m.AuthRegisterRedirectComponent),
    data: { animation: 'login' },
  },
  {
    path: 'onboarding/organizer',
    loadComponent: () =>
      import('./plan-flow/plan-organizer-onboarding.component').then(
        (m) => m.PlanOrganizerOnboardingComponent,
      ),
    data: { animation: 'home' },
  },
  {
    path: 'sales',
    loadComponent: () =>
      import('./plan-flow/plan-arena-sales.component').then((m) => m.PlanArenaSalesComponent),
    data: { animation: 'home' },
  },
  {
    path: 'checkout/sucesso',
    loadComponent: () =>
      import('./reservation-success.component').then((m) => m.ReservationSuccessComponent),
    data: { animation: 'success' },
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
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
  { path: '**', redirectTo: '', pathMatch: 'full' },
];
