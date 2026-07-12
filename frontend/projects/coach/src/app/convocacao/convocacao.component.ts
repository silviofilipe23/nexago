import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';

type ViewState = 'loading' | 'ready' | 'not-found' | 'not-mine' | 'already-responded' | 'responded';
type Response = 'confirmado' | 'talvez' | 'nao_vou';

interface CallUpView {
  coachName: string;
  title: string;
  message: string;
}

const RESPONSE_LABEL: Record<Response, string> = {
  confirmado: 'Confirmado',
  talvez: 'Talvez',
  nao_vou: 'Não vou',
};

function createFirestore(): Firestore {
  const app = getApps().length ? getApps()[0]! : initializeApp(environment.firebase);
  return getFirestore(app);
}

/** Tela de resposta à convocação — qualquer atleta convocado chega aqui via push/link. */
@Component({
  selector: 'co-convocacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="card">
        @switch (state()) {
          @case ('loading') {
            <p class="muted">Carregando convocação…</p>
          }
          @case ('not-found') {
            <p class="muted">Convocação não encontrada.</p>
          }
          @case ('not-mine') {
            <p class="muted">Você não foi convocado para este evento com esta conta.</p>
          }
          @case ('already-responded') {
            <p class="muted">Você já respondeu: <strong>{{ existingResponseLabel() }}</strong>.</p>
          }
          @case ('responded') {
            <p class="muted">Resposta registrada: <strong>{{ existingResponseLabel() }}</strong>. Obrigado!</p>
          }
          @case ('ready') {
            <h1>{{ callUp()?.title }}</h1>
            <p class="body-text">De <strong>{{ callUp()?.coachName }}</strong></p>
            @if (callUp()?.message) {
              <p class="body-text">{{ callUp()?.message }}</p>
            }
            @if (error(); as err) {
              <div class="co-alert" role="alert">{{ err }}</div>
            }
            <div class="actions">
              <button type="button" class="co-mini-btn co-mini-btn-primary" [disabled]="responding()" (click)="respond('confirmado')">Confirmar</button>
              <button type="button" class="co-mini-btn" [disabled]="responding()" (click)="respond('talvez')">Talvez</button>
              <button type="button" class="co-ghost-btn" [disabled]="responding()" (click)="respond('nao_vou')">Não vou</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .wrap {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: var(--nx-bg);
      padding: 24px;
    }
    .card {
      width: min(440px, 100%);
      background: var(--nx-surface-0);
      border: 1px solid var(--nx-line);
      border-radius: var(--nx-r-4);
      padding: 28px;
      color: var(--nx-text);
      font-family: var(--nx-font-ui);
    }
    h1 {
      font-family: var(--nx-font-display);
      font-size: 20px;
      margin: 0 0 10px;
    }
    .body-text {
      font-size: 14px;
      line-height: 1.5;
      color: var(--nx-text-mute);
      margin: 6px 0;
    }
    .muted {
      color: var(--nx-text-mute);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
  `,
})
export class ConvocacaoComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly firestore = createFirestore();

  protected readonly state = signal<ViewState>('loading');
  protected readonly callUp = signal<CallUpView | null>(null);
  protected readonly responding = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly existingResponse = signal<Response | null>(null);
  protected readonly existingResponseLabel = () => {
    const r = this.existingResponse();
    return r ? RESPONSE_LABEL[r] : '';
  };

  private coachUid = '';
  private callUpId = '';

  async ngOnInit(): Promise<void> {
    this.coachUid = this.route.snapshot.paramMap.get('coachUid') ?? '';
    this.callUpId = this.route.snapshot.paramMap.get('callUpId') ?? '';
    if (!this.coachUid || !this.callUpId) {
      this.state.set('not-found');
      return;
    }

    const snap = await getDoc(doc(this.firestore, 'coaches', this.coachUid, 'callUps', this.callUpId));
    if (!snap.exists()) {
      this.state.set('not-found');
      return;
    }

    const data = snap.data();
    const myUid = this.auth.user()?.uid ?? '';
    const recipients = Array.isArray(data['recipients']) ? (data['recipients'] as string[]) : [];
    if (!recipients.includes(myUid)) {
      this.state.set('not-mine');
      return;
    }

    this.callUp.set({
      coachName: (data['coachName'] as string | undefined) ?? 'Treinador',
      title: (data['title'] as string | undefined) ?? '',
      message: (data['message'] as string | undefined) ?? '',
    });

    const responses = (data['responses'] as Record<string, string> | undefined) ?? {};
    const mine = responses[myUid];
    if (mine && mine !== 'aguardando') {
      this.existingResponse.set(mine as Response);
      this.state.set('already-responded');
      return;
    }

    this.state.set('ready');
  }

  protected async respond(response: Response): Promise<void> {
    this.error.set(null);
    this.responding.set(true);
    try {
      const fn = httpsCallable(getFunctions(getApps()[0]!), 'respondToCallUp');
      await fn({ coachUid: this.coachUid, callUpId: this.callUpId, response });
      this.existingResponse.set(response);
      this.state.set('responded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Não foi possível registrar sua resposta.');
    } finally {
      this.responding.set(false);
    }
  }
}
