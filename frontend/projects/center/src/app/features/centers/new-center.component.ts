import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { formatCpfCnpjDisplay, isValidCpfCnpj, normalizeCpfCnpj } from '@nexago/br-documents';
import { AuthService } from '../../auth/auth.service';
import { CenterActions } from '../../data/actions/center.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import { IconComponent } from '../../ui/icon.component';

/** Centro é pessoa jurídica: só CNPJ (14 dígitos) válido. */
function isCnpj(raw: string): boolean {
  return normalizeCpfCnpj(raw).length === 14 && isValidCpfCnpj(raw);
}

/** Modalidades oferecidas no cadastro (viram `programs` com níveis padrão, editáveis depois). */
const SPORTS = ['Beach Tennis', 'Vôlei de praia', 'Futevôlei', 'Vôlei', 'Tênis', 'Padel', 'Funcional'];

/**
 * Cadastro do centro: o usuário logado vira OWNER e o centro nasce PENDENTE. Dá para montar
 * equipe, turmas e planos já; matrícula e cobrança só depois que o time NexaGO ativar.
 */
@Component({
  selector: 'ct-new-center',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  templateUrl: './new-center.component.html',
  styleUrl: './new-center.component.scss',
})
export class NewCenterComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly actions = inject(CenterActions);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly sports = SPORTS;
  protected readonly selected = signal<string[]>(['Beach Tennis']);
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    legalName: ['', Validators.required],
    cnpj: ['', Validators.required],
    contactEmail: [this.auth.email() ?? '', [Validators.required, Validators.email]],
    contactPhone: ['', Validators.required],
    city: ['', Validators.required],
    state: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{2}$/)]],
    address: [''],
  });

  protected readonly sportsError = computed(() => this.submitted() && this.selected().length === 0);

  protected toggleSport(sport: string): void {
    this.selected.update((list) => (list.includes(sport) ? list.filter((s) => s !== sport) : [...list, sport]));
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    return this.submitted() && this.form.controls[name].invalid;
  }

  protected cnpjInvalid(): boolean {
    const v = this.form.controls.cnpj.value;
    return this.submitted() && !isCnpj(v);
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid || this.selected().length === 0 || !isCnpj(this.form.controls.cnpj.value)) {
      return;
    }
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const id = await this.actions.createCenter({ ...raw, cnpj: formatCpfCnpjDisplay(raw.cnpj), sports: this.selected() });
      void this.router.navigate(['/centro', id, 'ativacao']);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
