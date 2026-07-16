/**
 * Bundled menu photos + the logic that picks one for a product.
 *
 * A product's own uploaded photo (photoUrl) always wins. When it has none, we
 * fall back to one of the shop's stock dish photos, chosen by keywords in the
 * item name — so every Aloopuri/Samosa/Khavsa/… variant shows an appetising,
 * relevant picture without needing a unique upload for all 24 items. New items
 * with familiar names inherit the right photo automatically.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Bundled photos live in the web app's /public/menu folder. */
const menu = (file: string) => `/menu/${file}`;

/**
 * Keyword → bundled photo, tried top to bottom (first match wins), so the more
 * specific rows (e.g. "cheese samosa") must come before the general ones
 * ("samosa", "cheese"). Matched against the lower-cased item name, which carries
 * both the Gujarati and the English transliteration.
 */
const RULES: Array<{ test: RegExp; img: string }> = [
  { test: /khavsa|ખાવસા/, img: 'khavsa.jpg' },
  { test: /khaman|ખમણ/, img: 'rasawala-khaman.jpg' },
  { test: /wafer|papdi|papad|વેફર|પાપડ/, img: 'wafer-chutney.jpg' },
  { test: /basket|બાસ્કેટ/, img: 'basket-cutlet.jpg' },
  // Cheese samosa/cutlet gets the cheese-topped photo; plain gets the plain one.
  { test: /(cheese|ચીઝ).*(samosa|katlesh|cutlet|સમોસા|કટલેશ)|(samosa|katlesh|cutlet|સમોસા|કટલેશ).*(cheese|ચીઝ)/, img: 'cheese-cutlet.jpg' },
  { test: /samosa|katlesh|cutlet|સમોસા|કટલેશ/, img: 'cutlet-samosa.jpg' },
  { test: /lal sev|લાલ સેવ/, img: 'aloopuri-sev.jpg' },
  { test: /aloopuri|આલુપુરી/, img: 'aloopuri.jpg' },
  { test: /extra cheese|ચીઝ/, img: 'cheese-cutlet.jpg' },
  { test: /cola|cold ?drink|soft ?drink|બોટલ/, img: 'cola.png' },
];

/**
 * Resolve the image to show for a product card. Returns null when there's no
 * uploaded photo and no keyword match — the card then renders its initial tile.
 */
export function productImageSrc(product: { name: string; photoUrl?: string | null }): string | null {
  const uploaded = product.photoUrl?.trim();
  if (uploaded) {
    // Uploaded photos are served by the API; bundled/absolute ones as-is.
    if (/^https?:\/\//.test(uploaded)) return uploaded;
    return uploaded.startsWith('/uploads') ? `${API_URL}${uploaded}` : uploaded;
  }
  const name = product.name.toLowerCase();
  const rule = RULES.find((r) => r.test.test(name));
  return rule ? menu(rule.img) : null;
}
