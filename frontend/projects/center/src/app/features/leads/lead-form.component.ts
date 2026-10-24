import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { writeErrorMessage } from '../../data/actions/actor';
import { CenterStore } from '../../data/center-store.service';
import { ModalComponent } from '../../ui/kit';
import {
  EXPERIENCE_LABEL,
  MANUAL_SOURCES,
  PERIOD_LABEL,
  SOURCE_LABEL,
  isValidPhone,
  phoneDigits,
  type Lead,
  type LeadExperience,
  type LeadPeriod,
  type LeadSource,
} from './lead-model';
import { LeadsService, type LeadInput } from './leads.service';

const EXPERIENCES = Object.entries(EXPERIENCE_LABEL) as [Exclude<LeadExperience, ''>, string][];
const PERIODS = Object.entries(PERIOD_LABEL) as [Exclude<LeadPeriod, ''>, string][];

/** Novo interessado / editar cadastro (C1 "Novo interessado", C3 "Editar"). */
@Component({
  selector: 'ct-lead-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent],
  template: `
    <ct-modal [title]="lead() ? 'Editar interessado' : 'Novo interessado'" kicker="Ainda sem conta NexaGO" [width]="600" (closed)="closed.emit()">
      <div class="ct-form-grid">
        <div class="ct-field wide">
          <label class="ct-label" for="lf-name">Nome</label>
          <input id="lf-name" class="ct-input" [value]="name()" (input)="name.set(v($event))" maxlength="80" />
        </div>
        <div class="ct-field">
          <label class="ct-label" for="lf-phone">WhatsApp</label>
          <input id="lf-phone" class="ct-input mono" type="tel" inputmode="tel" placeholder="(21) 9 0000-0000" [value]="phone()" (input)="phone.set(v($event))" maxlength="30" />
        </div>
        <div class="ct-field">
          <label class="ct-label" for="lf-email">E-mail (opcional)</label>
          <input id="lf-email" class="ct-input" type="email" [value]="email()" (input)="email.set(v($event))" maxlength="120" />
        </div>
        <div class="ct-field">
          <label class="ct-label" for="lf-age">Idade (opcional)</label>
          <input id="lf-age" class="ct-input mono" inputmode="numeric" [value]="age()" (input)="age.set(v($event))" maxlength="3" />
        </div>
        <div class="ct-field">
          <label class="ct-label" for="lf-program">Modalidade</label>
          <select id="lf-program" class="ct-input" [value]="programId()" (change)="programId.set(v($event))">
            <option value="">A definir</option>
            @for (p of store.programs(); track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </div>
      </div>

      <div class="group">
        <span class="ct-label">Experiência</span>
        <div class="chips">
          @for (e of EXPERIENCES; track e[0]) {
            <button type="button" class="ct-chip" [class.active]="experience() === e[0]" (click)="toggleExp(e[0])">{{ e[1] }}</button>
          }
        </div>
      </div>
      <div class="group">
        <span class="ct-label">Período</span>
        <div class="chips">
          @for (p of PERIODS; track p[0]) {
            <button type="button" class="ct-chip" [class.active]="period() === p[0]" (click)="togglePeriod(p[0])">{{ p[1] }}</button>
          }
        </div>
      </div>
      <div class="group">
        <span class="ct-label">Como conheceu</span>
        <div class="chips">
          @for (s of sources(); track s) {
            <button type="button" class="ct-chip" [class.active]="source() === s" (click)="source.set(s)">{{ SOURCE_LABEL[s] }}</button>
          }
        </div>
      </div>
      @if (source() === 'referral') {
        <div class="ct-field">
          <label class="ct-label" for="lf-ref">Indicado por</label>
          <input id="lf-ref" class="ct-input" [value]="referredBy()" (input)="referredBy.set(v($event))" maxlength="80" />
        </div>
      }
      <div class="ct-field">
        <label class="ct-label" for="lf-goal">Objetivo (opcional)</label>
        <input id="lf-goal" class="ct-input" placeholder="Ex.: jogar torneios, perder peso, socializar" [value]="goal()" (input)="goal.set(v($event))" maxlength="200" />
      </div>
      @if (!lead()) {
        <div class="ct-field">
          <label class="ct-label" for="lf-note">Primeiro contato (opcional)</label>
          <input id="lf-note" class="ct-input" placeholder="Ex.: pediu tabela de preços pelo Instagram" [value]="note()" (input)="note.set(v($event))" maxlength="200" />
        </div>
      }
      @if (error()) {
        <p class="ct-error-text" role="alert">{{ error() }}</p>
      }
      <ng-container footer>
        <button type="button" class="ct-ghost-btn" (click)="closed.emit()">Cancelar</button>
        @if (!lead()) {
          <button type="button" class="ct-mini-btn" [disabled]="busy()" (click)="save(false)">Só salvar</button>
        }
        <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy()" (click)="save(!lead())">
          {{ busy() ? 'Salvando…' : lead() ? 'Salvar' : 'Salvar e agendar experimental' }}
        </button>
      </ng-container>
    </ct-modal>
  `,
  styles: `
    .wide { grid-column: 1 / -1; }
    .group { display: flex; flex-direction: column; gap: 8px; }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export class LeadFormComponent implements OnInit {
  readonly lead = input<Lead | null>(null);
  readonly closed = output<void>();
  /** Salvou; `schedule` = abrir o agendamento da experimental em seguida. */
  readonly saved = output<{ id: string; schedule: boolean }>();

  protected readonly store = inject(CenterStore);
  private readonly leads = inject(LeadsService);

  protected readonly EXPERIENCES = EXPERIENCES;
  protected readonly PERIODS = PERIODS;
  protected readonly SOURCE_LABEL = SOURCE_LABEL;

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly age = signal('');
  protected readonly programId = signal('');
  protected readonly experience = signal<LeadExperience>('');
  protected readonly period = signal<LeadPeriod>('');
  protected readonly source = signal<LeadSource>('desk');
  protected readonly referredBy = signal('');
  protected readonly goal = signal('');
  protected readonly note = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** A origem automática (página/app) continua na lista quando o cadastro é editado. */
  protected readonly sources = computed(() => {
    const s = this.lead()?.source;
    return s && !MANUAL_SOURCES.includes(s) ? [s, ...MANUAL_SOURCES] : MANUAL_SOURCES;
  });

  ngOnInit(): void {
    const l = this.lead();
    if (!l) return;
    this.name.set(l.name);
    this.phone.set(l.phone);
    this.email.set(l.email);
    this.age.set(l.age ? String(l.age) : '');
    this.programId.set(l.interest.programId);
    this.experience.set(l.interest.experience);
    this.period.set(l.interest.period);
    this.source.set(l.source);
    this.referredBy.set(l.referredBy);
    this.goal.set(l.interest.goal);
  }

  protected v(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected toggleExp(e: Exclude<LeadExperience, ''>): void {
    this.experience.set(this.experience() === e ? '' : e);
  }

  protected togglePeriod(p: Exclude<LeadPeriod, ''>): void {
    this.period.set(this.period() === p ? '' : p);
  }

  private input(): LeadInput | string {
    const name = this.name().trim();
    if (name.length < 2) return 'Informe o nome.';
    if (!isValidPhone(this.phone())) return 'Informe um WhatsApp com DDD.';
    const email = this.email().trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido.';
    const ageRaw = this.age().trim();
    const age = ageRaw ? Number(ageRaw) : null;
    if (age != null && (!Number.isInteger(age) || age < 3 || age > 99)) return 'Idade inválida.';
    const program = this.store.programById(this.programId());
    return {
      name,
      phone: this.phone().trim(),
      email,
      age,
      source: this.source(),
      referredBy: this.source() === 'referral' ? this.referredBy() : '',
      programId: program?.id ?? '',
      programName: program?.name ?? '',
      experience: this.experience(),
      period: this.period(),
      goal: this.goal(),
      note: this.note(),
    };
  }

  protected async save(schedule: boolean): Promise<void> {
    if (this.busy()) return;
    const data = this.input();
    if (typeof data === 'string') {
      this.error.set(data);
      return;
    }
    // Mesmo telefone já no funil: abre o que existe em vez de duplicar.
    const dup = this.leads.leads().find((l) => l.id !== this.lead()?.id && l.phoneDigits && l.phoneDigits === phoneDigits(data.phone));
    if (dup) {
      this.error.set(`${dup.name} já está na captação com este WhatsApp.`);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const l = this.lead();
      if (l) {
        await this.leads.update(l, data);
        this.saved.emit({ id: l.id, schedule: false });
      } else {
        this.saved.emit({ id: await this.leads.create(data), schedule });
      }
    } catch (e) {
      this.error.set(writeErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
