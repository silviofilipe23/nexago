import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { arenaStorage } from '../data/storage';
import { IconComponent } from '../ui/icon.component';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { ToggleComponent } from '../ui/toggle.component';
import {
  ARENA_SITE_EMPTY,
  ARENA_SITE_MAX_ABOUT_IMAGES,
  ARENA_SITE_MAX_FAQ_ITEMS,
  ARENA_SITE_MAX_GALLERY_IMAGES,
  ARENA_SITE_MAX_PLANS,
  ARENA_SITE_MAX_STATS,
  ARENA_SITE_PALETTES,
  slugifyArenaSite,
  validateArenaSiteForPublish,
  type ArenaSiteDraft,
  type ArenaSiteFaqItem,
  type ArenaSiteStat,
} from './arena-site.model';
import {
  fetchArenaSiteDraft,
  publishArenaSite,
  saveArenaSiteDraft,
  unpublishArenaSite,
  uploadArenaGalleryImage,
  uploadArenaSiteImage,
  type ArenaSiteImageKind,
} from './arena-site-repository';

/** Estado de edição de um plano: features viram textarea (uma por linha). */
interface PlanFormItem {
  name: string;
  price: string;
  featuresText: string;
  featured: boolean;
}

/** Tela "Meu site": edita o rascunho do mini-site público da arena
 *  (`arenaSites/{arenaId}`) e publica via `publishArenaSite`. Fase 1:
 *  hero + sobre + contato + tema (catálogo fechado). Produto separado do
 *  link-in-bio da tela Links. */
@Component({
  selector: 'ar-panel-site',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, IconComponent, ToggleComponent],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Meu site" [subtitle]="headerSubtitle()">
        <button type="button" class="ar-mini-btn" [disabled]="busy()" (click)="saveDraft()">
          {{ saving() ? 'Salvando…' : 'Salvar rascunho' }}
        </button>
        <button type="button" class="ar-mini-btn ar-mini-btn-primary" [disabled]="busy()" (click)="publish()">
          <ar-icon name="check" [size]="14" />
          {{ publishing() ? 'Publicando…' : 'Publicar' }}
        </button>
      </ar-page-header>

      <div class="body">
        @if (arenaNotFound()) {
          <p class="state-text">Nenhuma arena vinculada à sua conta ainda. Fale com o suporte para concluir o cadastro.</p>
        } @else if (arenaLoading() || loading()) {
          <p class="state-text">Carregando site…</p>
        } @else if (loadError(); as err) {
          <p class="state-text">{{ err }}</p>
        } @else {
          @if (actionError(); as aerr) {
            <div class="error-banner">{{ aerr }}</div>
          }
          @if (feedback(); as msg) {
            <div class="ok-banner">{{ msg }}</div>
          }

          <div class="layout">
          <div class="col-main">
          <ar-panel-card kicker="Onde seu site fica no ar" title="Endereço" pad="lg">
            <span card-actions class="status-pill" [class.live]="status() === 'published'">
              {{ status() === 'published' ? 'Publicado' : 'Rascunho' }}
            </span>
            <div class="field-label">Endereço da página</div>
            <div class="slug-box">
              <span class="slug-prefix">{{ displayHost }}/s/</span>
              <input
                type="text"
                class="slug-input"
                [value]="slug()"
                (input)="slug.set(normalizeSlugInput($any($event.target).value))"
                placeholder="minha-arena"
                aria-label="Endereço da página"
              />
            </div>
            <p class="hint">Só letras minúsculas, números e hífen. Mudar o endereço quebra links já compartilhados.</p>
          </ar-panel-card>

          <ar-panel-card kicker="Identidade visual do site" title="Tema" pad="lg">
            <div class="field-label">Cor de destaque</div>
            <div class="palette-row">
              @for (p of palettes; track p.id) {
                <button
                  type="button"
                  class="swatch"
                  [class.active]="paletteId() === p.id"
                  [style.background]="p.hex"
                  [attr.aria-label]="'Cor ' + p.label"
                  [attr.aria-pressed]="paletteId() === p.id"
                  (click)="paletteId.set(p.id)"
                ></button>
              }
            </div>
            <p class="hint">Aplicada em botões, links e destaques do site.</p>
          </ar-panel-card>

          <ar-panel-card kicker="Primeira dobra — o que o visitante vê primeiro" title="Hero" pad="lg">
            <div class="field-label">Título principal *</div>
            <input type="text" class="input-box" maxlength="80" [value]="heroHeadline()" (input)="heroHeadline.set($any($event.target).value)" placeholder="Ex.: Sua praia é aqui" />

            <div class="field-label row-gap">Subtítulo</div>
            <input type="text" class="input-box" maxlength="140" [value]="heroTagline()" (input)="heroTagline.set($any($event.target).value)" placeholder="Ex.: Beach tennis e vôlei de praia no coração da cidade" />

            <div class="field-label row-gap">Imagem de fundo</div>
            <div class="upload-box" [class.filled]="heroImageUrl().trim()">
              @if (heroImageUrl().trim()) {
                <img [src]="heroImageUrl()" alt="" class="image-thumb wide" />
                <div class="upload-copy">
                  <div class="upload-title">Imagem enviada</div>
                  <div class="upload-meta">Aparece atrás do título, com escurecimento automático.</div>
                </div>
              } @else {
                <div class="upload-empty-thumb" aria-hidden></div>
                <div class="upload-copy">
                  <div class="upload-title">Nenhuma imagem enviada</div>
                  <div class="upload-meta">JPG ou PNG · mín. 1600×900 · até 5 MB</div>
                </div>
              }
              <div class="upload-actions">
                <button type="button" class="ar-mini-btn" [disabled]="uploading()" (click)="heroFileInput.click()">
                  <ar-icon name="camera" [size]="14" />
                  {{ heroImageUrl().trim() ? 'Trocar imagem' : 'Enviar imagem' }}
                </button>
                @if (heroImageUrl().trim()) {
                  <button type="button" class="ar-ghost-btn small" (click)="heroImageUrl.set('')">Remover</button>
                }
              </div>
              <input #heroFileInput type="file" accept="image/*" class="visually-hidden-input" aria-label="Selecionar imagem do hero" (change)="onImageSelected($event, 'site-hero')" />
            </div>

            <div class="two-col row-gap">
              <div>
                <div class="field-label">Texto do botão</div>
                <input type="text" class="input-box" maxlength="24" [value]="heroCtaLabel()" (input)="heroCtaLabel.set($any($event.target).value)" placeholder="Ex.: Reservar quadra" />
              </div>
              <div>
                <div class="field-label">Link do botão</div>
                <input type="url" class="input-box" maxlength="300" [value]="heroCtaUrl()" (input)="heroCtaUrl.set($any($event.target).value)" placeholder="https://…" />
              </div>
            </div>
          </ar-panel-card>

          <ar-panel-card kicker="Apresentação, história e estrutura" title="Sobre a arena" pad="lg">
            <ar-toggle card-actions [checked]="aboutEnabled()" (changed)="aboutEnabled.set($event)" label="Mostrar seção" />
            <p class="hint no-top">Seções ocultas não aparecem no site publicado.</p>

            <div class="field-label row-gap">Título</div>
            <input type="text" class="input-box" maxlength="60" [value]="aboutTitle()" (input)="aboutTitle.set($any($event.target).value)" placeholder="Ex.: Sobre a arena" />

            <div class="field-label row-gap">Texto</div>
            <textarea class="input-box textarea" rows="5" maxlength="1200" [value]="aboutBody()" (input)="aboutBody.set($any($event.target).value)" placeholder="Conte a história da arena, estrutura, diferenciais…"></textarea>

            <div class="field-label row-gap">Números de destaque (até {{ maxStats }})</div>
            @for (stat of aboutStats(); track $index; let i = $index) {
              <div class="stat-row">
                <input type="text" class="input-box stat-value" maxlength="12" [value]="stat.value" (input)="updateStat(i, { value: $any($event.target).value })" placeholder="120+" aria-label="Valor do destaque" />
                <input type="text" class="input-box" maxlength="24" [value]="stat.label" (input)="updateStat(i, { label: $any($event.target).value })" placeholder="alunos ativos" aria-label="Rótulo do destaque" />
                <button type="button" class="ar-ghost-btn small" (click)="removeStat(i)">Remover</button>
              </div>
            }
            @if (aboutStats().length < maxStats) {
              <button type="button" class="ar-mini-btn" (click)="addStat()">
                <ar-icon name="plus" [size]="14" />
                Adicionar destaque
              </button>
            }

            <div class="field-label row-gap">Fotos (até {{ maxAboutImages }})</div>
            <div class="image-row">
              @for (url of aboutImageUrls(); track url; let i = $index) {
                <div class="image-thumb-wrap">
                  <img [src]="url" alt="" class="image-thumb" />
                  <button type="button" class="thumb-remove" aria-label="Remover foto" (click)="removeAboutImage(i)">×</button>
                </div>
              }
              @if (aboutImageUrls().length < maxAboutImages) {
                <button type="button" class="ar-mini-btn" [disabled]="uploading()" (click)="aboutFileInput.click()">
                  <ar-icon name="plus" [size]="14" />
                  Adicionar foto
                </button>
              }
              <input #aboutFileInput type="file" accept="image/*" class="visually-hidden-input" aria-label="Selecionar foto da seção sobre" (change)="onAboutImageSelected($event)" />
            </div>
          </ar-panel-card>

          <ar-panel-card title="Seções automáticas" kicker="Dados ao vivo do NexaGO" pad="lg">
            <p class="auto-hint">
              Essas seções mostram dados reais da arena no NexaGO — sempre atualizados, sem precisar republicar o site.
            </p>
            <div class="auto-row">
              <div>
                <div class="auto-title">Horários</div>
                <div class="auto-desc">Grade semanal de funcionamento, direto da agenda das quadras.</div>
              </div>
              <ar-toggle [checked]="scheduleEnabled()" (changed)="scheduleEnabled.set($event)" />
            </div>
            <div class="auto-row">
              <div>
                <div class="auto-title">Torneios</div>
                <div class="auto-desc">Próximos torneios e etapas sediados na arena.</div>
              </div>
              <ar-toggle [checked]="eventsEnabled()" (changed)="eventsEnabled.set($event)" />
            </div>
            <div class="auto-row">
              <div>
                <div class="auto-title">Avaliações</div>
                <div class="auto-desc">Nota média e comentários de atletas que jogaram aí.</div>
              </div>
              <ar-toggle [checked]="reviewsEnabled()" (changed)="reviewsEnabled.set($event)" />
            </div>
          </ar-panel-card>

          <ar-panel-card kicker="Fotos que vendem a arena" title="Galeria" pad="lg">
            <ar-toggle card-actions [checked]="galleryEnabled()" (changed)="galleryEnabled.set($event)" label="Mostrar seção" />

            <div class="field-label row-gap">Fotos (até {{ maxGalleryImages }})</div>
            <div class="image-row">
              @for (url of galleryImageUrls(); track url; let i = $index) {
                <div class="image-thumb-wrap">
                  <img [src]="url" alt="" class="image-thumb" />
                  <button type="button" class="thumb-remove" aria-label="Remover foto da galeria" (click)="removeGalleryImage(i)">×</button>
                </div>
              }
              @if (galleryImageUrls().length < maxGalleryImages) {
                <button type="button" class="ar-mini-btn" [disabled]="uploading()" (click)="galleryFileInput.click()">
                  <ar-icon name="plus" [size]="14" />
                  Adicionar foto
                </button>
              }
              <input #galleryFileInput type="file" accept="image/*" class="visually-hidden-input" aria-label="Selecionar foto da galeria" (change)="onGalleryImageSelected($event)" />
            </div>
          </ar-panel-card>

          <ar-panel-card kicker="Mensalista, day use, aulas" title="Planos" pad="lg">
            <ar-toggle card-actions [checked]="plansEnabled()" (changed)="plansEnabled.set($event)" label="Mostrar seção" />

            @for (plan of planItems(); track $index; let i = $index) {
              <div class="item-block">
                <div class="item-head">
                  <span class="item-title">Plano {{ i + 1 }}</span>
                  <button type="button" class="ar-ghost-btn small" (click)="removePlan(i)">Remover</button>
                </div>
                <div class="two-col">
                  <div>
                    <div class="field-label">Nome *</div>
                    <input type="text" class="input-box" maxlength="40" [value]="plan.name" (input)="updatePlan(i, { name: $any($event.target).value })" placeholder="Ex.: Mensalista" />
                  </div>
                  <div>
                    <div class="field-label">Preço *</div>
                    <input type="text" class="input-box" maxlength="24" [value]="plan.price" (input)="updatePlan(i, { price: $any($event.target).value })" placeholder="Ex.: R$ 249/mês" />
                  </div>
                </div>
                <div class="field-label row-gap">Vantagens (uma por linha)</div>
                <textarea class="input-box textarea" rows="3" [value]="plan.featuresText" (input)="updatePlan(i, { featuresText: $any($event.target).value })" placeholder="2 horários fixos por semana&#10;Desconto no bar"></textarea>
                <div class="section-toggle row-gap">
                  <span>Destacar este plano</span>
                  <ar-toggle [checked]="plan.featured" (changed)="updatePlan(i, { featured: $event })" />
                </div>
              </div>
            }
            @if (planItems().length < maxPlans) {
              <button type="button" class="ar-mini-btn row-gap" (click)="addPlan()">
                <ar-icon name="plus" [size]="14" />
                Adicionar plano
              </button>
            }
          </ar-panel-card>

          <ar-panel-card kicker="O que sempre perguntam antes de jogar" title="Perguntas frequentes" pad="lg">
            <ar-toggle card-actions [checked]="faqEnabled()" (changed)="faqEnabled.set($event)" label="Mostrar seção" />

            @for (item of faqItems(); track $index; let i = $index) {
              <div class="item-block">
                <div class="item-head">
                  <span class="item-title">Pergunta {{ i + 1 }}</span>
                  <button type="button" class="ar-ghost-btn small" (click)="removeFaq(i)">Remover</button>
                </div>
                <div class="field-label">Pergunta *</div>
                <input type="text" class="input-box" maxlength="120" [value]="item.q" (input)="updateFaq(i, { q: $any($event.target).value })" placeholder="Ex.: Precisa levar raquete?" />
                <div class="field-label row-gap">Resposta *</div>
                <textarea class="input-box textarea" rows="3" maxlength="600" [value]="item.a" (input)="updateFaq(i, { a: $any($event.target).value })" placeholder="Temos raquetes para alugar na recepção…"></textarea>
              </div>
            }
            @if (faqItems().length < maxFaqItems) {
              <button type="button" class="ar-mini-btn row-gap" (click)="addFaq()">
                <ar-icon name="plus" [size]="14" />
                Adicionar pergunta
              </button>
            }
          </ar-panel-card>

          <ar-panel-card kicker="Canais que aparecem no site" title="Contato" pad="lg">
            <ar-toggle card-actions [checked]="contactEnabled()" (changed)="contactEnabled.set($event)" label="Mostrar seção" />

            <div class="two-col row-gap">
              <div>
                <div class="field-label">WhatsApp</div>
                <input type="tel" class="input-box" maxlength="20" [value]="contactWhatsapp()" (input)="contactWhatsapp.set($any($event.target).value)" placeholder="(11) 91234-5678" />
              </div>
              <div>
                <div class="field-label">Instagram</div>
                <input type="text" class="input-box" maxlength="40" [value]="contactInstagram()" (input)="contactInstagram.set($any($event.target).value)" placeholder="@minhaarena" />
              </div>
            </div>

            <div class="field-label row-gap">Endereço</div>
            <input type="text" class="input-box" maxlength="160" [value]="contactAddress()" (input)="contactAddress.set($any($event.target).value)" placeholder="Rua, número, bairro — cidade/UF" />
          </ar-panel-card>

          @if (uploading()) {
            <p class="state-text">Enviando imagem…</p>
          }
          </div>

          <aside class="col-side">
            <ar-panel-card title="Publicação">
              <div class="pub-status">
                <span class="pub-dot" [class.live]="status() === 'published'" aria-hidden></span>
                {{ status() === 'published' ? 'Publicado — no ar' : 'Rascunho — não publicado' }}
              </div>
              <div class="pub-url">
                <ar-icon name="share" [size]="14" />
                <span class="pub-url-text">{{ displayHost }}/s/{{ slug() || 'minha-arena' }}</span>
              </div>
              <div class="pub-actions">
                <button type="button" class="ar-mini-btn" (click)="copyLink()">Copiar link</button>
                @if (status() === 'published' && publishedSlug()) {
                  <a class="ar-mini-btn" [href]="publicUrl()" target="_blank" rel="noopener">Ver site</a>
                  <button type="button" class="ar-ghost-btn small" [disabled]="busy()" (click)="unpublish()">
                    Despublicar
                  </button>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card kicker="Atualiza conforme você edita" title="Prévia">
              <div class="pv">
                <div class="pv-bar">
                  <span class="pv-dots" aria-hidden><i></i><i></i><i></i></span>
                  <span class="pv-bar-url">{{ displayHost }}/s/{{ slug() || 'minha-arena' }}</span>
                </div>
                <div class="pv-page">
                  <div class="pv-nav">
                    <span class="pv-logo" [style.background]="paletteHex()">{{ arenaInitial() }}</span>
                    <span class="pv-nav-links">
                      @for (a of previewAnchors(); track a) {
                        <span>{{ a }}</span>
                      }
                    </span>
                  </div>
                  <div class="pv-hero" [style.background-image]="heroImageUrl().trim() ? 'url(' + heroImageUrl() + ')' : null">
                    <div class="pv-hero-shade" [class.plain]="!heroImageUrl().trim()">
                      <div class="pv-headline">{{ heroHeadline() || 'Sua praia é aqui' }}</div>
                      @if (heroTagline()) {
                        <div class="pv-tagline">{{ heroTagline() }}</div>
                      }
                      @if (heroCtaLabel()) {
                        <span class="pv-cta" [style.background]="paletteHex()">{{ heroCtaLabel() }}</span>
                      }
                    </div>
                  </div>
                  @if (aboutEnabled()) {
                    <div class="pv-section">
                      <div class="pv-section-title" [style.color]="paletteHex()">{{ aboutTitle() || 'Sobre a arena' }}</div>
                      @if (aboutBody()) {
                        <p class="pv-body">{{ previewAboutText() }}</p>
                      } @else {
                        <div class="pv-skel" aria-hidden></div>
                        <div class="pv-skel short" aria-hidden></div>
                      }
                    </div>
                  }
                </div>
              </div>
            </ar-panel-card>

            <div class="side-note">
              Alterações só vão ao ar quando você clicar em <strong>Publicar</strong>. Salvar rascunho guarda o
              progresso sem mudar o site no ar.
            </div>
          </aside>
          </div>
        }
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 1200px;
      /* Gutter da tela: o shell não dá padding — mesmo ritmo do Perfil/Início. */
      padding: 22px 32px 28px;
      box-sizing: border-box;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 28px;
      align-items: start;
    }

    .col-main {
      display: flex;
      flex-direction: column;
      gap: 24px;
      min-width: 0;
    }

    .col-side {
      position: sticky;
      top: 22px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      min-width: 0;
    }

    @media (max-width: 1080px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .col-side {
        position: static;
      }
    }

    .hint {
      font-size: 12px;
      color: var(--nx-text-dim);
      line-height: 1.5;
      margin: 8px 0 0;
    }

    .hint.no-top {
      margin-top: 0;
      margin-bottom: 12px;
    }

    .state-text {
      color: var(--nx-text-mute);
      font-size: 13px;
      padding: 24px 0;
    }

    .error-banner {
      border: 1px solid rgba(255, 92, 92, 0.4);
      background: rgba(255, 92, 92, 0.08);
      color: #ff8a8a;
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 13px;
    }

    .ok-banner {
      border: 1px solid rgba(43, 209, 126, 0.4);
      background: rgba(43, 209, 126, 0.08);
      color: #2bd17e;
      border-radius: var(--nx-r-2);
      padding: 10px 14px;
      font-size: 13px;
    }

    .status-pill {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--nx-line);
      color: var(--nx-text-mute);
    }

    .status-pill.live {
      border-color: rgba(43, 209, 126, 0.5);
      color: #2bd17e;
    }

    .field-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--nx-text-dim);
      margin-bottom: 10px;
    }

    .row-gap {
      margin-top: 18px;
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

    .textarea {
      height: auto;
      padding: 12px 14px;
      resize: vertical;
      font-family: var(--nx-font-ui);
    }

    .slug-box {
      display: flex;
      align-items: center;
      height: 46px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      padding: 0 14px;
      gap: 2px;
    }

    .slug-box:focus-within {
      border-color: var(--nx-orange-500);
    }

    .slug-prefix {
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text-dim);
      white-space: nowrap;
    }

    .slug-input {
      flex: 1;
      min-width: 0;
      font-family: var(--nx-font-mono);
      font-size: 13px;
      color: var(--nx-text);
      background: transparent;
      border: none;
      height: 100%;
    }

    .slug-input:focus {
      outline: none;
    }

    .upload-box {
      display: flex;
      align-items: center;
      gap: 14px;
      border: 1px dashed var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 12px 14px;
      flex-wrap: wrap;
    }

    .upload-box.filled {
      border-style: solid;
    }

    .upload-empty-thumb {
      width: 72px;
      height: 48px;
      border-radius: var(--nx-r-1);
      background: repeating-linear-gradient(
        -45deg,
        var(--nx-surface-1),
        var(--nx-surface-1) 6px,
        transparent 6px,
        transparent 12px
      );
      border: 1px solid var(--nx-line);
      flex-shrink: 0;
    }

    .upload-copy {
      flex: 1;
      min-width: 140px;
    }

    .upload-title {
      font-size: 13px;
      color: var(--nx-text);
    }

    .upload-meta {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.06em;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .upload-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pub-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--nx-text);
    }

    .pub-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--nx-orange-500);
      flex-shrink: 0;
    }

    .pub-dot.live {
      background: #2bd17e;
    }

    .pub-url {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: var(--nx-r-2);
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
      color: var(--nx-orange-500);
    }

    .pub-url-text {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pub-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .pv {
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      overflow: hidden;
    }

    .pv-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--nx-surface-1);
      border-bottom: 1px solid var(--nx-line);
    }

    .pv-dots {
      display: inline-flex;
      gap: 3px;
    }

    .pv-dots i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--nx-line);
      display: block;
    }

    .pv-bar-url {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pv-page {
      background: #050505;
      padding-bottom: 14px;
    }

    .pv-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .pv-logo {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      color: #0a0a0a;
      font-size: 10px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .pv-nav-links {
      display: flex;
      gap: 8px;
      margin-left: auto;
      font-size: 8px;
      color: rgba(244, 244, 245, 0.62);
    }

    .pv-hero {
      background-size: cover;
      background-position: center;
    }

    .pv-hero-shade {
      background: linear-gradient(to top, rgba(5, 5, 5, 0.92), rgba(5, 5, 5, 0.45));
      padding: 26px 14px 18px;
      text-align: center;
    }

    .pv-hero-shade.plain {
      background: radial-gradient(80% 80% at 50% 0%, rgba(255, 255, 255, 0.05), transparent), #0b0b0c;
    }

    .pv-headline {
      font-family: var(--nx-font-display);
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
      color: #f4f4f5;
      line-height: 1.15;
    }

    .pv-tagline {
      font-size: 9px;
      color: rgba(244, 244, 245, 0.62);
      margin-top: 6px;
      line-height: 1.4;
    }

    .pv-cta {
      display: inline-block;
      margin-top: 10px;
      color: #0a0a0a;
      font-size: 9px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 999px;
    }

    .pv-section {
      padding: 12px 14px 0;
    }

    .pv-section-title {
      font-family: var(--nx-font-mono);
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .pv-body {
      font-size: 9px;
      line-height: 1.5;
      color: rgba(244, 244, 245, 0.62);
      margin: 6px 0 0;
    }

    .pv-skel {
      height: 8px;
      border-radius: 3px;
      margin-top: 8px;
      background: repeating-linear-gradient(
        -45deg,
        rgba(255, 255, 255, 0.08),
        rgba(255, 255, 255, 0.08) 4px,
        transparent 4px,
        transparent 8px
      );
    }

    .pv-skel.short {
      width: 60%;
    }

    .side-note {
      font-size: 12px;
      line-height: 1.6;
      color: var(--nx-text-dim);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 12px 14px;
    }

    .side-note strong {
      color: var(--nx-text);
      font-weight: 600;
    }

    .palette-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .swatch {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
    }

    .swatch.active {
      border-color: var(--nx-text);
      box-shadow: 0 0 0 3px var(--nx-surface-1);
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    @media (max-width: 640px) {
      .two-col {
        grid-template-columns: 1fr;
      }
    }

    .section-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      color: var(--nx-text-mute);
    }

    .auto-hint {
      font-size: 13px;
      color: var(--nx-text-mute);
      margin: 0 0 6px;
      line-height: 1.5;
    }

    .auto-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .auto-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .auto-title {
      font-size: 13px;
      color: var(--nx-text);
      font-weight: 500;
    }

    .auto-desc {
      font-size: 12px;
      color: var(--nx-text-dim);
      margin-top: 2px;
    }

    .stat-row {
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
    }

    .item-block {
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-2);
      padding: 14px;
      margin-top: 14px;
    }

    .item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .item-title {
      font-family: var(--nx-font-mono);
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--nx-text-mute);
    }

    .image-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .image-thumb {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: var(--nx-r-2);
      border: 1px solid var(--nx-line);
      display: block;
    }

    .image-thumb.wide {
      width: 128px;
    }

    .image-thumb-wrap {
      position: relative;
    }

    .thumb-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 1px solid var(--nx-line);
      background: var(--nx-surface-1);
      color: var(--nx-text-mute);
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
    }

    .ar-ghost-btn.small {
      font-size: 12px;
      padding: 6px 10px;
    }

    /* Inputs de arquivo escondidos: o ancestral PRECISA ser positioned
       (.upload-box/.image-row são relative), senão o absolute escapa do
       scroller do shell e estica o documento — vira scrollbar dupla. */
    .visually-hidden-input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
    }

    .upload-box,
    .image-row {
      position: relative;
    }
  `,
})
export class PanelSiteComponent {
  private readonly arenaContext = inject(ArenaContextService);

  protected readonly palettes = ARENA_SITE_PALETTES;
  protected readonly maxAboutImages = ARENA_SITE_MAX_ABOUT_IMAGES;
  protected readonly maxGalleryImages = ARENA_SITE_MAX_GALLERY_IMAGES;
  protected readonly maxPlans = ARENA_SITE_MAX_PLANS;
  protected readonly maxFaqItems = ARENA_SITE_MAX_FAQ_ITEMS;
  protected readonly maxStats = ARENA_SITE_MAX_STATS;
  protected readonly publicBaseUrl = environment.publicSiteUrl;

  protected readonly arenaLoading = computed(() => this.arenaContext.loading());
  protected readonly arenaNotFound = computed(() => this.arenaContext.notFound());

  protected readonly draft = signal<ArenaSiteDraft | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly uploading = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  protected readonly status = linkedSignal(() => this.draft()?.status ?? 'draft');
  protected readonly publishedSlug = linkedSignal(() => this.draft()?.slug ?? '');
  protected readonly slug = linkedSignal(() => this.draft()?.slug || slugifyArenaSite(this.arenaContext.arenaName() ?? ''));
  protected readonly paletteId = linkedSignal(() => this.draft()?.theme.paletteId ?? ARENA_SITE_EMPTY.theme.paletteId);
  protected readonly heroHeadline = linkedSignal(() => this.draft()?.hero.headline ?? '');
  protected readonly heroTagline = linkedSignal(() => this.draft()?.hero.tagline ?? '');
  protected readonly heroImageUrl = linkedSignal(() => this.draft()?.hero.imageUrl ?? '');
  protected readonly heroCtaLabel = linkedSignal(() => this.draft()?.hero.ctaLabel ?? '');
  protected readonly heroCtaUrl = linkedSignal(() => this.draft()?.hero.ctaUrl ?? '');
  protected readonly aboutEnabled = linkedSignal(() => this.draft()?.about.enabled ?? true);
  protected readonly aboutTitle = linkedSignal(() => this.draft()?.about.title ?? '');
  protected readonly aboutBody = linkedSignal(() => this.draft()?.about.body ?? '');
  protected readonly aboutImageUrls = linkedSignal(() => this.draft()?.about.imageUrls ?? []);
  protected readonly aboutStats = linkedSignal<ArenaSiteStat[]>(() => this.draft()?.about.stats ?? []);
  protected readonly contactEnabled = linkedSignal(() => this.draft()?.contact.enabled ?? true);
  protected readonly scheduleEnabled = linkedSignal(() => this.draft()?.schedule.enabled ?? true);
  protected readonly eventsEnabled = linkedSignal(() => this.draft()?.events.enabled ?? true);
  protected readonly reviewsEnabled = linkedSignal(() => this.draft()?.reviews.enabled ?? true);
  protected readonly galleryEnabled = linkedSignal(() => this.draft()?.gallery.enabled ?? true);
  protected readonly galleryImageUrls = linkedSignal(() => this.draft()?.gallery.imageUrls ?? []);
  protected readonly plansEnabled = linkedSignal(() => this.draft()?.plans.enabled ?? true);
  protected readonly planItems = linkedSignal<PlanFormItem[]>(() =>
    (this.draft()?.plans.items ?? []).map((p) => ({
      name: p.name,
      price: p.price,
      featuresText: p.features.join('\n'),
      featured: p.featured,
    })),
  );
  protected readonly faqEnabled = linkedSignal(() => this.draft()?.faq.enabled ?? true);
  protected readonly faqItems = linkedSignal<ArenaSiteFaqItem[]>(() => this.draft()?.faq.items ?? []);
  protected readonly contactWhatsapp = linkedSignal(() => this.draft()?.contact.whatsapp ?? '');
  protected readonly contactInstagram = linkedSignal(() => this.draft()?.contact.instagram ?? '');
  protected readonly contactAddress = linkedSignal(() => this.draft()?.contact.address ?? '');

  protected readonly busy = computed(() => this.loading() || this.saving() || this.publishing() || this.uploading());
  protected readonly publicUrl = computed(() => `${this.publicBaseUrl}/s/${this.publishedSlug()}`);
  protected readonly displayHost = environment.publicSiteUrl.replace(/^https?:\/\//, '');
  protected readonly headerSubtitle = computed(() => {
    const name = this.arenaContext.arenaName();
    return `${name ? name + ' · ' : ''}landing page pública da arena — reservas, torneios e contato num só endereço`;
  });
  protected readonly paletteHex = computed(
    () => ARENA_SITE_PALETTES.find((p) => p.id === this.paletteId())?.hex ?? ARENA_SITE_PALETTES[0]!.hex,
  );
  protected readonly arenaInitial = computed(() => (this.arenaContext.arenaName() ?? 'A').charAt(0).toUpperCase());
  protected readonly previewAnchors = computed(() => {
    const anchors: string[] = [];
    if (this.aboutEnabled()) anchors.push('Sobre');
    if (this.scheduleEnabled()) anchors.push('Horários');
    if (this.galleryEnabled() && this.galleryImageUrls().length > 0) anchors.push('Galeria');
    if (this.plansEnabled() && this.planItems().length > 0) anchors.push('Planos');
    if (this.contactEnabled()) anchors.push('Contato');
    return anchors.slice(0, 3);
  });
  protected readonly previewAboutText = computed(() => {
    const body = this.aboutBody().trim();
    return body.length > 140 ? `${body.slice(0, 140)}…` : body;
  });

  constructor() {
    effect(() => {
      const arenaId = this.arenaContext.arenaId();
      if (!arenaId) return;
      void this.load(arenaId);
    });
  }

  private async load(arenaId: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.draft.set(await fetchArenaSiteDraft(arenaFirestore(), arenaId));
    } catch {
      this.loadError.set('Não foi possível carregar o site.');
    } finally {
      this.loading.set(false);
    }
  }

  protected normalizeSlugInput(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  }

  protected copyLink(): void {
    const url = `${this.publicBaseUrl}/s/${this.slug() || 'minha-arena'}`;
    void navigator.clipboard
      .writeText(url)
      .then(() => this.feedback.set('Link copiado.'))
      .catch(() => this.actionError.set('Não foi possível copiar o link.'));
  }

  private collectDraft(): ArenaSiteDraft {
    return {
      status: this.status(),
      slug: this.publishedSlug(),
      theme: { paletteId: this.paletteId(), dark: true },
      hero: {
        headline: this.heroHeadline(),
        tagline: this.heroTagline(),
        imageUrl: this.heroImageUrl(),
        ctaLabel: this.heroCtaLabel(),
        ctaUrl: this.heroCtaUrl(),
      },
      about: {
        enabled: this.aboutEnabled(),
        title: this.aboutTitle(),
        body: this.aboutBody(),
        imageUrls: this.aboutImageUrls(),
        stats: this.aboutStats(),
      },
      contact: {
        enabled: this.contactEnabled(),
        whatsapp: this.contactWhatsapp(),
        instagram: this.contactInstagram(),
        address: this.contactAddress(),
      },
      schedule: { enabled: this.scheduleEnabled() },
      events: { enabled: this.eventsEnabled() },
      reviews: { enabled: this.reviewsEnabled() },
      gallery: { enabled: this.galleryEnabled(), imageUrls: this.galleryImageUrls() },
      plans: {
        enabled: this.plansEnabled(),
        items: this.planItems().map((p) => ({
          name: p.name,
          price: p.price,
          features: p.featuresText.split('\n').map((f) => f.trim()).filter(Boolean),
          featured: p.featured,
        })),
      },
      faq: { enabled: this.faqEnabled(), items: this.faqItems() },
    };
  }

  protected addStat(): void {
    this.aboutStats.update((stats) => (stats.length >= ARENA_SITE_MAX_STATS ? stats : [...stats, { value: '', label: '' }]));
  }

  protected removeStat(index: number): void {
    this.aboutStats.update((stats) => stats.filter((_, i) => i !== index));
  }

  protected updateStat(index: number, patch: Partial<ArenaSiteStat>): void {
    this.aboutStats.update((stats) => stats.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  protected addPlan(): void {
    this.planItems.update((items) =>
      items.length >= ARENA_SITE_MAX_PLANS ? items : [...items, { name: '', price: '', featuresText: '', featured: false }],
    );
  }

  protected removePlan(index: number): void {
    this.planItems.update((items) => items.filter((_, i) => i !== index));
  }

  protected updatePlan(index: number, patch: Partial<PlanFormItem>): void {
    this.planItems.update((items) => items.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  protected addFaq(): void {
    this.faqItems.update((items) =>
      items.length >= ARENA_SITE_MAX_FAQ_ITEMS ? items : [...items, { q: '', a: '' }],
    );
  }

  protected removeFaq(index: number): void {
    this.faqItems.update((items) => items.filter((_, i) => i !== index));
  }

  protected updateFaq(index: number, patch: Partial<ArenaSiteFaqItem>): void {
    this.faqItems.update((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  protected onGalleryImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    const arenaId = this.arenaContext.arenaId();
    if (!arenaId || this.galleryImageUrls().length >= ARENA_SITE_MAX_GALLERY_IMAGES) return;

    this.actionError.set(null);
    this.uploading.set(true);
    void uploadArenaGalleryImage(arenaStorage(), arenaId, file)
      .then((url) => {
        this.galleryImageUrls.update((current) => [...current, url].slice(0, ARENA_SITE_MAX_GALLERY_IMAGES));
      })
      .catch((err: unknown) => {
        this.actionError.set(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.');
      })
      .finally(() => this.uploading.set(false));
  }

  protected removeGalleryImage(index: number): void {
    this.galleryImageUrls.update((current) => current.filter((_, i) => i !== index));
  }

  protected async saveDraft(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.saving.set(true);
    this.actionError.set(null);
    this.feedback.set(null);
    try {
      await saveArenaSiteDraft(arenaFirestore(), arenaId, this.collectDraft());
      this.feedback.set('Rascunho salvo.');
    } catch {
      this.actionError.set('Não foi possível salvar o rascunho.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    const slug = this.slug().trim();
    const validationError = validateArenaSiteForPublish(this.collectDraft(), slug);
    if (validationError) {
      this.actionError.set(validationError);
      return;
    }

    this.publishing.set(true);
    this.actionError.set(null);
    this.feedback.set(null);
    try {
      await saveArenaSiteDraft(arenaFirestore(), arenaId, this.collectDraft());
      const result = await publishArenaSite(arenaFunctions(), arenaId, slug);
      this.status.set('published');
      this.publishedSlug.set(result.slug);
      this.feedback.set('Site publicado.');
    } catch (err) {
      this.actionError.set(callableErrorMessage(err, 'Não foi possível publicar o site.'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected async unpublish(): Promise<void> {
    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.publishing.set(true);
    this.actionError.set(null);
    this.feedback.set(null);
    try {
      await unpublishArenaSite(arenaFunctions(), arenaId);
      this.status.set('draft');
      this.feedback.set('Site despublicado.');
    } catch (err) {
      this.actionError.set(callableErrorMessage(err, 'Não foi possível despublicar o site.'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected onImageSelected(event: Event, kind: ArenaSiteImageKind): void {
    void this.handleImageSelected(event, kind, (url) => this.heroImageUrl.set(url));
  }

  protected onAboutImageSelected(event: Event): void {
    const slot = (this.aboutImageUrls().length + 1) as 1 | 2 | 3;
    const kind = `site-about-${Math.min(slot, ARENA_SITE_MAX_ABOUT_IMAGES)}` as ArenaSiteImageKind;
    void this.handleImageSelected(event, kind, (url) => {
      this.aboutImageUrls.update((current) => [...current, url].slice(0, ARENA_SITE_MAX_ABOUT_IMAGES));
    });
  }

  protected removeAboutImage(index: number): void {
    this.aboutImageUrls.update((current) => current.filter((_, i) => i !== index));
  }

  private async handleImageSelected(event: Event, kind: ArenaSiteImageKind, apply: (url: string) => void): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    const arenaId = this.arenaContext.arenaId();
    if (!arenaId) return;

    this.actionError.set(null);
    this.uploading.set(true);
    try {
      const url = await uploadArenaSiteImage(arenaStorage(), arenaId, kind, file);
      apply(url);
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Não foi possível enviar a imagem.');
    } finally {
      this.uploading.set(false);
    }
  }
}

/** Extrai a mensagem legível de um erro de callable (as functions mandam mensagens em PT). */
function callableErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const message = (err as { message: string }).message;
    if (message && !/^internal$/i.test(message.trim())) return message;
  }
  return fallback;
}
