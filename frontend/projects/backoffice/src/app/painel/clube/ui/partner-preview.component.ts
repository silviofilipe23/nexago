import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CATEGORY_LABELS, textOnColor, type PartnerPayload } from '../data/partner';
import { TERMS_TAG_LABELS, defaultRequirementLabel, outsideWindow, partnerBadges } from '../data/partner-premium';
import { PartnerLogoComponent } from './partner-logo.component';

/** Formato do código por atleta (`NEXA-` + 4 do uid); cada atleta vê o seu. */
const ATHLETE_CODE_SAMPLE = 'NEXA-A1B2';

/**
 * Prévia da tela do parceiro no app (`/clube/:partnerId`): capa (ou a cor da marca), selos
 * (Destaque, Novo, Termina em), benefício, cupom, "Como usar", termos e o botão fixo no pé. Com
 * requisito, mostra o estado bloqueado (cadeado, texto do bloqueio, sem cupom). As cores são as do
 * app (tema escuro), não as do painel.
 */
@Component({
  selector: 'bo-partner-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PartnerLogoComponent],
  template: `
    @if (locked()) {
      <div class="modes" role="group" aria-label="Estado da prévia">
        <button type="button" class="bo-chip" [class.active]="!showUnlocked()" [attr.aria-pressed]="!showUnlocked()" (click)="showUnlocked.set(false)">Bloqueado</button>
        <button type="button" class="bo-chip" [class.active]="showUnlocked()" [attr.aria-pressed]="showUnlocked()" (click)="showUnlocked.set(true)">Quem pode usar</button>
      </div>
    }
    <div class="phone" aria-label="Prévia no app">
      @if (p().coverUrl; as cover) {
        <div class="cover"><img [src]="cover" alt="" /></div>
      }
      <div class="hero" [style.background]="p().brandColor" [style.color]="ink()">
        @if (badges().length > 0) {
          <div class="badges">
            @for (b of badges(); track b) {
              <span class="badge">{{ b }}</span>
            }
          </div>
        }
        @if (p().isMasterSponsor) {
          <span class="sponsor">Patrocinador oficial</span>
        }
        <div class="id">
          <bo-partner-logo [name]="name()" [color]="p().brandColor" [logoUrl]="p().logoUrl" [size]="52" [inverse]="true" />
          <div class="who">
            <div class="nm">{{ name() }}</div>
            <div class="ct">{{ place() }}</div>
          </div>
        </div>
      </div>

      <div class="scroll">
        <div class="ben">
          @if (p().benefitHighlight) {
            <span class="big">{{ p().benefitHighlight }}</span>
          }
          <span class="bt">{{ p().benefitTitle || 'O benefício aparece aqui' }}</span>
        </div>
        @if (p().description) {
          <p class="desc">{{ p().description }}</p>
        }

        @if (blocked()) {
          <div class="locked">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span>{{ lockText() }}</span>
          </div>
        } @else if (code(); as c) {
          <div class="code">
            <div>
              <div class="label">{{ p().couponMode === 'athlete' ? 'Seu código' : 'Seu cupom' }}</div>
              <div class="cv">{{ c }}</div>
            </div>
            <span class="copy">Copiar</span>
          </div>
        }

        <div class="label">Como usar</div>
        @if (p().howToUse.length > 0) {
          <ol class="steps">
            @for (step of p().howToUse; track $index) {
              <li><i>{{ $index + 1 }}</i><span>{{ step }}</span></li>
            }
          </ol>
        } @else {
          <p class="muted">Vazio: o app mostra os passos padrão do tipo de botão.</p>
        }

        @if (p().termsTags.length > 0) {
          <div class="tags">
            @for (t of p().termsTags; track t) {
              <span>{{ tagLabels[t] }}</span>
            }
          </div>
        }
        @if (p().terms) {
          <div class="terms">Termos e condições <span aria-hidden="true">›</span></div>
        }
      </div>

      <div class="bar">
        @if (blocked()) {
          <span class="cta off">Benefício bloqueado</span>
          <span class="hint">O botão aparece só para quem cumpre o requisito</span>
        } @else {
          <span class="cta">{{ p().ctaLabel || 'Texto do botão' }}</span>
          <span class="hint">{{ p().ctaType === 'link' ? 'Abre o link do parceiro' : 'Abre o formulário de contato' }}</span>
        }
      </div>
    </div>
    <div class="caption">
      Prévia no app
      @if (!p().active) {
        · desligado
      }
      @if (p().audience === 'testers') {
        · só quem testa
      }
      @if (windowNote(); as w) {
        · {{ w }}
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .modes { display: flex; gap: 6px; justify-content: center; margin-bottom: 10px; }
    .cover { aspect-ratio: 16 / 9; background: #111; }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .badge { padding: 3px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.3); color: #fff; font-family: var(--nx-font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .locked { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.04); font-size: 12.5px; color: rgba(244, 244, 245, 0.85); }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tags span { padding: 4px 9px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.14); font-size: 10.5px; color: rgba(244, 244, 245, 0.75); }
    .cta.off { background: rgba(255, 255, 255, 0.08); color: rgba(244, 244, 245, 0.6); }
    .phone { border-radius: 22px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1); background: #050505; color: #f4f4f5; font-family: var(--nx-font-ui); }
    .hero { padding: 18px 16px 20px; display: flex; flex-direction: column; gap: 10px; }
    .sponsor { align-self: flex-start; padding: 3px 8px; border-radius: 999px; background: rgba(0, 0, 0, 0.25); font-family: var(--nx-font-mono); font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #fff; }
    .id { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .who { min-width: 0; }
    .nm { font-family: var(--nx-font-display); font-weight: 800; font-size: 18px; line-height: 1.15; overflow-wrap: anywhere; }
    .ct { margin-top: 3px; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.8; }
    .scroll { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
    .ben { display: flex; flex-direction: column; gap: 4px; }
    .big { font-family: var(--nx-font-display); font-weight: 800; font-size: 24px; line-height: 1.1; color: #2bd17e; overflow-wrap: anywhere; }
    .bt { font-size: 13px; font-weight: 600; color: #f4f4f5; overflow-wrap: anywhere; }
    .desc { margin: 0; font-size: 12px; line-height: 1.5; color: rgba(244, 244, 245, 0.7); white-space: pre-line; overflow-wrap: anywhere; }
    .code { display: flex; align-items: center; justify-content: space-between; gap: 10px; border: 1.5px dashed rgba(255, 106, 26, 0.6); border-radius: 12px; padding: 10px 12px; }
    .cv { font-family: var(--nx-font-mono); font-weight: 700; letter-spacing: 0.08em; font-size: 14px; overflow-wrap: anywhere; }
    .copy { font-size: 12px; font-weight: 600; color: rgba(244, 244, 245, 0.8); }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(244, 244, 245, 0.55); }
    .steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .steps li { display: flex; gap: 10px; font-size: 12px; line-height: 1.45; color: rgba(244, 244, 245, 0.85); }
    .steps i { flex: none; width: 20px; height: 20px; border-radius: 50%; background: rgba(255, 106, 26, 0.15); color: #ff8a4a; font-style: normal; font-family: var(--nx-font-mono); font-size: 10.5px; font-weight: 700; display: grid; place-items: center; }
    .steps span { overflow-wrap: anywhere; }
    .muted { margin: 0; font-size: 11.5px; color: rgba(244, 244, 245, 0.5); }
    .terms { display: flex; justify-content: space-between; padding: 10px 0 2px; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 12.5px; color: rgba(244, 244, 245, 0.75); }
    .bar { padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
    .cta { height: 44px; border-radius: 12px; background: #ff6a1a; color: #0a0a0a; font-family: var(--nx-font-display); font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; padding: 0 12px; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .hint { text-align: center; font-size: 10.5px; color: rgba(244, 244, 245, 0.45); }
    .caption { margin-top: 8px; font-family: var(--nx-font-mono); font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); text-align: center; }
  `,
})
export class PartnerPreviewComponent {
  readonly partner = input.required<PartnerPayload>();
  /** Data de criação gravada (selo "Novo"); `unsaved` = parceiro ainda não criado (conta como novo). */
  readonly createdAt = input<Date | null>(null);
  readonly unsaved = input(false);

  protected readonly p = this.partner;
  protected readonly tagLabels = TERMS_TAG_LABELS;
  protected readonly showUnlocked = signal(false);
  protected readonly locked = computed(() => this.p().requirement.type !== 'none');
  protected readonly blocked = computed(() => this.locked() && !this.showUnlocked());
  protected readonly lockText = computed(
    () => this.p().requirementLabel || defaultRequirementLabel(this.p().requirement) || 'Benefício exclusivo',
  );
  protected readonly badges = computed(() =>
    partnerBadges({ createdAt: this.createdAt(), validUntil: this.p().validUntil, featured: this.p().featured }, new Date(), this.unsaved()),
  );
  protected readonly windowNote = computed(() => {
    const out = outsideWindow(this.p().startsAt, this.p().validUntil, new Date());
    if (out === 'before') return 'ainda não começou';
    return out === 'after' ? 'já terminou' : null;
  });
  protected readonly name = computed(() => this.p().name || 'Nome do parceiro');
  protected readonly ink = computed(() => textOnColor(this.p().brandColor));
  protected readonly place = computed(() => {
    const p = this.p();
    const cities = p.cities.length === 0 ? 'Todas as cidades' : p.cities.slice(0, 2).join(', ') + (p.cities.length > 2 ? '…' : '');
    return `${CATEGORY_LABELS[p.category]} · ${cities}`;
  });
  /** Cupom fixo mostra o código; por atleta, um exemplo do formato (`NEXA-` + 4 do uid). */
  protected readonly code = computed(() => {
    const p = this.p();
    if (p.couponMode === 'fixed') return p.couponCode || (p.requirement.type !== 'none' ? 'CUPOM PRIVADO' : 'CÓDIGO');
    if (p.couponMode === 'athlete') return ATHLETE_CODE_SAMPLE;
    return null;
  });
}
