'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { Reveal } from '@/components/motion/Reveal';

type Step = { n: string; title: string; desc: string; image: string; alt: string };
type Base = { ry: number; rx: number; ty: number };

const STEPS: Step[] = [
  {
    n: 'JOGUE',
    title: 'Participe de torneios',
    desc: 'Encontre torneios, inscreva sua dupla e acompanhe o ranking ao vivo.',
    image: '/app/atletas.png',
    alt: 'Tela inicial do app nexaGO para atletas, com torneio em destaque e missões',
  },
  {
    n: 'ORGANIZE',
    title: 'Crie torneios',
    desc: 'Crie etapas, gere chaves automáticas e gerencie tudo num painel só.',
    image: '/app/organizadores.png',
    alt: 'Tela de gerenciamento de torneio do nexaGO, com categorias, financeiro e partidas',
  },
  {
    n: 'GERENCIE',
    title: 'Sua arena',
    desc: 'Gerencie suas quadras, horários, aluguéis e a agenda da sua arena.',
    image: '/app/arenas.png',
    alt: 'Tela de gerenciamento de arena do nexaGO, com quadras, horários, aluguéis e agenda',
  },
];
const BASE: Base[] = [
  { ry: 17, rx: 3, ty: 0 },
  { ry: 0, rx: 0, ty: -24 },
  { ry: -17, rx: 3, ty: 0 },
];

export function ShowcasePhones() {
  const [active, setActive] = useState<number | null>(null);
  const [interactive, setInteractive] = useState(false); // desktop + sem reduced-motion

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setInteractive(mq.matches && !rm.matches);
    update();
    mq.addEventListener('change', update);
    rm.addEventListener('change', update);
    return () => {
      mq.removeEventListener('change', update);
      rm.removeEventListener('change', update);
    };
  }, []);

  const transformFor = (i: number): string | undefined => {
    if (!interactive) return undefined;
    const b = BASE[i];
    if (active === i) return `perspective(1600px) rotateX(0deg) rotateY(0deg) translateY(${b.ty - 14}px) scale(1.06)`;
    const scale = active !== null ? 0.96 : 1;
    return `perspective(1600px) rotateY(${b.ry}deg) rotateX(${b.rx}deg) translateY(${b.ty}px) scale(${scale})`;
  };

  const onMove = (e: MouseEvent<HTMLDivElement>, i: number) => {
    if (!interactive || active !== i) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const rx = (-py * 9).toFixed(2);
    const ry = (px * 9).toFixed(2);
    el.style.transform = `perspective(1600px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${BASE[i].ty - 14}px) scale(1.06)`;
  };

  return (
    <div className="mt-16 grid grid-cols-1 gap-14 sm:gap-12 lg:mt-20 lg:grid-cols-3 lg:items-start lg:gap-8">
      {STEPS.map((s, i) => {
        const focused = active === i;
        const dimmed = active !== null && active !== i;
        return (
          <Reveal key={s.n} delay={i * 0.1}>
            <div
              className={`flex flex-col items-center transition-opacity duration-300 ${dimmed ? 'opacity-50' : 'opacity-100'}`}
            >
              <div
                onMouseEnter={() => interactive && setActive(i)}
                onMouseLeave={() => setActive(null)}
                onMouseMove={(e) => onMove(e, i)}
                style={{ transform: transformFor(i) }}
                className={`relative mx-auto w-full max-w-[218px] transition-transform duration-300 ease-out [transform-style:preserve-3d] ${focused ? 'z-10' : ''}`}
              >
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -inset-8 -z-10 rounded-full transition-opacity duration-300 ${focused ? 'opacity-100' : 'opacity-60'}`}
                  style={{ background: 'radial-gradient(closest-side, rgba(255,106,26,0.22), transparent 70%)' }}
                />
                <div
                  className={`rounded-[2.6rem] border bg-[#0c0c0e] p-[6px] shadow-elev-3 transition-colors duration-300 ${focused ? 'border-brand/40' : 'border-[#26262b]'}`}
                >
                  <div className="overflow-hidden rounded-[2.2rem]">
                    <Image
                      src={s.image}
                      alt={s.alt}
                      width={1179}
                      height={2556}
                      sizes="(max-width: 1024px) 60vw, 218px"
                      className="h-auto w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-10 text-center">
                <span className="font-mono text-sm font-600 tracking-widest text-brand">{s.n}</span>
                <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-fg">{s.title}</h3>
                <p className="mx-auto mt-2 max-w-[260px] text-sm leading-relaxed text-text-mute">{s.desc}</p>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
