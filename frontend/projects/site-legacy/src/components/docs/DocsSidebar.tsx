'use client';

import { useEffect, useState } from 'react';

export type SidebarGroup = { title: string; items: { id: string; title: string }[] };

/** Sumário lateral com destaque da seção visível (scrollspy). */
export function DocsSidebar({ groups }: { groups: SidebarGroup[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [groups]);

  return (
    <nav aria-label="Nesta página" className="space-y-6">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            {group.title}
          </p>
          <ul className="space-y-0.5 border-l border-line">
            {group.items.map((item) => {
              const isActive = active === item.id;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={`-ml-px block border-l py-1 pl-3.5 pr-2 text-[13px] leading-snug transition-colors duration-150 ${
                      isActive
                        ? 'border-brand font-semibold text-brand'
                        : 'border-transparent text-text-mute hover:border-line-strong hover:text-fg'
                    }`}
                  >
                    {item.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
