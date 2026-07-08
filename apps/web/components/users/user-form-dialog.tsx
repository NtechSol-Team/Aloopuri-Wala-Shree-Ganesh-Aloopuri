'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { useOutlets, useSaveOutlet, type Outlet } from '@/hooks/useOutlets';
import { useSaveUser, type ManagedUser } from '@/hooks/useUsers';
import { OutletPricesDialog } from '@/components/outlets/outlet-prices-dialog';
import type { UserRole } from '@/types/api';

const ROLES: Array<{ value: UserRole; label: string }> = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'GODOWN_MANAGER', label: 'Godown Manager' },
  { value: 'FRANCHISE_OWNER', label: 'Franchise Owner' },
  { value: 'CASHIER', label: 'Cashier' },
];
const needsOutlet = (r: UserRole) => r === 'FRANCHISE_OWNER' || r === 'CASHIER';

function suggestCode(name: string): string {
  const letters = name.trim().toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean).map((w) => w.slice(0, 4)).join('-');
  return letters ? `OUT-${letters}` : '';
}

const emptyOutlet = { name: '', code: '', address: '', phone: '', creditPeriodDays: 15, specialPricing: false };

export function UserFormDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (v: boolean) => void; user: ManagedUser | null }) {
  const isEdit = !!user;
  const { data: outlets } = useOutlets();
  const save = useSaveUser();
  const saveOutlet = useSaveOutlet();
  const [form, setForm] = useState({ name: '', email: '', userId: '', password: '', phone: '', role: 'FRANCHISE_OWNER' as UserRole, outletId: '' });
  const [addingOutlet, setAddingOutlet] = useState(false);
  const [newOutlet, setNewOutlet] = useState({ ...emptyOutlet });
  const [codeTouched, setCodeTouched] = useState(false);
  const [justCreatedOutlet, setJustCreatedOutlet] = useState<Outlet | null>(null);

  useEffect(() => {
    if (open) {
      setForm(
        user
          ? { name: user.name, email: user.email, userId: user.userId, password: '', phone: user.phone ?? '', role: user.role, outletId: user.outletId ?? '' }
          : { name: '', email: '', userId: '', password: '', phone: '', role: 'FRANCHISE_OWNER', outletId: outlets?.[0]?.id ?? '' },
      );
      setAddingOutlet(false);
      setNewOutlet({ ...emptyOutlet });
      setCodeTouched(false);
    }
  }, [open, user, outlets]);

  const setOutletName = (name: string) => setNewOutlet((o) => ({ ...o, name, code: codeTouched ? o.code : suggestCode(name) }));

  const createOutlet = () => {
    if (newOutlet.name.trim().length < 2) { toast.error('Enter an outlet name'); return; }
    if (newOutlet.code.trim().length < 2) { toast.error('Enter an outlet code'); return; }
    saveOutlet.mutate(
      {
        name: newOutlet.name.trim(), code: newOutlet.code.trim().toUpperCase(),
        address: newOutlet.address || undefined, phone: newOutlet.phone || undefined,
        creditPeriodDays: newOutlet.creditPeriodDays,
        pricingMode: newOutlet.specialPricing ? 'SPECIAL' : 'GENERIC',
      },
      {
        onSuccess: (created) => {
          toast.success(`Outlet "${created.name}" created`);
          setForm((f) => ({ ...f, outletId: created.id }));
          setAddingOutlet(false);
          setNewOutlet({ ...emptyOutlet });
          if (newOutlet.specialPricing) setJustCreatedOutlet(created);
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  const submit = () => {
    if (form.name.trim().length < 2) return toast.error('Enter a name');
    if (!isEdit && !/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) return toast.error('Enter a valid email');
    if (!isEdit && form.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (needsOutlet(form.role) && !form.outletId) return toast.error('Select an outlet for this role');

    save.mutate(
      {
        id: user?.id,
        name: form.name,
        email: form.email,
        password: isEdit ? undefined : form.password,
        userId: form.userId || undefined,
        phone: form.phone || undefined,
        role: form.role,
        outletId: needsOutlet(form.role) ? form.outletId : null,
      },
      {
        onSuccess: () => { toast.success(isEdit ? 'User updated' : 'User created'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isEdit ? 'Edit User' : 'Add User'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5"><Label required>Full name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>

            <div className="space-y-1.5">
              <Label required={!isEdit}>Email</Label>
              <Input type="email" value={form.email} disabled={isEdit} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>User ID</Label>
              <Input value={form.userId} disabled={isEdit} placeholder={isEdit ? undefined : 'auto (EMP-…)'} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
            </div>

            {!isEdit && (
              <div className="space-y-1.5"><Label required>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            )}
            <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>

            <div className="space-y-1.5">
              <Label required>Role</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </div>
            {needsOutlet(form.role) && (
              <div className="space-y-1.5">
                <Label required>Outlet</Label>
                {addingOutlet ? null : (
                  <div className="flex gap-2">
                    <Select className="flex-1" value={form.outletId} onChange={(e) => setForm({ ...form, outletId: e.target.value })}>
                      <option value="">Select…</option>
                      {outlets?.map((o) => <option key={o.id} value={o.id}>{o.name}{o.pricingMode === 'SPECIAL' ? ' ★' : ''}</option>)}
                    </Select>
                    <Button type="button" variant="secondary" onClick={() => setAddingOutlet(true)}><Plus className="h-4 w-4" /> New</Button>
                  </div>
                )}
              </div>
            )}

            {needsOutlet(form.role) && addingOutlet && (
              <div className="sm:col-span-2 space-y-3 rounded-md border border-border bg-surface p-3">
                <p className="text-caption font-semibold uppercase text-muted-foreground">New outlet</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label required>Outlet name</Label><Input value={newOutlet.name} onChange={(e) => setOutletName(e.target.value)} placeholder="e.g. Piplod Outlet" /></div>
                  <div className="space-y-1.5"><Label required>Code</Label><Input value={newOutlet.code} onChange={(e) => { setCodeTouched(true); setNewOutlet((o) => ({ ...o, code: e.target.value.toUpperCase() })); }} placeholder="OUT-PIPLOD" /></div>
                  <div className="sm:col-span-2 space-y-1.5"><Label>Address</Label><Input value={newOutlet.address} onChange={(e) => setNewOutlet((o) => ({ ...o, address: e.target.value }))} placeholder="Optional" /></div>
                  <div className="space-y-1.5"><Label>Phone</Label><Input value={newOutlet.phone} onChange={(e) => setNewOutlet((o) => ({ ...o, phone: e.target.value }))} placeholder="Optional" /></div>
                  <div className="space-y-1.5"><Label>Credit period (days)</Label><Input type="number" value={newOutlet.creditPeriodDays} onChange={(e) => setNewOutlet((o) => ({ ...o, creditPeriodDays: Number(e.target.value) }))} /></div>
                </div>
                <label className="flex items-start gap-2 rounded-md border border-border bg-card p-2.5 text-body">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={newOutlet.specialPricing} onChange={(e) => setNewOutlet((o) => ({ ...o, specialPricing: e.target.checked }))} />
                  <span>
                    <span className="flex items-center gap-1 font-medium"><Tag className="h-3.5 w-3.5 text-primary" /> Special price selling</span>
                    <span className="block text-caption text-muted-foreground">This outlet gets its own negotiated prices instead of the standard catalog price. You&apos;ll set the actual prices right after creating it.</span>
                  </span>
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => { setAddingOutlet(false); setNewOutlet({ ...emptyOutlet }); }}>Cancel</Button>
                  <Button type="button" size="sm" loading={saveOutlet.isPending} onClick={createOutlet}>Create Outlet</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} loading={save.isPending}>{isEdit ? 'Save' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OutletPricesDialog outlet={justCreatedOutlet} onClose={() => setJustCreatedOutlet(null)} />
    </>
  );
}
