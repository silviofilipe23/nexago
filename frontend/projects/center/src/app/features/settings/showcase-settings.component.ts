import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CenterContextService } from '../../core/center-context.service';
import { CenterActions } from '../../data/actions/center.actions';
import { writeErrorMessage } from '../../data/actions/actor';
import {
  EMPTY_SHOWCASE,
  SHOWCASE_DESCRIPTION_MAX,
  SHOWCASE_TRIAL_NOTE_MAX,
  parseReais,
  showcaseError,
  trialLabel,
  type CenterShowcase,
  type CenterTrial,
} from '../../domain/showcase';
import { ToggleComponent } from '../../ui/kit';

/** Configurações › Vitrine no app — capa, descrição e aula experimental que o atleta vê em
 *  Hub › Aulas e treinos. Grava o campo `showcase` do centro (rules: só owner/admin). */
@Component({
  selector: 'ct-showcase-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToggleComponent],
  template: `
    <div class="ct-grid-aside">
      <div class="col">
        <div class="ct-card">
          <div class="ct-card-head">
            <div class="ct-grow">
              <div class="ct-kick">App do atleta</div>
              <div class="ct-card-title">Capa e descrição</div>
            </div>
          </div>
          <div class="ct-field wide">
            <label>Capa</label>
            <div class="cover" [class.empty]="!draft().coverUrl">
              @if (draft().coverUrl; as url) {
                <img [src]="url" alt="Capa da vitrine do centro" />
              } @else {
                <span>Sem capa — o app usa uma arte padrão</span>
              }
            </div>
            @if (editable()) {
              <div class="row">
                <button type="button" class="ct-mini-btn" [disabled]="uploading() || busy()" (click)="file.click()">
                  {{ uploading() ? 'Enviando…' : draft().coverUrl ? 'Trocar capa' : 'Enviar capa' }}
                </button>
                @if (draft().coverUrl) {
                  <button type="button" class="ct-ghost-btn" [disabled]="uploading() || busy()" (click)="patch({ coverUrl: null })">Remover</button>
                }
                <input #file type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="onFile($event)" />
              </div>
            }
            <span class="ct-dim hint">Foto na horizontal, de preferência com gente treinando. JPG, PNG ou WebP até 5 MB.</span>
          </div>
          <div class="ct-field wide">
            <label for="sc-desc">Descrição</label>
            <textarea id="sc-desc" class="ct-input" rows="4" [attr.maxlength]="descriptionMax" [disabled]="!editable()" [value]="draft().description"
              placeholder="Ex.: Treino de alto rendimento em vôlei de praia: técnica, físico e jogo, com avaliação de entrada."
              (input)="patch({ description: value($event) })"></textarea>
            <span class="ct-dim hint counter">{{ draft().description.length }}/{{ descriptionMax }}</span>
          </div>
        </div>

        <div class="ct-card">
          <div class="ct-card-head">
            <div class="ct-grow">
              <div class="ct-kick">App do atleta</div>
              <div class="ct-card-title">Aula experimental</div>
            </div>
            <ct-toggle label="Oferecer aula experimental" [on]="draft().trial.enabled" [disabled]="!editable()" (onChange)="patchTrial({ enabled: $event })" />
          </div>
          <p class="ct-muted lead">Aparece no card e no detalhe do centro, e o atleta pode filtrar por "Experimental grátis". O pedido chega pelo WhatsApp do centro.</p>
          <div class="ct-form-grid" [class.off]="!draft().trial.enabled">
            <div class="ct-field">
              <label for="sc-price">Valor (R$)</label>
              <input id="sc-price" class="ct-input mono" inputmode="decimal" [disabled]="!editable() || !draft().trial.enabled" [value]="priceText()" (input)="setPrice(value($event))" />
              <span class="ct-dim hint">Deixe 0 para grátis.</span>
            </div>
            <div class="ct-field">
              <label for="sc-note">Observação</label>
              <input id="sc-note" class="ct-input" [attr.maxlength]="noteMax" [disabled]="!editable() || !draft().trial.enabled" [value]="draft().trial.note"
                placeholder="Ex.: abatida na 1ª mensalidade" (input)="patchTrial({ note: value($event) })" />
            </div>
          </div>
        </div>

        @if (editable()) {
          <div class="save">
            <button type="button" class="ct-mini-btn ct-mini-btn-primary" [disabled]="busy() || uploading() || !dirty() || !!formError()" (click)="save()">
              {{ busy() ? 'Salvando…' : 'Salvar vitrine' }}
            </button>
            @if (dirty()) {
              <button type="button" class="ct-ghost-btn" [disabled]="busy()" (click)="discard()">Descartar</button>
            }
            @if (formError(); as fe) {
              <span class="ct-error-text">{{ fe }}</span>
            } @else if (error()) {
              <span class="ct-error-text">{{ error() }}</span>
            } @else if (saved()) {
              <span class="ok">Vitrine salva. O app já mostra a nova versão.</span>
            }
          </div>
        }
      </div>

      <div class="ct-card">
        <div class="ct-card-head">
          <div class="ct-grow">
            <div class="ct-kick">Prévia</div>
            <div class="ct-card-title">Como aparece no app</div>
          </div>
        </div>
        <div class="phone">
          <div class="hero" [style.background-image]="previewCover()">
            <div class="veil"></div>
            <div class="hero-text">
              <div class="kicker">CENTRO DE TREINAMENTO</div>
              <div class="name">{{ centerName() }}</div>
              @if (draft().description.trim(); as d) {
                <div class="desc">{{ d }}</div>
              }
            </div>
          </div>
          <div class="trial" [class.on]="draft().trial.enabled">
            <span>{{ trialText() }}</span>
            @if (draft().trial.enabled && draft().trial.note.trim()) {
              <small>{{ draft().trial.note.trim() }}</small>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .ct-field { margin-top: 12px; }
    .cover { aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; border: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover.empty { display: grid; place-items: center; border-style: dashed; }
    .cover.empty span { font-size: 12.5px; color: var(--nx-text-dim); padding: 0 16px; text-align: center; }
    .row { display: flex; gap: 8px; margin-top: 10px; }
    .hint { display: block; font-size: 11.5px; margin-top: 6px; }
    .counter { text-align: right; }
    .lead { font-size: 12.5px; margin: 8px 0 0; }
    .off { opacity: 0.5; }
    .save { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .ok { font-size: 12.5px; color: var(--nx-win); }
    /* Prévia sempre escura, como no app. */
    .phone { max-width: 320px; margin: 14px auto 0; border-radius: 22px; overflow: hidden; background: #050505; border: 1px solid var(--nx-line); }
    .hero { position: relative; height: 260px; background: #100c16 center / cover no-repeat; }
    .veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,5,5,.5) 0%, rgba(5,5,5,0) 25%, rgba(5,5,5,.25) 50%, rgba(5,5,5,.92) 84%, #050505 100%); }
    .hero-text { position: absolute; left: 18px; right: 18px; bottom: 14px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: .24em; color: #c9a8ff; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 24px; letter-spacing: -.03em; color: #fff; margin-top: 6px; }
    .desc { font-size: 11.5px; line-height: 1.45; color: rgba(255,255,255,.7); margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .trial { margin: 12px 14px 16px; padding: 10px 14px; border-radius: 16px; background: rgba(255,255,255,.06); color: rgba(255,255,255,.45); font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
    .trial.on { color: #7fe3b0; }
    .trial small { color: rgba(255,255,255,.55); font-size: 11px; }
  `,
})
export class ShowcaseSettingsComponent {
  private readonly ctx = inject(CenterContextService);
  private readonly actions = inject(CenterActions);

  readonly editable = input(false);

  protected readonly descriptionMax = SHOWCASE_DESCRIPTION_MAX;
  protected readonly noteMax = SHOWCASE_TRIAL_NOTE_MAX;

  /** O que está gravado (chega ao vivo pelo contexto do centro). */
  private readonly stored = computed(() => this.ctx.center()?.showcase ?? EMPTY_SHOWCASE);
  protected readonly draft = signal<CenterShowcase>(EMPTY_SHOWCASE);
  protected readonly priceText = signal('0');
  protected readonly busy = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal('');
  protected readonly saved = signal(false);

  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.stored()));
  protected readonly formError = computed(() => showcaseError(this.draft()));
  protected readonly trialText = computed(() => trialLabel(this.draft().trial));
  protected readonly centerName = computed(() => this.ctx.center()?.name ?? 'Seu centro');
  protected readonly previewCover = computed(() => {
    const url = this.draft().coverUrl;
    return url ? `url("${url}")` : 'none';
  });

  constructor() {
    // Carrega o gravado quando chega (ou muda em outra aba) e não há edição pendente.
    effect(() => {
      const s = this.stored();
      if (!this.busy()) this.reset(s);
    });
  }

  private reset(s: CenterShowcase): void {
    this.draft.set(s);
    this.priceText.set(String(s.trial.priceReais).replace('.', ','));
  }

  protected value(ev: Event): string {
    return (ev.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected patch(change: Partial<CenterShowcase>): void {
    this.draft.update((s) => ({ ...s, ...change }));
    this.saved.set(false);
  }

  protected patchTrial(change: Partial<CenterTrial>): void {
    this.draft.update((s) => ({ ...s, trial: { ...s.trial, ...change } }));
    this.saved.set(false);
  }

  protected setPrice(raw: string): void {
    this.priceText.set(raw);
    this.patchTrial({ priceReais: parseReais(raw) });
  }

  protected discard(): void {
    this.reset(this.stored());
    this.error.set('');
  }

  protected async onFile(event: Event): Promise<void> {
    const el = event.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.error.set('');
    try {
      this.patch({ coverUrl: await this.actions.uploadShowcaseCover(file) });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar a capa.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (!this.editable() || this.formError() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.actions.updateShowcase(this.draft());
      this.saved.set(true);
    } catch (err) {
      this.error.set(writeErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}
