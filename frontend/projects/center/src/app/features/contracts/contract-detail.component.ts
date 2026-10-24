import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CenterContextService } from '../../core/center-context.service';
import { ContractsActions, contractErrorMessage } from '../../data/actions/contracts.actions';
import { CenterStore } from '../../data/center-store.service';
import {
  adulthoodDay,
  CONTRACT_STATE,
  contractState,
  isOpenContract,
  KIND_LABELS,
  maskIp,
  readTimeLabel,
  shortHash,
  termLabel,
  type StudentContract,
} from '../../domain/contracts';
import { DEFAULT_TIMEZONE, formatInstant, monthLabel, todayKey, wallClock } from '../../domain/dates';
import { formatBRL } from '../../domain/money';
import { IconComponent } from '../../ui/icon.component';
import { AuditTrailComponent, BannerComponent, ModalComponent, PageHeaderComponent, PersonComponent, type AuditRow } from '../../ui/kit';
import { printSheet } from '../../ui/print';
import { ContractPaperComponent, type PaperSignature } from './contract-paper.component';

/** K4 — um contrato: a folha congelada do envio, quem assinou e as evidências. */
@Component({
  selector: 'ct-contract-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, PersonComponent, BannerComponent, ModalComponent, AuditTrailComponent, IconComponent, ContractPaperComponent],
  template: `
    @if (contract(); as c) {
      <ct-page-header [title]="c.studentName + ' · ' + c.number" [subtitle]="subtitle()">
        @if (canRemind()) {
          <button type="button" class="ct-mini-btn" [disabled]="busy() || !c.studentUid" [title]="c.studentUid ? '' : 'Aluno sem conta NexaGO vinculada'" (click)="remind(c)">
            <ct-icon name="bell" [size]="14" />Reenviar lembrete
          </button>
        }
        @if (canTerminate()) {
          <button type="button" class="ct-mini-btn danger" (click)="openTerminate()">{{ open() ? 'Cancelar envio' : 'Encerrar contrato' }}</button>
        }
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" (click)="print(c)"><ct-icon name="download" [size]="14" />Baixar PDF</button>
      </ct-page-header>

      <div class="page">
        <div class="ct-row ct-wrap">
          <a class="ct-ghost-btn" [routerLink]="['/centro', centerId(), 'contratos']"><ct-icon name="arrowLeft" [size]="14" />Contratos</a>
          <a class="ct-ghost-btn" [routerLink]="['/centro', centerId(), 'alunos', c.studentId]"><ct-icon name="person" [size]="14" />Ficha do aluno</a>
          <div class="ct-grow"></div>
          <span class="ct-pill" [class]="'ct-pill ' + stateTone()">{{ stateLabel() }}</span>
        </div>

        @if (notice()) {
          <ct-banner [inline]="true" tone="green">{{ notice() }}</ct-banner>
        }
        @if (error() && !terminating()) {
          <div class="ct-error-text">{{ error() }}</div>
        }

        <div class="ct-grid-aside">
          <ct-contract-paper
            #paper
            [title]="c.title"
            [meta]="c.number + ' · ' + kindLabel(c) + ' · v' + c.templateVersion"
            [body]="c.body"
            [centerId]="centerId()"
            [centerName]="c.centerName"
            [signatures]="signatures()"
            [footer]="c.sha256 ? 'SHA-256 ' + c.sha256 : ''"
          />

          <div class="ct-col">
            <div class="ct-card">
              <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">{{ signedCount() }} de 2 assinaram</div><div class="ct-card-title">Signatários</div></div></div>
              <div class="ct-list-row">
                <ct-person class="ct-grow" [name]="c.signer.name || c.studentName" [sub]="signerSub(c)" [size]="30" [colorKey]="c.studentId" />
                <span class="ct-pill" [class]="'ct-pill ' + signerTone(c)">{{ signerStatus(c) }}</span>
              </div>
              <div class="ct-list-row">
                <ct-person class="ct-grow" [name]="c.centerSignature?.name || c.centerName" sub="Assinatura automática do centro" [size]="30" colorKey="center" />
                <span class="ct-pill" [class]="'ct-pill ' + (c.centerSignature ? 'green' : 'dim')">{{ c.centerSignature ? when(c.centerSignature.at) : 'Junto com o aluno' }}</span>
              </div>
            </div>

            @if (c.essentials.length) {
              <div class="ct-card">
                <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">O que o aluno vê antes do texto</div><div class="ct-card-title">O essencial</div></div></div>
                @for (e of c.essentials; track e.label) {
                  <div class="ct-kv"><span>{{ e.label }}</span><span>{{ e.value }}</span></div>
                }
                <div class="ct-kv mono"><span>Vigência</span><span>{{ term(c) }}</span></div>
                @if (c.requireBeforePayment) {
                  <div class="ct-dim" style="margin-top: 8px">O pagamento da matrícula só libera depois da assinatura.</div>
                }
              </div>
            }

            <div class="ct-card">
              <div class="ct-card-head"><div class="ct-grow"><div class="ct-kick">Evidências guardadas com o documento</div><div class="ct-card-title">Registro da assinatura</div></div></div>
              <ct-audit-trail [rows]="trail()" />
              <div style="margin-top: 12px">
                @if (c.evidence; as ev) {
                  <div class="ct-kv mono"><span>IP</span><span>{{ ip(ev.ip) }}</span></div>
                  <div class="ct-kv"><span>Dispositivo</span><span>{{ device(ev.platform, ev.appVersion) }}</span></div>
                  <div class="ct-kv"><span>Conta</span><span>{{ ev.email || '—' }}</span></div>
                  <div class="ct-kv mono"><span>Tempo de leitura</span><span>{{ readTime(ev.readSeconds) }}</span></div>
                }
                <div class="ct-kv mono"><span>Hash SHA-256</span><span [title]="c.sha256">{{ hash(c.sha256) }}</span></div>
                <div class="ct-kv"><span>Tipo</span><span>Assinatura eletrônica simples</span></div>
              </div>
            </div>

            @if (adulthood(); as a) {
              <ct-banner [inline]="true" tone="yellow" [title]="a.title">{{ a.body }}</ct-banner>
            }
          </div>
        </div>
      </div>

      @if (terminating()) {
        <ct-modal kicker="Contrato · {{ c.number }}" [title]="open() ? 'Cancelar envio' : 'Encerrar contrato'" [width]="480" (closed)="terminating.set(false)">
          <div class="ct-muted">
            @if (open()) {
              O documento deixa de esperar a assinatura de {{ c.signer.name || c.studentName }} e some do app. Para mandar de novo, use “Enviar contrato”.
            } @else {
              O contrato assinado passa a “Encerrado”. O texto, a assinatura e as evidências continuam guardados.
            }
          </div>
          <div class="ct-field">
            <label for="ct-reason">Motivo</label>
            <textarea id="ct-reason" class="ct-input" placeholder="Fica registrado no contrato e na trilha de auditoria" [value]="reason()" (input)="reason.set(value($event))"></textarea>
          </div>
          @if (error()) {
            <div class="ct-error-text">{{ error() }}</div>
          }
          <div footer>
            <button type="button" class="ct-mini-btn" (click)="terminating.set(false)">Voltar</button>
            <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || reason().trim().length < 3" (click)="terminate(c)">
              {{ busy() ? 'Salvando…' : open() ? 'Cancelar envio' : 'Encerrar contrato' }}
            </button>
          </div>
        </ct-modal>
      }
    } @else if (!store.loaded.contracts()) {
      <div class="ct-empty">Carregando contrato…</div>
    } @else {
      <div class="page">
        <div class="ct-empty">
          Contrato não encontrado neste centro.
          <div style="margin-top: 12px"><a class="ct-mini-btn" [routerLink]="['/centro', centerId(), 'contratos']">Voltar para contratos</a></div>
        </div>
      </div>
    }
  `,
  styles: `
    .page { padding: 20px var(--ct-gutter) 26px; display: flex; flex-direction: column; gap: 16px; }
  `,
})
export class ContractDetailComponent {
  protected readonly ctx = inject(CenterContextService);
  protected readonly store = inject(CenterStore);
  private readonly actions = inject(ContractsActions);

  readonly centerId = input.required<string>();
  readonly contractId = input.required<string>();

  private readonly paper = viewChild<ContractPaperComponent>('paper');

  private readonly tz = computed(() => this.ctx.center()?.timezone ?? DEFAULT_TIMEZONE);
  private readonly today = computed(() => todayKey(this.tz()));
  protected readonly contract = computed(() => this.store.contracts().find((c) => c.id === this.contractId()) ?? null);
  private readonly state = computed(() => {
    const c = this.contract();
    return c ? contractState(c, this.today()) : 'sent';
  });
  protected readonly stateLabel = computed(() => CONTRACT_STATE[this.state()][0]);
  protected readonly stateTone = computed(() => CONTRACT_STATE[this.state()][1]);
  protected readonly open = computed(() => {
    const c = this.contract();
    return !!c && isOpenContract(c.status);
  });

  protected readonly canRemind = computed(() => this.open() && this.ctx.has('enroll_students') && this.ctx.canWrite());
  /** Encerrar (assinado) e cancelar (aberto) só owner/admin — a callable confere de novo. */
  protected readonly canTerminate = computed(() => {
    const c = this.contract();
    return !!c && (c.status === 'signed' || this.open()) && this.ctx.isManager() && this.ctx.canWrite();
  });

  protected readonly subtitle = computed(() => {
    const c = this.contract();
    if (!c) return '';
    return [`${c.title} v${c.templateVersion}`, c.className, c.planName && c.priceCents != null ? `${c.planName} · ${formatBRL(c.priceCents)}` : c.planName]
      .filter(Boolean)
      .join(' · ');
  });

  /** Aluno (ou responsável) e centro assinam juntos: 2 de 2 ou 0 de 2. */
  protected readonly signedCount = computed(() => {
    const c = this.contract();
    return c?.signedAt && c.decision === 'accepted' ? 2 : 0;
  });

  protected readonly signatures = computed<PaperSignature[]>(() => {
    const c = this.contract();
    if (!c || !c.signedAt || c.decision !== 'accepted') return [];
    const role = c.signer.role === 'guardian' ? 'Responsável legal' : 'Contratante';
    const out: PaperSignature[] = [{ name: c.signer.name || c.studentName, sub: `${role} · ${this.full(c.signedAt)}` }];
    if (c.centerSignature) {
      out.push({ name: c.centerSignature.name || c.centerName, sub: `Assinatura do centro · ${this.full(c.centerSignature.at)}` });
    }
    return out;
  });

  /** Mais recente no topo, como a trilha das outras telas. */
  protected readonly trail = computed<AuditRow[]>(() => {
    const c = this.contract();
    if (!c) return [];
    return [...c.events].reverse().map((e) => ({
      when: formatInstant(e.at, this.tz()),
      who: e.byName || 'Sistema',
      what: e.type === 'terminated' || e.type === 'cancelled' || !e.detail ? e.title : `${e.title} · ${e.detail}`,
      why: e.type === 'terminated' || e.type === 'cancelled' ? e.detail || undefined : undefined,
    }));
  });

  /** Menor: aviso de quando faz 18 (aí o próprio aluno precisa assinar um contrato novo). */
  protected readonly adulthood = computed(() => {
    const c = this.contract();
    if (!c?.isMinor || c.status === 'cancelled') return null;
    const s = this.store.studentById(c.studentId);
    const day = adulthoodDay(s?.birthDate ?? null);
    if (!s || !day) return null;
    const first = s.name.split(/\s+/)[0] ?? s.name;
    if (day <= this.today()) {
      return { title: `${first} já é maior de idade`, body: `Envie um novo contrato para ${first} assinar em nome próprio.` };
    }
    return {
      title: `${first} faz 18 anos em ${monthLabel(day.slice(0, 7)).toLowerCase()} ${day.slice(0, 4)}`,
      body: `Quando atingir a maioridade, envie um novo contrato para ${first} assinar.`,
    };
  });

  protected readonly terminating = signal(false);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected kindLabel(c: StudentContract): string {
    return KIND_LABELS[c.kind];
  }

  protected term(c: StudentContract): string {
    return termLabel(c);
  }

  protected when(at: Date | null): string {
    return formatInstant(at, this.tz());
  }

  /** '15/07/2026 19:42'. */
  private full(at: Date | null): string {
    if (!at) return '—';
    const w = wallClock(at, this.tz());
    return `${w.dayKey.slice(8, 10)}/${w.dayKey.slice(5, 7)}/${w.dayKey.slice(0, 4)} ${w.time}`;
  }

  protected signerSub(c: StudentContract): string {
    if (c.signer.role === 'guardian') return ['Responsável legal', c.signer.relation].filter(Boolean).join(' · ');
    return 'Aluno · maior de idade';
  }

  protected signerStatus(c: StudentContract): string {
    if (c.status === 'declined') return 'Recusou';
    if (c.signedAt && c.decision === 'accepted') return this.when(c.signedAt);
    if (c.status === 'cancelled') return 'Cancelado';
    return c.status === 'viewed' ? 'Abriu · pendente' : 'Pendente';
  }

  protected signerTone(c: StudentContract): string {
    if (c.signedAt && c.decision === 'accepted') return 'green';
    if (c.status === 'declined' || c.status === 'cancelled') return 'dim';
    return c.status === 'viewed' ? 'orange' : 'yellow';
  }

  protected ip(raw: string): string {
    return maskIp(raw);
  }

  protected hash(sha: string): string {
    return shortHash(sha);
  }

  protected readTime(s: number): string {
    return readTimeLabel(s);
  }

  protected device(platform: string, appVersion: string): string {
    const p = platform === 'ios' ? 'iPhone' : platform === 'android' ? 'Android' : platform;
    return [p, appVersion ? `app NexaGO ${appVersion}` : 'app NexaGO'].filter(Boolean).join(' · ');
  }

  protected print(c: StudentContract): void {
    const el = this.paper()?.host.nativeElement;
    if (el) printSheet(el, `${c.number} - ${c.studentName}`);
  }

  protected async remind(c: StudentContract): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const r = await this.actions.remind(c.id);
      this.notice.set(r.notified ? `Lembrete enviado no app (${r.reminderCount}º).` : 'Lembrete registrado, mas o aviso não chegou ao app do aluno.');
    } catch (err) {
      this.error.set(contractErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected openTerminate(): void {
    this.reason.set('');
    this.error.set('');
    this.terminating.set(true);
  }

  protected async terminate(c: StudentContract): Promise<void> {
    if (this.busy() || this.reason().trim().length < 3) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.actions.terminate(c.id, this.reason());
      this.terminating.set(false);
      this.notice.set(r.status === 'cancelled' ? 'Envio cancelado.' : 'Contrato encerrado.');
    } catch (err) {
      this.error.set(contractErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
