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

  const W = 100;
  const H = 30;
  const PAD = 3; // keeps the stroke off the top and bottom edges
  const top = rateAt(0);
  const bottom = rateAt(span);
  const x = (rd: number) => (rd / span) * W;
  const y = (rate: number) =>
    H - PAD - ((rate - bottom) / (top - bottom || 1)) * (H - PAD * 2);

  const points: string[] = [];
  for (let i = 0; i <= 32; i++) {
    const rd = (span / 32) * i;
    points.push(`${x(rd).toFixed(2)},${y(rateAt(rd)).toFixed(2)}`);
  }

  const here = Math.min(riderDays, span);
  const now = rateAt(riderDays);
  const drivers = members.filter((m) => m.included).length || 1;
  // What one more day in the car takes off each driver's total for the month.
  const saving = (memberDays * (now - rateAt(riderDays + 1))) / drivers;

  return (
    <div class="rate-curve">
      {/* Stretched to fill the card, so the marker is a vertical rule rather
          than a dot — a circle would render as a squashed ellipse. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points.join(' ')} />
        <line class="marker" x1={x(here)} y1={y(now)} x2={x(here)} y2={H} />
      </svg>
      <p class="muted">
        <strong>{euro(now)}/day</strong> each right now. Every extra day someone rides along
        takes about {euro(saving)} off each driver.
      </p>
    </div>
  );
}
