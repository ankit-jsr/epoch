import {
  findCaptureOnDate,
  formatTs,
  hasViewport,
  tsDateUtc,
  type Capture,
  type Viewport,
} from './types';

type Props = {
  captures: Capture[];
  viewport: Viewport;
  aTs: string | null;
  bTs: string | null;
  onPickTs: (slot: 'a' | 'b', ts: string | null) => void;
  // Shown only when at least one of a/b is set.
  onClear?: () => void;
};

/** "07:31" from "2026-06-01T07-31". */
function timeOnly(ts: string): string {
  const [, t] = ts.split('T');
  return t ? t.replace('-', ':') : ts;
}

/** YYYY-MM-DD for (today UTC) minus N days. */
function utcMinusDays(daysAgo: number): string {
  const ms = Date.now() - daysAgo * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

type QuickPill = { label: string; daysAgo: number };
const QUICK_PILLS: QuickPill[] = [
  { label: 'Today', daysAgo: 0 },
  { label: 'Yesterday', daysAgo: 1 },
  { label: 'Day before', daysAgo: 2 },
  { label: '7 days ago', daysAgo: 7 },
  { label: '1 month ago', daysAgo: 30 },
  { label: '6 months ago', daysAgo: 180 },
];

function DateAndTimePicker({
  slot,
  label,
  captures,
  viewport,
  ts,
  minDate,
  maxDate,
  onPick,
}: {
  slot: 'a' | 'b';
  label: string;
  captures: Capture[];
  viewport: Viewport;
  ts: string | null;
  minDate?: string;
  maxDate?: string;
  onPick: (ts: string | null) => void;
}) {
  const dateValue = ts ? tsDateUtc(ts) : '';

  const capturesOnDate: Capture[] = dateValue
    ? captures.filter((c) => tsDateUtc(c.ts) === dateValue && hasViewport(c, viewport))
    : [];

  function handleDateChange(value: string) {
    if (!value) {
      onPick(null);
      return;
    }
    const cap = findCaptureOnDate(captures, value, viewport);
    onPick(cap ? cap.ts : null);
  }

  function handleTimeChange(value: string) {
    onPick(value || null);
  }

  return (
    <div className="dt-picker">
      <span className="muted dt-picker__label">{label}</span>
      <input
        type="date"
        className="dt-picker__date"
        value={dateValue}
        min={minDate}
        max={maxDate}
        onChange={(e) => handleDateChange(e.target.value)}
        data-slot={slot}
      />
      {capturesOnDate.length > 0 && (
        <select
          className="dt-picker__time"
          value={ts ?? ''}
          onChange={(e) => handleTimeChange(e.target.value)}
          title={`${capturesOnDate.length} capture${capturesOnDate.length === 1 ? '' : 's'} on this date`}
        >
          {capturesOnDate.map((c, i) => (
            <option key={c.ts} value={c.ts}>
              {timeOnly(c.ts)} UTC{i === 0 ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      )}
      {dateValue && capturesOnDate.length === 0 && (
        <span className="muted dt-picker__count error">no {viewport} captures on this date</span>
      )}
    </div>
  );
}

export function TimelineControls({
  captures,
  viewport,
  aTs,
  bTs,
  onPickTs,
  onClear,
}: Props) {
  const validDates = captures
    .filter((c) => c.viewports[viewport]?.ok === true)
    .map((c) => tsDateUtc(c.ts));
  const minDate = validDates.length ? validDates[validDates.length - 1] : undefined;
  const maxDate = validDates.length ? validDates[0] : undefined;

  // For each quick pill, find a capture on that exact UTC date with the current
  // viewport. If none exists, the pill is shown but disabled.
  const pillTargets = QUICK_PILLS.map((p) => {
    const date = utcMinusDays(p.daysAgo);
    const cap = findCaptureOnDate(captures, date, viewport);
    return { ...p, date, cap };
  });

  function handlePillClick(ts: string) {
    // First click goes to From if empty; second click (From already set) goes
    // to To, entering compare mode. Third click restarts at From.
    if (!aTs) {
      onPickTs('a', ts);
    } else if (!bTs && ts !== aTs) {
      onPickTs('b', ts);
    } else {
      onPickTs('a', ts);
      onPickTs('b', null);
    }
  }

  // Which pill (if any) maps to the current From / To capture?
  const activePillForA = pillTargets.find((p) => p.cap?.ts === aTs)?.label;
  const activePillForB = pillTargets.find((p) => p.cap?.ts === bTs)?.label;

  return (
    <div className="timeline-controls">
      <div className="timeline-controls__row">
        <span className="timeline-controls__label">Quick jump</span>
        <div className="pill-row">
          {pillTargets.map((p) => {
            const enabled = !!p.cap;
            const active = enabled && (p.cap!.ts === aTs || p.cap!.ts === bTs);
            return (
              <button
                key={p.label}
                type="button"
                className={`pill ${active ? 'is-active' : ''}`}
                disabled={!enabled}
                onClick={() => enabled && handlePillClick(p.cap!.ts)}
                title={enabled ? `${p.date} — latest capture` : `no capture on ${p.date}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="timeline-controls__row">
        <span className="timeline-controls__label">Compare two dates</span>
        <div className="dt-pickers">
          <DateAndTimePicker
            slot="a"
            label="From"
            captures={captures}
            viewport={viewport}
            ts={aTs}
            minDate={minDate}
            maxDate={maxDate}
            onPick={(ts) => onPickTs('a', ts)}
          />
          <span className="dt-pickers__arrow">↔</span>
          <DateAndTimePicker
            slot="b"
            label="To"
            captures={captures}
            viewport={viewport}
            ts={bTs}
            minDate={minDate}
            maxDate={maxDate}
            onPick={(ts) => onPickTs('b', ts)}
          />
          {onClear && (
            <button type="button" className="link timeline-controls__clear" onClick={onClear}>
              clear
            </button>
          )}
        </div>
      </div>

      <div className="timeline-controls__hint muted">
        {!aTs && !bTs && 'Click a pill or pick a date to view that capture. Click two to compare.'}
        {aTs && !bTs && (
          <>Viewing {formatTs(aTs)}{activePillForA && ` (${activePillForA})`}. Click another pill or pick "To" to compare. <kbd>←</kbd>/<kbd>→</kbd> steps through history.</>
        )}
        {!aTs && bTs && (
          <>Viewing {formatTs(bTs)}{activePillForB && ` (${activePillForB})`}. Click another pill or pick "From" to compare.</>
        )}
        {aTs && bTs && (
          <>
            Comparing {formatTs(aTs)}{activePillForA && ` (${activePillForA})`} ↔ {formatTs(bTs)}{activePillForB && ` (${activePillForB})`}. <kbd>←</kbd>/<kbd>→</kbd> steps To; <kbd>Shift</kbd>+arrows step From.
          </>
        )}
      </div>
    </div>
  );
}
