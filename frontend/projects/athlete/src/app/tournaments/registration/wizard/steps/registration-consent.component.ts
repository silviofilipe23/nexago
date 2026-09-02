import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

import { environment } from '../../../../../environments/environment';
import { saveMarketingOptIn } from '../../../../data/my-athlete-profile-repository';
import { NxPageLoadingComponent } from '../../../../shared/loading/nx-page-loading.component';
import { RegistrationWizardShellComponent } from '../registration-wizard-shell.component';
import { RegistrationWizardStore } from '../registration-wizard.store';
import { bindWizardParams, wizardQueryParams } from '../wizard-params';

function createFirestore(): Firestore | null {
  const cfg = environment.firebase;
  if (cfg == null || (cfg.apiKey ?? '').length === 0) return null;
  const app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  return getFirestore(app);
}

/** Passo 2 do wizard: o consentimento LGPD.
 *
 *  As duas caixas obrigatórias (dados + imagem) são as duas METADES do mesmo termo que já
 *  existe — marcar as duas manda o mesmo `lgpdAccepted: true` que a callable já espera,
 *  carregado na URL do passo seguinte (`lgpd=1`). Zero mudança em Cloud Function, regras do
 *  Firestore ou painel do organizador, que lê `lgpdAcceptedUids`.
 *
 *  A terceira caixa (marketing) é consentimento de PLATAFORMA, não do evento: grava
 *  `marketingOptIn` no perfil, fora do fluxo de inscrição — falhar ali nunca trava o avanço,
 *  porque o aceite que IMPORTA para a inscrição é o do termo.
 *
 *  O aceite continua sendo POR INSCRIÇÃO, não por perfil. Como o consentimento agora vem antes
 *  da criação da inscrição, ele viaja pelo fluxo como parâmetro até a callable carimbá-lo. Quem
 *  fecha o navegador antes de criar a inscrição vê a tela de novo — correto para um aceite que
 *  ainda não foi dado. */
@Component({
  selector: 'app-registration-consent',
  imports: [RegistrationWizardShellComponent, NxPageLoadingComponent],
  templateUrl: './registration-consent.component.html',
  styleUrls: ['../wizard-step.scss', './registration-consent.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationConsentComponent {
  private readonly router = inject(Router);
  private readonly firestore = createFirestore();
  protected readonly store = inject(RegistrationWizardStore);
  protected readonly params = bindWizardParams(this.store);

  // As duas obrigatórias começam DESMARCADAS. Consentimento pré-marcado é o exemplo clássico
  // de consentimento inválido sob a LGPD (art. 8) — o aceite tem de ser ato afirmativo do
  // titular. O protótipo desenhá-las marcadas é convenção de mockup, não decisão de produto.
  protected readonly dataConsent = signal(false);
  protected readonly imageConsent = signal(false);
  protected readonly marketing = signal(false);
  protected readonly saving = signal(false);
  protected readonly showRegulation = signal(false);

  protected readonly loading = computed(() => !this.store.tournamentLoaded());
  protected readonly tournament = computed(() => this.store.tournament());
  protected readonly canConfirm = computed(() => this.dataConsent() && this.imageConsent());
  protected readonly regulationText = computed(() => this.tournament()?.regulationsText?.trim() ?? '');

  /** Mesma URL que o app abre em `AuthLegalUrls.privacyUrl` — a política é uma só, no site
   *  institucional (o domínio que as lojas esperam nas fichas). */
  protected readonly privacyUrl = 'https://nexago.com.br/privacidade';

  protected toggleData(): void {
    this.dataConsent.update((v) => !v);
  }

  protected toggleImage(): void {
    this.imageConsent.update((v) => !v);
  }

  protected toggleMarketing(): void {
    this.marketing.update((v) => !v);
  }

  protected toggleRegulation(): void {
    this.showRegulation.update((v) => !v);
  }

  protected exit(): void {
    void this.router.navigate(['/torneios', this.params().tournamentId]);
  }

  /** Grava o opt-in de marketing (best-effort) e segue para as condições carregando o aceite do
   *  termo na URL — é assim que ele atravessa até a callable, no próximo passo. */
  protected async confirm(): Promise<void> {
    if (!this.canConfirm() || this.saving()) return;
    this.saving.set(true);
    const uid = this.store.myUid();
    const db = this.firestore;
    if (uid && db) {
      try {
        await saveMarketingOptIn(db, uid, this.marketing());
      } catch {
        // O opt-in de marketing não pode travar a inscrição: falhou, segue. O aceite que
        // IMPORTA é o do termo, e ele viaja na callable.
      }
    }
    this.saving.set(false);
    const p = this.params();
    void this.router.navigate(['/torneios', p.tournamentId, 'inscricao', 'condicoes'], {
      queryParams: wizardQueryParams({ categoryId: p.categoryId, lgpdAccepted: true }),
    });
  }
}
