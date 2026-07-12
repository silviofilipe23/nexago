import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AthleteStatus = 'ativo' | 'lesionado' | 'afastado' | 'ferias';

const STATUS_COLOR: Record<AthleteStatus, string> = {
  ativo: 'var(--nx-win)',
  lesionado: 'var(--nx-live)',
  afastado: 'var(--nx-pending)',
  ferias: 'var(--nx-text-dim)',
};

/** Avatar com anel de status (protótipo TrAthleteAvatar) — ativo/lesionado/afastado/férias. */
@Component({
  selector: 'co-athlete-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" [style.width.px]="size()" [style.height.px]="size()">
      <div class="circle" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.32">
        {{ initials() }}
      </div>
      <span class="dot" [style.background]="statusColor()"></span>
    </div>
  `,
  styles: `
    .wrap {
      position: relative;
      flex: none;
    }
    .circle {
      border-radius: 50%;
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.3);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 700;
      color: var(--nx-orange-500);
    }
    .dot {
      position: absolute;
      bottom: -1px;
      right: -1px;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      border: 2px solid #0B0B0C;
    }
  `,
})
export class AthleteAvatarComponent {
  readonly initials = input.required<string>();
  readonly size = input(40);
  readonly status = input<AthleteStatus>('ativo');

  protected readonly statusColor = computed(() => STATUS_COLOR[this.status()]);
}
