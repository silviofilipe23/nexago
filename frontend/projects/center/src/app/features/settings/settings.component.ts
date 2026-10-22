import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterActions, type CenterProfilePatch } from '../../data/actions/center.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { formatDayKey, formatInstant, wallClock } from '../../domain/dates';
import { holdsSeat } from '../../domain/enrollment';
import type { CenterPolicies, CenterStatus, TrainingCenter } from '../../domain/models';
import { AuditTrailComponent, BannerComponent, PageHeaderComponent, SegmentedComponent } from '../../ui/kit';
import { applyChoice, applyNumber, changedPolicies, choiceValue, policiesError, POLICY_ROWS } from './policy-fields';
import { BillingSettingsComponent } from './billing-settings.component';
import { NotificationSettingsComponent } from './notification-settings.component';
import { SubscriptionCardComponent } from './subscription-card.component';

type Tab = 'dados' | 'politicas' | 'cobranca' | 'quadras' | 'notificacoes' | 'assinatura';

const TABS: { value: Tab; label: string }[] = [
  { value: 'dados', label: 'Dados do centro' },
  { value: 'politicas', label: 'Políticas comerciais' },
  { value: 'cobranca', label: 'Cobrança recorrente' },
  { value: 'quadras', label: 'Quadras' },
  { value: 'notificacoes', label: 'Notificações' },
  { value: 'assinatura', label: 'Assinatura NexaGO' },
];

export const CENTER_STATUS: Record<CenterStatus, [string, string]> = {
  active: ['Ativo', 'green'],
  pending: ['Pendente', 'orange'],
  suspended: ['Suspenso', 'red'],
};

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
  'America/Belem',
  'America/Manaus',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Noronha',
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function profileOf(c: TrainingCenter): CenterProfilePatch {
  return {
    name: c.name,
    legalName: c.legalName,
    cnpj: c.cnpj,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
    city: c.city,
    state: c.state,
    address: c.address,
    timezone: c.timezone,
  };
}

@Component({
  selector: 'ct-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, SegmentedComponent, BannerComponent, AuditTrailComponent, SubscriptionCardComponent, BillingSettingsComponent, NotificationSettingsComponent],
  templateUrl: './settings.component.html',
  styles: `
    .body { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .wide { grid-column: 1 / -1; }
    /* Abas rolam na horizontal no celular em vez de quebrar o texto dos botões. */
    .tabs { overflow-x: auto; max-width: 100%; }
    .tabs > ct-segmented { display: block; width: max-content; }
    .policy { padding: 14px 0; border-top: 1px solid var(--nx-line); display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; }
    .policy .ct-grow { min-width: 220px; }
    .policy.off { opacity: 0.45; }
    .num { display: flex; align-items: center; gap: 8px; }
    .num .ct-input { width: 92px; height: 36px; }
    .save { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
    .save .ct-input { flex: 1; min-width: 200px; }
    .ct-card > p { margin: 0; }
  `,
})
export class SettingsComponent {
  readonly centerId = input.required<string>();
  /** `?aba=politicas` abre direto numa aba (links da ativação). */
  readonly aba = input<string>();

  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(CenterActions);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly tabs = TABS;
  protected readonly timezones = TIMEZONES;
  protected readonly statusLabel = CENTER_STATUS;

  protected readonly tab = linkedSignal<Tab>(() => {
    const a = this.aba();
    return TABS.some((t) => t.value === a) ? (a as Tab) : 'dados';
  });

  /** Só owner/admin editam, e nunca com o centro suspenso. */
  protected readonly editable = computed(() => this.ctx.isManager() && this.ctx.canWrite());
  protected readonly tz = computed(() => this.ctx.center()?.timezone ?? 'America/Sao_Paulo');

  // ── Dados do centro ─────────────────────────────────────
  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    legalName: ['', Validators.maxLength(120)],
    cnpj: ['', Validators.maxLength(20)],
    contactEmail: ['', [Validators.required, Validators.pattern(EMAIL)]],
    contactPhone: ['', Validators.maxLength(20)],
    city: ['', Validators.maxLength(60)],
    state: ['', Validators.maxLength(2)],
    address: ['', Validators.maxLength(160)],
    timezone: ['America/Sao_Paulo', Validators.required],
  });
  private readonly profileKey = computed(() => {
    const c = this.ctx.center();
    return c ? JSON.stringify(profileOf(c)) : '';
  });
  protected readonly tzOptions = computed(() => {
    const cur = this.ctx.center()?.timezone;
    return cur && !TIMEZONES.includes(cur) ? [cur, ...TIMEZONES] : TIMEZONES;
  });
  protected readonly profileBusy = signal(false);
  protected readonly profileError = signal('');
  protected readonly profileSaved = signal(false);
  protected readonly submitted = signal(false);

  // ── Políticas ───────────────────────────────────────────
  private readonly policiesKey = computed(() => {
    const p = this.ctx.center()?.policies;
    return p ? JSON.stringify(p) : '';
  });
  protected readonly draft = linkedSignal<string, CenterPolicies | null>({
    source: this.policiesKey,
    computation: (k) => (k ? (JSON.parse(k) as CenterPolicies) : null),
  });
  protected readonly reason = signal('');
  protected readonly policiesBusy = signal(false);
  protected readonly policiesErr = signal('');
  protected readonly policiesSaved = signal(false);

  protected readonly changed = computed(() => {
    const before = this.ctx.center()?.policies;
    const next = this.draft();
    return before && next ? changedPolicies(before, next) : [];
  });
  protected readonly invalid = computed(() => {
    const d = this.draft();
    return d ? policiesError(d) : null;
  });

  protected readonly policyView = computed(() => {
    const p = this.draft();
    if (!p) {
      return [];
    }
    return POLICY_ROWS.map((r) => ({
      row: r,
      title: r.title(p),
      hint: r.hint(p),
      value: r.kind === 'choice' ? choiceValue(p, r.key) : Number.isFinite(p[r.key]) ? String(p[r.key]) : '',
      off: r.kind === 'number' && r.dependsOn ? p[r.dependsOn] === false : false,
      options: r.kind === 'choice' ? r.options : [],
      unit: r.kind === 'number' ? r.unit : '',
      changed: this.changed().includes(r.key),
    }));
  });

  protected readonly seesEnrollments = computed(() => this.ctx.has('view_enrollments') || this.ctx.has('enroll_students'));
  /** "4 quadras em 1 local próprio" — a gestão de quadras mudou para Locais. */
  protected readonly courtsSummary = computed(() => {
    const own = this.store.locations().filter((l) => l.status === 'active' && l.type === 'own');
    const n = this.store.courts().filter((c) => own.some((l) => l.id === c.locationId)).length;
    if (own.length === 0) return 'Nenhum local próprio';
    return `${n} ${n === 1 ? 'quadra' : 'quadras'} em ${own.length} ${own.length === 1 ? 'local próprio' : 'locais próprios'}`;
  });

  protected readonly activeContracts = computed(() => this.store.enrollments().filter((e) => holdsSeat(e.status)).length);
  protected readonly policyAudit = computed(() => {
    const tz = this.tz();
    return this.store
      .audit()
      .filter((a) => a.action === 'center.policies' || a.action === 'center.created')
      .map((a) => ({
        when: formatInstant(a.at, tz),
        who: a.actorName,
        what: a.action === 'center.created' ? 'Políticas iniciais definidas' : a.detail,
        why: a.reason || undefined,
      }));
  });

  protected readonly dates = computed(() => {
    const c = this.ctx.center();
    const tz = this.tz();
    const day = (d: Date | null) => (d ? formatDayKey(wallClock(d, tz).dayKey, true) : '—');
    return { created: day(c?.createdAt ?? null), activated: day(c?.activatedAt ?? null) };
  });

  constructor() {
    // Recarrega o form quando o centro muda no servidor, sem atropelar edição em curso.
    effect(() => {
      const key = this.profileKey();
      if (key && this.form.pristine) {
        this.form.reset(JSON.parse(key) as CenterProfilePatch);
      }
    });
    effect(() => {
      if (this.editable()) {
        this.form.enable({ emitEvent: false });
      } else {
        this.form.disable({ emitEvent: false });
      }
    });
  }

  protected selectTab(value: string): void {
    this.tab.set(value as Tab);
  }

  protected invalidCtl(name: keyof CenterProfilePatch): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected async saveProfile(): Promise<void> {
    this.submitted.set(true);
    this.profileSaved.set(false);
    if (!this.editable() || this.form.invalid || this.profileBusy()) {
      return;
    }
    this.profileBusy.set(true);
    this.profileError.set('');
    try {
      const value = this.form.getRawValue();
      await this.actions.updateProfile(value);
      this.form.reset(value);
      this.submitted.set(false);
      this.profileSaved.set(true);
    } catch (err) {
      this.profileError.set(writeErrorMessage(err));
    } finally {
      this.profileBusy.set(false);
    }
  }

  protected discardProfile(): void {
    const key = this.profileKey();
    if (key) {
      this.form.reset(JSON.parse(key) as CenterProfilePatch);
    }
    this.submitted.set(false);
  }

  protected setChoice(key: keyof CenterPolicies, value: string): void {
    this.policiesSaved.set(false);
    this.draft.update((p) => (p ? applyChoice(p, key as Parameters<typeof applyChoice>[1], value) : p));
  }

  protected setNumber(key: keyof CenterPolicies, ev: Event): void {
    this.policiesSaved.set(false);
    const raw = (ev.target as HTMLInputElement).value;
    this.draft.update((p) => (p ? applyNumber(p, key as Parameters<typeof applyNumber>[1], raw) : p));
  }

  protected discardPolicies(): void {
    const k = this.policiesKey();
    this.draft.set(k ? (JSON.parse(k) as CenterPolicies) : null);
    this.reason.set('');
  }

  protected async savePolicies(): Promise<void> {
    const before = this.ctx.center()?.policies;
    const next = this.draft();
    if (!before || !next || !this.editable() || this.policiesBusy() || this.changed().length === 0) {
      return;
    }
    if (this.invalid()) {
      this.policiesErr.set(this.invalid()!);
      return;
    }
    if (this.reason().trim().length < 3) {
      this.policiesErr.set('Conte o motivo da mudança — fica na trilha de auditoria.');
      return;
    }
    this.policiesBusy.set(true);
    this.policiesErr.set('');
    try {
      await this.actions.updatePolicies(before, next, this.reason().trim());
      this.reason.set('');
      this.policiesSaved.set(true);
    } catch (err) {
      this.policiesErr.set(writeErrorMessage(err));
    } finally {
      this.policiesBusy.set(false);
    }
  }

  protected inputValue(ev: Event): string {
    return (ev.target as HTMLInputElement).value;
  }
}
