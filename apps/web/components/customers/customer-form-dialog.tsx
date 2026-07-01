'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api';
import { useSaveCustomer, type Customer } from '@/hooks/useCustomers';
import { useGstLookup } from '@/hooks/useGst';

const empty = { name: '', gstin: '', legalName: '', tradeName: '', stateCode: '', stateName: '', address: '', phone: '', email: '' };

export function CustomerFormDialog({ open, onOpenChange, customer }: { open: boolean; onOpenChange: (v: boolean) => void; customer: Customer | null }) {
  const save = useSaveCustomer();
  const lookup = useGstLookup();
  const [form, setForm] = useState({ ...empty });
  const isEdit = !!customer;

  useEffect(() => {
    if (open) {
      setForm(customer
        ? { name: customer.name, gstin: customer.gstin ?? '', legalName: customer.legalName ?? '', tradeName: customer.tradeName ?? '', stateCode: customer.stateCode ?? '', stateName: customer.stateName ?? '', address: customer.address ?? '', phone: customer.phone ?? '', email: customer.email ?? '' }
        : { ...empty });
    }
  }, [open, customer]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const fetchGstin = () => {
    const g = form.gstin.trim().toUpperCase();
    if (g.length !== 15) { toast.error('Enter a 15-character GSTIN'); return; }
    lookup.mutate(g, {
      onSuccess: (r) => {
        setForm((f) => ({
          ...f,
          gstin: r.gstin,
          name: f.name || r.tradeName || r.legalName || f.name,
          legalName: r.legalName ?? f.legalName,
          tradeName: r.tradeName ?? f.tradeName,
          stateCode: r.stateCode ?? f.stateCode,
          stateName: r.stateName ?? f.stateName,
          address: r.address ?? f.address,
        }));
        toast.success(r.source === 'gstzen' ? `Fetched from GSTzen · ${r.stateName ?? ''}` : `Valid GSTIN · ${r.stateName ?? ''} (add provider key for full details)`);
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  const submit = () => {
    if (form.name.trim().length < 2) { toast.error('Enter a customer name'); return; }
    save.mutate(
      { id: customer?.id, ...form, gstin: form.gstin || undefined, email: form.email || undefined },
      { onSuccess: () => { toast.success(isEdit ? 'Customer updated' : 'Customer created'); onOpenChange(false); }, onError: (e) => toast.error(apiErrorMessage(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>GSTIN</Label>
            <div className="flex gap-2">
              <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" maxLength={15} />
              <Button type="button" variant="secondary" loading={lookup.isPending} onClick={fetchGstin}><Sparkles className="h-4 w-4" /> Fetch</Button>
            </div>
            {form.stateName && <p className="text-caption text-muted-foreground">State: {form.stateName} ({form.stateCode})</p>}
          </div>
          <div className="col-span-2 space-y-1.5"><Label required>Customer name</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Legal name</Label><Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Trade name</Label><Input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{isEdit ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
