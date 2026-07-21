'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Star, Store, UtensilsCrossed } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api';
import { useMenus, useCreateMenu, useUpdateMenu, useDeleteMenu } from '@/hooks/useMenus';
import { MenuEditorDialog } from './menu-editor-dialog';

/**
 * Menu Management (Main Owner only). Create outlet-specific menus, optionally by
 * importing an existing one (an independent copy), edit their items, set the
 * default, and delete. Assigning a menu to an outlet lives in Outlet Settings.
 */
export function MenuManagement() {
  const { data: menus, isLoading } = useMenus();
  const createMenu = useCreateMenu();
  const updateMenu = useUpdateMenu();
  const deleteMenu = useDeleteMenu();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-body font-medium">Menu Management</p>
          <p className="text-caption text-muted-foreground">
            Build a menu per outlet. Each menu&apos;s items, prices and categories are its own — importing copies a menu, and editing one never changes another.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New Menu</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !menus?.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <UtensilsCrossed className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No menus yet.</p>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Create the first menu</Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {menus.map((m) => (
            <Card key={m.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {m.name}
                    {m.isDefault && <Badge variant="success"><Star className="mr-0.5 -ml-0.5 inline h-3 w-3" />Default</Badge>}
                    {!m.isActive && <Badge variant="warning">Inactive</Badge>}
                  </p>
                  {m.description && <p className="line-clamp-1 text-caption text-muted-foreground">{m.description}</p>}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
                <span className="inline-flex items-center gap-1"><UtensilsCrossed className="h-3.5 w-3.5" />{m._count.items} items</span>
                <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" />{m._count.outlets} outlet{m._count.outlets === 1 ? '' : 's'}</span>
              </div>
              {m.outlets.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.outlets.map((o) => <Badge key={o.id} variant="info">{o.name}</Badge>)}
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                <Button size="sm" onClick={() => setEditingId(m.id)}><Pencil className="h-3.5 w-3.5" /> Edit items</Button>
                {!m.isDefault && (
                  <Button
                    size="sm" variant="secondary"
                    onClick={() => updateMenu.mutate({ id: m.id, isDefault: true }, { onSuccess: () => toast.success(`"${m.name}" is now the default menu`), onError: (e) => toast.error(apiErrorMessage(e)) })}
                  ><Star className="h-3.5 w-3.5" /> Make default</Button>
                )}
                {!m.isDefault && (
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      if (m._count.outlets > 0) { toast.error('Reassign its outlets to another menu first.'); return; }
                      if (confirm(`Delete menu "${m.name}"? This cannot be undone.`)) {
                        deleteMenu.mutate(m.id, { onSuccess: () => toast.success('Menu deleted'), onError: (e) => toast.error(apiErrorMessage(e)) });
                      }
                    }}
                  ><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateMenuDialog
        open={creating}
        onOpenChange={setCreating}
        menus={(menus ?? []).map((m) => ({ id: m.id, name: m.name }))}
        onCreated={(id) => { setCreating(false); setEditingId(id); }}
      />
      <MenuEditorDialog menuId={editingId} onClose={() => setEditingId(null)} />
    </div>
  );

  function CreateMenuDialog({
    open, onOpenChange, menus, onCreated,
  }: {
    open: boolean; onOpenChange: (v: boolean) => void; menus: Array<{ id: string; name: string }>; onCreated: (id: string) => void;
  }) {
    const [name, setName] = useState('');
    const [importFrom, setImportFrom] = useState('');

    const submit = () => {
      if (name.trim().length < 2) { toast.error('Give the menu a name'); return; }
      createMenu.mutate(
        { name: name.trim(), importFromMenuId: importFrom || undefined },
        {
          onSuccess: (menu) => {
            toast.success(importFrom ? `"${menu.name}" created from an existing menu` : `"${menu.name}" created`);
            setName(''); setImportFrom('');
            onCreated(menu.id);
          },
          onError: (e) => toast.error(apiErrorMessage(e)),
        },
      );
    };

    return (
      <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setName(''); setImportFrom(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Menu</DialogTitle>
            <DialogDescription>Start blank, or import all items from an existing menu as an independent copy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label required>Menu name</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vesu Menu" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </div>
            <div className="space-y-1.5">
              <Label>Import from existing menu</Label>
              <Select value={importFrom} onChange={(e) => setImportFrom(e.target.value)}>
                <option value="">— Start blank —</option>
                {menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <p className="text-caption text-muted-foreground">
                {importFrom ? 'All items and categories are copied. The new menu is fully independent afterwards.' : 'You can add items after creating the menu.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} loading={createMenu.isPending}>Create Menu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
