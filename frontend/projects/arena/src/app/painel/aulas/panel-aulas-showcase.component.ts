import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaAccessService } from '../data/arena-access.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { arenaStorage } from '../data/storage';
import { IconComponent } from '../ui/icon.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { ToggleComponent } from '../ui/toggle.component';
import { AulasPageComponent } from './aulas-ui';
import { parsePrice } from './billing.model';
import {
  EMPTY_SHOWCASE,
  SHOWCASE_DESCRIPTION_MAX,
  SHOWCASE_TRIAL_NOTE_MAX,
  fetchShowcase,
  saveShowcase,
  showcaseError,
  trialLabel,
  uploadShowcaseCover,
  type ClassShowcase,
  type ClassTrial,
} from './showcase.model';

/** Vitrine no app — capa, descrição e aula experimental que o atleta vê em Hub › Aulas e
 *  treinos. Sem capa ou descrição aqui, o app usa as do perfil da arena. */
@Component({
  selector: 'ar-panel-aulas-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AulasPageComponent, PanelCardComponent, IconComponent, ToggleComponent],
  styleUrl: './aulas-form.scss',
  template: `
    <ar-aulas-page title="Aulas" subtitle="Como suas aulas aparecem no app do atleta" tab="vitrine">
      <button page-actions type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="readOnly() || saving() || uploading() || !dirty() || !!formError()" (click)="save()">
        <ar-icon name="check" [size]="14" />
        {{ saving() ? 'Salvando…' : 'Salvar vitrine' }}
      </button>

      @if (loading()) {
        <p class="state-text">Carregando vitrine…</p>
      } @else {
        @if (error(); as err) {
          <div class="error-banner">{{ err }}</div>
        }
        @if (notice(); as n) {
          <div class="notice">{{ n }}</div>
        }
        <div class="grid">
          <div class="col">
            <ar-panel-card title="Capa e descrição">
              <div class="field-label">Capa</div>
              <div class="cover" [class.empty]="!showcase().coverUrl">
                @if (showcase().coverUrl; as url) {
                  <img [src]="url" alt="Capa da vitrine de aulas" />
                } @else {
                  <span>Sem capa — o app usa a capa do perfil da arena</span>
                }
              </div>
              <div class="cover-actions">
                <button type="button" class="ar-mini-btn" [disabled]="readOnly() || uploading()" (click)="file.click()">
                  <ar-icon name="image" [size]="14" />
                  {{ uploading() ? 'Enviando…' : showcase().coverUrl ? 'Trocar capa' : 'Enviar capa' }}
                </button>
                @if (showcase().coverUrl) {
                  <button type="button" class="ar-mini-btn" [disabled]="readOnly() || uploading()" (click)="patch({ coverUrl: null })">Remover</button>
                }
                <input #file type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="onFile($event)" />
              </div>
              <p class="hint">Foto na horizontal, de preferência com gente treinando. JPG, PNG ou WebP até 5 MB.</p>

              <div class="field-label spaced">Descrição</div>
              <textarea class="input-box" rows="4" [attr.maxlength]="descriptionMax" [disabled]="readOnly()" [value]="showcase().description"
                placeholder="Ex.: Turmas do iniciante ao avançado, professores certificados e turma kids aos sábados."
                (input)="patch({ description: $any($event.target).value })"></textarea>
              <p class="hint counter">{{ showcase().description.length }}/{{ descriptionMax }}</p>
            </ar-panel-card>

            <ar-panel-card title="Aula experimental">
              <div class="toggle-row">
                <div>
                  <div class="t-title">Oferecer aula experimental</div>
                  <div class="t-sub">Aparece no card e no detalhe da arena, e o atleta pode filtrar por "Experimental grátis"</div>
                </div>
                <ar-toggle label="Oferecer aula experimental" [checked]="showcase().trial.enabled" [disabled]="readOnly()" (changed)="patchTrial({ enabled: $event })" />
              </div>
              <div class="row-2" [class.off]="!showcase().trial.enabled">
                <div>
                  <div class="field-label">Valor (R$)</div>
                  <input class="input-box" type="text" inputmode="decimal" [disabled]="readOnly() || !showcase().trial.enabled" [value]="priceText()" (input)="setPrice($any($event.target).value)" />
                  <p class="hint">Deixe 0 para grátis.</p>
                </div>
                <div>
                  <div class="field-label">Observação</div>
                  <input class="input-box" type="text" [attr.maxlength]="noteMax" [disabled]="readOnly() || !showcase().trial.enabled" [value]="showcase().trial.note"
                    placeholder="Ex.: 1 aula · abatida na 1ª mensalidade" (input)="patchTrial({ note: $any($event.target).value })" />
                </div>
              </div>
              <p class="hint">O atleta pede a experimental pelo WhatsApp da arena; a matrícula continua sendo feita por aqui.</p>
            </ar-panel-card>
          </div>

          <ar-panel-card title="Prévia no app">
            <div class="phone">
              <div class="hero" [style.background-image]="previewCover()">
                <div class="veil"></div>
                <div class="hero-text">
                  <div class="kicker">ARENA</div>
                  <div class="name">{{ arenaName() }}</div>
                  @if (previewDescription(); as d) {
                    <div class="desc">{{ d }}</div>
                  }
                </div>
              </div>
              <div class="trial" [class.on]="showcase().trial.enabled">
                <span>{{ trialText() }}</span>
                @if (showcase().trial.enabled && showcase().trial.note.trim()) {
                  <small>{{ showcase().trial.note.trim() }}</small>
                }
              </div>
            </div>
            @if (formError(); as fe) {
              <p class="hint field-error">{{ fe }}</p>
            }
          </ar-panel-card>
        </div>
      }
    </ar-aulas-page>
  `,
  styles: `
    .state-text { font-size: 13.5px; color: var(--nx-text-mute); margin: 0; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .col { display: flex; flex-direction: column; gap: 16px; }
    .cover { aspect-ratio: 16 / 9; border-radius: var(--nx-r-2); overflow: hidden; border: 1px solid var(--nx-line); background: var(--nx-surface-1); }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover.empty { display: grid; place-items: center; border-style: dashed; }
    .cover.empty span { font-size: 12.5px; color: var(--nx-text-dim); padding: 0 16px; text-align: center; }
    .cover-actions { display: flex; gap: 8px; margin-top: 10px; }
    .counter { text-align: right; }
    .toggle-row { display: flex; align-items: center; gap: 14px; padding: 4px 0 14px; }
    .toggle-row > div { flex: 1; min-width: 0; }
    .t-title { font-family: var(--nx-font-display); font-weight: 600; font-size: 13px; color: var(--nx-text); }
    .t-sub { font-size: 12px; color: var(--nx-text-dim); margin-top: 2px; }
    .off { opacity: 0.5; }
    .field-error { color: var(--nx-live); }
    .notice {
      border-radius: var(--nx-r-2); padding: 10px 14px; font-size: 12.5px; flex: none;
      border: 1px solid rgba(43, 209, 126, 0.3); color: var(--nx-win); background: rgba(43, 209, 126, 0.08);
    }
    /* Prévia: sempre escura, como no app (a arte é escura nos dois temas). */
    .phone { max-width: 320px; margin: 0 auto; border-radius: 22px; overflow: hidden; background: #050505; border: 1px solid var(--nx-line); }
    .hero { position: relative; height: 260px; background: #120c08 center / cover no-repeat; }
    .veil { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,5,5,.5) 0%, rgba(5,5,5,0) 25%, rgba(5,5,5,.25) 50%, rgba(5,5,5,.92) 84%, #050505 100%); }
    .hero-text { position: absolute; left: 18px; right: 18px; bottom: 14px; }
    .kicker { font-family: var(--nx-font-mono); font-size: 9px; letter-spacing: .24em; color: #ff8a4a; }
    .name { font-family: var(--nx-font-display); font-weight: 700; font-size: 24px; letter-spacing: -.03em; color: #fff; margin-top: 6px; }
    .desc { font-size: 11.5px; line-height: 1.45; color: rgba(255,255,255,.7); margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .trial { margin: 12px 14px 16px; padding: 10px 14px; border-radius: 16px; background: rgba(255,255,255,.06); color: rgba(255,255,255,.45); font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
    .trial.on { color: #7fe3b0; }
    .trial small { color: rgba(255,255,255,.55); font-size: 11px; }
    @media (max-width: 1100px) { .grid { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class PanelAulasShowcaseComponent {
  private readonly arenaContext = inject(ArenaContextService);
  private readonly access = inject(ArenaAccessService);

  protected readonly descriptionMax = SHOWCASE_DESCRIPTION_MAX;
  protected readonly noteMax = SHOWCASE_TRIAL_NOTE_MAX;
  protected readonly readOnly = computed(() => !this.access.canWrite('agenda'));
  protected readonly showcase = signal<ClassShowcase>(EMPTY_SHOWCASE);
  private readonly saved = signal<ClassShowcase>(EMPTY_SHOWCASE);
  protected readonly priceText = signal('0');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly dirty = computed(() => JSON.stringify(this.showcase()) !== JSON.stringify(this.saved()));
  protected readonly formError = computed(() => showcaseError(this.showcase()));
  protected readonly trialText = computed(() => trialLabel(this.showcase().trial));

  /** Campo de texto do doc da arena (o perfil é o plano B do app). */
  private arenaText(key: string): string {
    const v = this.arenaContext.arenaDocData()?.[key];
    return typeof v === 'string' ? v.trim() : '';
  }
  protected readonly arenaName = computed(() => this.arenaText('name') || 'Sua arena');
  protected readonly previewCover = computed(() => {
    const url = this.showcase().coverUrl || this.arenaText('coverUrl');
    return url ? `url("${url}")` : 'none';
  });
  protected readonly previewDescription = computed(
    () => this.showcase().description.trim() || this.arenaText('description'),
  );

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (arenaId) void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    try {
      const s = await fetchShowcase(arenaFirestore(), arenaId);
      this.showcase.set(s);
      this.saved.set(s);
      this.priceText.set(String(s.trial.priceReais).replace('.', ','));
    } catch {
      this.error.set('Não foi possível carregar a vitrine.');
    } finally {
      this.loading.set(false);
    }
  }

  protected patch(change: Partial<ClassShowcase>): void {
    this.showcase.update((s) => ({ ...s, ...change }));
    this.notice.set(null);
  }

  protected patchTrial(change: Partial<ClassTrial>): void {
    this.showcase.update((s) => ({ ...s, trial: { ...s.trial, ...change } }));
    this.notice.set(null);
  }

  protected setPrice(raw: string): void {
    this.priceText.set(raw);
    this.patchTrial({ priceReais: raw.trim() === '' ? 0 : parsePrice(raw) });
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const arenaId = this.arenaContext.arenaId();
    if (!file || !arenaId) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const url = await uploadShowcaseCover(arenaStorage(), arenaId, file);
      this.patch({ coverUrl: url });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível enviar a capa.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected async save(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.readOnly() || this.formError()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await saveShowcase(arenaFunctions(), arenaId, this.showcase());
      this.showcase.set(saved);
      this.saved.set(saved);
      this.priceText.set(String(saved.trial.priceReais).replace('.', ','));
      this.notice.set('Vitrine salva. O app já mostra a nova versão.');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível salvar a vitrine.');
    } finally {
      this.saving.set(false);
    }
  }
}
