import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterStore } from '../../data/center-store.service';
import { RequestsActions, type CertificatePayload } from '../../data/actions/requests.actions';
import { addDays, formatDayKey, todayKey } from '../../domain/dates';
import { CANCEL_REASONS, DEFAULT_POLICIES, type EnrollmentRequestType } from '../../domain/models';
import { BannerComponent, ModalComponent, SegmentedComponent } from '../../ui/kit';
import { deskDraftError, eligibleEnrollments, requestErrorMessage } from './request-view';

const TYPES: { value: EnrollmentRequestType; label: string }[] = [
  { value: 'pause', label: 'Trancamento' },
  { value: 'injury', label: 'Pausa por lesão' },
  { value: 'cancel', label: 'Cancelamento' },
];

/** Pedido trazido à recepção, registrado pela gestão (callable marca `source: desk`). */
@Component({
  selector: 'ct-register-request-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, SegmentedComponent, BannerComponent],
  template: `
    <ct-modal title="Registrar pedido" kicker="Trancar e cancelar · no balcão" [width]="600" (closed)="closed.emit()">
      <ct-segmented [options]="types" [value]="type()" (valueChange)="setType($event)" />

      <div class="ct-field">
        <label for="rq-search">Matrícula</label>
        <input id="rq-search" class="ct-input" placeholder="Buscar aluno ou turma" [value]="search()" (input)="search.set(val($event))" />
        <select class="ct-input" aria-label="Matrícula" [value]="enrollmentId()" (change)="enrollmentId.set(val($event))">
          <option value="">{{ options().length ? 'Escolha a matrícula' : 'Nenhuma matrícula elegível' }}</option>
          @for (e of options(); track e.id) {
            <option [value]="e.id">{{ e.studentName }} · {{ e.className }}{{ e.status === 'paused' ? ' (pausada)' : '' }}</option>
          }
        </select>
        <span class="ct-dim small">{{ type() === 'cancel' ? 'Matrículas ativas ou pausadas.' : 'Só planos mensais ativos, sem outro pedido em andamento.' }}</span>
      </div>

      @if (type() === 'cancel') {
        <div class="ct-field">
          <label for="rq-reason">Motivo</label>
          <select id="rq-reason" class="ct-input" [value]="reason()" (change)="reason.set(val($event))">
            <option value="">Escolha o motivo</option>
            @for (r of reasons; track r[0]) {
              <option [value]="r[0]">{{ r[1] }}</option>
            }
          </select>
        </div>
        <div class="ct-field">
          <label for="rq-comment">Comentário (opcional)</label>
          <input id="rq-comment" class="ct-input" maxlength="500" [value]="comment()" (input)="comment.set(val($event))" />
        </div>
        <div class="ct-dim">
          {{ policies().monthlyCancellation === 'end_of_cycle'
            ? 'Plano mensal segue até a véspera do próximo vencimento, que não é cobrado. Pacote e matrícula sem assinatura encerram hoje.'
            : 'Pela política do centro, a matrícula encerra hoje e a vaga é liberada.' }}
        </div>
      } @else {
        <div class="ct-form-grid">
          <div class="ct-field">
            <label for="rq-start">Começa em</label>
            <input id="rq-start" class="ct-input mono" type="date" [min]="today()" [value]="startsOn()" (input)="startsOn.set(val($event))" />
          </div>
          <div class="ct-field">
            <label for="rq-days">Dias de pausa</label>
            <input id="rq-days" class="ct-input mono" type="number" inputmode="numeric" min="1" max="365" [value]="days() ?? ''" (input)="setDays(val($event))" />
          </div>
        </div>
        <div class="ct-field">
          <label for="rq-why">{{ type() === 'injury' ? 'Lesão ou descrição' : 'Motivo' }}</label>
          <input id="rq-why" class="ct-input" maxlength="200" [placeholder]="type() === 'injury' ? 'Ex.: entorse no joelho' : 'Ex.: viagem'" [value]="reason()" (input)="reason.set(val($event))" />
        </div>
        @if (endsOn()) {
          <div class="ct-dim">Pausa de {{ formatDayKey(startsOn()) }} a {{ formatDayKey(endsOn()) }}; a matrícula volta sozinha em {{ formatDayKey(back()) }}. A vaga fica reservada.</div>
        }
        @if (type() === 'injury') {
          <div class="ct-box">
            <div class="ct-kick">Atestado (opcional no balcão)</div>
            <div class="ct-form-grid" style="margin-top: 10px">
              <div class="ct-field">
                <label for="rq-file">Arquivo (PDF ou foto, até 10 MB)</label>
                <input id="rq-file" class="ct-input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" (change)="pickFile($event)" />
              </div>
              <div class="ct-field">
                <label for="rq-issued">Emitido em</label>
                <input id="rq-issued" class="ct-input mono" type="date" [max]="today()" [value]="issuedOn()" (input)="issuedOn.set(val($event))" />
              </div>
              <div class="ct-field">
                <label for="rq-doctor">Médico (opcional)</label>
                <input id="rq-doctor" class="ct-input" maxlength="120" [value]="doctor()" (input)="doctor.set(val($event))" />
              </div>
            </div>
          </div>
          <ct-banner tone="blue" [inline]="true" title="Aprovada na hora">Registrada pela gestão, a pausa por lesão não passa pela revisão do atestado.</ct-banner>
        }
      }

      @if (error()) {
        <div class="ct-error-text" role="alert">{{ error() }}</div>
      }
      <div footer>
        <button type="button" class="ct-mini-btn" [disabled]="busy()" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'Registrando…' : 'Registrar pedido' }}</button>
      </div>
    </ct-modal>
  `,
  styles: `
    .small { font-size: 11.5px; }
    .ct-field select { margin-top: 6px; }
  `,
})
export class RegisterRequestModalComponent {
  readonly closed = output<void>();
  readonly created = output<string>();

  private readonly ctx = inject(CenterContextService);
  private readonly store = inject(CenterStore);
  private readonly actions = inject(RequestsActions);

  protected readonly types = TYPES;
  protected readonly reasons = Object.entries(CANCEL_REASONS);
  protected readonly formatDayKey = formatDayKey;

  protected readonly today = computed(() => todayKey(this.ctx.center()?.timezone));
  protected readonly policies = computed(() => this.ctx.center()?.policies ?? DEFAULT_POLICIES);

  protected readonly type = signal<EnrollmentRequestType>('pause');
  protected readonly search = signal('');
  protected readonly enrollmentId = signal('');
  protected readonly startsOn = signal(todayKey(this.ctx.center()?.timezone));
  protected readonly days = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly comment = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly issuedOn = signal('');
  protected readonly doctor = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly options = computed(() => {
    const q = this.search().trim().toLocaleLowerCase('pt-BR');
    const all = eligibleEnrollments(this.store.enrollments(), this.store.requests(), this.type());
    return q ? all.filter((e) => `${e.studentName} ${e.className}`.toLocaleLowerCase('pt-BR').includes(q)) : all;
  });
  protected readonly endsOn = computed(() => {
    const d = this.days();
    return d && d > 0 && /^\d{4}-\d{2}-\d{2}$/.test(this.startsOn()) ? addDays(this.startsOn(), d - 1) : '';
  });
  protected readonly back = computed(() => (this.endsOn() ? addDays(this.endsOn(), 1) : ''));

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setType(v: string): void {
    this.type.set(v as EnrollmentRequestType);
    this.reason.set('');
    this.error.set('');
    if (!this.options().some((e) => e.id === this.enrollmentId())) this.enrollmentId.set('');
  }

  protected setDays(raw: string): void {
    this.days.set(raw.trim() === '' ? null : Number(raw));
  }

  protected pickFile(e: Event): void {
    this.file.set((e.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected async save(): Promise<void> {
    if (this.busy()) return;
    const type = this.type();
    const err = deskDraftError(
      { enrollmentId: this.enrollmentId(), type, startsOn: this.startsOn(), days: this.days(), reason: this.reason(), comment: this.comment() },
      this.policies(),
      this.today(),
    );
    if (err) {
      this.error.set(err);
      return;
    }
    const file = type === 'injury' ? this.file() : null;
    if (file && !/^\d{4}-\d{2}-\d{2}$/.test(this.issuedOn())) {
      this.error.set('Informe a data de emissão do atestado.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      let certificate: CertificatePayload | null = null;
      if (file) {
        const up = await this.actions.uploadCertificate(file);
        certificate = { ...up, issuedOn: this.issuedOn(), daysOff: this.days() ?? 0, doctor: this.doctor().trim(), description: this.reason().trim() };
      }
      const r = await this.actions.register(
        type === 'cancel'
          ? { enrollmentId: this.enrollmentId(), type, reason: this.reason(), comment: this.comment().trim() }
          : { enrollmentId: this.enrollmentId(), type, startsOn: this.startsOn(), days: this.days() ?? 0, reason: this.reason().trim(), certificate },
      );
      this.created.emit(r.requestId);
    } catch (e) {
      this.error.set(requestErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
