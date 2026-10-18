import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SquadStore } from './data/squad.store';
import { SquadEntrarComponent } from './squad-entrar.component';
import { SquadPainelComponent } from './squad-painel.component';
import { SquadFrameComponent } from './ui/squad-frame.component';

/** `/squad`: o painel para quem tem contrato; "Entrar no Squad" para os outros. */
@Component({
  selector: 'app-squad-home',
  imports: [SquadFrameComponent, SquadPainelComponent, SquadEntrarComponent],
  template: `
    <app-squad-frame tab="painel">
      @if (store.ambassador(); as a) {
        <app-squad-painel [view]="a" />
      } @else if (store.candidate(); as c) {
        <app-squad-entrar [join]="c.join" />
      }
    </app-squad-frame>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SquadHomeComponent {
  protected readonly store = inject(SquadStore);
}
