import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../auth/auth.service';
import { watchOrganizerSettings } from '../data/organizer-settings-repository';
import { DEFAULT_ORGANIZER_SETTINGS, type OrganizerSettings } from '../data/organizer-settings.model';
import { loadWalletView, type OrganizerPayoutProfile } from '../data/wallet-repository';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { OgConfigNotificacoesCardComponent } from './notificacoes-card.component';
import { OgConfigPagamentosCardComponent } from './pagamentos-card.component';
import { OgConfigPerfilCardComponent } from './perfil-card.component';
import { OgConfigRegrasCardComponent } from './regras-card.component';

const EMPTY_PAYOUT: OrganizerPayoutProfile = { pixKey: '', pixKeyType: '', hasPixKey: false };

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
    OgConfigNotificacoesCardComponent,
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
        [payoutPixKey]="payout().pixKey"
        [payoutPixKeyType]="payout().pixKeyType"
        [loading]="loading()"
      />
      <og-config-regras [uid]="uid()" [defaults]="settings().defaults" [loading]="loading()" />
      <og-config-notificacoes [uid]="uid()" />
    </div>
  `,
  styles: `
    .og-config-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
      /* O .og-content preenche a altura da coluna (é ele quem rola), então sobra espaço
         quando os cards são curtos. Sem isto o grid reparte essa sobra entre as linhas
         (medido: linhas de 120px viravam 420px) e os cards saem espalhados. */
      align-content: start;
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
  protected readonly payout = signal<OrganizerPayoutProfile>(EMPTY_PAYOUT);
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
    void this.loadPayout();

    this.destroyRef.onDestroy(() => {
      stopSettings();
    });
  }

  /** Chave Pix de saque: dado da PESSOA (`organizerPayoutProfiles/{uid}`), não do caixa
   *  de um torneio — a mesma chave vale pro saque de qualquer evento que a pessoa alcance.
   *  Só leitura aqui: quem grava é a tela Financeiro. `ledgerLimit: 1` porque a Config não
   *  mostra extrato nem lista de caixas. Falha cai em vazio, como o Início já faz. */
  private async loadPayout(): Promise<void> {
    try {
      const view = await loadWalletView(undefined, 1);
      this.payout.set(view.payout);
    } catch {
      this.payout.set(EMPTY_PAYOUT);
    }
  }
}
