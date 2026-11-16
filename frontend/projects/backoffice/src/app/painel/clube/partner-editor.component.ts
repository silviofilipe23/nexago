import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { FieldComponent } from '../ui/field.component';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ToggleComponent } from '../ui/toggle.component';
import { clubErrorMessage } from './data/club-errors';
import { ClubRepository } from './data/club.repository';
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  BENEFIT_TITLE_MAX,
  CATEGORY_LABELS,
  CONSENT_TEXT_MAX,
  COUPON_CODE_MAX,
  COUPON_MODES,
  COUPON_MODE_LABELS,
  CTA_LABEL_MAX,
  CTA_TYPES,
  CTA_TYPE_LABELS,
  DEFAULT_BRAND_COLOR,
  DESCRIPTION_MAX,
  HIGHLIGHT_MAX,
  HOW_TO_USE_MAX,
  NAME_MAX,
  NEW_PARTNER_ROUTE_ID,
  PARTNER_CATEGORIES,
  SUCCESS_MESSAGE_MAX,
  TERMS_MAX,
  defaultConsentText,
  defaultLeadSuccessMessage,
  emptyPartnerForm,
  formFromPartner,
  isValidColor,
  logoFileError,
  normalizeColor,
  parseSteps,
  partnerPayload,
  uniquePartnerId,
  validatePartnerForm,
  type PartnerForm,
  type PartnerFormField,
} from './data/partner';
import { PartnerLogoComponent } from './ui/partner-logo.component';
import { PartnerPreviewComponent } from './ui/partner-preview.component';

type LoadState = 'loading' | 'ok' | 'missing' | 'error';

/**
 * Editor de parceiro do clube (`/painel/clube/parceiros/:id`, `novo` = criar). O id é o slug do
 * nome, único, e não muda depois de criado. Grava o doc inteiro direto no Firestore; a validação
 * espelha a rule `partnerValid`. Prévia ao vivo no estilo da tela do parceiro no app.
 */
@Component({
  selector: 'bo-partner-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  imports: [
    RouterLink,
    PanelShellComponent,
    PageHeaderComponent,
    PanelCardComponent,
    FieldComponent,
    IconComponent,
    ToggleComponent,
    ConfirmDialogComponent,
    PartnerLogoComponent,
    PartnerPreviewComponent,
  ],
  template: `
    <bo-panel-shell>
      <bo-page-header [title]="isNew() ? 'Novo parceiro' : 'Editar parceiro'" [subtitle]="'Clube de Vantagens › ' + (savedName() || 'Novo')">
        @if (dirty() && state() === 'ok') {
          <span class="unsaved">Alterações não salvas</span>
        }
        <a class="bo-mini-btn" routerLink="/painel/clube">Voltar</a>
        @if (!isNew() && state() === 'ok') {
          <button type="button" class="bo-mini-btn danger" [disabled]="busy()" (click)="openDelete()">
            <bo-icon name="trash" [size]="13" /> Excluir
          </button>
        }
        <button type="button" class="bo-mini-btn bo-mini-btn-primary" [disabled]="!canSave()" (click)="save()">
          @if (saving()) {
            <span class="bo-spinner small" aria-hidden="true"></span>
          }
          {{ isNew() ? 'Criar parceiro' : 'Salvar' }}
        </button>
      </bo-page-header>

      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <div class="skeleton" aria-hidden="true"></div>
          }
          @case ('missing') {
            <div class="empty">
              <bo-icon name="gift" [size]="20" />
              <p>Parceiro não encontrado</p>
              <span>Ele pode ter sido excluído.</span>
              <a class="bo-mini-btn" routerLink="/painel/clube">Voltar ao clube</a>
            </div>
          }
          @case ('error') {
            <div class="bo-alert" role="alert">
              <bo-icon name="alert" [size]="16" />
              <span>{{ loadError() }}</span>
              <button type="button" class="bo-mini-btn push" (click)="load()">Tentar de novo</button>
            </div>
          }
          @default {
            <div class="grid">
              <div class="main">
                @if (notice(); as text) {
                  <div class="bo-feedback" role="status" aria-live="polite"><bo-icon name="check" [size]="15" /><span>{{ text }}</span></div>
                }
                @if (actionError(); as text) {
                  <div class="bo-alert" role="alert"><bo-icon name="alert" [size]="16" /><span>{{ text }}</span></div>
                }

                <bo-panel-card title="Parceiro">
                  <div class="stack">
                    <div class="g2">
                      <bo-field label="Nome" [hint]="idHint()">
                        <span class="counted">
                          <input class="bo-input" [class.invalid]="err('name')" [value]="form().name" (input)="patch({ name: text($event) })" (blur)="touch('name')" />
                          <span class="count" [class.over]="len(form().name) > limits.name">{{ len(form().name) }}/{{ limits.name }}</span>
                        </span>
                        @if (err('name'); as e) {
                          <span class="err">{{ e }}</span>
                        }
                      </bo-field>
                      <bo-field label="Categoria" hint="Filtro da tela do clube no app.">
                        <select class="bo-select" [value]="form().category" (change)="patch({ category: $any(text($event)) })">
                          @for (c of categories; track c) {
                            <option [value]="c">{{ categoryLabels[c] }}</option>
                          }
                        </select>
                      </bo-field>
                    </div>

                    <div class="g2">
                      <div class="fld">
                        <span class="lbl">Logo (PNG com fundo transparente)</span>
                        <div class="logo-row">
                          <bo-partner-logo [name]="form().name || '?'" [color]="previewColor()" [logoUrl]="form().logoUrl" [size]="48" />
                          <label class="bo-mini-btn file" [class.disabled]="busy()">
                            <input type="file" accept="image/png,image/webp,image/jpeg" [disabled]="busy()" (change)="onLogo($event)" />
                            {{ form().logoUrl ? 'Trocar' : 'Enviar arquivo' }}
                          </label>
                          @if (form().logoUrl) {
                            <button type="button" class="bo-ghost-btn" [disabled]="busy()" (click)="patch({ logoUrl: null })">Remover</button>
                          }
                        </div>
                        @if (uploadPercent() !== null) {
                          <span class="hint">Enviando… {{ uploadPercent() }}%</span>
                        } @else if (logoError() || err('logoUrl'); as e) {
                          <span class="err">{{ e }}</span>
                        } @else {
                          <span class="hint">PNG, WebP ou JPG até 2 MB. Sem logo, o app mostra as iniciais na cor da marca.</span>
                        }
                      </div>
                      <div class="fld">
                        <label class="lbl" for="pe-color">Cor da marca</label>
                        <div class="color-row">
                          <input type="color" class="swatch" aria-label="Escolher a cor da marca" [value]="pickerColor()" (input)="patch({ brandColor: text($event).toUpperCase() })" />
                          <input
                            id="pe-color"
                            class="bo-input mono"
                            maxlength="7"
                            [class.invalid]="err('brandColor')"
                            [value]="form().brandColor"
                            (input)="patch({ brandColor: text($event) })"
                            (blur)="touch('brandColor'); patch({ brandColor: normalize(form().brandColor) })"
                          />
                        </div>
                        @if (err('brandColor'); as e) {
                          <span class="err">{{ e }}</span>
                        } @else {
                          <span class="hint">Banner, iniciais e destaque do parceiro no app.</span>
                        }
                      </div>
                    </div>

                    <bo-field label="Cidades" hint="Separadas por vírgula. Vazio = todas as cidades.">
                      <input class="bo-input" placeholder="Todas as cidades" [class.invalid]="err('cities')" [value]="form().cities" (input)="patch({ cities: text($event) })" (blur)="touch('cities')" />
                      @if (err('cities'); as e) {
                        <span class="err">{{ e }}</span>
                      }
                    </bo-field>
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Benefício">
                  <div class="stack">
                    <div class="g2">
                      <bo-field label="Selo curto" hint="O destaque grande: 10% OFF, GRÁTIS.">
                        <span class="counted">
                          <input class="bo-input" [class.invalid]="err('benefitHighlight')" [value]="form().benefitHighlight" (input)="patch({ benefitHighlight: text($event) })" (blur)="touch('benefitHighlight')" />
                          <span class="count" [class.over]="len(form().benefitHighlight) > limits.highlight">{{ len(form().benefitHighlight) }}/{{ limits.highlight }}</span>
                        </span>
                        @if (err('benefitHighlight'); as e) {
                          <span class="err">{{ e }}</span>
                        }
                      </bo-field>
                      <bo-field label="Benefício" hint="Uma linha: 10% de desconto em todo pedido.">
                        <span class="counted">
                          <input class="bo-input" [class.invalid]="err('benefitTitle')" [value]="form().benefitTitle" (input)="patch({ benefitTitle: text($event) })" (blur)="touch('benefitTitle')" />
                          <span class="count" [class.over]="len(form().benefitTitle) > limits.title">{{ len(form().benefitTitle) }}/{{ limits.title }}</span>
                        </span>
                        @if (err('benefitTitle'); as e) {
                          <span class="err">{{ e }}</span>
                        }
                      </bo-field>
                    </div>
                    <bo-field label="Descrição" [hint]="len(form().description) + '/' + limits.description + ' · Texto do parceiro na tela dele.'">
                      <textarea class="bo-input area" rows="3" [class.invalid]="err('description')" [value]="form().description" (input)="patch({ description: text($event) })" (blur)="touch('description')"></textarea>
                      @if (err('description'); as e) {
                        <span class="err">{{ e }}</span>
                      }
                    </bo-field>
                    <bo-field label="Como usar" [hint]="stepsHint()">
                      <textarea class="bo-input area" rows="3" [class.invalid]="err('howToUse')" [value]="form().howToUse" (input)="patch({ howToUse: text($event) })" (blur)="touch('howToUse')"></textarea>
                      @if (err('howToUse'); as e) {
                        <span class="err">{{ e }}</span>
                      }
                    </bo-field>
                    <bo-field label="Termos e condições" [hint]="len(form().terms) + '/' + limits.terms + ' · Regulamento da oferta.'">
                      <textarea class="bo-input area" rows="3" [class.invalid]="err('terms')" [value]="form().terms" (input)="patch({ terms: text($event) })" (blur)="touch('terms')"></textarea>
                      @if (err('terms'); as e) {
                        <span class="err">{{ e }}</span>
                      }
                    </bo-field>
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Botão">
                  <div class="stack">
                    <div class="seg" role="radiogroup" aria-label="O que o botão faz">
                      @for (t of ctaTypes; track t) {
                        <button type="button" role="radio" [attr.aria-checked]="form().ctaType === t" [class.on]="form().ctaType === t" (click)="patch({ ctaType: t })">
                          {{ ctaTypeLabels[t] }}
                        </button>
                      }
                    </div>
                    <div class="g2">
                      <bo-field label="Texto do botão" [hint]="form().ctaType === 'link' ? 'Pedir com 10% off.' : 'Quero contratar.'">
                        <span class="counted">
                          <input class="bo-input" [class.invalid]="err('ctaLabel')" [value]="form().ctaLabel" (input)="patch({ ctaLabel: text($event) })" (blur)="touch('ctaLabel')" />
                          <span class="count" [class.over]="len(form().ctaLabel) > limits.cta">{{ len(form().ctaLabel) }}/{{ limits.cta }}</span>
                        </span>
                        @if (err('ctaLabel'); as e) {
                          <span class="err">{{ e }}</span>
                        }
                      </bo-field>
                      @if (form().ctaType === 'link') {
                        <bo-field label="Link do parceiro" hint="A NexaGO acrescenta utm_source, utm_medium, utm_campaign e ref.">
                          <input class="bo-input" type="url" placeholder="https://" [class.invalid]="err('link')" [value]="form().link" (input)="patch({ link: text($event) })" (blur)="touch('link')" />
                          @if (err('link'); as e) {
                            <span class="err">{{ e }}</span>
                          }
                        </bo-field>
                      }
                    </div>

                    <div class="g2">
                      <div class="fld">
                        <span class="lbl" id="pe-coupon">Cupom</span>
                        <div class="seg" role="radiogroup" aria-labelledby="pe-coupon">
                          @for (m of couponModes; track m) {
                            <button type="button" role="radio" [attr.aria-checked]="form().couponMode === m" [class.on]="form().couponMode === m" (click)="patch({ couponMode: m })">
                              {{ couponLabels[m] }}
                            </button>
                          }
                        </div>
                      </div>
                      @if (form().couponMode === 'fixed') {
                        <bo-field label="Código fixo" hint="O mesmo para todos: NEXAGO10.">
                          <span class="counted">
                            <input class="bo-input mono" [class.invalid]="err('couponCode')" [value]="form().couponCode" (input)="patch({ couponCode: text($event) })" (blur)="touch('couponCode')" />
                            <span class="count" [class.over]="len(form().couponCode) > limits.coupon">{{ len(form().couponCode) }}/{{ limits.coupon }}</span>
                          </span>
                          @if (err('couponCode'); as e) {
                            <span class="err">{{ e }}</span>
                          }
                        </bo-field>
                      } @else if (form().couponMode === 'athlete') {
                        <p class="explain">Cada atleta vê o próprio código (NEXA- + 4 caracteres do cadastro). Combine com o parceiro antes.</p>
                      }
                    </div>

                    @if (form().ctaType === 'lead_form') {
                      <bo-field label="Texto do consentimento (opcional)" [hint]="len(form().leadConsentText) + '/' + limits.consent + ' · Vazio usa o padrão mostrado. O texto aceito fica guardado em cada lead.'">
                        <textarea class="bo-input area" rows="3" [placeholder]="consentPlaceholder()" [class.invalid]="err('leadConsentText')" [value]="form().leadConsentText" (input)="patch({ leadConsentText: text($event) })" (blur)="touch('leadConsentText')"></textarea>
                        @if (err('leadConsentText'); as e) {
                          <span class="err">{{ e }}</span>
                        }
                      </bo-field>
                      <bo-field label="Mensagem de sucesso (opcional)" [hint]="len(form().leadSuccessMessage) + '/' + limits.success + ' · Aparece depois do envio. Vazio usa o padrão.'">
                        <input class="bo-input" [placeholder]="successPlaceholder()" [class.invalid]="err('leadSuccessMessage')" [value]="form().leadSuccessMessage" (input)="patch({ leadSuccessMessage: text($event) })" (blur)="touch('leadSuccessMessage')" />
                        @if (err('leadSuccessMessage'); as e) {
                          <span class="err">{{ e }}</span>
                        }
                      </bo-field>
                    }
                  </div>
                </bo-panel-card>

                <bo-panel-card title="Publicação">
                  <div class="g3">
                    <bo-field label="Público" hint="Só quem testa: admins e a lista do clube.">
                      <select class="bo-select" [value]="form().audience" (change)="patch({ audience: $any(text($event)) })">
                        @for (a of audiences; track a) {
                          <option [value]="a">{{ audienceLabels[a] }}</option>
                        }
                      </select>
                    </bo-field>
                    <bo-field label="Prioridade" hint="Maior aparece primeiro.">
                      <input class="bo-input mono" type="number" step="1" [class.invalid]="err('priority')" [value]="form().priority" (input)="patch({ priority: text($event) })" (blur)="touch('priority')" />
                      @if (err('priority'); as e) {
                        <span class="err">{{ e }}</span>
                      }
                    </bo-field>
                    <div class="switches">
                      <div class="switch">
                        <bo-toggle ariaLabel="Ativo" [checked]="form().active" (checkedChange)="patch({ active: $event })" />
                        <span>Ativo <small>Desligado some do app.</small></span>
                      </div>
                      <div class="switch">
                        <bo-toggle ariaLabel="Patrocinador oficial" [checked]="form().isMasterSponsor" (checkedChange)="patch({ isMasterSponsor: $event })" />
                        <span>Patrocinador oficial <small>Banner no topo do clube.</small></span>
                      </div>
                    </div>
                  </div>
                </bo-panel-card>
              </div>

              <aside class="rail">
                <bo-partner-preview [partner]="payload()" />
              </aside>
            </div>
          }
        }
      </div>

      <bo-confirm-dialog
        [open]="deleteOpen()"
        [title]="'Excluir ' + (savedName() || 'parceiro') + '?'"
        description="Some do app na hora. Métricas e leads já gravados continuam aqui no backoffice. Não dá para desfazer."
        confirmLabel="Excluir parceiro"
        tone="danger"
        [busy]="saving()"
        [error]="deleteError()"
        (confirmed)="remove()"
        (dismissed)="deleteOpen.set(false)"
      />
      <bo-confirm-dialog
        [open]="leaveOpen()"
        title="Sair sem salvar?"
        description="As alterações deste parceiro se perdem."
        confirmLabel="Sair sem salvar"
        tone="danger"
        (confirmed)="resolveLeave(true)"
        (dismissed)="resolveLeave(false)"
      />
    </bo-panel-shell>
  `,
  styles: `
    .body { padding: 22px 32px 40px; min-width: 0; }
    @media (max-width: 760px) { .body { padding: 16px; } }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; }
    @media (max-width: 1180px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .rail { position: sticky; top: 0; min-width: 0; }
    @media (max-width: 1180px) { .rail { position: static; max-width: 360px; } }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
    .g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
    @media (max-width: 760px) { .g2, .g3 { grid-template-columns: minmax(0, 1fr); } }
    .fld { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .lbl { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .hint { font-size: 11px; line-height: 1.3; color: var(--nx-text-dim); }
    .err { font-size: 11.5px; line-height: 1.3; color: #ff9b94; }
    .bo-input.invalid, .bo-select.invalid { border-color: rgba(255, 59, 48, 0.6); }
    .bo-input.area { height: auto; min-height: 76px; padding: 10px 13px; resize: vertical; line-height: 1.45; font-family: var(--nx-font-ui); }
    .mono { font-family: var(--nx-font-mono); }
    .counted { position: relative; display: block; }
    .counted .bo-input { padding-right: 58px; }
    .count { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); pointer-events: none; }
    .count.over { color: var(--nx-live); }
    .logo-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .file { position: relative; overflow: hidden; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file.disabled { opacity: 0.5; pointer-events: none; }
    .file:focus-within { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .color-row { display: flex; gap: 8px; align-items: center; }
    .swatch { flex: none; width: 42px; height: 42px; padding: 3px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-1); cursor: pointer; }
    .seg { display: flex; gap: 6px; }
    .seg button { flex: 1; height: 40px; border-radius: var(--nx-r-2); border: 1px solid var(--nx-line); background: var(--nx-surface-1); color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }
    .seg button.on { border-color: var(--nx-orange-500); background: rgba(255, 106, 26, 0.12); color: var(--nx-orange-400); }
    .seg button:focus-visible { outline: 2px solid var(--nx-orange-500); outline-offset: 2px; }
    .explain { margin: 22px 0 0; font-size: 12px; line-height: 1.5; color: var(--nx-text-mute); }
    .switches { display: flex; flex-direction: column; gap: 14px; padding-top: 22px; }
    .switch { display: flex; align-items: flex-start; gap: 12px; font-size: 13px; color: var(--nx-text); }
    .switch small { display: block; margin-top: 2px; font-size: 11px; color: var(--nx-text-dim); }
    .unsaved { font-family: var(--nx-font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--nx-pending); white-space: nowrap; }
    .bo-mini-btn.danger { color: var(--nx-live); border-color: rgba(255, 59, 48, 0.35); }
    .bo-spinner.small { width: 13px; height: 13px; border-width: 2px; }
    .bo-alert { margin: 0; align-items: center; }
    .push { margin-left: auto; flex: none; }
    .skeleton { height: 420px; border-radius: var(--nx-r-4); background: var(--nx-surface-1); opacity: 0.5; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 60px 0; color: var(--nx-text-dim); text-align: center; }
    .empty p { margin: 0; font-size: 14px; color: var(--nx-text); }
    .empty span { font-size: 12px; }
  `,
})
export class PartnerEditorComponent {
  private readonly repository = inject(ClubRepository);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly categories = PARTNER_CATEGORIES;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly ctaTypes = CTA_TYPES;
  protected readonly ctaTypeLabels = CTA_TYPE_LABELS;
  protected readonly couponModes = COUPON_MODES;
  protected readonly couponLabels = COUPON_MODE_LABELS;
  protected readonly audiences = AUDIENCES;
  protected readonly audienceLabels = AUDIENCE_LABELS;
  protected readonly limits = {
    name: NAME_MAX,
    highlight: HIGHLIGHT_MAX,
    title: BENEFIT_TITLE_MAX,
    description: DESCRIPTION_MAX,
    terms: TERMS_MAX,
    cta: CTA_LABEL_MAX,
    coupon: COUPON_CODE_MAX,
    consent: CONSENT_TEXT_MAX,
    success: SUCCESS_MESSAGE_MAX,
  };

  /** `null` = parceiro novo (rota `novo`). */
  protected readonly partnerId = signal<string | null>(this.routeId());
  protected readonly isNew = computed(() => this.partnerId() === null);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal('');
  protected readonly form = signal<PartnerForm>(emptyPartnerForm());
  /** O payload como está gravado (ou o do form em branco, no novo): base do "não salvo". */
  private readonly savedJson = signal(JSON.stringify(partnerPayload(emptyPartnerForm())));
  protected readonly savedName = signal('');
  private readonly existingIds = signal<ReadonlySet<string>>(new Set());

  private readonly touched = signal<ReadonlySet<PartnerFormField>>(new Set());
  private readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploadPercent = signal<number | null>(null);
  protected readonly logoError = signal('');
  protected readonly actionError = signal('');
  protected readonly notice = signal('');
  protected readonly deleteOpen = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly leaveOpen = signal(false);
  private leaveResolver: ((ok: boolean) => void) | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly payload = computed(() => partnerPayload(this.form()));
  protected readonly errors = computed(() => validatePartnerForm(this.form()));
  protected readonly dirty = computed(() => JSON.stringify(this.payload()) !== this.savedJson());
  protected readonly busy = computed(() => this.saving() || this.uploadPercent() !== null);
  protected readonly canSave = computed(() => this.state() === 'ok' && !this.busy() && (this.isNew() || this.dirty()));
  /** Id que o parceiro novo vai ganhar (slug do nome, sem repetir). */
  protected readonly newId = computed(() => (this.isNew() ? uniquePartnerId(this.form().name, this.existingIds()) : null));
  protected readonly idHint = computed(() => {
    if (!this.isNew()) return `Id ${this.partnerId()} · não muda.`;
    const id = this.newId();
    return id ? `Id no app: ${id}` : 'O id sai do nome (letras e números).';
  });
  protected readonly previewColor = computed(() =>
    isValidColor(this.form().brandColor) ? normalizeColor(this.form().brandColor) : DEFAULT_BRAND_COLOR,
  );
  protected readonly pickerColor = computed(() => this.previewColor().toLowerCase());
  protected readonly stepsHint = computed(
    () =>
      `${parseSteps(this.form().howToUse).length}/${HOW_TO_USE_MAX} passos, um por linha. Vazio usa o padrão do tipo de botão.`,
  );
  protected readonly consentPlaceholder = computed(() => defaultConsentText(this.form().name.trim() || 'parceiro'));
  protected readonly successPlaceholder = computed(() => defaultLeadSuccessMessage(this.form().name.trim() || 'parceiro'));

  protected readonly normalize = normalizeColor;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    });
    void this.load();
  }

  private routeId(): string | null {
    const id = this.route.snapshot.paramMap.get('id');
    return !id || id === NEW_PARTNER_ROUTE_ID ? null : id;
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.loadError.set('');
    const id = this.partnerId();
    try {
      if (id === null) {
        // Os ids existentes deixam o slug do novo único antes de gravar.
        const partners = await this.repository.partners();
        this.existingIds.set(new Set(partners.map((p) => p.id)));
        this.state.set('ok');
        return;
      }
      const partner = await this.repository.partner(id);
      if (!partner) {
        this.state.set('missing');
        return;
      }
      const form = formFromPartner(partner);
      this.form.set(form);
      this.savedJson.set(JSON.stringify(partnerPayload(form)));
      this.savedName.set(partner.name);
      this.state.set('ok');
    } catch (error) {
      this.loadError.set(clubErrorMessage(error));
      this.state.set('error');
    }
  }

  protected patch(change: Partial<PartnerForm>): void {
    this.form.update((f) => ({ ...f, ...change }));
  }

  protected touch(field: PartnerFormField): void {
    this.touched.update((s) => new Set([...s, field]));
  }

  /** Erro do campo depois que a pessoa passou por ele ou tentou salvar. */
  protected err(field: PartnerFormField): string | null {
    if (!this.submitted() && !this.touched().has(field)) return null;
    return this.errors()[field] ?? null;
  }

  protected len(value: string): number {
    return value.trim().length;
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  // ---------- logo ----------

  protected async onLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const problem = logoFileError(file);
    if (problem) {
      this.logoError.set(problem);
      return;
    }
    this.logoError.set('');
    this.uploadPercent.set(0);
    try {
      const url = await this.repository.uploadLogo(this.partnerId() ?? this.newId() ?? '', file, (p) => this.uploadPercent.set(p));
      this.patch({ logoUrl: url });
    } catch (error) {
      this.logoError.set(clubErrorMessage(error));
    } finally {
      this.uploadPercent.set(null);
    }
  }

  // ---------- salvar / excluir ----------

  protected async save(): Promise<void> {
    this.submitted.set(true);
    this.actionError.set('');
    if (Object.keys(this.errors()).length > 0) {
      this.actionError.set('Confira os campos destacados.');
      return;
    }
    const payload = this.payload();
    const existingId = this.partnerId();
    const id = existingId ?? this.newId();
    if (!id) {
      this.actionError.set('O nome precisa ter letras ou números: o id do parceiro sai dele.');
      return;
    }
    this.saving.set(true);
    try {
      if (existingId === null) {
        await this.repository.createPartner(id, payload);
      } else {
        await this.repository.updatePartner(id, payload);
      }
      this.savedJson.set(JSON.stringify(payload));
      this.savedName.set(payload.name);
      this.submitted.set(false);
      this.touched.set(new Set());
      this.showNotice(this.savedMessage(existingId === null, payload.active));
      if (existingId === null) {
        this.partnerId.set(id);
        this.existingIds.update((s) => new Set([...s, id]));
        await this.router.navigate(['/painel/clube/parceiros', id], { replaceUrl: true });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'PartnerExistsError') {
        // Outra pessoa criou o mesmo id agora: o próximo slug livre já vale no próximo clique.
        this.existingIds.update((s) => new Set([...s, id]));
        this.actionError.set(`Já existe um parceiro com o id "${id}". Salve de novo para criar como "${this.newId()}".`);
      } else {
        this.actionError.set(clubErrorMessage(error));
      }
    } finally {
      this.saving.set(false);
    }
  }

  private savedMessage(created: boolean, active: boolean): string {
    if (!active) return created ? 'Parceiro criado, desligado: ainda não aparece no app.' : 'Alterações salvas. O parceiro está desligado.';
    return created ? 'Parceiro criado. Já aparece no clube do app.' : 'Alterações salvas. O app já mostra a versão nova.';
  }

  protected openDelete(): void {
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  protected async remove(): Promise<void> {
    const id = this.partnerId();
    if (id === null) return;
    this.saving.set(true);
    this.deleteError.set(null);
    try {
      await this.repository.deletePartner(id);
      // Nada mais a salvar: sai sem o "Sair sem salvar?".
      this.savedJson.set(JSON.stringify(this.payload()));
      this.deleteOpen.set(false);
      await this.router.navigate(['/painel/clube']);
    } catch (error) {
      this.deleteError.set(clubErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private showNotice(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(''), 4000);
  }

  // ---------- sair com alteração ----------

  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty() || this.state() !== 'ok') return true;
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve) => (this.leaveResolver = resolve));
  }

  protected resolveLeave(ok: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolver?.(ok);
    this.leaveResolver = null;
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() && this.state() === 'ok') event.preventDefault();
  }
}
