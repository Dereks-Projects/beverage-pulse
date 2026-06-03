// lib/subCategory.js
// Resolves a brand to the subcategory key used by lib/categoryBackdrop.json.
//
// Non-spirits brands return their category id directly (wine, beer, rtd,
// non-alc, thc, coffee-tea, energy), which already match the backdrop keys.
// Spirits brands are read from their searchTerm, since the subcategory word
// is already written there ("Knob Creek bourbon" -> bourbon). A short
// overrides list handles the few brands the searchTerm cannot resolve
// correctly. Returns null when no backdrop applies.

import { BRAND_TAXONOMY } from './taxonomy.js';

// Brands whose subcategory differs from their searchTerm wording, or that
// have no backdrop category at all (null).
const SUBCATEGORY_OVERRIDES = {
  campari: 'amaro',
  aperol: 'amaro',
  jagermeister: 'amaro',
  pernod: null, // absinthe; no section in the backdrop report
};

// Spirits subcategory read from the searchTerm. Order matters: the more
// specific whiskey styles (mezcal, bourbon, scotch) are tested before the
// general whiskey catch so they are not swallowed by it.
function deriveSpiritsSubCategory(searchTerm) {
  const s = ` ${searchTerm.toLowerCase()} `;
  if (s.includes('mezcal')) return 'mezcal';
  if (s.includes('bourbon')) return 'bourbon';
  if (s.includes('scotch')) return 'scotch';
  if (s.includes('rye') || s.includes('irish whiskey') || s.includes('canadian') || s.includes('whiskey') || s.includes('whisky')) return 'whiskey';
  if (s.includes('tequila')) return 'tequila';
  if (s.includes('vodka')) return 'vodka';
  if (s.includes(' gin')) return 'gin';
  if (s.includes(' rum')) return 'rum';
  if (s.includes('cognac') || s.includes('brandy') || s.includes('armagnac')) return 'brandy';
  if (s.includes('amaro')) return 'amaro';
  if (s.includes('liqueur') || s.includes('cream')) return 'liqueur';
  return null;
}

export function getSubCategory(brandName) {
  if (!brandName) return null;
  const key = brandName.toLowerCase();

  if (Object.prototype.hasOwnProperty.call(SUBCATEGORY_OVERRIDES, key)) {
    return SUBCATEGORY_OVERRIDES[key];
  }

  const entry = BRAND_TAXONOMY[key];
  if (!entry) return null;

  if (entry.category !== 'spirits') return entry.category;

  const searchTerm = entry.searchTerm || entry.display || key;
  return deriveSpiritsSubCategory(searchTerm);
}