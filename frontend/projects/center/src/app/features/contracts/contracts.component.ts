import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import {
  CONTRACT_STATE,
  contractState,
  contractStats,
  matchesContractFilter,
  signatureLine,
  sortContracts,
  termLabel,
  type ContractFilter,
} from '../../domain/contracts';
import { DEFAULT_TIMEZONE, todayKey } from '../../domain/dates';
import { IconComponent } from '../../ui/icon.component';
import { PageHeaderComponent, PersonComponent, StatComponent } from '../../ui/kit';
import { SendContractModalComponent } from './send-contract-modal.component';

const CHIPS: { value: ContractFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'open', label: 'Aguardando assinatura' },
  { value: 'signed', label: 'Assinados' },
  { value: 'expiring', label: 'Renovam em breve' },
  { value: 'ended', label: 'Encerrados' },
];

/** K1 — contratos e termos dos alunos do centro. */
@Component({
  selector: 'ct-contracts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, StatComponent, PersonComponent, IconComponent, SendContractModalComponent],
  template: `
    <ct-page-header title="Contratos" [subtitle]="subtitle()">
      <a class="ct-mini-btn" [routerLink]="['/centro', centerId(), 'contratos', 'modelos']"><ct-icon name="doc" [size]="14" />Modelos</a>
      @if (canSend()) {
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" (click)="sending.set(true)"><ct-icon name="pen" [size]="14" />Enviar contrato</button>
      }
    </ct-page-header>

    <div class="page">
      <div class="ct-stats">
        <ct-stat label="Assinados e vigentes" [value]="'' + stats().inForce" [sub]="'de ' + stats().activeStudents + ' alunos ativos'" tone="green" />
        <ct-stat
          label="Aguardando assinatura"
          [value]="'' + stats().awaiting"
          [sub]="stats().awaitingStale ? stats().awaitingStale + ' há mais de 7 dias' : 'nenhum parado há mais de 7 dias'"
          [tone]="stats().awaiting ? 'orange' : ''"
        />
        <ct-stat label="Renovam em 30 dias" [value]="'' + stats().expiringSoon" sub="fim da vigência chegando" />
        <ct-stat label="Alunos sem contrato" [value]="'' + stats().studentsWithout" sub="ativos sem matrícula assinada vigente" [tone]="stats().studentsWithout ? 'red' : ''" />
      </div>

      <div class="ct-filter-bar">
        <input class="ct-input search" type="search" placeholder="Buscar por aluno" aria-label="Buscar por aluno" [value]="term()" (input)="term.set(value($event))" />
        @for (c of chips; track c.value) {
          <button type="button" class="ct-chip" [class.active]="filter() === c.value" (click)="filter.set(c.value)">{{ c.label }}</button>
        }
      </div>

      <div class="ct-card flush">
        @if (!store.loaded.contracts()) {
          <div class="ct-empty">Carregando contratos…</div>
        } @else if (store.contracts().length === 0) {
          <div class="ct-empty">
            Nenhum contrato enviado ainda.
            {{ canSend() ? 'Publique um modelo em “Modelos” e use “Enviar contrato”.' : '' }}
          </div>
        } @else {
          <div class="ct-table" style="--cols: minmax(170px, 1.2fr) minmax(150px, 1.2fr) minmax(110px, 1fr) minmax(140px, 1.1fr) minmax(170px, 1.5fr) 170px; --min-w: 1000px">
            <div class="ct-thead"><span>Aluno</span><span>Modelo</span><span>Plano</span><span>Vigência</span><span>Assinatura</span><span>Situação</span></div>
            @for (r of rows(); track r.c.id) {
              <a class="ct-tr" [routerLink]="['/centro', centerId(), 'contratos', r.c.id]">
                <ct-person [name]="r.c.studentName" [colorKey]="r.c.studentId" [size]="28">
                  @if (r.c.isMinor) {
                    <span class="ct-tag blue">Menor</span>
                  }
                </ct-person>
                <span class="ct-row" style="gap: 6px; min-width: 0">
                  <span class="ct-ellipsis model">{{ r.c.title }}</span>
                  <span class="ct-tag">v{{ r.c.templateVersion }}</span>
                </span>
                <span class="ct-ellipsis">{{ r.c.planName || '—' }}</span>
                <span class="ct-mono term">{{ r.term }}</span>
                <span class="ct-ellipsis" [class.waiting]="r.open">{{ r.signature }}</span>
                <span><span class="ct-pill" [class]="'ct-pill ' + r.tone">{{ r.label }}</span></span>
              </a>
            } @empty {
              <div class="ct-empty">Nenhum contrato com esse filtro.</div>
            }
          </div>
        }
      </div>
    </div>

    @if (sending()) {
      <ct-send-contract-modal (closed)="sending.set(false)" />
    }
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
    .search { width: 260px; max-width: 100%; }
    .model { color: var(--nx-text); }
    .term { font-weight: 600; color: var(--nx-text-mute); }
    .waiting { color: var(--nx-pending); }
  `,
})
export class ContractsComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly router = inject(Router);

  readonly centerId = input.required<string>();
  /** `?enviar=1` abre o modal direto. */
  readonly enviar = input<string>();

  protected readonly chips = CHIPS;
  protected readonly term = signal('');
  protected readonly filter = signal<ContractFilter>('all');
  protected readonly sending = signal(false);

  protected readonly canSend = computed(() => this.ctx.has('enroll_students') && this.ctx.canWrite());
  private readonly tz = computed(() => this.ctx.center()?.timezone ?? DEFAULT_TIMEZONE);
  private readonly today = computed(() => todayKey(this.tz()));
  /** Relógio pros "há 2h" — o feed ao vivo redesenha a lista a cada mudança. */
  private readonly now = computed(() => {
    this.store.contracts();
    return new Date();
  });

  protected readonly stats = computed(() => contractStats(this.store.contracts(), this.store.students(), this.today(), this.now()));
  protected readonly subtitle = computed(() => {
    const n = this.store.contracts().length;
    return `Contratos e termos dos alunos · ${n} ${n === 1 ? 'documento' : 'documentos'}`;
  });

  protected readonly rows = computed(() => {
    const q = this.term().trim().toLowerCase();
    const f = this.filter();
    const today = this.today();
    const now = this.now();
    const tz = this.tz();
    return sortContracts(this.store.contracts())
      .filter((c) => matchesContractFilter(c, f, today) && (!q || c.studentName.toLowerCase().includes(q)))
      .map((c) => {
        const st = contractState(c, today);
        return {
          c,
          label: CONTRACT_STATE[st][0],
          tone: CONTRACT_STATE[st][1],
          open: st === 'sent' || st === 'viewed',
          term: termLabel(c),
          signature: signatureLine(c, now, tz),
        };
      });
  });

  constructor() {
    effect(() => {
      if (this.enviar() === '1' && this.canSend()) {
        untracked(() => {
          this.sending.set(true);
          void this.router.navigate([], { queryParams: { enviar: null }, queryParamsHandling: 'merge', replaceUrl: true });
        });
      }
    });
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
