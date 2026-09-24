import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { formatCpfCnpjDisplay } from '@nexago/br-documents';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { arenaAddressFromDoc } from './arena-registration-repository';
import { ArenaRegistrationGateway } from './arena-registration.gateway';
import { isValidCep, validateArenaAddress, validateArenaCompany } from './arena-registration.model';

/** Dados cadastrais da arena. Junta o que estava espalhado: o CNPJ, que o formulário de
 *  cadastro pedia e descartava, e o endereço, que era uma linha de texto livre sem coordenada.
 *
 *  Duas gravações com donos diferentes: a empresa vai para `arenas/{id}/registration/data`
 *  (só o titular escreve — firestore.rules), o endereço para o doc público da arena, que
 *  qualquer área 'perfil' edita. Por isso a tela abre para o staff, mas com a empresa travada. */
@Component({
  selector: 'ar-panel-registration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Dados cadastrais" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="saving() || arenaLoading()" (click)="save()">
          <ar-icon name="check" [size]="14" />
          {{ saving() ? 'Salvando…' : 'Salvar alterações' }}
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda.</p>
        } @else if (arenaLoading()) {
          <p class="state-text">Carregando dados cadastrais…</p>
        } @else {
          @if (saveError(); as serr) {
            <div class="error-banner">{{ serr }}</div>
          }
          @if (notice(); as msg) {
            <div class="notice-banner">{{ msg }}</div>
          }

          <ar-panel-card kicker="Não aparece no app — usado em cobranças e notas" title="Empresa">
            @if (!isOwner()) {
              <p class="hint">Só o titular da arena edita os dados da empresa.</p>
            }
            <div class="row-2">
              <div>
                <div class="field-label">CNPJ ou CPF</div>
                <input
                  type="text"
                  name="cpfCnpj"
                  class="input-box"
                  placeholder="00.000.000/0000-00"
                  [disabled]="!isOwner()"
                  [value]="cpfCnpj()"
                  (input)="onDocumentInput($any($event.target).value)"
                />
              </div>
              <div>
                <div class="field-label">Inscrição municipal</div>
                <input
                  type="text"
                  name="inscricaoMunicipal"
                  class="input-box"
                  [disabled]="!isOwner()"
                  [value]="inscricaoMunicipal()"
                  (input)="inscricaoMunicipal.set($any($event.target).value)"
                />
              </div>
            </div>
            <div class="row-2 row-gap">
              <div>
                <div class="field-label">Razão social</div>
                <input
                  type="text"
                  name="razaoSocial"
                  class="input-box"
                  [disabled]="!isOwner()"
                  [value]="razaoSocial()"
                  (input)="razaoSocial.set($any($event.target).value)"
                />
              </div>
              <div>
                <div class="field-label">Nome fantasia (opcional)</div>
                <input
                  type="text"
                  name="nomeFantasia"
                  class="input-box"
                  [disabled]="!isOwner()"
                  [value]="nomeFantasia()"
                  (input)="nomeFantasia.set($any($event.target).value)"
                />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card kicker="Aparece no app e posiciona a arena no mapa" title="Endereço">
            @if (legacyAddress(); as legacy) {
              <p class="hint">Endereço cadastrado antes: <strong>{{ legacy }}</strong>. Refaça pelos campos abaixo para a arena aparecer no mapa.</p>
            }
            <div class="row-cep">
              <div>
                <div class="field-label">CEP</div>
                <input
                  type="text"
                  name="cep"
                  class="input-box"
                  placeholder="00000-000"
                  [value]="cep()"
                  (input)="onCepInput($any($event.target).value)"
                />
              </div>
              <p class="cep-hint">{{ cepHint() }}</p>
            </div>

            <div class="row-street row-gap">
              <div>
                <div class="field-label">Rua</div>
                <input type="text" name="logradouro" class="input-box" [value]="logradouro()" (input)="logradouro.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Número</div>
                <input type="text" name="numero" class="input-box" [value]="numero()" (input)="numero.set($any($event.target).value)" />
              </div>
            </div>

            <div class="row-2 row-gap">
              <div>
                <div class="field-label">Complemento (opcional)</div>
                <input type="text" name="complemento" class="input-box" [value]="complemento()" (input)="complemento.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">Bairro</div>
                <input type="text" name="bairro" class="input-box" [value]="bairro()" (input)="bairro.set($any($event.target).value)" />
              </div>
            </div>

            <div class="row-city row-gap">
              <div>
                <div class="field-label">Cidade</div>
                <input type="text" name="city" class="input-box" [value]="city()" (input)="city.set($any($event.target).value)" />
              </div>
              <div>
                <div class="field-label">UF</div>
                <input type="text" name="state" class="input-box" maxlength="2" [value]="state()" (input)="state.set($any($event.target).value.toUpperCase())" />
              </div>
            </div>
          </ar-panel-card>
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
      max-width: 720px;
      overflow: auto;
    }

    .state-text {
      font-size: 13.5px;
      color: var(--nx-text-mute);
    }

    .error-banner,
    .notice-banner {
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 12.5px;
    }

    .error-banner {
      border: 1px solid var(--nx-live);
      background: rgba(255, 59, 48, 0.08);
      color: var(--nx-live);
    }

    .notice-banner {
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
    }

    .hint {
      font-size: 12.5px;
      color: var(--nx-text-mute);
      margin: 0 0 16px;
      line-height: 1.5;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .input-box {
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

    .input-box:focus {
      outline: none;
      border-color: var(--nx-orange-500);
    }

    .input-box:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .row-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .row-street {
      display: grid;
      grid-template-columns: 3fr 1fr;
      gap: 16px;
    }

    .row-city {
      display: grid;
      grid-template-columns: 3fr 1fr;
      gap: 16px;
    }

    .row-cep {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 16px;
      align-items: end;
    }

    .cep-hint {
      font-size: 12px;
      color: var(--nx-text-mute);
      margin: 0 0 13px;
    }

    .row-gap {
      margin-top: 18px;
    }

    @media (max-width: 720px) {
      .row-2,
      .row-street,
      .row-city,
      .row-cep {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelRegistrationComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);
  private readonly gateway = inject(ArenaRegistrationGateway);

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());
  protected readonly isOwner = computed(() => this.access.isOwner());
  protected readonly headerSubtitle = computed(
    () => `${this.arenaContext.arenaName() ?? 'Arena'} · empresa e endereço`,
  );

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  private readonly cpfCnpjSeed = signal('');
  private readonly razaoSocialSeed = signal('');
  private readonly nomeFantasiaSeed = signal('');
  private readonly inscricaoMunicipalSeed = signal('');

  protected readonly cpfCnpj = linkedSignal(() => this.cpfCnpjSeed());
  protected readonly razaoSocial = linkedSignal(() => this.razaoSocialSeed());
  protected readonly nomeFantasia = linkedSignal(() => this.nomeFantasiaSeed());
  protected readonly inscricaoMunicipal = linkedSignal(() => this.inscricaoMunicipalSeed());

  private readonly cepSeed = signal('');
  private readonly logradouroSeed = signal('');
  private readonly numeroSeed = signal('');
  private readonly complementoSeed = signal('');
  private readonly bairroSeed = signal('');
  private readonly citySeed = signal('');
  private readonly stateSeed = signal('');

  protected readonly cep = linkedSignal(() => this.cepSeed());
  protected readonly logradouro = linkedSignal(() => this.logradouroSeed());
  protected readonly numero = linkedSignal(() => this.numeroSeed());
  protected readonly complemento = linkedSignal(() => this.complementoSeed());
  protected readonly bairro = linkedSignal(() => this.bairroSeed());
  protected readonly city = linkedSignal(() => this.citySeed());
  protected readonly state = linkedSignal(() => this.stateSeed());

  protected readonly legacyAddress = signal('');
  protected readonly cepHint = signal('');

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;

      // Semente única: o doc do contexto é ao vivo e reagir a ele reescreveria o que o
      // gestor está digitando (mesmo cuidado da tela de Contatos).
      const data = untracked(() => this.arenaContext.arenaDocData());
      const address = arenaAddressFromDoc(data ?? {});
      this.cepSeed.set(address.parts.cep);
      this.logradouroSeed.set(address.parts.logradouro);
      this.numeroSeed.set(address.parts.numero);
      this.complementoSeed.set(address.parts.complemento);
      this.bairroSeed.set(address.parts.bairro);
      this.citySeed.set(address.city);
      this.stateSeed.set(address.state);
      this.legacyAddress.set(address.legacyAddress);

      // Só o titular lê `registration/data` — pedir como staff só renderia erro de permissão.
      if (untracked(() => this.isOwner())) {
        void this.loadCompany(arenaId);
      }
    });
  }

  private async loadCompany(arenaId: string): Promise<void> {
    try {
      const company = await this.gateway.loadCompany(arenaId);
      this.cpfCnpjSeed.set(company.cpfCnpj ? formatCpfCnpjDisplay(company.cpfCnpj) : '');
      this.razaoSocialSeed.set(company.razaoSocial);
      this.nomeFantasiaSeed.set(company.nomeFantasia);
      this.inscricaoMunicipalSeed.set(company.inscricaoMunicipal);
    } catch {
      this.saveError.set('Não foi possível carregar os dados da empresa.');
    }
  }

  protected onDocumentInput(raw: string): void {
    this.cpfCnpj.set(formatCpfCnpjDisplay(raw));
  }

  protected onCepInput(raw: string): void {
    this.cep.set(raw);
    if (!isValidCep(raw)) {
      this.cepHint.set('');
      return;
    }
    void this.applyCep(raw);
  }

  private async applyCep(raw: string): Promise<void> {
    this.cepHint.set('Buscando endereço…');
    const found = await this.gateway.lookupCep(raw);
    if (!found) {
      this.cepHint.set('CEP não encontrado — preencha o endereço na mão.');
      return;
    }
    this.cepHint.set('');
    this.logradouro.set(found.logradouro);
    this.bairro.set(found.bairro);
    this.city.set(found.city);
    this.state.set(found.state);
  }

  private currentParts() {
    return {
      cep: this.cep(),
      logradouro: this.logradouro(),
      numero: this.numero(),
      complemento: this.complemento(),
      bairro: this.bairro(),
    };
  }

  private currentCompany() {
    return {
      cpfCnpj: this.cpfCnpj(),
      razaoSocial: this.razaoSocial(),
      nomeFantasia: this.nomeFantasia(),
      inscricaoMunicipal: this.inscricaoMunicipal(),
    };
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    const parts = this.currentParts();
    const company = this.currentCompany();

    const companyError = this.isOwner() ? validateArenaCompany(company) : null;
    const addressError = validateArenaAddress(parts, this.city(), this.state());
    const error = companyError ?? addressError;
    if (error) {
      this.saveError.set(error);
      this.notice.set(null);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.notice.set(null);
    try {
      const coords = await this.gateway.geocode({ ...parts, city: this.city(), state: this.state() });
      if (this.isOwner()) {
        await this.gateway.saveCompany(arenaId, company);
      }
      await this.gateway.saveAddress(arenaId, parts, this.city(), this.state(), coords);
      this.legacyAddress.set('');
      this.notice.set(
        coords
          ? 'Dados cadastrais salvos.'
          : 'Dados salvos, mas não conseguimos posicionar a arena no mapa a partir desse endereço.',
      );
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Não foi possível salvar os dados cadastrais.');
    } finally {
      this.saving.set(false);
    }
  }
}
