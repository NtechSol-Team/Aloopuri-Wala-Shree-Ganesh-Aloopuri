'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Route error:', error);
  }, [error]);

  const isChunkError = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(error.message);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-danger/10 text-danger">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h2 className="text-page-heading font-bold">Something went wrong</h2>
      <p className="max-w-md text-body text-muted-foreground">
        {isChunkError
          ? 'The app was updated. Please reload the page to get the latest version.'
          : error.message || 'An unexpected error occurred.'}
      </p>
      <div className="flex gap-2">
        <button onClick={() => (isChunkError ? window.location.reload() : reset())} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-body font-medium text-primary-foreground hover:bg-primary/90">
          <RefreshCw className="h-4 w-4" /> {isChunkError ? 'Reload' : 'Try again'}
        </button>
        <a href="/" className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-body font-medium hover:bg-surface">Go home</a>
      </div>
    </div>
  );
}
