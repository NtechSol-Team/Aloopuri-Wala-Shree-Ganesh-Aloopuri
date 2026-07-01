'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Search, Contact } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { apiErrorMessage } from '@/lib/api';
import { useCustomers, useDeleteCustomer, type Customer } from '@/hooks/useCustomers';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useCustomers({ search: search || undefined });
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useDeleteCustomer();

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, GSTIN, phone…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Customer</Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Contact className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No customers yet.</p>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first customer</Button>
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>GSTIN</TH><TH>State</TH><TH>Phone</TH><TH>Email</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {data.map((c) => (
                <TR key={c.id} className="group">
                  <TD className="font-medium">{c.name}{c.legalName && c.legalName !== c.name && <span className="block text-caption text-muted-foreground">{c.legalName}</span>}</TD>
                  <TD>{c.gstin ? <Badge variant="info">{c.gstin}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                  <TD className="text-muted-foreground">{c.stateName ?? '—'}</TD>
                  <TD className="text-muted-foreground">{c.phone ?? '—'}</TD>
                  <TD className="text-muted-foreground">{c.email ?? '—'}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Remove" onClick={() => del.mutate(c.id, { onSuccess: () => toast.success('Customer removed'), onError: (e) => toast.error(apiErrorMessage(e)) })}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <CustomerFormDialog open={creating || !!editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }} customer={editing} />
    </div>
  );
}
