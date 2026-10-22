// A4 portrait sheets of 3 × 3 cards with crop marks (spec 5, print studio).
// Sheet geometry: 3 × 63 mm + 2 × 3 mm gaps = 195 mm wide; 3 × 88 mm + 2 × 3 mm = 270 mm tall,
// centred on 210 × 297 mm, leaving 7.5 mm side and 13.5 mm top/bottom margins (inside every
// printer's unprintable area). Print with scale 100% and margins "None" or "Default" (@page sets 0).
import './print.css';
import type { CardData } from './cardData';
import { TradingCard } from './TradingCard';

export const CARDS_PER_SHEET = 9;

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function CropMarks() {
  return (
    <>
      <span className="crop crop-tl" />
      <span className="crop crop-tr" />
      <span className="crop crop-bl" />
      <span className="crop crop-br" />
    </>
  );
}

export function PrintSheets({ cards }: { cards: CardData[] }) {
  const sheets = chunk(cards, CARDS_PER_SHEET);
  return (
    <div className="print-sheets">
      {sheets.map((sheet, i) => (
        <section className="print-sheet" key={i} aria-label={`Sheet ${i + 1} of ${sheets.length}`}>
          <div className="print-grid">
            {sheet.map((c) => (
              <div className="print-slot" key={c.athleteId}>
                <CropMarks />
                <TradingCard data={c} />
              </div>
            ))}
          </div>
          <div className="print-sheet-label no-print">
            Sheet {i + 1} of {sheets.length} · A4 portrait · print at 100% scale
          </div>
        </section>
      ))}
    </div>
  );
}
