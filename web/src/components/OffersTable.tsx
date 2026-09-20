import type { SupplierId } from '../api/types';
import { SUPPLIERS, type ComparisonRow, type QuoteCell } from '../lib/comparison';
import { formatCity, formatPrice } from '../lib/format';
import { CheckIcon } from './Icons';
import { SupplierSwatch, SupplierTag } from './SupplierTag';

/**
 * One row per deduplicated hotel. The two supplier columns explain the pick:
 * the winning quote is emphasised, the other is shown in secondary ink, and a
 * hotel only one supplier sells shows a dash in the other column.
 */
export function OffersTable({ rows, city }: { rows: ComparisonRow[]; city: string }) {
  return (
    <div className="table-scroll">
      <table className="offers-table">
        <caption className="sr-only">
          Best offer per hotel in {formatCity(city)}, with each supplier&apos;s quote
        </caption>
        <thead>
          <tr>
            <th scope="col">Hotel</th>
            <th scope="col" className="num">
              Best price
            </th>
            <th scope="col">Booked via</th>
            <th scope="col" className="num">
              Commission
            </th>
            {SUPPLIERS.map((supplier) => (
              <th key={supplier} scope="col" className="num">
                <span className="column-key">
                  <SupplierSwatch supplier={supplier} />
                  Supplier {supplier}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.offer.name}</th>
              <td className="num">
                <span className="best-price">{formatPrice(row.offer.price)}</span>
                {row.saving !== null && (
                  <span className="saving">saves {formatPrice(row.saving)}</span>
                )}
              </td>
              <td>
                <SupplierTag supplier={row.winner} label={row.offer.supplier} />
              </td>
              <td className="num">{row.offer.commissionPct}%</td>
              {SUPPLIERS.map((supplier) => (
                <QuoteCellView key={supplier} supplier={supplier} cell={row.quotes[supplier]} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuoteCellView({ supplier, cell }: { supplier: SupplierId; cell: QuoteCell }) {
  if (cell.kind === 'not-offered') {
    return (
      <td className="num quote quote--none">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Supplier {supplier} does not offer this hotel</span>
      </td>
    );
  }

  if (cell.kind === 'unavailable') {
    return <td className="num quote quote--unavailable">unavailable</td>;
  }

  return (
    <td className={`num quote ${cell.best ? 'quote--best' : 'quote--other'}`}>
      {cell.best && <CheckIcon className="quote-check" />}
      {formatPrice(cell.price)}
      {cell.best && <span className="sr-only"> (best price)</span>}
    </td>
  );
}
