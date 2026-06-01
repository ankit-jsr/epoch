import {
  findCaptureOnDate,
  isoDate,
  parseTs,
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
  // Current a/b selection (UTC date prefix or null). Calendar inputs reflect these.
  aTs: string | null;
  bTs: string | null;
  // Called with the chosen capture (latest on the picked date for the current viewport).
  onPickDate: (slot: 'a' | 'b', capture: Capture | null) => void;
};

export function TimelineControls({
  range,
  onRange,
  captures,
  viewport,
  aTs,
  bTs,
  onPickDate,
}: Props) {
  // Bound the calendar to dates that actually have at least one capture in the
  // current viewport. Min = oldest, Max = newest, so people can't pick gibberish.
  const validDates = captures
    .filter((c) => c.viewports[viewport]?.ok === true)
    .map((c) => tsDateUtc(c.ts));
  const minDate = validDates.length ? validDates[validDates.length - 1] : undefined;
  const maxDate = validDates.length ? validDates[0] : undefined;

  function dateOf(ts: string | null): string {
    return ts ? tsDateUtc(ts) : '';
  }

  function handleDateChange(slot: 'a' | 'b', value: string) {
    if (!value) {
      onPickDate(slot, null);
      return;
    }
    const cap = findCaptureOnDate(captures, value, viewport);
    onPickDate(slot, cap);
  }

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

      <div className="timeline-controls__row">
        <span className="timeline-controls__label">Or compare two dates</span>
        <div className="date-pickers">
          <label className="date-picker">
            <span className="muted">From</span>
            <input
              type="date"
              value={dateOf(aTs)}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleDateChange('a', e.target.value)}
            />
          </label>
          <span className="date-pickers__arrow">↔</span>
          <label className="date-picker">
            <span className="muted">To</span>
            <input
              type="date"
              value={dateOf(bTs)}
              min={minDate}
              max={maxDate}
              onChange={(e) => handleDateChange('b', e.target.value)}
            />
          </label>
        </div>
      </div>

      {(aTs || bTs) && validDates.length > 0 && (
        <div className="timeline-controls__hint muted">
          {aTs && !bTs && <>Showing {tsDateUtc(aTs)}. Pick a "To" date to compare.</>}
          {!aTs && bTs && <>Showing {tsDateUtc(bTs)}. Pick a "From" date to compare.</>}
          {aTs && bTs && (
            <>
              Comparing {tsDateUtc(aTs)} ↔ {tsDateUtc(bTs)} (latest capture on each date).
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export for App.tsx convenience
export { RANGES };
export type { RangeOption };
