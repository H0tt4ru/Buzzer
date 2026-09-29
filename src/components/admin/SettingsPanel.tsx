'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { CountdownSeconds, GameSettings } from '@/types/game';

/**
 * Settings are a patch, not a form submit: only the keys the teacher touched
 * are sent, and SQL whitelists them again in sanitize_settings. Adding a new
 * option means adding a row here and a key there — nothing in the buzzer path
 * changes.
 */
export function SettingsPanel({
  settings,
  onChange,
  busy = false,
}: {
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => Promise<void> | void;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Buzzer mode --------------------------------------------------- */}
      <Row label={t.admin.settingBuzzerMode}>
        <Choice
          value={settings.buzzer_mode}
          options={[
            { value: 'manual', label: t.admin.settingBuzzerManual },
            { value: 'auto', label: t.admin.settingBuzzerAuto },
          ]}
          disabled={busy}
          onSelect={(value) => void onChange({ buzzer_mode: value })}
        />
      </Row>

      {/* Countdown ----------------------------------------------------- */}
      <Row label={t.admin.settingCountdown}>
        <Choice
          value={settings.countdown_seconds}
          options={[
            { value: 0, label: t.admin.settingCountdownNone },
            { value: 3, label: t.admin.settingCountdown3 },
            { value: 5, label: t.admin.settingCountdown5 },
          ]}
          disabled={busy}
          onSelect={(value: CountdownSeconds) => void onChange({ countdown_seconds: value })}
        />
      </Row>

      {/* Toggles ------------------------------------------------------- */}
      <Toggle
        label={t.admin.settingSound}
        checked={settings.sound_enabled}
        disabled={busy}
        onChange={(value) => void onChange({ sound_enabled: value })}
      />
      <Toggle
        label={t.admin.settingLiveLeaderboard}
        checked={settings.live_leaderboard}
        disabled={busy}
        onChange={(value) => void onChange({ live_leaderboard: value })}
      />
      <Toggle
        label={t.admin.settingStudentLeaderboard}
        hint="Kalau dimatikan, siswa tidak menerima data klasemen sama sekali."
        checked={settings.student_leaderboard}
        disabled={busy}
        onChange={(value) => void onChange({ student_leaderboard: value })}
      />
      <Toggle
        label={t.admin.settingRequireReady}
        checked={settings.require_all_ready}
        disabled={busy}
        onChange={(value) => void onChange({ require_all_ready: value })}
      />
      <Toggle
        label={t.admin.settingExcludePrevious}
        checked={settings.exclude_previous_on_reopen}
        disabled={busy}
        onChange={(value) => void onChange({ exclude_previous_on_reopen: value })}
      />
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <Label className="text-sm font-bold">{label}</Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground text-balance">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Row label={label} hint={hint}>
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-bold text-muted-foreground">
          {checked ? t.common.on : t.common.off}
        </span>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </div>
    </Row>
  );
}

function Choice<T extends string | number>({
  value,
  options,
  disabled,
  onSelect,
}: {
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => onSelect(option.value)}
          className={cn(
            'rounded-sm px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50',
            option.value === value
              ? 'bg-lemon text-stage-900'
              : 'bg-white/5 text-muted-foreground ring-1 ring-white/10 hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
