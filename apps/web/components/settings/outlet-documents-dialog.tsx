'use client';

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Upload, FileText, Trash2, ExternalLink, Loader2, Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/lib/api';
import {
  useOutletDocuments, useUploadOutletDocument, useDeleteOutletDocument, openOutletDocument,
  DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL,
  type Outlet, type DocumentCategory, type OutletDocument,
} from '@/hooks/useOutlets';

const prettySize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * The outlet's paperwork drawer: GST certificate, food licence, franchise
 * agreement and so on. Files are streamed back through an authenticated endpoint
 * (they're licences and signed agreements — not something to leave on a public URL),
 * so opening one fetches the bytes and hands the browser a blob.
 */
export function OutletDocumentsDialog({ outlet, onClose }: { outlet: Outlet | null; onClose: () => void }) {
  const outletId = outlet?.id ?? '';
  const { data: docs, isLoading } = useOutletDocuments(outlet ? outletId : null);
  const upload = useUploadOutletDocument(outletId);
  const remove = useDeleteOutletDocument(outletId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('GST_CERTIFICATE');
  const [opening, setOpening] = useState<string | null>(null);

  if (!outlet) return null;

  const reset = () => {
    setFile(null);
    setTitle('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const pick = (f: File | null) => {
    setFile(f);
    // Default the name to the file's own — the usual case is "just store this".
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = () => {
    if (!file) { toast.error('Choose a file to upload'); return; }
    if (title.trim().length < 2) { toast.error('Give the document a name'); return; }
    upload.mutate(
      { file, title: title.trim(), category },
      {
        onSuccess: () => { toast.success('Document uploaded'); reset(); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  const open = async (doc: OutletDocument) => {
    setOpening(doc.id);
    try { await openOutletDocument(outletId, doc); }
    catch (e) { toast.error(apiErrorMessage(e, 'Could not open the document')); }
    finally { setOpening(null); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Documents — {outlet.name}</DialogTitle>
          <DialogDescription>
            GST certificate, FSSAI licence, agreements. Only you and this outlet&apos;s own staff can open them.
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Document</Label>
              <Input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="cursor-pointer file:mr-3 file:rounded file:border-0 file:bg-primary file:px-2 file:py-1 file:text-primary-foreground"
                onChange={(e) => pick(e.target.files?.[0] ?? null)}
              />
              <p className="text-caption text-muted-foreground">PDF, JPG, PNG or WebP · up to 5 MB</p>
            </div>
            <div className="space-y-1.5">
              <Label required>Name</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. GST Certificate 2026" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={submit} loading={upload.isPending} disabled={!file}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
            </div>
          </div>
        </div>

        {/* Existing */}
        <div className="max-h-[40vh] space-y-2 overflow-y-auto scrollbar-thin">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)
          ) : !docs?.length ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Paperclip className="h-7 w-7 text-muted-foreground" />
              <p className="text-body text-muted-foreground">No documents on file for this outlet yet.</p>
            </div>
          ) : (
            docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{d.title}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {d.fileName} · {prettySize(d.sizeBytes)} · added {format(new Date(d.createdAt), 'dd MMM yyyy')}
                  </p>
                </div>
                <Badge variant="info">{DOCUMENT_CATEGORY_LABEL[d.category]}</Badge>
                <Button variant="ghost" size="icon" title="Open" onClick={() => open(d)}>
                  {opening === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remove"
                  onClick={() => remove.mutate(d.id, {
                    onSuccess: () => toast.success('Document removed'),
                    onError: (e) => toast.error(apiErrorMessage(e)),
                  })}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
