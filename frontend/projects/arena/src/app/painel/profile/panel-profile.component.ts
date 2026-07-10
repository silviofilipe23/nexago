import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../ui/icon.component';
import { initialsOf } from '../ui/initials';
import { PageHeaderComponent } from '../ui/page-header.component';
import { PanelCardComponent } from '../ui/panel-card.component';
import { PanelShellComponent } from '../ui/panel-shell.component';
import { PillComponent } from '../ui/pill.component';
import { StatusDotComponent } from '../ui/status-dot.component';

interface ProfileStat {
  label: string;
  value: string | number;
  accent: boolean;
}

interface OpeningHour {
  days: string;
  time: string;
  open: boolean;
}

const CITY = 'Aparecida de Goiânia · GO';
const ADDRESS = 'Esq com – Rua Moscou, Av. Francisco Inácio Ferreira, qd 29 – LT 01';
const FULL_CITY = 'Aparecida de Goiânia · GO · 74968-570';
const DESCRIPTION = 'Um lugar aconchegante, cheio de charme. Ótimo para um vôlei e se divertir com os amigos.';
const SPORTS = ['Vôlei de praia', 'Beach Tennis', 'Beach Soccer'];
const HOURS: OpeningHour[] = [
  { days: 'Seg – Sex', time: '07:00 – 22:00', open: true },
  { days: 'Sáb – Dom', time: '06:00 – 20:00', open: true },
  { days: 'Feriados', time: '08:00 – 18:00', open: false },
];
const WHATSAPP = '+55 62 9 9999-9999';
const INSTAGRAM = '@arenacfc';
const RATING = 4.8;
const REVIEWS = 23;
const FOLLOWERS = 6;
const WEEK_VIEWS = 42;

/** Tela Perfil do painel (protótipo ArPerfilScreen): como os atletas veem a arena no app — somente leitura. */
@Component({
  selector: 'ar-panel-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelShellComponent, PageHeaderComponent, PanelCardComponent, PillComponent, StatusDotComponent, IconComponent, RouterLink],
  template: `
    <ar-panel-shell>
      <ar-page-header title="Perfil da arena" subtitle="Como os atletas veem a arena no app">
        <button type="button" class="ar-mini-btn ar-mini-btn-primary">
          <ar-icon name="edit" [size]="14" />
          Editar perfil
        </button>
      </ar-page-header>

      <div class="body">
        <div class="main-grid">
          <div class="col-left">
            <div class="cover">
              <svg width="100%" height="150" viewBox="0 0 1000 150" preserveAspectRatio="none" class="cover-svg">
                <defs>
                  <radialGradient id="arProfileG1" cx="24%" cy="45%">
                    <stop offset="0%" stop-color="#FF6A1A" stop-opacity="0.45" />
                    <stop offset="100%" stop-color="#FF6A1A" stop-opacity="0" />
                  </radialGradient>
                  <radialGradient id="arProfileG2" cx="82%" cy="30%">
                    <stop offset="0%" stop-color="#2BD17E" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="#2BD17E" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <rect width="1000" height="150" fill="#0d0d0e" />
                <rect width="1000" height="150" fill="url(#arProfileG1)" />
                <rect width="1000" height="150" fill="url(#arProfileG2)" />
                @for (x of coverLines; track x) {
                  <line [attr.x1]="x" y1="0" [attr.x2]="x" y2="150" stroke="rgba(255,255,255,0.04)" />
                }
              </svg>
              <div class="cover-edit">
                <ar-icon name="edit" [size]="13" />
                Editar capa
              </div>
            </div>

            <div class="identity">
              <div class="identity-avatar">{{ initials() }}</div>
              <div class="identity-body">
                <div class="identity-name-row">
                  <h1>{{ arenaName() }}</h1>
                  <ar-pill tone="green">Perfil público ativo</ar-pill>
                </div>
                <div class="identity-city">{{ city }}</div>
              </div>
            </div>

            <div class="stats-row">
              @for (s of stats; track s.label) {
                <div class="stat" [class.accent]="s.accent">
                  <div class="stat-value">{{ s.value }}</div>
                  <div class="stat-label">{{ s.label }}</div>
                </div>
              }
            </div>

            <ar-panel-card title="Descrição">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </button>
              <p class="text">{{ description }}</p>
            </ar-panel-card>

            <ar-panel-card title="Modalidades">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="plus" [size]="13" />
                Adicionar
              </button>
              <div class="sports">
                @for (s of sports; track s) {
                  <ar-pill tone="orange">{{ s }}</ar-pill>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Endereço">
              <button type="button" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </button>
              <p class="text address">{{ address }}</p>
              <div class="full-city">{{ fullCity }}</div>
            </ar-panel-card>
          </div>

          <div class="col-right">
            <ar-panel-card title="Completude do perfil">
              <ar-pill tone="orange" card-actions>80%</ar-pill>
              <div class="completeness-track">
                <div class="completeness-fill"></div>
              </div>
              <div class="completeness-hint">Adicione fotos das quadras para completar +20%.</div>
            </ar-panel-card>

            <ar-panel-card title="Horários de funcionamento">
              <a routerLink="/painel/perfil/horarios" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </a>
              <div>
                @for (h of hours; track h.days) {
                  <div class="hour-row">
                    <div class="hour-days">
                      <ar-status-dot [tone]="h.open ? 'green' : 'yellow'" [size]="6" />
                      <span>{{ h.days }}</span>
                    </div>
                    <span class="hour-time">{{ h.time }}</span>
                  </div>
                }
              </div>
            </ar-panel-card>

            <ar-panel-card title="Contato">
              <a routerLink="/painel/perfil/contatos" class="ar-ghost-btn" card-actions>
                <ar-icon name="edit" [size]="13" />
                Editar
              </a>
              <div class="contact-list">
                <div class="contact-row">
                  <div class="contact-icon whatsapp">
                    <ar-icon name="mail" [size]="15" />
                  </div>
                  <div>
                    <div class="contact-label">WhatsApp</div>
                    <div class="contact-value">{{ whatsapp }}</div>
                  </div>
                </div>
                <div class="contact-row">
                  <div class="contact-icon instagram">
                    <ar-icon name="share" [size]="15" />
                  </div>
                  <div>
                    <div class="contact-label">Instagram</div>
                    <div class="contact-value">{{ instagram }}</div>
                  </div>
                </div>
              </div>
            </ar-panel-card>
          </div>
        </div>
      </div>
    </ar-panel-shell>
  `,
  styles: `
    .body {
      flex: 1;
      padding: 22px 32px 28px;
      overflow-y: auto;
      scrollbar-width: none;
    }

    .body::-webkit-scrollbar {
      display: none;
    }

    .main-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }

    .col-left,
    .col-right {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }

    .cover {
      height: 150px;
      position: relative;
      overflow: hidden;
      border-radius: var(--nx-r-4);
      flex: none;
    }

    .cover-svg {
      position: absolute;
      inset: 0;
      display: block;
    }

    .cover-edit {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: var(--nx-r-2);
      background: rgba(11, 11, 12, 0.72);
      backdrop-filter: blur(12px);
      border: 1px solid var(--nx-line-strong);
      color: var(--nx-text);
      cursor: pointer;
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12px;
    }

    .identity {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-top: -46px;
      padding: 0 4px;
    }

    .identity-avatar {
      width: 74px;
      height: 74px;
      border-radius: 18px;
      flex: none;
      background: linear-gradient(135deg, #f0a830 0%, #2260b8 100%);
      border: 4px solid var(--nx-bg);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      display: grid;
      place-items: center;
      font-family: var(--nx-font-display);
      font-weight: 900;
      font-size: 17px;
      color: #fff;
    }

    .identity-body {
      margin-top: 40px;
      min-width: 0;
    }

    .identity-name-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .identity-name-row h1 {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.02em;
      color: var(--nx-text);
      margin: 0;
    }

    .identity-city {
      font-size: 12.5px;
      color: var(--nx-text-dim);
      margin-top: 4px;
    }

    .stats-row {
      display: flex;
      gap: 10px;
    }

    .stat {
      flex: 1;
      padding: 12px 10px;
      border-radius: var(--nx-r-2);
      text-align: center;
      background: var(--nx-surface-1);
      border: 1px solid var(--nx-line);
    }

    .stat.accent {
      background: var(--nx-orange-tint);
      border-color: rgba(255, 106, 26, 0.28);
    }

    .stat-value {
      font-family: var(--nx-font-display);
      font-weight: 800;
      font-size: 19px;
      color: var(--nx-text);
    }

    .stat.accent .stat-value {
      color: var(--nx-orange-500);
    }

    .stat-label {
      font-family: var(--nx-font-mono);
      font-size: 9px;
      color: var(--nx-text-dim);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-top: 4px;
    }

    .text {
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--nx-text-mute);
      margin: 0;
    }

    .address {
      margin: 0 0 6px;
      font-size: 13px;
    }

    .full-city {
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .sports {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .completeness-track {
      height: 8px;
      border-radius: 4px;
      background: var(--nx-surface-1);
      overflow: hidden;
      margin-bottom: 10px;
    }

    .completeness-fill {
      width: 80%;
      height: 100%;
      border-radius: 4px;
      background: var(--nx-orange-500);
    }

    .completeness-hint {
      font-size: 12px;
      color: var(--nx-text-dim);
    }

    .hour-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--nx-line);
    }

    .hour-row:last-child {
      border-bottom: none;
    }

    .hour-days {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12.5px;
      color: var(--nx-text-mute);
    }

    .hour-time {
      font-family: var(--nx-font-mono);
      font-weight: 700;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .contact-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .contact-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .contact-icon {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      flex: none;
      display: grid;
      place-items: center;
    }

    .contact-icon.whatsapp {
      background: rgba(37, 211, 102, 0.12);
      color: #25d366;
    }

    .contact-icon.instagram {
      background: var(--nx-orange-tint);
      color: var(--nx-orange-500);
    }

    .contact-label {
      font-family: var(--nx-font-display);
      font-weight: 600;
      font-size: 12.5px;
      color: var(--nx-text);
    }

    .contact-value {
      font-family: var(--nx-font-mono);
      font-size: 11px;
      color: var(--nx-text-dim);
    }

    @media (max-width: 1180px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PanelProfileComponent {
  private readonly auth = inject(AuthService);

  protected readonly city = CITY;
  protected readonly address = ADDRESS;
  protected readonly fullCity = FULL_CITY;
  protected readonly description = DESCRIPTION;
  protected readonly sports = SPORTS;
  protected readonly hours = HOURS;
  protected readonly whatsapp = WHATSAPP;
  protected readonly instagram = INSTAGRAM;
  protected readonly coverLines = [120, 280, 440, 600, 760, 920];

  protected readonly stats: ProfileStat[] = [
    { label: 'avaliação', value: RATING, accent: true },
    { label: 'avaliações', value: REVIEWS, accent: false },
    { label: 'seguidores', value: FOLLOWERS, accent: false },
    { label: 'visitas/sem', value: WEEK_VIEWS, accent: false },
  ];

  protected readonly arenaName = computed(() => this.auth.displayName() || 'Arena');
  protected readonly initials = computed(() => initialsOf(this.arenaName()));
}
