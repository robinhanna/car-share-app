import type { Member, Settings } from '../api/types';
import { euro, totalMemberDays, totalRiderDays } from '../lib/cost';

interface Props {
  members: Member[];
  settings: Settings;
}

/**
 * The day rate falling as more people ride.
 *
 * It took four rounds of explaining to land the point that the rate isn't
 * per-day and isn't per-carload: there is one rate for the whole month, and
 * every day anyone rides pushes it down for everybody, retroactively. A curve
 * says that in a glance.
 *
 * Illustrative, but not invented — Robin's group is being told what they owe,
 * so a made-up figure here would cost more trust than the picture buys. Both
 * the curve and the saving come from the same arithmetic the Sheet uses:
 * total ÷ (member-days + rider-days).
 */
export function RateCurve({ members, settings }: Props) {
  const memberDays = totalMemberDays(members);
  const riderDays = totalRiderDays(members);
  if (memberDays <= 0 || settings.totalCost <= 0) return null;

  const rateAt = (rd: number) => settings.totalCost / (memberDays + rd);

  // Plot the whole range the month could reach — every rider out every day.
  // Early on that puts "now" near the left, which is the honest picture: it
  // shows how much room there still is.
  const riders = members.filter((m) => !m.included).length;
  const days = members.find((m) => m.included)?.daysActive || 25;
  const span = Math.max(riders * days, riderDays * 1.5, 25);

  // The gauge runs between the rate before anyone rode and the rate if everyone
  // rode every day. It starts full and drains — a tank emptying, not a bar
  // filling. A horizontal bar was tried and read as a loading bar, so growing
  // fill said the price was climbing however it was labelled.
  const ceiling = rateAt(0);
  const floor = rateAt(span);
  const now = rateAt(riderDays);
  const fill = Math.max(0, Math.min(100, ((now - floor) / (ceiling - floor || 1)) * 100));

  // Measured against the rate before anyone had ridden at all, so the number
  // answers "what has riding along already saved me" rather than "what is one
  // more day worth" — the passenger's question, not the driver's.
  const drop = ceiling - now;
  const dropPct = ceiling > 0 ? (drop / ceiling) * 100 : 0;

  return (
    <div class="rate-curve">
      <div class="rate-text">
        {/* "day rate" spelled out: the figure is per day in the car, and a bare
            "rate" left people reading it as a total. */}
        <p class="eyebrow">Current passenger day rate</p>
        <p class="rate-now">
          {euro(now)}
          {drop > 0.005 && (
            <span class="rate-drop">
              ↓ {euro(drop)} ({Math.round(dropPct)}%)
            </span>
          )}
        </p>
        <p class="muted">
          Falls further as more rides get logged — every ride adds a day to the pot it's
          split across, <strong>retroactively, for everyone</strong>.
        </p>
      </div>

      {/* The numbers are in the labels, so the tank itself is decoration. */}
      <div class="gauge">
        <span class="gauge-end">{euro(ceiling)}</span>
        <div class="gauge-track" aria-hidden="true">
          <div class="gauge-fill" style={`height:${fill.toFixed(1)}%`} />
          <div class="gauge-marker" style={`bottom:${fill.toFixed(1)}%`} />
        </div>
        <span class="gauge-end">{euro(floor)}</span>
      </div>
    </div>
  );
}
