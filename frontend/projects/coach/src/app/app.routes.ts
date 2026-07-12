import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Routes } from '@angular/router';

@Component({
  selector: 'app-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="font-family: system-ui; padding: 24px; color: #F4F4F5; background: #050505; min-height: 100dvh; margin: 0;">Portal do treinador — em construção.</p>`,
})
class PlaceholderComponent {}

export const routes: Routes = [
  { path: '', pathMatch: 'full', component: PlaceholderComponent },
  { path: '**', redirectTo: '' },
];
