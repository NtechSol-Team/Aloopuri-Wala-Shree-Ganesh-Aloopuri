'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChefHat, CheckCheck, Soup, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSocket } from '@/lib/socket';
import { beepNewOrder } from '@/lib/beep';
import { useKitchenQueue, useUpdateKot, type KitchenTicket } from '@/hooks/usePos';

/** Wall-display kitchen board: tap a ticket to advance PREPARING → READY → done. */
export default function KitchenPage() {
  const { data: tickets } = useKitchenQueue();
  const update = useUpdateKot();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const knownIds = useRef<Set<string>>(new Set());

  // Clock tick for elapsed-time badges.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Realtime: refresh instantly on any KOT event; chime for brand-new tickets.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (msg: { data?: { action?: string } }) => {
      if (msg.data?.action === 'created') beepNewOrder();
      void qc.invalidateQueries({ queryKey: ['pos', 'kitchen'] });
    };
    socket.on('pos_kot', handler);
    return () => { socket.off('pos_kot', handler); };
  }, [qc]);

  // Chime for tickets that arrive via polling too (covers socket hiccups).
  useEffect(() => {
    if (!tickets) return;
    const fresh = tickets.filter((t) => !knownIds.current.has(t.id));
    if (knownIds.current.size > 0 && fresh.some((t) => t.kotStatus === 'PREPARING')) beepNewOrder();
    knownIds.current = new Set(tickets.map((t) => t.id));
  }, [tickets]);

  const preparing = (tickets ?? []).filter((t) => t.kotStatus === 'PREPARING');
  const ready = (tickets ?? []).filter((t) => t.kotStatus === 'READY');

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <Link href="/pos" className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
          <ChefHat className="h-6 w-6 shrink-0 text-amber-400" />
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Kitchen Orders</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Preparing <b className="text-lg">{preparing.length}</b></span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Ready <b className="text-lg">{ready.length}</b></span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
        <BoardColumn
          title="PREPARING"
          accent="amber"
          empty="No orders in the queue"
          tickets={preparing}
          now={now}
          actionLabel="Mark READY"
          onAction={(t) => update.mutate({ id: t.id, status: 'READY' })}
        />
        <BoardColumn
          title="READY — CALL TOKEN"
          accent="emerald"
          empty="Nothing waiting for pickup"
          tickets={ready}
          now={now}
          actionLabel="Delivered"
          onAction={(t) => update.mutate({ id: t.id, status: 'DELIVERED' })}
        />
      </div>
    </div>
  );
}

function BoardColumn({ title, accent, empty, tickets, now, actionLabel, onAction }: {
  title: string;
  accent: 'amber' | 'emerald';
  empty: string;
  tickets: KitchenTicket[];
  now: number;
  actionLabel: string;
  onAction: (t: KitchenTicket) => void;
}) {
  const border = accent === 'amber' ? 'border-amber-400/60' : 'border-emerald-400/60';
  const text = accent === 'amber' ? 'text-amber-400' : 'text-emerald-400';
  const bg = accent === 'amber' ? 'bg-amber-400/10' : 'bg-emerald-400/10';

  return (
    <section className="flex flex-col overflow-hidden border-r border-slate-800 last:border-r-0">
      <h2 className={cn('px-5 py-2.5 text-sm font-extrabold uppercase tracking-widest', text, bg)}>{title}</h2>
      <div className="grid flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-4 scrollbar-thin xl:grid-cols-2">
        {tickets.length === 0 ? (
          <div className="col-span-full flex flex-col items-center gap-2 py-16 text-slate-600">
            <Soup className="h-10 w-10" />
            <p>{empty}</p>
          </div>
        ) : (
          tickets.map((t) => {
            const mins = Math.max(0, Math.floor((now - new Date(t.soldAt).getTime()) / 60_000));
            const late = accent === 'amber' && mins >= 10;
            return (
              <button
                key={t.id}
                onClick={() => onAction(t)}
                className={cn(
                  'flex flex-col rounded-xl border-2 bg-slate-900 p-4 text-left transition-transform active:scale-[0.98]',
                  border,
                  late && 'border-red-500/80 animate-pulse',
                )}
              >
                <div className="flex items-start justify-between">
                  <span className={cn('text-4xl font-black leading-none', late ? 'text-red-400' : text)}>#{t.tokenNumber ?? '—'}</span>
                  <div className="flex items-center gap-1.5">
                    {t.orderType === 'PARCEL' && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-bold text-amber-300">
                        <ShoppingBag className="h-3 w-3" /> PARCEL
                      </span>
                    )}
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', late ? 'bg-red-500/15 text-red-400' : 'bg-slate-800 text-slate-400')}>{mins}m</span>
                  </div>
                </div>
                {t.customerName && <p className="mt-1 truncate text-xs text-slate-400">{t.customerName}</p>}
                <ul className="mt-3 space-y-1 text-[15px] leading-snug">
                  {t.items.map((it, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={cn('font-bold', text)}>{Number(it.quantity)}×</span>
                      <span className="text-slate-200">{it.productNameSnapshot}</span>
                    </li>
                  ))}
                </ul>
                <span className={cn('mt-3 inline-flex items-center gap-1.5 self-end rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide', bg, text)}>
                  <CheckCheck className="h-3.5 w-3.5" /> {actionLabel}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
