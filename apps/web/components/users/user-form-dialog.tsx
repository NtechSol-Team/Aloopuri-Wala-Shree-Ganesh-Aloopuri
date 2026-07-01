'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { useOutlets } from '@/hooks/useOutlets';
import { useSaveUser, type ManagedUser } from '@/hooks/useUsers';
import type { UserRole } from '@/types/api';

const ROLES: Array<{ value: UserRole; label: string }> = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'GODOWN_MANAGER', label: 'Godown Manager' },
  { value: 'FRANCHISE_OWNER', label: 'Franchise Owner' },
  { value: 'CASHIER', label: 'Cashier' },
];
const needsOutlet = (r: UserRole) => r === 'FRANCHISE_OWNER' || r === 'CASHIER';

export function UserFormDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (v: boolean) => void; user: ManagedUser | null }) {
  const isEdit = !!user;
  const { data: outlets } = useOutlets();
  const save = useSaveUser();
  const [form, setForm] = useState({ name: '', email: '', userId: '', password: '', phone: '', role: 'FRANCHISE_OWNER' as UserRole, outletId: '' });

  useEffect(() => {
    if (open) {
      setForm(
        user
          ? { name: user.name, email: user.email, userId: user.userId, password: '', phone: user.phone ?? '', role: user.role, outletId: user.outletId ?? '' }
          : { name: '', email: '', userId: '', password: '', phone: '', role: 'FRANCHISE_OWNER', outletId: outlets?.[0]?.id ?? '' },
      );
    }
  }, [open, user, outlets]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? 'Edit User' : 'Add User'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label required>Full name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>

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
              <Select value={form.outletId} onChange={(e) => setForm({ ...form, outletId: e.target.value })}>
                <option value="">Select…</option>
                {outlets?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{isEdit ? 'Save' : 'Create User'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
