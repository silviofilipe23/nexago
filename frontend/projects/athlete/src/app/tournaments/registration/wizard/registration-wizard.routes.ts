import type { Routes } from '@angular/router';
import { RegistrationWizardStore } from './registration-wizard.store';

/** Filhas de `torneios/:id/inscricao` (`app.routes.ts`), carregadas por `loadChildren`: o
 *  `RegistrationWizardStore` (e o Firestore que ele arrasta) só baixa quando alguém entra no
 *  wizard, em vez de inchar o bundle inicial do portal inteiro. */
export const registrationWizardRoutes: Routes = [
  {
    // Wizard de inscrição: uma rota por etapa, sob `torneios/:id/inscricao`.
    //
    // A rota-mãe é COMPONENTLESS de propósito. Duas consequências, as duas necessárias: o
    // `RegistrationWizardStore` vive uma instância por entrada no fluxo (os seis passos leem o
    // mesmo torneio, as mesmas inscrições e os mesmos convites, sem refazer a cadeia de
    // leituras a cada navegação), e o `:id` é herdado pelos filhos sem
    // `paramsInheritanceStrategy`.
    //
    // O store mora nesta rota vazia, e não em `torneios/:id/inscricao`, porque `providers` exige
    // a classe na hora de declarar a rota — lá ela iria para o bundle inicial. Vazia e sem
    // componente, ela não muda a URL, nem a herança do `:id`, nem a navegação relativa.
    //
    // A filha `''` é o PORTEIRO, não uma tela: ele deriva a etapa do Firestore e se substitui pela rota
    // dela. É por isso que os ~8 pontos de entrada do portal (painel, agenda, anunciador de
    // convite, aba do torneio, liga, "continuar inscrição") continuam apontando para
    // `torneios/:id/inscricao` sem nenhuma mudança.
    path: '',
    providers: [RegistrationWizardStore],
    children: [
      {
        path: 'categoria',
        loadComponent: () =>
          import('./steps/registration-category.component').then(
            (m) => m.RegistrationCategoryComponent,
          ),
      },
      {
        path: 'consentimento',
        loadComponent: () =>
          import('./steps/registration-consent.component').then(
            (m) => m.RegistrationConsentComponent,
          ),
      },
      {
        path: 'condicoes',
        loadComponent: () =>
          import('./steps/registration-terms.component').then(
            (m) => m.RegistrationTermsComponent,
          ),
      },
      {
        path: 'parceiro',
        loadComponent: () =>
          import('./steps/registration-partner.component').then(
            (m) => m.RegistrationPartnerComponent,
          ),
      },
      {
        path: 'aguardando',
        loadComponent: () =>
          import('./steps/registration-waiting.component').then(
            (m) => m.RegistrationWaitingComponent,
          ),
      },
      {
        path: 'uniforme',
        loadComponent: () =>
          import('./steps/registration-uniform.component').then(
            (m) => m.RegistrationUniformComponent,
          ),
      },
      {
        // Já existia como rota irmã; virou filha para herdar o store e o `:id`. A URL é a
        // mesma, então os links de "pagar" do painel e da aba do torneio seguem valendo.
        path: 'pagamento',
        loadComponent: () =>
          import('../tournament-payment.component').then(
            (m) => m.TournamentPaymentComponent,
          ),
      },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./registration-gate.component').then(
            (m) => m.RegistrationGateComponent,
          ),
      },
    ],
  },
];
