import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal } from '@angular/core';
import { CenterStore } from '../../data/center-store.service';
import { writeErrorMessage } from '../../data/actions/actor';
import { StudentsActions, type AccountHit, type StudentInput } from '../../data/actions/students.actions';
import { isValidDayKey } from '../../domain/dates';
import { ModalComponent, PersonComponent, ToggleComponent } from '../../ui/kit';
import { normalize } from './student-rows';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** W10 — adicionar aluno: conta NexaGO existente ou convite por e-mail; menor pede responsável. */
@Component({
  selector: 'ct-add-student-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, PersonComponent, ToggleComponent],
  templateUrl: './add-student-modal.component.html',
  styles: `
    .hit { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid var(--nx-line); cursor: pointer; text-align: left; width: 100%; font: inherit; color: inherit; }
    .hit.on { background: rgba(255,106,26,0.07); border-color: rgba(255,106,26,0.35); }
    .hit:disabled { opacity: 0.55; cursor: default; }
    .minor { display: flex; align-items: center; gap: 12px; padding-top: 12px; border-top: 1px solid var(--nx-line); }
    .guardian { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: var(--nx-r-3); background: var(--nx-surface-0); border: 1px solid rgba(91,155,255,0.3); }
  `,
})
export class AddStudentModalComponent {
  private readonly actions = inject(StudentsActions);
  private readonly store = inject(CenterStore);

  readonly closed = output<void>();
  readonly added = output<string>();

  protected readonly mode = signal<'search' | 'invite'>('search');
  protected readonly term = signal('');
  protected readonly hits = signal<AccountHit[]>([]);
  protected readonly searching = signal(false);
  protected readonly searchError = signal('');
  protected readonly selected = signal<AccountHit | null>(null);

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly isMinor = signal(false);
  protected readonly birthDate = signal('');
  protected readonly gName = signal('');
  protected readonly gRelation = signal('');
  protected readonly gEmail = signal('');
  protected readonly gPhone = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly tried = signal(false);

  private readonly linkedUids = computed(() => new Set(this.store.students().map((s) => s.uid).filter(Boolean)));

  protected readonly problems = computed(() => {
    const p: string[] = [];
    const email = this.email().trim().toLowerCase();
    if (this.mode() === 'search') {
      if (!this.selected()) p.push('Escolha uma conta na busca.');
    } else {
      if (this.name().trim().length < 3) p.push('Informe o nome completo.');
      if (!EMAIL_RE.test(email)) p.push('Informe um e-mail válido.');
    }
    if (email && !EMAIL_RE.test(email)) p.push('E-mail inválido.');
    if (email && this.store.students().some((s) => s.email === email)) p.push('Já existe aluno com esse e-mail neste centro.');
    if (this.isMinor()) {
      if (!isValidDayKey(this.birthDate())) p.push('Informe a data de nascimento.');
      if (this.gName().trim().length < 3) p.push('Informe o nome do responsável.');
      if (!this.gRelation().trim()) p.push('Informe o parentesco.');
      if (!EMAIL_RE.test(this.gEmail().trim())) p.push('Informe o e-mail do responsável.');
      if (this.gPhone().replace(/\D/g, '').length < 10) p.push('Informe o telefone do responsável.');
    }
    return [...new Set(p)];
  });

  constructor() {
    // Busca com debounce: só dispara 350 ms depois da última tecla, e descarta resposta velha.
    effect((onCleanup) => {
      const t = this.term().trim();
      if (this.mode() !== 'search' || normalize(t).length < 2) {
        this.hits.set([]);
        this.searching.set(false);
        return;
      }
      let stale = false;
      this.searching.set(true);
      const timer = setTimeout(async () => {
        try {
          const r = await this.actions.searchAccounts(t);
          if (!stale) {
            this.hits.set(r);
            this.searchError.set('');
          }
        } catch (err) {
          if (!stale) this.searchError.set(writeErrorMessage(err));
        } finally {
          if (!stale) this.searching.set(false);
        }
      }, 350);
      onCleanup(() => {
        stale = true;
        clearTimeout(timer);
      });
    });
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected isLinked(h: AccountHit): boolean {
    return this.linkedUids().has(h.uid);
  }

  protected setMode(m: 'search' | 'invite'): void {
    this.mode.set(m);
    this.selected.set(null);
    this.tried.set(false);
  }

  protected async submit(): Promise<void> {
    this.tried.set(true);
    if (this.problems().length || this.busy()) {
      return;
    }
    const hit = this.mode() === 'search' ? this.selected() : null;
    const minor = this.isMinor();
    const input: StudentInput = {
      uid: hit?.uid ?? null,
      name: hit?.name ?? this.name(),
      email: this.email(),
      phone: this.phone(),
      isMinor: minor,
      birthDate: minor ? this.birthDate() : null,
      guardian: minor
        ? { name: this.gName().trim(), relation: this.gRelation().trim(), email: this.gEmail().trim().toLowerCase(), phone: this.gPhone().trim() }
        : null,
      imageUseAllowed: false,
      notifyClasses: true,
      emergencyName: '',
      emergencyPhone: '',
      medicalNotes: '',
    };
    this.busy.set(true);
    this.error.set('');
    try {
      this.added.emit(await this.actions.addStudent(input));
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
