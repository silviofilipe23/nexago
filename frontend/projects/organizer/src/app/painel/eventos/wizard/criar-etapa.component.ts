import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OgCardComponent } from '../../ui/card.component';
import { OgDisplayInputComponent } from '../../ui/display-input.component';
import { OgFormFieldComponent } from '../../ui/form-field.component';
import { OgIconComponent } from '../../ui/icon.component';
import { OgReviewRowComponent } from '../../ui/review-row.component';
import { OgStepperStaticComponent } from '../../ui/stepper-static.component';
import { OgWizardShellComponent } from '../../ui/wizard-shell.component';

const TOTAL = 3;

interface EtapaCategoria {
  name: string;
  tags: string[];
  vagas: string;
  on: boolean;
}

const CATEGORIAS: EtapaCategoria[] = [
  { name: 'Masculino Open', tags: ['Masc', 'Dupla', 'Open'], vagas: '32', on: true },
  { name: 'Feminino Open', tags: ['Fem', 'Dupla', 'Open'], vagas: '24', on: true },
  { name: 'Misto Sub-23', tags: ['Misto', 'Dupla', 'Sub-23'], vagas: '16', on: false },
];

const TITLES = ['', 'Local e datas', 'Categorias & inscrições', 'Publicar a etapa'];
const SUBTITLES = [
  '',
  'O resto (categorias, formato, ranking) já vem da liga.',
  'Escolha quais categorias abrem nesta etapa e ajuste as vagas.',
  'Confira — preço, formato e ranking seguem a liga.',
];

/** Wizard curto para adicionar uma etapa a uma liga existente — herda regras da liga. */
@Component({
  selector: 'og-criar-etapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OgWizardShellComponent, OgCardComponent, OgFormFieldComponent, OgDisplayInputComponent, OgStepperStaticComponent, OgReviewRowComponent, OgIconComponent],
  template: `
    <og-wizard-shell
      [flow]="'Nova etapa'"
      [total]="3"
      [step]="step()"
      [title]="title()"
      [subtitle]="subtitle()"
      [ctaLabel]="ctaLabel()"
      (cta)="onCta()"
      (back)="onBack()"
    >
      @switch (step()) {
        @case (1) {
          <div class="og-inherit-banner">
            <div class="og-inherit-banner-icon"><og-icon name="flag" [size]="19" /></div>
            <div style="flex:1">
              <div class="og-inherit-banner-kicker">Etapa de</div>
              <div class="og-inherit-banner-name">Copa Goiás Beach 2026</div>
            </div>
            <span class="og-inherit-banner-count">3 / 6</span>
          </div>
          <og-card title="Detalhes da etapa">
            <div class="og-field-grid">
              <div class="span-2"><og-form-field label="Nome da etapa"><og-display-input value="Open Goiânia Beach" /></og-form-field></div>
              <og-form-field label="Cidade"><og-display-input value="Goiânia · GO" /></og-form-field>
              <og-form-field label="Arena / clube"><og-display-input value="Arena ErreJota" /></og-form-field>
              <og-stepper-static label="Quadras disponíveis" value="4" suffix="quadras" />
              <og-form-field label="Início"><og-display-input value="28 Mar" /></og-form-field>
              <og-form-field label="Fim"><og-display-input value="30 Mar" /></og-form-field>
            </div>
          </og-card>
        }
        @case (2) {
          <og-card title="Categorias herdadas">
            <div style="display:flex;flex-direction:column;gap:10px">
              @for (c of categorias; track c.name) {
                <div class="og-etapa-cat-row" [class.on]="c.on" [style.opacity]="c.on ? 1 : 0.6">
                  <div style="flex:1">
                    <div class="og-etapa-cat-name">{{ c.name }}</div>
                    <div class="og-tag-row" style="margin-top:7px">
                      @for (t of c.tags; track t) {
                        <span class="og-tag">{{ t }}</span>
                      }
                    </div>
                  </div>
                  <span class="og-etapa-cat-vagas">{{ c.vagas }} vagas</span>
                  <span class="og-toggle" [class.on]="c.on"></span>
                </div>
              }
            </div>
          </og-card>
          <og-card kicker="Inscrições" title="Janela desta etapa">
            <div class="og-field-grid">
              <og-form-field label="Abrem em"><og-display-input value="01 Mar" /></og-form-field>
              <og-form-field label="Fecham em"><og-display-input value="26 Mar" /></og-form-field>
            </div>
          </og-card>
        }
        @case (3) {
          <og-card title="Etapa 3 · Open Goiânia Beach">
            <og-review-row label="Liga" value="Copa Goiás Beach 2026 · Etapa 3 de 6" />
            <og-review-row label="Local & datas" value="Arena ErreJota, Goiânia · 28 a 30 de março" />
            <og-review-row label="Categorias ativas" value="Masculino Open + Feminino Open · 56 vagas" />
            <og-review-row label="Inscrições" value="01–26 Mar · R$ 90 (preço da liga)" />
            <og-review-row label="Formato & ranking" value="Grupos + mata-mata · pontos somam no circuito" />
          </og-card>
          <div class="og-banner win">Ao publicar, as duplas inscritas no circuito recebem um aviso de que a Etapa 3 abriu.</div>
        }
      }
    </og-wizard-shell>
  `,
  styles: `
    .og-inherit-banner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 13px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-orange-tint);
      border: 1px solid rgba(255, 106, 26, 0.28);
    }
    .og-inherit-banner-icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      flex: none;
      background: rgba(255, 106, 26, 0.2);
      color: var(--nx-orange-500);
      display: grid;
      place-items: center;
    }
    .og-inherit-banner-kicker {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-orange-500);
      font-weight: 600;
    }
    .og-inherit-banner-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
      margin-top: 1px;
    }
    .og-inherit-banner-count {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-mute);
      font-weight: 600;
    }
    .og-etapa-cat-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 13px 16px;
      border-radius: var(--nx-r-3);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
    }
    .og-etapa-cat-row.on {
      border-color: rgba(255, 106, 26, 0.28);
    }
    .og-etapa-cat-name {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 14px;
      color: var(--nx-text);
    }
    .og-etapa-cat-vagas {
      font-family: var(--nx-font-ui);
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-right: 8px;
    }
  `,
})
export class CriarEtapaComponent {
  private readonly router = inject(Router);

  protected readonly step = signal(1);
  protected readonly categorias = CATEGORIAS;

  protected readonly title = computed(() => TITLES[this.step()]);
  protected readonly subtitle = computed(() => SUBTITLES[this.step()]);
  protected readonly ctaLabel = computed(() => (this.step() === TOTAL ? 'Publicar etapa' : 'Continuar'));

  protected onCta(): void {
    if (this.step() < TOTAL) {
      this.step.update((s) => s + 1);
      return;
    }
    void this.router.navigateByUrl('/painel/eventos');
  }

  protected onBack(): void {
    if (this.step() > 1) {
      this.step.update((s) => s - 1);
    }
  }
}
