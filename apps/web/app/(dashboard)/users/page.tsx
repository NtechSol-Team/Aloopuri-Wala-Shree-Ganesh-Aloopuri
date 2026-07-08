'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, KeyRound, UserX, Search, Users as UsersIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useUsers, useDeactivateUser, useResetPassword, type ManagedUser } from '@/hooks/useUsers';
import { UserFormDialog } from '@/components/users/user-form-dialog';
import type { UserRole } from '@/types/api';

const ROLE_LABEL: Record<UserRole, string> = { SUPER_ADMIN: 'Super Admin', GODOWN_MANAGER: 'Godown Manager', FRANCHISE_OWNER: 'Franchise Owner', CASHIER: 'Cashier' };
const roleBadge = (r: UserRole) => (r === 'SUPER_ADMIN' ? 'info' : r === 'GODOWN_MANAGER' ? 'warning' : 'neutral');

export default function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const { data, isLoading } = useUsers({ search: search || undefined, role: role || undefined });
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const deactivate = useDeactivateUser();

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search name, email, ID…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select className="w-44" value={role} onChange={(e) => setRole(e.target.value as UserRole | '')}>
              <option value="">All roles</option>
              {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </div>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add User</Button>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !data?.rows.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <UsersIcon className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No users found.</p>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first user</Button>
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>User ID</TH><TH>Email</TH><TH>Role</TH><TH>Outlet</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {data.rows.map((u) => {
                const self = u.id === me?.id;
                return (
                  <TR key={u.id} className="group">
                    <TD className="font-medium">{u.name}{self && <span className="ml-1 text-caption text-muted-foreground">(you)</span>}</TD>
                    <TD className="text-muted-foreground">{u.userId}</TD>
                    <TD className="text-muted-foreground">{u.email}</TD>
                    <TD><Badge variant={roleBadge(u.role)}>{ROLE_LABEL[u.role]}</Badge></TD>
                    <TD>{u.outlet?.name ?? '—'}</TD>
                    <TD><Badge variant={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset password" onClick={() => setResetUser(u)}><KeyRound className="h-4 w-4" /></Button>
                        {!self && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title={u.isActive ? 'Deactivate' : 'Already inactive'} disabled={!u.isActive}
                            onClick={() => deactivate.mutate(u.id, { onSuccess: () => toast.success('User deactivated'), onError: (e) => toast.error(apiErrorMessage(e)) })}>
                            <UserX className="h-4 w-4 text-danger" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <UserFormDialog open={creating || !!editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }} user={editing} />
      <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} />
    </div>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: ManagedUser | null; onClose: () => void }) {
  const reset = useResetPassword();
  const [password, setPassword] = useState('');

  const submit = () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (!user) return;
    reset.mutate({ id: user.id, password }, {
      onSuccess: () => { toast.success(`Password reset for ${user.name}`); setPassword(''); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reset password — {user?.name}</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label required>New password</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          <p className="text-caption text-muted-foreground">This signs the user out of all devices.</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={reset.isPending}>Reset Password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
