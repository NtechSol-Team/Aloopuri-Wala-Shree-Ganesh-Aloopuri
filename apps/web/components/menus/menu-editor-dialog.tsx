'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, EyeOff, FolderPlus, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import {
  useMenu, useCreateMenuCategory, useUpdateMenuCategory, useDeleteMenuCategory, useDeleteMenuItem,
  type MenuItem,
} from '@/hooks/useMenus';
import { MenuItemFormDialog } from './menu-item-form-dialog';

/** Full editor for one menu — its own categories and items. Every change here
 *  is isolated to this menu (imported menus are independent copies). */
export function MenuEditorDialog({ menuId, onClose }: { menuId: string | null; onClose: () => void }) {
  const { data: menu, isLoading } = useMenu(menuId);
  const createCat = useCreateMenuCategory(menuId ?? '');
  const renameCat = useUpdateMenuCategory(menuId ?? '');
  const deleteCat = useDeleteMenuCategory(menuId ?? '');
  const deleteItem = useDeleteMenuItem(menuId ?? '');

  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: MenuItem | null }>({ open: false, item: null });

  if (!menuId) return null;

  const addCategory = () => {
    const name = newCat.trim();
    if (name.length < 1) return;
    createCat.mutate(name, {
      onSuccess: () => { setNewCat(''); setAddingCat(false); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };
  const saveCatName = (id: string) => {
    const name = editCatName.trim();
    if (name.length < 1) { setEditingCatId(null); return; }
    renameCat.mutate({ id, name }, { onSuccess: () => setEditingCatId(null), onError: (e) => toast.error(apiErrorMessage(e)) });
  };

  const cats = menu?.categories ?? [];
  const items = menu?.items ?? [];
  const grouped = [
    ...cats.map((c) => ({ cat: c, items: items.filter((i) => i.categoryId === c.id) })),
    { cat: { id: '', name: 'Uncategorised', displayOrder: 999 }, items: items.filter((i) => !i.categoryId) },
  ].filter((g) => g.items.length > 0 || g.cat.id !== '');

  return (
    <>
      <Dialog open={!!menuId} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {menu?.name ?? 'Menu'}
              {menu?.isDefault && <Badge variant="success">Default</Badge>}
            </DialogTitle>
          </DialogHeader>

          {isLoading || !menu ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="space-y-4">
              {/* Categories */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-caption font-semibold uppercase text-muted-foreground">Categories</p>
                  {!addingCat && (
                    <Button size="sm" variant="ghost" onClick={() => setAddingCat(true)}><FolderPlus className="h-3.5 w-3.5" /> Add category</Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {cats.map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 text-caption">
                      {editingCatId === c.id ? (
                        <>
                          <input
                            autoFocus value={editCatName} onChange={(e) => setEditCatName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveCatName(c.id); if (e.key === 'Escape') setEditingCatId(null); }}
                            className="w-24 bg-transparent outline-none"
                          />
                          <button onClick={() => saveCatName(c.id)} title="Save"><Check className="h-3 w-3 text-success" /></button>
                          <button onClick={() => setEditingCatId(null)} title="Cancel"><X className="h-3 w-3 text-muted-foreground" /></button>
                        </>
                      ) : (
                        <>
                          <span className="font-medium">{c.name}</span>
                          <button onClick={() => { setEditingCatId(c.id); setEditCatName(c.name); }} title="Rename"><Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>
                          <button
                            onClick={() => { if (confirm(`Remove category "${c.name}"? Its items become uncategorised.`)) deleteCat.mutate(c.id, { onError: (e) => toast.error(apiErrorMessage(e)) }); }}
                            title="Remove"
                          ><Trash2 className="h-3 w-3 text-muted-foreground hover:text-danger" /></button>
                        </>
                      )}
                    </span>
                  ))}
                  {addingCat && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary bg-accent px-2 py-1 text-caption">
                      <input
                        autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Category name"
                        onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') { setAddingCat(false); setNewCat(''); } }}
                        className="w-28 bg-transparent outline-none"
                      />
                      <button onClick={addCategory} title="Add"><Check className="h-3 w-3 text-success" /></button>
                      <button onClick={() => { setAddingCat(false); setNewCat(''); }} title="Cancel"><X className="h-3 w-3 text-muted-foreground" /></button>
                    </span>
                  )}
                  {cats.length === 0 && !addingCat && <span className="text-caption text-muted-foreground">No categories yet.</span>}
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-caption font-semibold uppercase text-muted-foreground">Items ({items.length})</p>
                  <Button size="sm" onClick={() => setItemDialog({ open: true, item: null })}><Plus className="h-3.5 w-3.5" /> Add item</Button>
                </div>
                <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                  {items.length === 0 ? (
                    <p className="py-8 text-center text-caption text-muted-foreground">No items yet — add the first one.</p>
                  ) : grouped.map((g) => (
                    <div key={g.cat.id || 'uncat'}>
                      <p className="mb-1 text-caption font-semibold text-muted-foreground">{g.cat.name}</p>
                      <div className="divide-y divide-border rounded-lg border border-border">
                        {g.items.map((i) => (
                          <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className={cn('truncate font-medium', !i.isAvailable && 'text-muted-foreground')}>
                                {i.name}
                                {!i.isAvailable && <EyeOff className="ml-1 inline h-3.5 w-3.5 text-warning" />}
                              </p>
                              <p className="text-caption text-muted-foreground">{formatINR(i.price)} · GST {Number(i.taxPercent)}%</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button size="sm" variant="secondary" onClick={() => setItemDialog({ open: true, item: i })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => { if (confirm(`Remove "${i.name}" from this menu?`)) deleteItem.mutate(i.id, { onError: (e) => toast.error(apiErrorMessage(e)) }); }}
                              ><Trash2 className="h-3.5 w-3.5 text-danger" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <MenuItemFormDialog
        menuId={menuId}
        categories={cats}
        item={itemDialog.item}
        open={itemDialog.open}
        onOpenChange={(v) => setItemDialog((s) => ({ ...s, open: v }))}
      />
    </>
  );
}
