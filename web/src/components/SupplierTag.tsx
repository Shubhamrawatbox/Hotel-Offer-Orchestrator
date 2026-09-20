import type { SupplierId } from '../api/types';

/**
 * Supplier identity: a small swatch in the supplier's categorical colour next to
 * its name. The name stays in text ink; the swatch only carries identity.
 */
export function SupplierSwatch({ supplier }: { supplier: SupplierId | null }) {
  return <span className={`swatch swatch--${supplier ?? 'none'}`} aria-hidden="true" />;
}

export function SupplierTag({ supplier, label }: { supplier: SupplierId | null; label?: string }) {
  return (
    <span className="supplier-tag">
      <SupplierSwatch supplier={supplier} />
      {label ?? (supplier ? `Supplier ${supplier}` : 'Unknown')}
    </span>
  );
}
