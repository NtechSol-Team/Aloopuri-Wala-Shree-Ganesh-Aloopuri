// GST helpers: GSTIN validation (format + checksum), state derivation, tax split.

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const CODE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

/** Validate GSTIN format and the mod-36 checksum digit. */
export function isValidGstin(gstin: string): boolean {
  const g = gstin?.toUpperCase().trim();
  if (!g || !GSTIN_RE.test(g)) return false;
  let factor = 2;
  let sum = 0;
  for (let i = g.length - 2; i >= 0; i--) {
    const cp = CODE.indexOf(g[i]);
    let digit = factor * cp;
    digit = Math.floor(digit / 36) + (digit % 36);
    sum += digit;
    factor = factor === 2 ? 1 : 2;
  }
  const check = (36 - (sum % 36)) % 36;
  return CODE[check] === g[g.length - 1];
}

export function gstinStateCode(gstin: string): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}

export function stateNameFromCode(code: string | null): string | null {
  return code ? STATE_NAMES[code] ?? null : null;
}

/** Split a tax amount into CGST/SGST (intra-state) or IGST (inter-state). */
export function splitGst(taxAmount: number, supplierStateCode: string | null, homeStateCode: string): { cgst: number; sgst: number; igst: number } {
  const intraState = !supplierStateCode || supplierStateCode === homeStateCode;
  if (intraState) {
    const half = Math.round((taxAmount / 2) * 100) / 100;
    return { cgst: half, sgst: taxAmount - half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxAmount };
}
