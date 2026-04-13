import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-athlete-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="athlete-welcome card card-sub">
      <h1 class="title-lg welcome-title">Área do atleta</h1>
      <p class="text-body welcome-lead">
        Mesmo design system do hub NexaGO (violeta, azul e vidro).
      </p>
      <p class="text-muted">
        Login em tela dividida, redirect seguro e rota de exemplo protegida em <code>/painel</code>.
      </p>
      <div class="welcome-actions">
        <a routerLink="/entrar" [queryParams]="{ redirect: '/painel' }" class="btn-primary welcome-link">
          Entrar
        </a>
        <a routerLink="/painel" class="btn-secondary welcome-link-secondary">Painel (após login)</a>
      </div>
    </section>
  `,
  styles: `
    .athlete-welcome {
      padding: 1.5rem;
      max-width: 36rem;
    }
    .welcome-title {
      margin: 0 0 0.5rem;
    }
    .welcome-lead {
      margin: 0 0 0.75rem;
    }
    .welcome-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 1.25rem;
    }
    .welcome-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      border-radius: 1rem;
      font-weight: 600;
      padding: 14px 20px;
    }
    .welcome-link-secondary {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      border-radius: 1rem;
      font-weight: 600;
      padding: 14px 20px;
    }
    code {
      font-size: 0.82em;
      opacity: 0.9;
    }
  `,
})
export class AthleteHomeComponent {}
