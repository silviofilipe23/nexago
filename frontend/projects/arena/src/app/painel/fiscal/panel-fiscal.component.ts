import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import type { Unsubscribe } from 'firebase/firestore';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent, type PillTone } from '../ui/pill.component';
import {
  emitActivationTestInvoice,
  getArenaFiscalRequirements,
  saveArenaFiscalConfig,
  setArenaFiscalMode,
  watchArenaFiscalConfig,
  type FiscalAddressInput,
  type FiscalRegimeTributario,
  type MunicipalRequirementView,
} from './fiscal-repository';
import {
  FISCAL_MODE_LABEL,
  fiscalConfigStatusLabel,
  type ArenaFiscalConfigView,
  type FiscalConfigStatus,
  type FiscalMode,
  type FiscalServiceView,
} from './fiscal.model';

const HELP_EMAIL = 'contato@nexago.com.br';

/** Versão do termo de autorização exibido no passo 3. Suba este valor sempre que o texto do
 *  termo mudar de forma relevante — o backend grava o que for enviado aqui em
 *  `authorizationTermVersion`, sem validar o conteúdo, então é o único registro de qual texto a
 *  arena realmente aceitou. */
export const FISCAL_TERM_VERSION = 'v1';

const FISCAL_TERM_TEXT =
  'Ao marcar esta caixa, a arena autoriza expressamente a nexaGO a emitir Notas Fiscais de Serviço ' +
  'Eletrônicas (NFS-e) em seu nome junto à prefeitura do município informado, utilizando os dados ' +
  'cadastrais e o certificado digital fornecidos nesta tela. A nexaGO atua apenas como intermediária ' +
  'técnica do processo de emissão — a responsabilidade tributária pelas notas emitidas continua sendo ' +
  'integralmente da arena. Este aceite pode ser revogado a qualquer momento, desligando a emissão ' +
  '(modo "Desligado") ou entrando em contato com o suporte para remover o cadastro.';

const REGIME_OPTIONS: { value: FiscalRegimeTributario; label: string }[] = [
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'lucro_presumido', label: 'Lucro Presumido' },
  { value: 'lucro_real', label: 'Lucro Real' },
  { value: 'mei', label: 'MEI' },
];

const MODE_OPTIONS: FiscalMode[] = ['always', 'on_demand', 'off'];

const STATUS_TONE: Record<FiscalConfigStatus, PillTone> = {
  draft: 'dim',
  testing: 'yellow',
  active: 'green',
  error: 'red',
};

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Dados da empresa',
  2: 'Catálogo de serviços',
  3: 'Termo de autorização',
  4: 'Credenciais',
  5: 'Nota de teste',
};

function emptyAddress(): FiscalAddressInput {
  return { logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', cep: '', codigoIbge: '' };
}

function newServiceRow(): FiscalServiceView {
  return { id: crypto.randomUUID(), codigoMunicipal: '', descricao: '', aliquotaIss: 0 };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Lê o arquivo e devolve só a parte base64 (sem o prefixo `data:...;base64,`) — é o formato que
 *  `SaveFiscalConfigInput.certificadoBase64` espera. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

/** Assistente de configuração fiscal (NFS-e) da arena: 5 passos que terminam numa única chamada a
 *  `saveArenaFiscalConfig` (Task 7) — o backend não aceita salvamento incremental, então os passos
 *  1–4 só existem no estado local do componente até o envio final. Depois de enviado, a config
 *  nasce com `status: 'testing'`; ela só vira `'active'` (liberando o seletor de modo do passo 5)
 *  via um fluxo de emissão de nota de teste que ainda não existe — aqui a tela só lê e mostra o
 *  status que o backend reportar, sem inventar transição nenhuma no cliente. */
@Component({
  selector: 'ar-panel-fiscal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Configuração fiscal" subtitle="Emissão de NFS-e em nome da arena">
        <ar-pill [tone]="statusTone[currentStatus()]">{{ statusLabel(currentStatus()) }}</ar-pill>
        <a class="ar-mini-btn" [href]="'mailto:' + helpEmail + '?subject=D%C3%BAvida%20sobre%20NFS-e'">
          <ar-icon name="mail" [size]="14" />
          Preciso de ajuda
        </a>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading() || configLoading()) {
          <p class="state-text">Carregando configuração fiscal…</p>
        } @else {
          <div class="stepper">
            @for (s of steps; track s) {
              <button
                type="button"
                class="step"
                [class.active]="currentStep() === s"
                [class.done]="s < currentStep()"
                [disabled]="s > maxVisitedStep()"
                (click)="goToStep(s)"
              >
                <span class="step-index">{{ s }}</span>
                <span class="step-label">{{ stepLabels[s] }}</span>
              </button>
            }
          </div>

          @switch (currentStep()) {
            @case (1) {
              <ar-panel-card title="Dados da empresa" kicker="Passo 1 de 5">
                <div class="field-label">CNPJ</div>
                <input type="text" class="input-box" placeholder="00.000.000/0000-00" [value]="cnpj()" (input)="cnpj.set($any($event.target).value)" />

                <div class="field-label row-gap">Razão social</div>
                <input type="text" class="input-box" [value]="razaoSocial()" (input)="razaoSocial.set($any($event.target).value)" />

                <div class="field-label row-gap">Nome fantasia (opcional)</div>
                <input type="text" class="input-box" [value]="nomeFantasia()" (input)="nomeFantasia.set($any($event.target).value)" />

                <div class="grid-2 row-gap">
                  <div>
                    <div class="field-label">Inscrição municipal</div>
                    <input type="text" class="input-box" [value]="inscricaoMunicipal()" (input)="inscricaoMunicipal.set($any($event.target).value)" />
                  </div>
                  <div>
                    <div class="field-label">Regime tributário</div>
                    <!-- [selected] na <option>, não [value] no <select>: o binding no select não
                         reflete o valor nesta versão do Angular. -->
                    <select class="input-box" (change)="onRegimeChange($any($event.target).value)">
                      <option value="" disabled [selected]="regimeTributario() === null">Selecione</option>
                      @for (opt of regimeOptions; track opt.value) {
                        <option [value]="opt.value" [selected]="regimeTributario() === opt.value">{{ opt.label }}</option>
                      }
                    </select>
                  </div>
                </div>

                <div class="field-label row-gap">Endereço fiscal</div>
                <div class="grid-2">
                  <input type="text" class="input-box" placeholder="Logradouro" [value]="endereco().logradouro" (input)="updateAddress({ logradouro: $any($event.target).value })" />
                  <input type="text" class="input-box" placeholder="Número" [value]="endereco().numero" (input)="updateAddress({ numero: $any($event.target).value })" />
                </div>
                <div class="grid-2 row-gap-sm">
                  <input type="text" class="input-box" placeholder="Complemento (opcional)" [value]="endereco().complemento" (input)="updateAddress({ complemento: $any($event.target).value })" />
                  <input type="text" class="input-box" placeholder="Bairro" [value]="endereco().bairro" (input)="updateAddress({ bairro: $any($event.target).value })" />
                </div>
                <div class="grid-3 row-gap-sm">
                  <input type="text" class="input-box" placeholder="Município" [value]="endereco().municipio" (input)="updateAddress({ municipio: $any($event.target).value })" />
                  <input type="text" class="input-box" placeholder="UF" maxlength="2" [value]="endereco().uf" (input)="updateAddress({ uf: $any($event.target).value.toUpperCase() })" />
                  <input type="text" class="input-box" placeholder="CEP" [value]="endereco().cep" (input)="updateAddress({ cep: $any($event.target).value })" />
                </div>
                <div class="row-gap-sm">
                  <div class="field-label">Código IBGE do município (7 dígitos)</div>
                  <input type="text" class="input-box mono" placeholder="0000000" maxlength="7" [value]="endereco().codigoIbge" (input)="updateAddress({ codigoIbge: $any($event.target).value })" />
                </div>
              </ar-panel-card>
            }
            @case (2) {
              <ar-panel-card title="Catálogo de serviços" kicker="Passo 2 de 5">
                <p class="hint">
                  Cadastre os serviços prestados pela arena (ex.: locação de quadra) com o código na tabela do município e a
                  alíquota de ISS. Marque qual serviço é o padrão para reservas e para o clubinho.
                </p>
                @for (s of services(); track s.id) {
                  <div class="service-row">
                    <input
                      type="text"
                      class="input-box"
                      placeholder="Código municipal (ex.: 3.03)"
                      [value]="s.codigoMunicipal"
                      (input)="updateService(s.id, { codigoMunicipal: $any($event.target).value })"
                    />
                    <input type="text" class="input-box" placeholder="Descrição" [value]="s.descricao" (input)="updateService(s.id, { descricao: $any($event.target).value })" />
                    <div class="aliquota-field">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        class="input-box"
                        [value]="s.aliquotaIss"
                        (input)="updateService(s.id, { aliquotaIss: $any($event.target).valueAsNumber || 0 })"
                      />
                      <span>% ISS</span>
                    </div>
                    <div class="default-toggles">
                      <button type="button" class="ar-chip" [class.active]="defaultServiceIdBooking() === s.id" (click)="defaultServiceIdBooking.set(s.id)">
                        Padrão reserva
                      </button>
                      <button type="button" class="ar-chip" [class.active]="defaultServiceIdClub() === s.id" (click)="defaultServiceIdClub.set(s.id)">
                        Padrão clubinho
                      </button>
                    </div>
                    <button type="button" class="ar-ghost-btn remove-service-btn" [disabled]="services().length <= 1" (click)="removeService(s.id)">
                      Remover
                    </button>
                  </div>
                }
                <button type="button" class="ar-mini-btn" (click)="addService()">
                  <ar-icon name="plus" [size]="14" />
                  Adicionar serviço
                </button>
              </ar-panel-card>
            }
            @case (3) {
              <ar-panel-card title="Termo de autorização" kicker="Passo 3 de 5">
                <div class="term-box">{{ termText }}</div>
                <label class="checkbox-label term-check">
                  <input type="checkbox" [checked]="authorizationAccepted()" (change)="authorizationAccepted.set($any($event.target).checked)" />
                  <span>Li e autorizo a nexaGO a emitir NFS-e em nome da arena, conforme descrito acima (termo versão {{ termVersion }}).</span>
                </label>
              </ar-panel-card>
            }
            @case (4) {
              <ar-panel-card title="Credenciais" kicker="Passo 4 de 5">
                <p class="hint warning">
                  <ar-icon name="alert-triangle" [size]="14" />
                  A nexaGO não guarda o arquivo do certificado: ele é enviado apenas para o emissor da nota fiscal no
                  momento do cadastro, em trânsito, e não fica salvo em nenhum servidor nosso.
                </p>

                @if (requirementsLoading()) {
                  <p class="hint">Consultando exigências do município…</p>
                } @else if (requirementsError(); as rerr) {
                  <p class="hint error">{{ rerr }}</p>
                } @else if (requirements().length) {
                  <div class="requirements-list">
                    @for (r of requirements(); track r.field) {
                      <div class="requirement-row">
                        <ar-icon name="check" [size]="13" />
                        <span>{{ r.label }}{{ r.required ? '' : ' (opcional)' }}</span>
                      </div>
                    }
                  </div>
                }

                <div class="field-label row-gap">Certificado digital A1 (.pfx/.p12)</div>
                <input type="file" accept=".pfx,.p12" class="input-file" (change)="onCertificateSelected($event)" />
                @if (certificateFile(); as file) {
                  <p class="file-selected">Selecionado: {{ file.name }}</p>
                }

                <div class="field-label row-gap">Senha do certificado</div>
                <input type="password" class="input-box" [value]="senhaCertificado()" (input)="senhaCertificado.set($any($event.target).value)" />

                @if (saveError(); as serr) {
                  <div class="error-banner">{{ serr }}</div>
                }
              </ar-panel-card>
            }
            @case (5) {
              <ar-panel-card title="Nota de teste" kicker="Passo 5 de 5">
                <div class="status-block">
                  <ar-pill [tone]="statusTone[currentStatus()]">{{ statusLabel(currentStatus()) }}</ar-pill>
                  @if (config()?.statusMessage; as msg) {
                    <p class="status-detail">{{ msg }}</p>
                  }
                </div>

                @switch (currentStatus()) {
                  @case ('draft') {
                    @if (justSubmitted()) {
                      <p class="hint">Dados enviados — aguardando a confirmação do cadastro. Isso deve levar só um instante.</p>
                    } @else {
                      <p class="hint">
                        Conclua os passos anteriores e envie seus dados fiscais para começarmos a preparar a emissão em
                        homologação.
                      </p>
                    }
                  }
                  @case ('testing') {
                    <p class="hint">
                      Seus dados fiscais foram enviados. Falta emitir uma nota real em homologação pra confirmar que o
                      cadastro foi aceito pela prefeitura — assim que ela for autorizada, a emissão automática libera.
                    </p>
                    <button
                      type="button"
                      class="ar-mini-btn ar-mini-btn-primary"
                      [disabled]="!isOwner() || emittingTest()"
                      (click)="emitTestInvoice()"
                    >
                      {{ emittingTest() ? 'Emitindo…' : 'Emitir nota de teste' }}
                    </button>
                    @if (emitTestError(); as eerr) {
                      <div class="error-banner">{{ eerr }}</div>
                    }
                  }
                  @case ('error') {
                    <p class="hint error">
                      A nota de teste foi rejeitada pela prefeitura. Revise os dados nos passos anteriores se precisar, ou
                      tente de novo.
                    </p>
                    <button
                      type="button"
                      class="ar-mini-btn ar-mini-btn-primary"
                      [disabled]="!isOwner() || emittingTest()"
                      (click)="emitTestInvoice()"
                    >
                      {{ emittingTest() ? 'Tentando…' : 'Tentar novamente' }}
                    </button>
                    @if (emitTestError(); as eerr) {
                      <div class="error-banner">{{ eerr }}</div>
                    }
                  }
                  @case ('active') {
                    <p class="hint">Nota de teste aprovada — escolha como a emissão deve funcionar:</p>
                    <div class="mode-options">
                      @for (m of modeOptions; track m) {
                        <button type="button" class="ar-chip" [class.active]="config()?.mode === m" [disabled]="!isOwner() || settingMode()" (click)="chooseMode(m)">
                          {{ modeLabel[m] }}
                        </button>
                      }
                    </div>
                    @if (modeError(); as merr) {
                      <div class="error-banner">{{ merr }}</div>
                    }
                  }
                }
              </ar-panel-card>
            }
          }

          @if (currentStep() < 5) {
            <div class="wizard-actions">
              @if (currentStep() > 1) {
                <button type="button" class="ar-ghost-btn" (click)="back()">Voltar</button>
              }
              <div class="spacer"></div>
              @if (!isOwner()) {
                <p class="owner-only-hint">Somente o dono da arena pode configurar os dados fiscais.</p>
              }
              <button
                type="button"
                class="ar-mini-btn ar-mini-btn-primary"
                [disabled]="!canAdvanceFrom(currentStep()) || saving() || !isOwner()"
                (click)="advance()"
              >
                {{ currentStep() === 4 ? (saving() ? 'Enviando…' : 'Salvar e enviar') : 'Avançar' }}
              </button>
            </div>
          }
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .stepper {
      display: flex;
      gap: 4px;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-3);
      padding: 6px;
    }

    .step {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border: none;
      border-radius: var(--nx-r-2);
      background: transparent;
      cursor: pointer;
      color: var(--nx-text-dim);
      min-width: 0;
    }

    .step:disabled {
      cursor: default;
      opacity: 0.5;
    }

    .step.done {
      color: var(--nx-text-mute);
    }

    .step.active {
      background: var(--nx-surface-0);
      color: var(--nx-text);
      box-shadow: 0 0 0 1px var(--nx-line);
    }

    .step-index {
      flex: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--nx-surface-2);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-mono);
      font-size: 10.5px;
      font-weight: 700;
    }

    .step.active .step-index {
      background: var(--nx-orange-500);
      color: var(--nx-text-on-orange);
    }

    .step-label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 8px;
    }

    .row-gap {
      margin-top: 18px;
    }

    .row-gap-sm {
      margin-top: 10px;
    }

    .input-box,
    .input-file {
      width: 100%;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
      font-size: 14px;
      padding: 0 14px;
      box-sizing: border-box;
    }

    .input-box.mono {
      font-family: var(--nx-font-mono);
    }

    .input-box:focus,
    .input-file:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .input-file {
      padding: 10px 14px;
      font-size: 13px;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 88px 1fr;
      gap: 10px;
    }

    .hint {
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--nx-text-dim);
      margin: 0 0 16px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .hint.warning {
      color: var(--nx-pending);
    }

    .hint.error {
      color: var(--nx-live);
    }

    .service-row {
      display: grid;
      grid-template-columns: 140px 1.4fr 120px auto auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }

    .aliquota-field {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .default-toggles {
      display: flex;
      gap: 6px;
    }

    .remove-service-btn {
      height: 32px;
      padding: 0 12px;
      font-size: 11.5px;
    }

    .term-box {
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 16px;
      font-size: 12.5px;
      line-height: 1.65;
      color: var(--nx-text-mute);
      margin-bottom: 16px;
      white-space: pre-line;
    }

    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 13px;
      color: var(--nx-text);
      cursor: pointer;
      line-height: 1.5;
    }

    .checkbox-label input {
      margin-top: 3px;
      flex: none;
    }

    .requirements-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 18px;
    }

    .requirement-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .requirement-row ar-icon {
      color: var(--nx-win);
    }

    .file-selected {
      font-size: 12px;
      color: var(--nx-text-mute);
      margin: 8px 0 0;
    }

    .error-banner {
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
      padding: 10px 14px;
      font-size: 12.5px;
      margin-top: 16px;
    }

    .status-block {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 16px;
    }

    .status-detail {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin: 0;
    }

    .mode-options {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .wizard-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .spacer {
      flex: 1;
    }

    .owner-only-hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin: 0;
    }

    @media (max-width: 900px) {
      .service-row {
        grid-template-columns: 1fr;
      }

      .grid-2,
      .grid-3 {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelFiscalComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly destroyRef = inject(DestroyRef);

  private unsubConfig: Unsubscribe | null = null;

  protected readonly termVersion = FISCAL_TERM_VERSION;
  protected readonly termText = FISCAL_TERM_TEXT;
  protected readonly regimeOptions = REGIME_OPTIONS;
  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly modeLabel = FISCAL_MODE_LABEL;
  protected readonly statusLabel = fiscalConfigStatusLabel;
  protected readonly statusTone = STATUS_TONE;
  protected readonly stepLabels = STEP_LABELS;
  protected readonly steps: WizardStep[] = [1, 2, 3, 4, 5];
  protected readonly helpEmail = HELP_EMAIL;

  /** Só o dono da arena pode alterar dados fiscais — a Cloud Function (`assertManagesArena`)
   *  recusa qualquer outro cargo, mesmo quem tem permissão de escrita em "financeiro" (que é o
   *  que a rota exige só para conseguir VER esta tela). */
  protected readonly isOwner = computed(() => this.access.isOwner());

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly configLoading = signal(true);
  protected readonly config = signal<ArenaFiscalConfigView | null>(null);
  protected readonly currentStatus = computed<FiscalConfigStatus>(() => this.config()?.status ?? 'draft');

  protected readonly currentStep = signal<WizardStep>(1);
  protected readonly maxVisitedStep = signal<WizardStep>(1);

  // Passo 1 — dados da empresa
  protected readonly cnpj = signal('');
  protected readonly razaoSocial = signal('');
  protected readonly nomeFantasia = signal('');
  protected readonly inscricaoMunicipal = signal('');
  protected readonly regimeTributario = signal<FiscalRegimeTributario | null>(null);
  protected readonly endereco = signal<FiscalAddressInput>(emptyAddress());

  // Passo 2 — catálogo de serviços
  protected readonly services = signal<FiscalServiceView[]>([newServiceRow()]);
  protected readonly defaultServiceIdBooking = signal<string | null>(null);
  protected readonly defaultServiceIdClub = signal<string | null>(null);

  // Passo 3 — termo de autorização
  protected readonly authorizationAccepted = signal(false);

  // Passo 4 — credenciais
  protected readonly certificateFile = signal<File | null>(null);
  protected readonly senhaCertificado = signal('');
  protected readonly requirements = signal<MunicipalRequirementView[]>([]);
  protected readonly requirementsLoading = signal(false);
  protected readonly requirementsError = signal<string | null>(null);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Cobre o instante entre o callable retornar e o listener ao vivo confirmar o novo `status` —
   *  sem isso, o passo 5 mostraria por um piscar de olhos "conclua os passos anteriores" logo
   *  depois de o gestor concluir o envio. */
  protected readonly justSubmitted = signal(false);

  // Passo 5 — modo de emissão
  protected readonly settingMode = signal(false);
  protected readonly modeError = signal<string | null>(null);
  protected readonly emittingTest = signal(false);
  protected readonly emitTestError = signal<string | null>(null);

  private readonly cnpjDigits = computed(() => onlyDigits(this.cnpj()));

  protected readonly step1Valid = computed(() => {
    const e = this.endereco();
    return (
      this.cnpjDigits().length === 14 &&
      this.razaoSocial().trim().length > 0 &&
      this.inscricaoMunicipal().trim().length > 0 &&
      this.regimeTributario() != null &&
      e.logradouro.trim().length > 0 &&
      e.numero.trim().length > 0 &&
      e.bairro.trim().length > 0 &&
      e.municipio.trim().length > 0 &&
      e.uf.trim().length === 2 &&
      onlyDigits(e.cep).length === 8 &&
      onlyDigits(e.codigoIbge).length === 7
    );
  });

  protected readonly step2Valid = computed(() =>
    this.services().some((s) => s.codigoMunicipal.trim().length > 0 && s.descricao.trim().length > 0 && s.aliquotaIss >= 0),
  );

  protected readonly step3Valid = computed(() => this.authorizationAccepted());

  protected readonly step4Valid = computed(() => this.certificateFile() != null && this.senhaCertificado().trim().length > 0);

  constructor() {
    this.destroyRef.onDestroy(() => this.unsubConfig?.());

    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      this.unsubConfig?.();
      this.unsubConfig = null;
      if (!arenaId) return;

      this.configLoading.set(true);
      this.unsubConfig = watchArenaFiscalConfig(arenaFirestore(), arenaId, (cfg) => {
        this.config.set(cfg);
        this.configLoading.set(false);
        this.seedFromConfig(cfg);
        if (cfg && cfg.status !== 'draft') this.justSubmitted.set(false);
      });
    });
  }

  /** Semente única (primeira leitura com dados reais) — não sobrescreve o que o gestor está
   *  digitando. `enderecoFiscal`/`regimeTributario`/`nomeFantasia` não fazem parte da view (é um
   *  espelho parcial do doc, ver `fiscal.model.ts`), então precisam ser reinformados ao reabrir o
   *  assistente para editar um cadastro já enviado. */
  private seedFromConfig(cfg: ArenaFiscalConfigView | null): void {
    if (!cfg?.cnpj) return;
    if (this.cnpj().trim() || this.razaoSocial().trim()) return;

    this.cnpj.set(cfg.cnpj);
    this.razaoSocial.set(cfg.razaoSocial);
    this.inscricaoMunicipal.set(cfg.inscricaoMunicipal);
    if (cfg.services.length) {
      this.services.set(cfg.services);
      this.defaultServiceIdBooking.set(cfg.defaultServiceIdBooking);
      this.defaultServiceIdClub.set(cfg.defaultServiceIdClub);
    }
    // Config já enviada antes (status nunca é 'draft' depois do primeiro save real) — pula direto
    // pro status, mas mantém os passos anteriores navegáveis pra revisão/edição.
    if (cfg.status !== 'draft') {
      this.maxVisitedStep.set(5);
      this.currentStep.set(5);
    }
  }

  protected goToStep(step: WizardStep): void {
    if (step <= this.maxVisitedStep()) this.currentStep.set(step);
  }

  protected canAdvanceFrom(step: WizardStep): boolean {
    switch (step) {
      case 1:
        return this.step1Valid();
      case 2:
        return this.step2Valid();
      case 3:
        return this.step3Valid();
      case 4:
        return this.step4Valid();
      default:
        return true;
    }
  }

  protected async advance(): Promise<void> {
    const step = this.currentStep();
    if (!this.canAdvanceFrom(step) || !this.isOwner()) return;

    if (step === 4) {
      await this.submit();
      return;
    }

    const next = (step + 1) as WizardStep;
    this.currentStep.set(next);
    if (next > this.maxVisitedStep()) this.maxVisitedStep.set(next);
    if (next === 4) void this.loadRequirements();
  }

  protected back(): void {
    const step = this.currentStep();
    if (step > 1) this.currentStep.set((step - 1) as WizardStep);
  }

  protected onRegimeChange(value: string): void {
    this.regimeTributario.set((value || null) as FiscalRegimeTributario | null);
  }

  protected updateAddress(patch: Partial<FiscalAddressInput>): void {
    this.endereco.update((current) => ({ ...current, ...patch }));
  }

  /** Lista fixa hoje (ver `FocusNfeIssuer.getMunicipalRequirements`), mas consultada de verdade —
   *  é a confirmação, vinda do emissor, do que a prefeitura exige antes de subir o certificado. */
  private async loadRequirements(): Promise<void> {
    const codigoIbge = onlyDigits(this.endereco().codigoIbge);
    if (codigoIbge.length !== 7) return;
    this.requirementsLoading.set(true);
    this.requirementsError.set(null);
    try {
      this.requirements.set(await getArenaFiscalRequirements(arenaFunctions(), codigoIbge));
    } catch (err) {
      this.requirementsError.set(err instanceof Error ? err.message : 'Não foi possível consultar as exigências do município.');
    } finally {
      this.requirementsLoading.set(false);
    }
  }

  protected addService(): void {
    this.services.update((rows) => [...rows, newServiceRow()]);
  }

  protected removeService(id: string): void {
    this.services.update((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
    if (this.defaultServiceIdBooking() === id) this.defaultServiceIdBooking.set(null);
    if (this.defaultServiceIdClub() === id) this.defaultServiceIdClub.set(null);
  }

  protected updateService(id: string, patch: Partial<FiscalServiceView>): void {
    this.services.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  protected onCertificateSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.certificateFile.set(input.files?.[0] ?? null);
  }

  protected async submit(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || !this.isOwner()) return;
    if (!this.step1Valid() || !this.step2Valid() || !this.step3Valid() || !this.step4Valid()) {
      this.saveError.set('Revise os passos anteriores — há campos obrigatórios pendentes.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    try {
      const file = this.certificateFile();
      const certificadoBase64 = file ? await readFileAsBase64(file) : undefined;

      const filteredServices = this.services().filter((s) => s.codigoMunicipal.trim() && s.descricao.trim());
      const validServiceIds = new Set(filteredServices.map((s) => s.id));
      const defaultBooking = this.defaultServiceIdBooking();
      const defaultClub = this.defaultServiceIdClub();

      await saveArenaFiscalConfig(arenaFunctions(), {
        arenaId,
        cnpj: this.cnpjDigits(),
        razaoSocial: this.razaoSocial().trim(),
        nomeFantasia: this.nomeFantasia().trim() || undefined,
        inscricaoMunicipal: this.inscricaoMunicipal().trim(),
        regimeTributario: this.regimeTributario()!,
        enderecoFiscal: {
          ...this.endereco(),
          cep: onlyDigits(this.endereco().cep),
          codigoIbge: onlyDigits(this.endereco().codigoIbge),
        },
        services: filteredServices,
        defaultServiceIdBooking: defaultBooking && validServiceIds.has(defaultBooking) ? defaultBooking : undefined,
        defaultServiceIdClub: defaultClub && validServiceIds.has(defaultClub) ? defaultClub : undefined,
        certificadoBase64,
        senhaCertificado: this.senhaCertificado().trim() || undefined,
        authorizationAccepted: this.authorizationAccepted(),
        authorizationTermVersion: this.termVersion,
      });

      // Certificado e senha passaram em trânsito — não ficam nem no estado do componente depois
      // de enviados.
      this.certificateFile.set(null);
      this.senhaCertificado.set('');
      this.justSubmitted.set(true);
      this.currentStep.set(5);
      this.maxVisitedStep.set(5);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar os dados fiscais.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async chooseMode(mode: FiscalMode): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || !this.isOwner() || this.currentStatus() !== 'active') return;

    this.settingMode.set(true);
    this.modeError.set(null);
    try {
      await setArenaFiscalMode(arenaFunctions(), arenaId, mode);
    } catch (err) {
      this.modeError.set(err instanceof Error ? err.message : 'Não foi possível alterar o modo de emissão.');
    } finally {
      this.settingMode.set(false);
    }
  }

  protected async emitTestInvoice(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || !this.isOwner()) return;
    if (this.currentStatus() !== 'testing' && this.currentStatus() !== 'error') return;

    this.emittingTest.set(true);
    this.emitTestError.set(null);
    try {
      await emitActivationTestInvoice(arenaFunctions(), arenaId);
    } catch (err) {
      this.emitTestError.set(err instanceof Error ? err.message : 'Não foi possível emitir a nota de teste.');
    } finally {
      this.emittingTest.set(false);
    }
  }
}
