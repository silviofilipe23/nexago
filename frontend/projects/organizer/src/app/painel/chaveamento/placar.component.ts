import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgDisplayInputComponent } from '../ui/display-input.component';
import { OgFormFieldComponent } from '../ui/form-field.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgPillComponent } from '../ui/pill.component';

interface SetScore {
  set: number;
  sa: number;
  sb: number;
  done: boolean;
}

const SETS: SetScore[] = [
  { set: 1, sa: 6, sb: 4, done: true },
  { set: 2, sa: 3, sb: 3, done: false },
];

/** Lançamento do placar de uma partida — sets, duração, árbitro e observações. */
@Component({
  selector: 'og-placar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgAvatarComponent, OgPillComponent, OgFormFieldComponent, OgDisplayInputComponent],
  template: `
    <og-page-header title="Lançar placar" subtitle="Liga Beach Tennis · Quartas · Quadra 2">
      <button type="button" class="og-ghost-btn" (click)="cancel()">Cancelar</button>
      <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="save()"><og-icon name="check" [size]="14" />Salvar placar</button>
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col">
        <og-card kicker="Partida" title="Martins/Silva vs Costa/Reis">
          <div class="og-placar-header">
            <div class="og-placar-side">
              <og-avatar initials="MS" [size]="40" />
              <span class="og-placar-name">Martins/Silva</span>
            </div>
            <div class="og-placar-score">
              <span class="a">1</span>
              <span class="lbl">sets</span>
              <span class="b">0</span>
            </div>
            <div class="og-placar-side reverse">
              <span class="og-placar-name">Costa/Reis</span>
              <og-avatar initials="CR" [size]="40" />
            </div>
          </div>
        </og-card>

        <og-card kicker="Placar por set" title="Sets">
          @for (s of sets; track s.set) {
            <div class="og-placar-set-row">
              <span class="og-placar-set-label">Set {{ s.set }}</span>
              <div style="flex:1;display:flex;gap:20px">
                <div class="og-placar-set-box-wrap">
                  <span class="lbl">Martins/Silva</span>
                  <div class="og-placar-set-box" [class.editable]="!s.done">{{ s.sa }}</div>
                </div>
                <div class="og-placar-set-box-wrap">
                  <span class="lbl">Costa/Reis</span>
                  <div class="og-placar-set-box" [class.editable]="!s.done">{{ s.sb }}</div>
                </div>
              </div>
              <og-pill [tone]="s.done ? 'dim' : 'orange'">{{ s.done ? 'Encerrado' : 'Em jogo' }}</og-pill>
            </div>
          }
        </og-card>

        <og-card kicker="Detalhes" title="Registro da partida">
          <div class="og-field-grid">
            <og-form-field label="Duração"><og-display-input value="52 min" /></og-form-field>
            <og-form-field label="Árbitro"><og-display-input value="Camila Duarte" /></og-form-field>
          </div>
          <div style="margin-top:16px">
            <og-form-field label="Observações">
              <div class="og-textarea" style="color:var(--nx-text-dim)">Nenhuma ocorrência registrada.</div>
            </og-form-field>
          </div>
        </og-card>
      </div>
    </div>
  `,
  styles: `
    .og-placar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .og-placar-side {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .og-placar-side.reverse {
      flex-direction: row-reverse;
    }
    .og-placar-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 16px;
      color: var(--nx-text);
    }
    .og-placar-score {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .og-placar-score .a {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-orange-500);
    }
    .og-placar-score .b {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 28px;
      color: var(--nx-text-dim);
    }
    .og-placar-score .lbl {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
    }
    .og-placar-set-row {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }
    .og-placar-set-row:last-of-type {
      border-bottom: none;
    }
    .og-placar-set-label {
      width: 60px;
      font-family: var(--nx-font-mono);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-placar-set-box-wrap {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }
    .og-placar-set-box-wrap .lbl {
      font-family: var(--nx-font-mono);
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
    }
    .og-placar-set-box {
      width: 64px;
      height: 64px;
      border-radius: var(--nx-r-3);
      display: grid;
      place-items: center;
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 26px;
      color: var(--nx-text);
    }
    .og-placar-set-box.editable {
      background: var(--nx-surface-1);
      border-color: var(--nx-orange-500);
    }
  `,
})
export class PlacarComponent {
  private readonly router = inject(Router);

  protected readonly sets = SETS;

  protected cancel(): void {
    void this.router.navigateByUrl('/painel/chaveamento/jogos');
  }

  protected save(): void {
    void this.router.navigateByUrl('/painel/chaveamento/jogos');
  }
}
