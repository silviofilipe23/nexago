'use client';

import { Building2, Share2 } from 'lucide-react';
import { Reveal } from '@/components/motion/Reveal';
import { Button, ButtonLink } from '@/components/ui/Button';

const INVITE_TITLE = 'nexaGO para arenas';
const INVITE_TEXT =
  'Conheça o nexaGO — a plataforma de torneios e ligas dos esportes de areia. Coloque sua arena no mapa e encha as quadras:';
const INVITE_URL = 'https://nexago.com.br/arenas';

/**
 * Convite viral: o atleta indica o nexaGO para a arena onde joga. Usa a Web Share
 * API nativa (sheet do sistema no mobile) com fallback para WhatsApp Web no desktop.
 * Sem backend — só encaminha a mensagem de convite. Ação secundária leva o gestor
 * direto ao formulário de cadastro (#contato).
 */
export function ConviteArena() {
  async function handleInvite() {
    const message = `${INVITE_TEXT} ${INVITE_URL}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: INVITE_TITLE, text: INVITE_TEXT, url: INVITE_URL });
      } catch {
        // Compartilhamento cancelado pelo usuário — nada a fazer.
      }
      return;
    }

    // Fallback (desktop sem Web Share): abre o WhatsApp com a mensagem pronta.
    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <section className="relative mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
      <Reveal>
        <div className="relative overflow-hidden rounded-5 border border-brand/20 bg-surface-1 p-8 text-center sm:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(40rem 20rem at 50% -10%, rgba(255,106,26,0.12), transparent 60%)',
            }}
          />

          <div className="relative">
            <div className="mx-auto mb-6 inline-flex size-14 items-center justify-center rounded-4 border border-brand/20 bg-brand-tint text-brand">
              <Building2 className="size-7" aria-hidden="true" />
            </div>

            <h2 className="font-display text-[clamp(1.6rem,4.5vw,2.4rem)] font-700 leading-tight tracking-tight text-fg">
              A arena que você joga não está aqui?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base leading-relaxed text-text-mute sm:text-lg">
              Indique o nexaGO para a sua arena e ajude a trazer a sua quadra para a comunidade da
              areia — com perfil público, torneios e mais movimento.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button onClick={handleInvite}>
                Convidar arena
                <Share2 className="size-4" aria-hidden="true" />
              </Button>
              <ButtonLink href="#contato" variant="secondary">
                Sou da arena, quero cadastrar
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
