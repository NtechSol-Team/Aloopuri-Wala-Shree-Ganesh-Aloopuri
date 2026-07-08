'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Users, Truck, MoreHorizontal, Landmark } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useSaveContact, type Contact, type ContactType } from '@/hooks/useContacts';
import { useGstLookup } from '@/hooks/useGst';

const empty = {
  name: '', gstin: '', legalName: '', tradeName: '', stateCode: '', stateName: '', address: '',
  phone: '', whatsapp: '', email: '',
  bankAccountHolder: '', bankName: '', bankAccountNumber: '', bankIfsc: '',
};

const TYPE_OPTIONS: Array<{ key: ContactType; label: string; icon: typeof Users }> = [
  { key: 'CUSTOMER', label: 'Customer', icon: Users },
  { key: 'SUPPLIER', label: 'Supplier', icon: Truck },
  { key: 'OTHER', label: 'Other', icon: MoreHorizontal },
];

export function ContactFormDialog({ open, onOpenChange, contact, defaultType }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact | null;
  defaultType: ContactType;
}) {
  const save = useSaveContact();
  const lookup = useGstLookup();
  const [type, setType] = useState<ContactType>(defaultType);
  const [form, setForm] = useState({ ...empty });
  const isEdit = !!contact;
  // Once the user (or an edit load) sets whatsapp independently of phone, stop auto-mirroring it.
  const whatsappTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setType(contact.type);
      whatsappTouched.current = true; // respect the saved value, don't overwrite on phone edits
      setForm({
        name: contact.name, gstin: contact.gstin ?? '', legalName: contact.legalName ?? '', tradeName: contact.tradeName ?? '',
        stateCode: contact.stateCode ?? '', stateName: contact.stateName ?? '', address: contact.address ?? '',
        phone: contact.phone ?? '', whatsapp: contact.whatsapp ?? '', email: contact.email ?? '',
        bankAccountHolder: contact.bankAccountHolder ?? '', bankName: contact.bankName ?? '',
        bankAccountNumber: contact.bankAccountNumber ?? '', bankIfsc: contact.bankIfsc ?? '',
      });
    } else {
      setType(defaultType);
      whatsappTouched.current = false;
      setForm({ ...empty });
    }
  }, [open, contact, defaultType]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // WhatsApp defaults to whatever phone number is typed, until the user edits WhatsApp directly.
  const setPhone = (v: string) => setForm((f) => ({ ...f, phone: v, whatsapp: whatsappTouched.current ? f.whatsapp : v }));
  const setWhatsapp = (v: string) => { whatsappTouched.current = true; set('whatsapp', v); };

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
    if (form.name.trim().length < 2) { toast.error('Enter a name'); return; }
    save.mutate(
      { id: contact?.id, type, ...form, gstin: form.gstin || undefined, email: form.email || undefined },
      { onSuccess: () => { toast.success(isEdit ? 'Contact updated' : 'Contact created'); onOpenChange(false); }, onError: (e) => toast.error(apiErrorMessage(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Contact' : 'Add Contact'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label required>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md border-2 py-2 text-body font-semibold transition-colors',
                    type === t.key ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground hover:border-primary/40',
                  )}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>GSTIN</Label>
            <div className="flex gap-2">
              <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" maxLength={15} />
              <Button type="button" variant="secondary" loading={lookup.isPending} onClick={fetchGstin}><Sparkles className="h-4 w-4" /> Fetch</Button>
            </div>
            {form.stateName && <p className="text-caption text-muted-foreground">State: {form.stateName} ({form.stateCode})</p>}
          </div>
          <div className="sm:col-span-2 space-y-1.5"><Label required>Name</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Legal name</Label><Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Trade name</Label><Input value={form.tradeName} onChange={(e) => set('tradeName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Same as phone by default" />
          </div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>

          <div className="sm:col-span-2 mt-1 flex items-center gap-1.5 border-t border-border pt-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" /> Bank details <span className="font-normal normal-case">(optional)</span>
          </div>
          <div className="space-y-1.5"><Label>Account holder</Label><Input value={form.bankAccountHolder} onChange={(e) => set('bankAccountHolder', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Bank name</Label><Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Account number</Label><Input value={form.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>IFSC</Label><Input value={form.bankIfsc} onChange={(e) => set('bankIfsc', e.target.value.toUpperCase())} maxLength={11} /></div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{isEdit ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
