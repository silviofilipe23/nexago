import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { FormFieldComponent } from '../ui/form-field.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

@Component({
  selector: 'co-panel-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormFieldComponent, PageHeaderComponent, PanelCardComponent, PanelShellComponent],
  template: `
    <co-panel-shell>
      <co-page-header title="Perfil" subtitle="Seus dados de treinador">
        <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="saving()" (click)="save()">
          @if (saving()) {
            Salvando…
          } @else {
            Salvar alterações
          }
        </button>
      </co-page-header>

      <div class="body">
        @if (error(); as err) {
          <div class="co-alert" role="alert">{{ err }}</div>
        }
        @if (saved()) {
          <div class="co-alert saved" role="status">Dados salvos.</div>
        }

        <co-panel-card title="Dados do treinador" kicker="Nome e contato">
          <form [formGroup]="form" class="grid">
            <co-form-field label="Nome completo" formControlName="displayName" [wide]="true" />
            <co-form-field label="Telefone" formControlName="phone" />
          </form>
        </co-panel-card>

        <co-panel-card [title]="'Conta'" [kicker]="auth.user()?.email ?? ''">
          <button type="button" class="co-ghost-btn" (click)="signOut()">Sair da conta</button>
        </co-panel-card>
      </div>
    </co-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 640px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .co-alert.saved {
      background: rgba(43, 209, 126, 0.1);
      border-color: rgba(43, 209, 126, 0.35);
      color: var(--nx-win);
    }
  `,
})
export class PanelPerfilComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly firestore = createFirestore();

  protected readonly form = this.fb.group({
    displayName: ['', Validators.required],
    phone: [''],
  });

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      return;
    }
    const snap = await getDoc(doc(this.firestore, 'coaches', uid));
    const data = snap.data();
    this.form.setValue({
      displayName: (data?.['displayName'] as string | undefined) ?? this.auth.displayName() ?? '',
      phone: (data?.['phone'] as string | undefined) ?? '',
    });
  }

  protected async save(): Promise<void> {
    const uid = this.auth.user()?.uid;
    if (!uid || this.form.invalid) {
      return;
    }
    this.error.set(null);
    this.saved.set(false);
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await Promise.all([
        setDoc(
          doc(this.firestore, 'coaches', uid),
          { displayName: raw.displayName, phone: raw.phone, updatedAt: serverTimestamp() },
          { merge: true },
        ),
        this.auth.updateDisplayName(raw.displayName),
      ]);
      this.saved.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOutUser();
    void this.router.navigateByUrl('/entrar');
  }
}
