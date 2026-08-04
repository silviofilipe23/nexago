import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { watchOrganizerSettings } from '../data/organizer-settings-repository';
import { DEFAULT_ORGANIZER_SETTINGS, type OrganizerSettings } from '../data/organizer-settings.model';
import { watchWallet, type OrganizerWalletSummary } from '../data/wallet-repository';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgConfigPagamentosCardComponent } from './pagamentos-card.component';
import { OgConfigPerfilCardComponent } from './perfil-card.component';
import { OgConfigRegrasCardComponent } from './regras-card.component';

const EMPTY_WALLET: OrganizerWalletSummary = { availableReais: 0, pendingReais: 0, payoutPixKey: '', payoutPixKeyType: '' };

/** Configurações do organizador: perfil da organização, dados de recebimento e regras padrão de
 *  evento — os três mapas de `users/{uid}` descritos em `organizer-settings.model.ts`.
 *
 *  Este componente é só a casca: mantém o listener e distribui as fatias. Cada card cuida do
 *  próprio ciclo de edição/salvamento, então um erro ao salvar Pagamentos não derruba o Perfil.
 *
 *  A equipe de acesso é por torneio (`/painel/eventos/:id/equipe`, gestor/mesário) — não existe
 *  "equipe do painel" global, por isso não há card de equipe aqui. */
@Component({
  selector: 'og-config',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OgPageHeaderComponent,
    OgConfigPerfilCardComponent,
    OgConfigPagamentosCardComponent,
    OgConfigRegrasCardComponent,
  ],
  template: `
    <og-page-header title="Configurações" subtitle="Dados da organização, pagamentos e padrões de evento" />

    <div class="og-content og-config-grid">
      <og-config-perfil
        [uid]="uid()"
        [profile]="settings().profile"
        [responsavel]="responsavel()"
        [accountEmail]="accountEmail()"
        [loading]="loading()"
      />
      <og-config-pagamentos
        [uid]="uid()"
        [payments]="settings().payments"
        [payoutPixKey]="wallet().payoutPixKey"
        [payoutPixKeyType]="wallet().payoutPixKeyType"
        [loading]="loading()"
      />
      <og-config-regras [uid]="uid()" [defaults]="settings().defaults" [loading]="loading()" />
    </div>
  `,
  styles: `
    .og-config-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
    }

    @media (max-width: 1100px) {
      .og-config-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ConfigComponent {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly settings = signal<OrganizerSettings>(DEFAULT_ORGANIZER_SETTINGS);
  protected readonly wallet = signal<OrganizerWalletSummary>(EMPTY_WALLET);
  protected readonly loading = signal(true);

  protected readonly uid = computed(() => this.auth.user()?.uid ?? '');
  protected readonly responsavel = computed(() => this.auth.displayName() ?? '');
  protected readonly accountEmail = computed(() => this.auth.user()?.email ?? '');

  constructor() {
    const uid = this.auth.user()?.uid;
    if (!uid) {
      this.loading.set(false);
      return;
    }

    const stopSettings = watchOrganizerSettings(uid, (s) => {
      this.settings.set(s);
      this.loading.set(false);
    });
    // Só leitura: a chave de saque é escrita por Cloud Function na tela Financeiro.
    const stopWallet = watchWallet(uid, (w) => this.wallet.set(w));

    this.destroyRef.onDestroy(() => {
      stopSettings();
      stopWallet();
    });
  }
}
