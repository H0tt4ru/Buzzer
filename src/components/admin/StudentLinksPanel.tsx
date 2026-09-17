'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Pencil, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copyText, parseNames, studentLink } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { AdminStudentRow } from '@/types/game';

/**
 * Link distribution. The token is the student's entire identity, so it is only
 * ever read here — the roster query in SQL joins it in for this panel alone
 * and never exposes it on the student side.
 */
export function StudentLinksPanel({
  students,
  onAdd,
  onRename,
  busy = false,
}: {
  students: AdminStudentRow[];
  onAdd: (names: string[]) => Promise<void> | void;
  onRename: (studentId: string, name: string) => Promise<void> | void;
  busy?: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newNames, setNewNames] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const copyOne = async (student: AdminStudentRow) => {
    const ok = await copyText(studentLink(student.token));
    if (!ok) {
      toast.error(t.errors.generic);
      return;
    }
    setCopiedId(student.id);
    window.setTimeout(() => setCopiedId((id) => (id === student.id ? null : id)), 1600);
  };

  const copyAll = async () => {
    const lines = students.map((s) => `${s.name}\t${studentLink(s.token)}`).join('\n');
    const ok = await copyText(lines);
    if (ok) toast.success(t.admin.copied);
    else toast.error(t.errors.generic);
  };

  const submitAdd = async () => {
    const names = parseNames(newNames, 1);
    if (names.length === 0) return;
    await onAdd(names);
    setNewNames('');
    setAdding(false);
  };

  const submitRename = async (studentId: string) => {
    const name = editValue.trim();
    if (name.length > 0) await onRename(studentId, name);
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground text-balance">{t.admin.linksHelp}</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void copyAll()} disabled={students.length === 0}>
          <Copy />
          {t.admin.copyAll}
        </Button>
        <Button variant="outline" onClick={() => setAdding((open) => !open)} disabled={busy}>
          {adding ? <X /> : <UserPlus />}
          {adding ? t.admin.cancel : t.admin.addStudents}
        </Button>
      </div>

      {adding ? (
        <div className="flex flex-col gap-2 rounded-md bg-white/5 p-3">
          <Label htmlFor="new-names">{t.admin.namesLabel}</Label>
          <Textarea
            id="new-names"
            value={newNames}
            onChange={(event) => setNewNames(event.target.value)}
            placeholder={t.admin.namesPlaceholder}
            className="min-h-24"
          />
          <p className="text-xs text-muted-foreground">{t.admin.namesHelp}</p>
          <Button onClick={() => void submitAdd()} disabled={busy || newNames.trim().length === 0}>
            {t.admin.addStudents}
          </Button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {students.map((student) => {
          const link = studentLink(student.token);
          const editing = editingId === student.id;

          return (
            <li
              key={student.id}
              className="flex flex-wrap items-center gap-2 rounded-md bg-white/5 px-3 py-2"
            >
              <span className="w-6 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                {student.seat_index}
              </span>

              {editing ? (
                <>
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submitRename(student.id);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    className="h-9 max-w-44 flex-1"
                  />
                  <Button size="sm" onClick={() => void submitRename(student.id)} disabled={busy}>
                    {t.admin.saveName}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    {t.admin.cancel}
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-semibold">{student.name}</span>

                  <code className="hidden min-w-0 max-w-64 flex-1 truncate rounded-sm bg-black/30 px-2 py-1 text-xs text-muted-foreground lg:block">
                    {link}
                  </code>

                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t.admin.rename}
                    onClick={() => {
                      setEditingId(student.id);
                      setEditValue(student.name);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t.admin.copyLink}
                    onClick={() => void copyOne(student)}
                  >
                    {copiedId === student.id ? <Check className="text-lime" /> : <Copy />}
                    <span className="hidden sm:inline">
                      {copiedId === student.id ? t.admin.copied : t.admin.copyLink}
                    </span>
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={link} asChild>
                    <a href={link} target="_blank" rel="noreferrer">
                      <ExternalLink />
                    </a>
                  </Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
