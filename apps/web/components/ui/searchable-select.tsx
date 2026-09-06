'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectItem {
  id: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

/**
 * A type-ahead dropdown for picking one of many named things (outlets, mainly) —
 * a plain <select> works but makes finding one of dozens by name slower than
 * typing a few letters. No portal/positioning library: the list is a plain
 * absolutely-positioned panel under the input, closed on outside click or Escape.
 */
export function SearchableSelect({
  items, value, onChange, placeholder = 'Search…', disabled, className,
}: {
  items: SearchableSelectItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.id === value);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) => i.label.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q))
    : items;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(
            'flex h-10 w-full rounded-sm border border-input bg-background pl-9 pr-9 text-base text-foreground',
            'transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:text-body',
          )}
          placeholder={selected ? selected.label : placeholder}
          disabled={disabled}
          value={open ? query : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); setQuery(''); (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Enter' && filtered.length === 1) { onChange(filtered[0].id); setOpen(false); setQuery(''); }
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {filtered.length === 0 ? (
            <p className="p-3 text-caption text-muted-foreground">No matches.</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => { onChange(item.id); setOpen(false); setQuery(''); }}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-body hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-40',
                  item.id === value && 'bg-accent/40',
                )}
              >
                <span className="font-medium">{item.label}</span>
                {item.sublabel && <span className="text-caption text-muted-foreground">{item.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
