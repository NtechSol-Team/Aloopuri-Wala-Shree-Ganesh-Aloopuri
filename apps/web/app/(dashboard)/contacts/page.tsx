'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Search, Contact as ContactIcon, Users, Truck, MoreHorizontal, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useContacts, useDeleteContact, type Contact, type ContactType } from '@/hooks/useContacts';
import { ContactFormDialog } from '@/components/contacts/contact-form-dialog';

const TABS: Array<{ key: ContactType | 'ALL'; label: string; icon: typeof Users }> = [
  { key: 'ALL', label: 'All', icon: ContactIcon },
  { key: 'CUSTOMER', label: 'Customers', icon: Users },
  { key: 'SUPPLIER', label: 'Suppliers', icon: Truck },
  { key: 'OTHER', label: 'Other', icon: MoreHorizontal },
];

const TYPE_BADGE: Record<ContactType, { label: string; variant: BadgeProps['variant'] }> = {
  CUSTOMER: { label: 'Customer', variant: 'info' },
  SUPPLIER: { label: 'Supplier', variant: 'warning' },
  OTHER: { label: 'Other', variant: 'neutral' },
};

function waLink(whatsapp: string): string {
  return `https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`;
}

export default function ContactsPage() {
  const [tab, setTab] = useState<ContactType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useContacts({ search: search || undefined, type: tab === 'ALL' ? undefined : tab });
  const [editing, setEditing] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useDeleteContact();

  const addLabel = tab === 'ALL' ? 'Contact' : TYPE_BADGE[tab].label;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-border scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-body font-medium transition-colors',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, GSTIN, phone…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add {addLabel}</Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ContactIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No {tab === 'ALL' ? 'contacts' : TYPE_BADGE[tab].label.toLowerCase()} yet.</p>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first {addLabel.toLowerCase()}</Button>
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Name</TH>{tab === 'ALL' && <TH>Type</TH>}<TH>GSTIN</TH><TH>State</TH><TH>Phone</TH><TH>WhatsApp</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {data.map((c) => (
                <TR key={c.id} className="group">
                  <TD className="font-medium">{c.name}{c.legalName && c.legalName !== c.name && <span className="block text-caption text-muted-foreground">{c.legalName}</span>}</TD>
                  {tab === 'ALL' && <TD><Badge variant={TYPE_BADGE[c.type].variant}>{TYPE_BADGE[c.type].label}</Badge></TD>}
                  <TD>{c.gstin ? <Badge variant="info">{c.gstin}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                  <TD className="text-muted-foreground">{c.stateName ?? '—'}</TD>
                  <TD className="text-muted-foreground">{c.phone ?? '—'}</TD>
                  <TD>
                    {c.whatsapp ? (
                      <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-success hover:underline">
                        <MessageCircle className="h-3.5 w-3.5" /> {c.whatsapp}
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Remove" onClick={() => del.mutate(c.id, { onSuccess: () => toast.success('Contact removed'), onError: (e) => toast.error(apiErrorMessage(e)) })}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ContactFormDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        contact={editing}
        defaultType={tab === 'ALL' ? 'CUSTOMER' : tab}
      />
    </div>
  );
}
