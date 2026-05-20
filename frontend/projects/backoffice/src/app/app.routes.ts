import { Routes } from '@angular/router';

import { authGuard, loginPageGuard, organizerGuard, platformAdminGuard } from './core/auth/auth.guard';
import { BackofficeLayoutComponent } from './layout/backoffice-layout.component';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { OperacionalComponent } from './pages/operacional/operacional.component';
import { SaquesArenaComponent } from './pages/saques-arena/saques-arena.component';
import { UsuariosComponent } from './pages/usuarios/usuarios.component';

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [loginPageGuard],
    component: LoginComponent,
  },
  {
    path: '',
    canMatch: [authGuard, organizerGuard],
    component: BackofficeLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomeComponent },
      { path: 'operacional', component: OperacionalComponent },
      {
        path: 'saques-arenas',
        component: SaquesArenaComponent,
        canMatch: [platformAdminGuard],
      },
      { path: 'usuarios', component: UsuariosComponent, canMatch: [platformAdminGuard] },
    ],
  },
  { path: '**', redirectTo: '' },
];
