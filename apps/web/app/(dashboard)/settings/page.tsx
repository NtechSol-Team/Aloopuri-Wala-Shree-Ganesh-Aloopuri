'use client';

import { useState } from 'react';
import { Store, Pencil, FileText, ShieldCheck, AlertTriangle, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { useAuthStore } from '@/store/auth.store';
import { useOutlets, type Outlet } from '@/hooks/useOutlets';
import { OutletDetailsDialog } from '@/components/settings/outlet-details-dialog';
import { OutletDocumentsDialog } from '@/components/settings/outlet-documents-dialog';

/**
 * Settings — outlet business details and paperwork, maintained by the main owner.
 *
 * Creating an outlet stays in the passphrase-gated developer window on purpose;
 * this page is for keeping the outlets you already have accurate, because their
 * address/GSTIN/licence print on their own receipts and invoices.
 */
export default function SettingsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN';
  const { data: outlets, isLoading } = useOutlets();

  const [editing, setEditing] = useState<Outlet | null>(null);
  const [docsFor, setDocsFor] = useState<Outlet | null>(null);

  if (!isAdmin) {
    return (
      <Card className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <p className="text-body text-muted-foreground">Only the main owner can manage outlet settings.</p>
      </Card>
    );
  }

  const active = (outlets ?? []).filter((o) => o.isActive);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-body font-medium">Outlet Settings</p>
        <p className="text-caption text-muted-foreground">
          Each outlet prints its own address and GSTIN on its receipts. Keep these current, and store their
          GST certificates and licences here.
        </p>
      </div>

      {isLoading ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</Card>
      ) : !active.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <Store className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No outlets yet.</p>
          <p className="text-caption text-muted-foreground">New outlets are created from the developer window.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Outlet</TH>
                <TH>Address</TH>
                <TH>GSTIN</TH>
                <TH>FSSAI</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {active.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-caption text-muted-foreground">{o.code}</p>
                  </TD>
                  <TD className="max-w-xs">
                    {o.address
                      ? <span className="line-clamp-2 text-caption">{o.address}</span>
                      : <Missing text="No address" />}
                  </TD>
                  <TD>
                    {o.gstin ? (
                      <Badge variant="success"><ShieldCheck className="mr-1 -ml-0.5 inline h-3 w-3" />{o.gstin}</Badge>
                    ) : o.gstBilling ? (
                      // Billed with GST but no GSTIN on file — their invoices can't carry a
                      // buyer GSTIN, so they can't claim input credit on what they buy.
                      <Missing text="Not set" warn />
                    ) : (
                      <span className="text-caption text-muted-foreground">No-GST outlet</span>
                    )}
                  </TD>
                  <TD>
                    {o.fssaiNumber
                      ? <span className="text-caption">{o.fssaiNumber}</span>
                      : <Missing text="Not set" />}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(o)}>
                        <Pencil className="h-3.5 w-3.5" /> Details
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDocsFor(o)}>
                        <FileText className="h-3.5 w-3.5" /> Documents
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <p className="text-caption text-muted-foreground">
        Adding a new outlet is done from the developer window, not here.
      </p>

      <OutletDetailsDialog outlet={editing} onClose={() => setEditing(null)} />
      <OutletDocumentsDialog outlet={docsFor} onClose={() => setDocsFor(null)} />
    </div>
  );
}

function Missing({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-caption ${warn ? 'font-medium text-warning' : 'text-muted-foreground'}`}>
      {warn && <AlertTriangle className="h-3.5 w-3.5" />}{text}
    </span>
  );
}
