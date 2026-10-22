import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterActions } from '../../data/actions/center.actions';
import { formatInstant } from '../../domain/dates';
import { AREA_LABELS, homeArea, isManager, ROLE_LABELS, type CenterArea } from '../../domain/roles';
import { AREA_PATH } from '../../shell/nav';
import { IconComponent } from '../../ui/icon.component';

/**
 * W6 · O papel neste centro não abre a área pedida (ex.: professor aqui, owner em outro centro).
 * Isolamento é por centro: o acesso de owner em um não vale no outro. A tentativa vai para a
 * auditoria do centro.
 */
@Component({
  selector: 'ct-denied',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="wrap">
      <div class="url ct-mono">/centro/<span>{{ centerId() }}</span>/{{ areaPath() }}</div>
      <div class="box">
        <div class="lock"><ct-icon name="shield" [size]="28" /></div>
        <div class="ct-kick red">Acesso negado · 403</div>
        <h1>Você não tem permissão para ver {{ areaLabel() }} {{ centerName() ? 'de ' + centerName() : 'deste centro' }}</h1>
        <p>
          Nesse centro seu papel é <b>{{ roleLabel() }}</b>.
          @if (managerElsewhere(); as other) {
            O acesso de {{ other.role }} vale só em {{ other.name }}.
          }
          A tentativa foi registrada.
        </p>
        <div class="ct-row ct-wrap actions">
          @if (managerElsewhere(); as other) {
            <a class="ct-mini-btn ct-mini-btn-primary" [routerLink]="['/centro', other.id, areaPath()]">Voltar a {{ other.name }}</a>
          }
          @if (home(); as h) {
            <a class="ct-mini-btn" [routerLink]="['/centro', centerId(), h]">Abrir {{ centerName() || 'o centro' }} como {{ roleLabel().toLowerCase() }}</a>
          }
        </div>
        <div class="facts">
          <div class="ct-kv"><span>Seu vínculo</span><span>{{ centerName() }} · {{ roleLabel() }}</span></div>
          <div class="ct-kv mono"><span>Área</span><span>{{ area() || '—' }}</span></div>
          <div class="ct-kv mono"><span>Registro</span><span>{{ loggedAt() }} · auditLogs</span></div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .wrap { position: relative; min-height: calc(100dvh - 60px); display: grid; place-items: center; padding: 56px 16px 32px; }
    .url { position: absolute; top: 22px; left: var(--ct-gutter); }
    .url span { color: var(--nx-live); }
    .box { width: min(520px, 100%); text-align: center; display: flex; flex-direction: column; align-items: center; }
    .lock { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.35); color: var(--nx-live); }
    .red { margin-top: 22px; color: var(--nx-live); }
    h1 { margin: 10px 0 0; font-family: var(--nx-font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em; color: var(--nx-text); }
    p { margin: 12px 0 0; font-size: 14px; line-height: 1.55; color: var(--nx-text-mute); }
    p b { color: var(--nx-text); }
    .actions { justify-content: center; margin-top: 24px; }
    .facts { margin-top: 28px; width: 100%; padding: 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); text-align: left; }
  `,
})
export class DeniedComponent {
  readonly centerId = input.required<string>();
  readonly area = input<string>('');

  private readonly ctx = inject(CenterContextService);
  private readonly actions = inject(CenterActions);
  protected readonly loggedAt = signal('—');
  /** Uma linha de auditoria por tentativa (o vínculo muda de objeto a cada snapshot). */
  private readonly logged = new Set<string>();

  protected readonly centerName = computed(() => this.ctx.center()?.name ?? this.ctx.me()?.centerName ?? '');
  protected readonly roleLabel = computed(() => {
    const m = this.ctx.me();
    return m ? ROLE_LABELS[m.role] : '—';
  });
  protected readonly areaLabel = computed(() => {
    const a = this.area() as CenterArea;
    return AREA_LABELS[a] ? AREA_LABELS[a].toLowerCase() : 'esta área';
  });
  protected readonly areaPath = computed(() => AREA_PATH[this.area() as CenterArea] ?? '');
  protected readonly home = computed(() => {
    const h = homeArea(this.ctx.me());
    return h ? AREA_PATH[h] : null;
  });
  /** Outro centro onde a pessoa é owner/admin — o caso clássico de "achei que podia". */
  protected readonly managerElsewhere = computed(() => {
    const m = this.ctx.activeMemberships().find((x) => x.centerId !== this.centerId() && isManager(x));
    return m ? { id: m.centerId, name: m.centerName, role: ROLE_LABELS[m.role] } : null;
  });

  constructor() {
    effect(() => {
      const centerId = this.centerId();
      const area = this.area();
      const role = this.roleLabel();
      const key = `${centerId}|${area}`;
      if (!this.ctx.me() || !area || this.logged.has(key)) {
        return;
      }
      this.logged.add(key);
      untracked(() => {
        this.actions
          .logDenied(centerId, area, role)
          .then(() => this.loggedAt.set(formatInstant(new Date(), this.ctx.center()?.timezone)))
          .catch(() => this.loggedAt.set('não registrado'));
      });
    });
  }
}
