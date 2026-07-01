import { Hammer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function PagePlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-primary">
          <Hammer className="h-6 w-6" />
        </div>
        <h2 className="text-card-title font-semibold">{title}</h2>
        <p className="max-w-md text-body text-muted-foreground">
          {description ?? 'This module is being built and will be available shortly.'}
        </p>
      </CardContent>
    </Card>
  );
}
