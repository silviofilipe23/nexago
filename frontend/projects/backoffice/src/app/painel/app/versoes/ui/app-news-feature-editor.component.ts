import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { callableErrorMessage } from '../../../data/callable-error';
import { readImageSize, type ImageSize } from '../../../loja/campanhas/data/campaign-image';
import { FieldComponent } from '../../../ui/field.component';
import { IconComponent } from '../../../ui/icon.component';
import { ToggleComponent } from '../../../ui/toggle.component';
import { artFileError } from '../../novidades/data/home-banner-image';
import {
  CTA_MAX,
  DESCRIPTION_MAX,
  DESTINATIONS,
  ICONS,
  MAX_STEPS,
  STEP_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
  WHERE_MAX,
  featureIssue,
  featureWarning,
  type AppNewsIcon,
  type FeatureDraft,
} from '../data/app-news';
import { NEWS_ART_HEIGHT, NEWS_ART_SPEC, NEWS_ART_WIDTH, newsArtSizeCheck } from '../data/app-news-image';
import { AppNewsRepository } from '../data/app-news.repository';

/**
 * Os campos de uma funcionalidade, abertos embaixo da linha dela. Não grava: emite a
 * funcionalidade inteira a cada mudança e a tela guarda no rascunho da versão.
 */
@Component({
  selector: 'bo-app-news-feature-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent, IconComponent, ToggleComponent],
  template: `
    <div class="editor">
      @if (issue(); as text) {
        <p class="issue" [class.soft]="!published()" role="alert"><bo-icon name="alert" [size]="13" />{{ text }}</p>
      } @else if (warning(); as text) {
        <p class="warn">{{ text }}</p>
      }

      <div class="two">
        <bo-field label="Título" hint="2–3 palavras. O nome da funcionalidade.">
          <span class="counted">
            <input class="bo-input" [class.invalid]="over(feature().title, titleMax)" [value]="feature().title" [disabled]="disabled()" (input)="patch({ title: text($event) })" />
            <span class="count" [class.over]="over(feature().title, titleMax)">{{ size(feature().title) }}/{{ titleMax }}</span>
          </span>
        </bo-field>
        <bo-field label="Texto do botão" [hint]="feature().destination === null ? 'Sem botão: só informativa.' : 'Um verbo: Abrir mapa, Ver convites.'">
          <span class="counted">
            <input
              class="bo-input"
              placeholder="Abrir mapa"
              [class.invalid]="over(feature().ctaLabel, ctaMax)"
              [value]="feature().ctaLabel"
              [disabled]="disabled() || feature().destination === null"
              (input)="patch({ ctaLabel: text($event) })"
            />
            <span class="count" [class.over]="over(feature().ctaLabel, ctaMax)">{{ size(feature().ctaLabel) }}/{{ ctaMax }}</span>
          </span>
        </bo-field>
      </div>

      <bo-field label="Resumo · lista e stories" hint="Uma linha com o benefício para o atleta.">
        <span class="counted">
          <input class="bo-input" [class.invalid]="over(feature().summary, summaryMax)" [value]="feature().summary" [disabled]="disabled()" (input)="patch({ summary: text($event) })" />
          <span class="count" [class.over]="over(feature().summary, summaryMax)">{{ size(feature().summary) }}/{{ summaryMax }}</span>
        </span>
      </bo-field>

      <bo-field label="Descrição · tela de detalhe" hint="O que é e por que o atleta vai querer usar. Vazia, o detalhe repete o resumo.">
        <span class="counted area-wrap">
          <textarea
            class="bo-input area"
            rows="3"
            placeholder="O que é e por que o atleta vai querer usar."
            [class.invalid]="over(feature().description, descriptionMax)"
            [value]="feature().description"
            [disabled]="disabled()"
            (input)="patch({ description: text($event) })"
          ></textarea>
          <span class="count" [class.over]="over(feature().description, descriptionMax)">{{ size(feature().description) }}/{{ descriptionMax }}</span>
        </span>
      </bo-field>

      <div class="group">
        <span class="label">Como funciona · até {{ maxSteps }} passos</span>
        @for (step of feature().steps; track $index; let i = $index) {
          <div class="step">
            <span class="dot" [class.first]="i === 0">{{ i + 1 }}</span>
            <input
              class="bo-input step-input"
              placeholder="Passo"
              [attr.aria-label]="'Passo ' + (i + 1)"
              [class.invalid]="over(step, stepMax)"
              [value]="step"
              [disabled]="disabled()"
              (input)="setStep(i, text($event))"
            />
            <button type="button" class="icon-btn" [attr.aria-label]="'Remover passo ' + (i + 1)" [disabled]="disabled()" (click)="removeStep(i)">✕</button>
          </div>
        }
        @if (feature().steps.length < maxSteps) {
          <button type="button" class="add-step" [disabled]="disabled()" (click)="addStep()">
            <bo-icon name="plus" [size]="13" />
            Adicionar passo
          </button>
        }
      </div>

      <bo-field label="Onde encontrar" hint="O caminho no app, com ›.">
        <span class="counted">
          <input class="bo-input" placeholder="Início › Ações rápidas" [class.invalid]="over(feature().where, whereMax)" [value]="feature().where" [disabled]="disabled()" (input)="patch({ where: text($event) })" />
          <span class="count" [class.over]="over(feature().where, whereMax)">{{ size(feature().where) }}/{{ whereMax }}</span>
        </span>
      </bo-field>

      <div class="group">
        <span class="label">Botão abre</span>
        <div class="chips" role="radiogroup" aria-label="Botão abre">
          <button type="button" role="radio" class="chip" [attr.aria-checked]="feature().destination === null" [class.on]="feature().destination === null" [disabled]="disabled()" (click)="patch({ destination: null })">
            Sem botão
          </button>
          @for (d of destinations; track d.id) {
            <button type="button" role="radio" class="chip" [attr.aria-checked]="feature().destination === d.id" [class.on]="feature().destination === d.id" [disabled]="disabled()" (click)="patch({ destination: d.id })">
              {{ d.label }}
            </button>
          }
        </div>
        @if (feature().destination === 'url') {
          <bo-field label="Endereço" hint="https://… — abre fora do app, no navegador.">
            <input class="bo-input mono" placeholder="https://" [value]="feature().url ?? ''" [disabled]="disabled()" (input)="patch({ url: text($event).trim() || null })" />
          </bo-field>
        }
      </div>

      <div class="group">
        <span class="label">Ícone · lista e espaço sem imagem</span>
        <div class="chips" role="radiogroup" aria-label="Ícone">
          <button type="button" role="radio" class="chip" [attr.aria-checked]="feature().icon === null" [class.on]="feature().icon === null" [disabled]="disabled()" (click)="setIcon(null)">
            O do destino
          </button>
          @for (ic of icons; track ic.id) {
            <button type="button" role="radio" class="chip" [attr.aria-checked]="feature().icon === ic.id" [class.on]="feature().icon === ic.id" [disabled]="disabled()" (click)="setIcon(ic.id)">
              {{ ic.label }}
            </button>
          }
        </div>
      </div>

      <div class="group">
        <span class="label">Imagem · tela da funcionalidade · {{ artWidth }}×{{ artHeight }} px</span>
        <div class="art-row">
          <div class="art" [class.has-image]="feature().imageUrl" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
            @if (feature().imageUrl; as img) {
              <img [src]="img" alt="Imagem da funcionalidade" (load)="onImageLoad($event)" />
            } @else {
              <span class="art-empty">Arraste aqui</span>
            }
            @if (uploadProgress() !== null) {
              <div class="bar" aria-label="Enviando imagem"><span [style.width.%]="uploadProgress()"></span></div>
            }
          </div>
          <div class="art-side">
            <div class="art-actions">
              <label class="bo-mini-btn" [class.disabled]="busy()">
                <bo-icon name="camera" [size]="13" />
                {{ feature().imageUrl ? 'Trocar' : 'Enviar imagem' }}
                <input type="file" hidden accept="image/jpeg,image/png,image/webp" [disabled]="busy()" (change)="onPick($event)" />
              </label>
              @if (feature().imageUrl) {
                <button type="button" class="bo-mini-btn" [disabled]="busy()" (click)="removeImage()">Remover</button>
              }
            </div>
            <span class="hint spec">{{ artSpec }}</span>
            @if (uploadError(); as err) {
              <span class="hint err" role="alert">{{ err }}</span>
            } @else if (imageWarning(); as warn) {
              <span class="hint warn">{{ warn }}</span>
            } @else {
              <span class="hint">Sem imagem, o app mostra o ícone num espaço reservado.</span>
            }
          </div>
        </div>
      </div>

      <div class="toggle-row">
        <span>
          <strong>Mostrar nos stories pós-atualização</strong>
          <span class="dim">Desligado: aparece só na tela de Novidades.</span>
        </span>
        <bo-toggle ariaLabel="Mostrar nos stories" [checked]="feature().stories" [disabled]="disabled()" (checkedChange)="patch({ stories: $event })" />
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .editor { padding: 6px 16px 18px 44px; display: flex; flex-direction: column; gap: 16px; }
    @media (max-width: 760px) { .editor { padding-left: 16px; } }
    .issue, .warn { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 11.5px; line-height: 1.4; }
    .issue { color: var(--nx-live); }
    .issue.soft { color: var(--nx-pending); }
    .warn { color: var(--nx-pending); }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 560px) { .two { grid-template-columns: 1fr; } }

    .counted { position: relative; display: block; }
    .counted .bo-input { padding-right: 58px; }
    .count { position: absolute; right: 12px; top: 13px; font-family: var(--nx-font-mono); font-size: 10.5px; color: var(--nx-text-dim); pointer-events: none; }
    .count.over { color: var(--nx-live); }
    .area-wrap .count { top: auto; bottom: 10px; }
    .bo-input.area { height: auto; min-height: 84px; padding: 11px 58px 11px 13px; resize: vertical; line-height: 1.45; font-family: var(--nx-font-ui); }
    .bo-input.invalid { border-color: rgba(255, 59, 48, 0.6); }
    .mono { font-family: var(--nx-font-mono); letter-spacing: 0.02em; }

    .group { display: flex; flex-direction: column; gap: 8px; }
    .label { font-family: var(--nx-font-mono); font-size: 9.5px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--nx-text-dim); }
    .step { display: flex; align-items: center; gap: 10px; }
    .dot { flex: none; width: 26px; height: 26px; border-radius: var(--nx-r-pill); display: grid; place-items: center; background: var(--nx-surface-2); color: var(--nx-text); font-family: var(--nx-font-display); font-weight: 800; font-size: 12px; }
    .dot.first { background: var(--nx-orange-500); color: #0a0a0a; }
    .step-input { height: 38px; font-size: 13px; }
    .icon-btn { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid var(--nx-line); border-radius: 8px; background: transparent; color: var(--nx-text-mute); cursor: pointer; font-size: 11px; }
    .icon-btn:hover:not(:disabled) { color: var(--nx-text); background: var(--nx-surface-2); }
    .icon-btn:disabled { opacity: 0.4; cursor: default; }
    .add-step { align-self: flex-start; margin-left: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 0; border: none; background: none; color: var(--nx-orange-500); font-family: var(--nx-font-display); font-weight: 600; font-size: 12.5px; cursor: pointer; }

    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { height: 30px; padding: 0 12px; border-radius: var(--nx-r-pill); border: 1px solid var(--nx-line-strong); background: transparent; color: var(--nx-text-mute); font-family: var(--nx-font-display); font-weight: 600; font-size: 12px; cursor: pointer; }
    .chip:hover:not(:disabled) { color: var(--nx-text); }
    .chip.on { border-color: rgba(255, 106, 26, 0.6); background: rgba(255, 106, 26, 0.12); color: var(--nx-text); }
    .chip:disabled { cursor: default; }

    .art-row { display: flex; gap: 16px; align-items: flex-start; }
    /* Na proporção do detalhe do app (1170×1140): o que aparece aqui é o recorte de lá. */
    .art { position: relative; flex: none; width: 128px; height: 125px; border-radius: 14px; overflow: hidden; border: 1px dashed var(--nx-line-strong); background: repeating-linear-gradient(135deg, rgba(255, 106, 26, 0.1) 0 7px, rgba(255, 106, 26, 0.03) 7px 14px); display: grid; place-items: center; }
    .art.has-image { border-style: solid; border-color: var(--nx-line); }
    .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .art-empty { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--nx-text-dim); }
    .bar { position: absolute; left: 10px; right: 10px; bottom: 10px; height: 4px; border-radius: var(--nx-r-pill); background: rgba(255, 255, 255, 0.15); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--nx-orange-500); transition: width 120ms linear; }
    .art-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
    .art-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .art-actions label { cursor: pointer; }
    .art-actions label.disabled { opacity: 0.5; pointer-events: none; }
    .hint { font-size: 11px; line-height: 1.35; color: var(--nx-text-dim); }
    .hint.spec { color: var(--nx-text-mute); }
    .hint.err { color: var(--nx-live); }
    .hint.warn { color: var(--nx-orange-500); }

    .toggle-row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: var(--nx-r-2); background: var(--nx-surface-0); border: 1px solid var(--nx-line); }
    .toggle-row > span { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .toggle-row strong { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .dim { font-size: 11.5px; color: var(--nx-text-dim); }
  `,
})
export class AppNewsFeatureEditorComponent {
  private readonly repository = inject(AppNewsRepository);

  readonly feature = input.required<FeatureDraft>();
  /** A versão está publicada: o que falta vira erro (impede salvar), não só pendência. */
  readonly published = input(false);
  readonly disabled = input(false);

  readonly changed = output<FeatureDraft>();

  protected readonly titleMax = TITLE_MAX;
  protected readonly summaryMax = SUMMARY_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  protected readonly ctaMax = CTA_MAX;
  protected readonly whereMax = WHERE_MAX;
  protected readonly stepMax = STEP_MAX;
  protected readonly maxSteps = MAX_STEPS;
  protected readonly destinations = DESTINATIONS;
  protected readonly icons = ICONS;
  protected readonly artWidth = NEWS_ART_WIDTH;
  protected readonly artHeight = NEWS_ART_HEIGHT;
  protected readonly artSpec = NEWS_ART_SPEC;

  protected readonly uploadProgress = signal<number | null>(null);
  protected readonly uploadError = signal('');
  protected readonly imageSize = signal<ImageSize | null>(null);

  protected readonly busy = computed(() => this.disabled() || this.uploadProgress() !== null);
  /** Sempre pela regra de publicar: no rascunho é o que falta, na publicada é o que impede salvar. */
  protected readonly issue = computed(() => featureIssue(this.feature(), true));
  protected readonly warning = computed(() => featureWarning(this.feature()));
  protected readonly imageWarning = computed(() => {
    const size = this.imageSize();
    return size && this.feature().imageUrl ? newsArtSizeCheck(size).warning : null;
  });

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected size(value: string): number {
    return value.trim().length;
  }

  protected over(value: string, max: number): boolean {
    return value.trim().length > max;
  }

  protected patch(change: Partial<FeatureDraft>): void {
    const next = { ...this.feature(), ...change };
    // Link só vale com destino externo; trocar de destino não deixa um link esquecido para trás.
    if (change.destination !== undefined && change.destination !== 'url') {
      next.url = null;
    }
    this.changed.emit(next);
  }

  protected setIcon(icon: AppNewsIcon | null): void {
    this.patch({ icon });
  }

  protected setStep(index: number, value: string): void {
    this.patch({ steps: this.feature().steps.map((s, i) => (i === index ? value : s)) });
  }

  protected addStep(): void {
    this.patch({ steps: [...this.feature().steps, ''] });
  }

  protected removeStep(index: number): void {
    this.patch({ steps: this.feature().steps.filter((_, i) => i !== index) });
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void this.upload(file);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file && !this.busy()) {
      void this.upload(file);
    }
  }

  protected onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.imageSize.set({ width: img.naturalWidth, height: img.naturalHeight });
  }

  protected removeImage(): void {
    this.imageSize.set(null);
    this.patch({ imageUrl: null });
  }

  /** Confere tipo, bytes e pixels antes de subir: imagem pequena demais nem chega ao Storage. */
  private async upload(file: File): Promise<void> {
    if (this.uploadProgress() !== null) {
      return;
    }
    const problem = artFileError(file);
    this.uploadError.set(problem ?? '');
    if (problem) {
      return;
    }
    this.uploadProgress.set(0);
    try {
      const size = await readImageSize(file).catch(() => null);
      if (!size) {
        this.uploadError.set('Não foi possível ler a imagem. Tente outro arquivo.');
        return;
      }
      const tooSmall = newsArtSizeCheck(size).error;
      if (tooSmall) {
        this.uploadError.set(tooSmall);
        return;
      }
      const url = await this.repository.uploadImage(file, (p) => this.uploadProgress.set(p));
      this.imageSize.set(size);
      this.patch({ imageUrl: url });
    } catch (error) {
      this.uploadError.set(`Não foi possível enviar a imagem. ${callableErrorMessage(error)}`);
    } finally {
      this.uploadProgress.set(null);
    }
  }
}
