'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

/**
 * Destructive actions go through here. `requireAcknowledge` adds a checkbox
 * for the truly irreversible one (clearing a game), so a mis-tap on a tablet
 * cannot delete a lesson's worth of scores.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: 'default' | 'destructive' | 'lemon' | 'accent';
  requireAcknowledge?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmVariant = 'destructive',
  requireAcknowledge,
  onConfirm,
}: ConfirmDialogProps) {
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [working, setWorking] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAcknowledged(false);
      setWorking(false);
    }
  }, [open]);

  const blocked = Boolean(requireAcknowledge) && !acknowledged;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requireAcknowledge ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-md bg-destructive/10 p-3 ring-1 ring-destructive/30">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 size-5 accent-magenta"
            />
            <Label className="cursor-pointer text-sm font-medium leading-snug">
              {requireAcknowledge}
            </Label>
          </label>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>
            {t.admin.cancel}
          </Button>
          <Button
            variant={confirmVariant}
            disabled={blocked || working}
            onClick={async () => {
              setWorking(true);
              await onConfirm();
              setWorking(false);
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
