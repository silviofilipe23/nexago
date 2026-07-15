import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { OGD_SEEDS, OGD_UNSEEDED, initialsOf } from '../data/mock-data';
import { OgAvatarComponent } from '../ui/avatar.component';
import { OgCardComponent } from '../ui/card.component';
import { OgIconComponent } from '../ui/icon.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgToggleRowComponent } from '../ui/toggle-row.component';

/** Ordem de semeadura das cabeças de chave antes de sortear o bracket da categoria. */
@Component({
  selector: 'og-seeds',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgPageHeaderComponent, OgCardComponent, OgIconComponent, OgAvatarComponent, OgToggleRowComponent],
  template: `
    <og-page-header title="Cabeças de chave" subtitle="Masculino Open · Open Goiânia Beach">
      <button type="button" class="og-ghost-btn" (click)="cancel()">Cancelar</button>
      <button type="button" class="og-mini-btn og-mini-btn-primary" (click)="save()"><og-icon name="check" [size]="14" />Salvar cabeças de chave</button>
    </og-page-header>

    <div class="og-wizard-body">
      <div class="og-wizard-col">
        <og-card title="Critério de semeadura">
          <og-toggle-row
            title="Semear pelo ranking NexaGO"
            desc="Ordena automaticamente pela pontuação. Desligue para ordenar na mão."
            [on]="true"
          />
        </og-card>

        <div class="og-banner">
          As <strong>4 primeiras</strong> cabeças são distribuídas em grupos diferentes. Arraste para ajustar a ordem.
        </div>

        <og-card kicker="Cabeças (8)" title="Ordem de semeadura">
          <div style="display:flex;flex-direction:column;gap:8px">
            @for (s of seeds; track s.pos) {
              <div class="og-seed-row" [class.top]="s.pos <= 4">
                <span class="og-seed-pos" [class.top]="s.pos <= 4">{{ s.pos }}</span>
                <og-avatar [initials]="initialsOf(s.names, ' / ')" [size]="32" />
                <span style="flex:1">
                  <div class="og-seed-name">{{ s.names }}</div>
                  <div class="og-seed-pts">{{ s.pts }} pts no ranking</div>
                </span>
                <span class="og-seed-handle">⠿</span>
              </div>
            }
          </div>
        </og-card>

        <og-card kicker="SORTEIO" [title]="'Demais duplas (' + unseeded.length + ')'">
          <div class="og-seed-unseeded">
            <div style="display:flex">
              @for (n of unseeded.slice(0, 3); track n; let i = $index) {
                <div [style.margin-left.px]="i ? -10 : 0" [style.z-index]="3 - i">
                  <og-avatar [initials]="initialsOf(n, ' / ')" [size]="28" />
                </div>
              }
            </div>
            <span style="flex:1;font-family:var(--nx-font-ui);font-size:12.5px;color:var(--nx-text-mute)">Distribuídas por sorteio na geração da chave.</span>
          </div>
        </og-card>
      </div>
    </div>
  `,
  styles: `
    .og-seed-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 11px 14px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-seed-row.top {
      border-color: rgba(255, 106, 26, 0.3);
    }
    .og-seed-pos {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      flex: none;
      display: grid;
      place-items: center;
      background: var(--nx-surface-1);
      font-family: var(--nx-font-mono);
      font-weight: 800;
      font-size: 12px;
      color: var(--nx-text-dim);
    }
    .og-seed-pos.top {
      background: var(--nx-orange-500);
      color: #0a0a0a;
    }
    .og-seed-name {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 13.5px;
      color: var(--nx-text);
    }
    .og-seed-pts {
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }
    .og-seed-handle {
      color: var(--nx-text-dim);
      font-family: var(--nx-font-mono);
      font-size: 16px;
      cursor: grab;
    }
    .og-seed-unseeded {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px;
      border-radius: var(--nx-r-3);
      border: 1px dashed var(--nx-line-strong);
    }
  `,
})
export class SeedsComponent {
  readonly id = input<string>('');
  readonly catId = input<string>('');

  private readonly router = inject(Router);

  protected readonly seeds = OGD_SEEDS;
  protected readonly unseeded = OGD_UNSEEDED;
  protected readonly initialsOf = initialsOf;

  protected cancel(): void {
    void this.router.navigate(['/painel/eventos', this.id(), 'categorias', this.catId()]);
  }

  protected save(): void {
    void this.router.navigate(['/painel/chaveamento']);
  }
}
