import {
  findCaptureOnDate,
  formatTs,
  hasViewport,
  tsDateUtc,
  type Capture,
  type TimeRange,
  type Viewport,
} from './types';

type RangeOption = { key: TimeRange; label: string };
const RANGES: RangeOption[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All' },
];

type Props = {
  range: TimeRange;
  onRange: (r: TimeRange) => void;
  captures: Capture[];
  viewport: Viewport;
  aTs: string | null;
  bTs: string | null;
  onPickTs: (slot: 'a' | 'b', ts: string | null) => void;
};

/** "07:31" from "2026-06-01T07-31". */
function timeOnly(ts: string): string {
  const [, t] = ts.split('T');
  return t ? t.replace('-', ':') : ts;
}

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

  // Captures available on the chosen date for the current viewport, latest first.
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
        <>
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
          <span className="muted dt-picker__count">
            {capturesOnDate.length === 1 ? '1 capture' : `${capturesOnDate.length} captures`}
          </span>
        </>
      )}
      {dateValue && capturesOnDate.length === 0 && (
        <span className="muted dt-picker__count error">no {viewport} captures on this date</span>
      )}
    </div>
  );
}

export function TimelineControls({
  range,
  onRange,
  captures,
  viewport,
  aTs,
  bTs,
  onPickTs,
}: Props) {
  // Bound the date inputs to dates that actually have captures in the current
  // viewport so the calendar grays out empty days.
  const validDates = captures
    .filter((c) => c.viewports[viewport]?.ok === true)
    .map((c) => tsDateUtc(c.ts));
  const minDate = validDates.length ? validDates[validDates.length - 1] : undefined;
  const maxDate = validDates.length ? validDates[0] : undefined;

  return (
    <div className="timeline-controls">
      <div className="timeline-controls__row">
        <span className="timeline-controls__label">Filter</span>
        <div className="range-capsules">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`range-capsule ${range === r.key ? 'is-active' : ''}`}
              onClick={() => onRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="timeline-controls__row timeline-controls__row--top">
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
        </div>
      </div>

      <div className="timeline-controls__hint muted">
        {!aTs && !bTs && 'Pick a date (and optionally a time on that date) to load a capture. Pick two to compare them.'}
        {aTs && !bTs && <>Loaded {formatTs(aTs)}. Pick "To" to compare against another date/time.</>}
        {!aTs && bTs && <>Loaded {formatTs(bTs)}. Pick "From" to compare against another date/time.</>}
        {aTs && bTs && <>Comparing {formatTs(aTs)} ↔ {formatTs(bTs)} (you can change the time on each side).</>}
      </div>
    </div>
  );
}

export { RANGES };
export type { RangeOption };
