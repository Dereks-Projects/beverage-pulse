// lib/taxonomy.js
// Single source of truth for beverage and brand classification.
// Every tracked term is tagged with a category, parent group,
// and display name. The dashboard uses this for filtering,
// the alc vs. non-alc split view, and proper label rendering.
//
// To add a new beverage or brand in the future, add it here
// and in the corresponding DEFAULT array in redditService.js.

// --------------------------------------------------------------------------
// Category definitions
// --------------------------------------------------------------------------
export const CATEGORIES = {
  spirits: {
    id: 'spirits',
    label: 'Spirits',
    parent: 'alcoholic',
    color: '#B45309',
  },
  wine: {
    id: 'wine',
    label: 'Wine',
    parent: 'alcoholic',
    color: '#9F1239',
  },
  beer: {
    id: 'beer',
    label: 'Beer',
    parent: 'alcoholic',
    color: '#D97706',
  },
  rtd: {
    id: 'rtd',
    label: 'RTD',
    parent: 'alcoholic',
    color: '#0D9488',
  },
  'coffee-tea': {
    id: 'coffee-tea',
    label: 'Coffee & Tea',
    parent: 'non-alcoholic',
    color: '#78716C',
  },
  'non-alc': {
    id: 'non-alc',
    label: 'Non-Alc',
    parent: 'non-alcoholic',
    color: '#059669',
  },
  thc: {
    id: 'thc',
    label: 'THC',
    parent: 'non-alcoholic',
    color: '#7C3AED',
  },
};

// --------------------------------------------------------------------------
// Parent group definitions
// --------------------------------------------------------------------------
export const PARENT_GROUPS = {
  alcoholic: { id: 'alcoholic', label: 'Alcoholic' },
  'non-alcoholic': { id: 'non-alcoholic', label: 'Non-Alcoholic' },
};

// --------------------------------------------------------------------------
// Beverage taxonomy
// Each key matches the lowercase term used in redditService.js
// --------------------------------------------------------------------------
export const BEVERAGE_TAXONOMY = {
  // ----- Spirits -----
  vodka:              { display: 'Vodka',              category: 'spirits' },
  gin:                { display: 'Gin',                 category: 'spirits' },
  rum:                { display: 'Rum',                 category: 'spirits' },
  tequila:            { display: 'Tequila',             category: 'spirits' },
  mezcal:             { display: 'Mezcal',              category: 'spirits' },
  whiskey:            { display: 'Whiskey',              category: 'spirits' },
  whisky:             { display: 'Whisky',               category: 'spirits' },
  scotch:             { display: 'Scotch',               category: 'spirits' },
  rye:                { display: 'Rye',                  category: 'spirits' },
  cognac:             { display: 'Cognac',               category: 'spirits' },
  brandy:             { display: 'Brandy',               category: 'spirits' },
  'brown spirits':    { display: 'Brown Spirits',        category: 'spirits' },
  cocktail:           { display: 'Cocktail',             category: 'spirits' },

  // ----- Wine -----
  wine:               { display: 'Wine',                 category: 'wine' },
  'red wine':         { display: 'Red Wine',             category: 'wine' },
  'white wine':       { display: 'White Wine',           category: 'wine' },
  'rosé':             { display: 'Rosé',                 category: 'wine' },
  'sparkling wine':   { display: 'Sparkling Wine',       category: 'wine' },
  champagne:          { display: 'Champagne',            category: 'wine' },
  merlot:             { display: 'Merlot',               category: 'wine' },
  'cabernet sauvignon': { display: 'Cabernet Sauvignon', category: 'wine' },
  'pinot noir':       { display: 'Pinot Noir',           category: 'wine' },
  chardonnay:         { display: 'Chardonnay',           category: 'wine' },
  'sauvignon blanc':  { display: 'Sauvignon Blanc',      category: 'wine' },
  sake:               { display: 'Sake',                 category: 'wine' },
  'wine cooler':      { display: 'Wine Cooler',          category: 'wine' },

  // ----- Beer -----
  beer:               { display: 'Beer',                 category: 'beer' },
  lager:              { display: 'Lager',                category: 'beer' },
  ale:                { display: 'Ale',                  category: 'beer' },
  cider:              { display: 'Cider',                category: 'beer' },
  'hard cider':       { display: 'Hard Cider',           category: 'beer' },

  // ----- RTD -----
  rtd:                { display: 'RTD',                  category: 'rtd' },
  'hard seltzer':     { display: 'Hard Seltzer',         category: 'rtd' },
  seltzer:            { display: 'Seltzer',              category: 'rtd' },
  'hard tea':         { display: 'Hard Tea',             category: 'rtd' },
  'canned cocktail':  { display: 'Canned Cocktail',      category: 'rtd' },
  'canned alcohol':   { display: 'Canned Alcohol',       category: 'rtd' },

  // ----- Coffee & Tea -----
  coffee:             { display: 'Coffee',               category: 'coffee-tea' },
  tea:                { display: 'Tea',                  category: 'coffee-tea' },

  // ----- Non-Alcoholic -----
  'non-alcoholic':    { display: 'Non-Alcoholic',        category: 'non-alc' },
  mocktail:           { display: 'Mocktail',             category: 'non-alc' },
  kombucha:           { display: 'Kombucha',             category: 'non-alc' },
  cola:               { display: 'Cola',                 category: 'non-alc' },
  'energy drink':     { display: 'Energy Drink',         category: 'non-alc' },
};

// --------------------------------------------------------------------------
// Brand taxonomy
// Each key matches the lowercase term used in redditService.js
// --------------------------------------------------------------------------
export const BRAND_TAXONOMY = {
  // ----- Beer brands -----
  budweiser:            { display: 'Budweiser',            category: 'beer' },
  'bud light':          { display: 'Bud Light',            category: 'beer' },
  'coors light':        { display: 'Coors Light',          category: 'beer' },
  'miller lite':        { display: 'Miller Lite',          category: 'beer' },
  heineken:             { display: 'Heineken',             category: 'beer' },
  corona:               { display: 'Corona',               category: 'beer' },
  modelo:               { display: 'Modelo',               category: 'beer' },
  guinness:             { display: 'Guinness',             category: 'beer' },
  'stella artois':      { display: 'Stella Artois',        category: 'beer' },
  'blue moon':          { display: 'Blue Moon',            category: 'beer' },
  'sam adams':          { display: 'Sam Adams',            category: 'beer' },
  'angry orchard':      { display: 'Angry Orchard',        category: 'beer' },

  // ----- RTD brands -----
  'white claw':         { display: 'White Claw',           category: 'rtd' },
  truly:                { display: 'Truly',                category: 'rtd' },

  // ----- Wine brands -----
  gallo:                { display: 'Gallo',                category: 'wine' },
  'gallo family vineyards': { display: 'Gallo Family Vineyards', category: 'wine' },
  barefoot:             { display: 'Barefoot',             category: 'wine' },
  'yellow tail':        { display: 'Yellow Tail',          category: 'wine' },
  yellowtail:           { display: 'Yellowtail',           category: 'wine' },
  'kendall-jackson':    { display: 'Kendall-Jackson',      category: 'wine' },
  caymus:               { display: 'Caymus',               category: 'wine' },
  'robert mondavi':     { display: 'Robert Mondavi',       category: 'wine' },
  'opus one':           { display: 'Opus One',             category: 'wine' },
  apothic:              { display: 'Apothic',              category: 'wine' },
  meiomi:               { display: 'Meiomi',               category: 'wine' },
  'cupcake vineyards':  { display: 'Cupcake Vineyards',    category: 'wine' },
  'josh cellars':       { display: 'Josh Cellars',         category: 'wine' },
  beringer:             { display: 'Beringer',             category: 'wine' },
  woodbridge:           { display: 'Woodbridge',           category: 'wine' },
  'woodbridge by robert mondavi': { display: 'Woodbridge by Robert Mondavi', category: 'wine' },
  'sutter home':        { display: 'Sutter Home',          category: 'wine' },
  'chateau ste michelle': { display: 'Chateau Ste. Michelle', category: 'wine' },
  'chateau ste. michelle': { display: 'Chateau Ste. Michelle', category: 'wine' },
  'santa margherita':   { display: 'Santa Margherita',     category: 'wine' },
  duckhorn:             { display: 'Duckhorn',             category: 'wine' },
  'la crema':           { display: 'La Crema',             category: 'wine' },
  'j lohr':             { display: 'J. Lohr',              category: 'wine' },
  decoy:                { display: 'Decoy',                category: 'wine' },
  coppola:              { display: 'Coppola',              category: 'wine' },
  'screaming eagle':    { display: 'Screaming Eagle',      category: 'wine' },
  boillot:              { display: 'Boillot',              category: 'wine' },
  'domaine chandon':    { display: 'Domaine Chandon',      category: 'wine' },
  'veuve clicquot':     { display: 'Veuve Clicquot',       category: 'wine' },
  'moet & chandon':     { display: 'Moët & Chandon',       category: 'wine' },
  'dom perignon':       { display: 'Dom Pérignon',         category: 'wine' },
  krug:                 { display: 'Krug',                 category: 'wine' },
  roederer:             { display: 'Roederer',             category: 'wine' },
  'louis roederer':     { display: 'Louis Roederer',       category: 'wine' },
  'rodney strong':      { display: 'Rodney Strong',        category: 'wine' },
  franzia:              { display: 'Franzia',              category: 'wine' },
  'canyon road':        { display: 'Canyon Road',          category: 'wine' },
  frontera:             { display: 'Frontera',             category: 'wine' },
  cavit:                { display: 'Cavit',                category: 'wine' },
  'ecco domani':        { display: 'Ecco Domani',          category: 'wine' },
  mirassou:             { display: 'Mirassou',             category: 'wine' },
  riunite:              { display: 'Riunite',              category: 'wine' },
  'menage a trois':     { display: 'Ménage à Trois',       category: 'wine' },
  '14 hands':           { display: '14 Hands',             category: 'wine' },
  bogle:                { display: 'Bogle',                category: 'wine' },
  'liberty creek':      { display: 'Liberty Creek',        category: 'wine' },
  'dark horse':         { display: 'Dark Horse',           category: 'wine' },
  'black box':          { display: 'Black Box',            category: 'wine' },
  inglenook:            { display: 'Inglenook',            category: 'wine' },

  // ----- Spirits brands -----
  bacardi:              { display: 'Bacardi',              category: 'spirits' },
  'captain morgan':     { display: 'Captain Morgan',       category: 'spirits' },
  malibu:               { display: 'Malibu',               category: 'spirits' },
  'grey goose':         { display: 'Grey Goose',           category: 'spirits' },
  absolut:              { display: 'Absolut',              category: 'spirits' },
  smirnoff:             { display: 'Smirnoff',             category: 'spirits' },
  titos:                { display: "Tito's",               category: 'spirits' },
  'johnnie walker':     { display: 'Johnnie Walker',       category: 'spirits' },
  'jack daniels':       { display: 'Jack Daniel\'s',       category: 'spirits' },
  'woodford reserve':   { display: 'Woodford Reserve',     category: 'spirits' },
  'makers mark':        { display: 'Maker\'s Mark',        category: 'spirits' },
  jameson:              { display: 'Jameson',              category: 'spirits' },
  bushmills:            { display: 'Bushmills',            category: 'spirits' },
  glenfiddich:          { display: 'Glenfiddich',          category: 'spirits' },
  macallan:             { display: 'Macallan',             category: 'spirits' },
  hennessy:             { display: 'Hennessy',             category: 'spirits' },
  courvoisier:          { display: 'Courvoisier',          category: 'spirits' },
  patron:               { display: 'Patrón',               category: 'spirits' },
  'don julio':          { display: 'Don Julio',            category: 'spirits' },
  'jose cuervo':        { display: 'Jose Cuervo',          category: 'spirits' },
  casamigos:            { display: 'Casamigos',            category: 'spirits' },
  bulleit:              { display: 'Bulleit',              category: 'spirits' },
  'wild turkey':        { display: 'Wild Turkey',          category: 'spirits' },
  redbreast:            { display: 'Redbreast',            category: 'spirits' },
  glendronach:          { display: 'GlenDronach',          category: 'spirits' },
  balvenie:             { display: 'Balvenie',             category: 'spirits' },
  lagavulin:            { display: 'Lagavulin',            category: 'spirits' },
  talisker:             { display: 'Talisker',             category: 'spirits' },
  laphroaig:            { display: 'Laphroaig',            category: 'spirits' },
};

// --------------------------------------------------------------------------
// Utility functions
// --------------------------------------------------------------------------

/**
 * Look up the category for a beverage term.
 * Returns the category object from CATEGORIES, or null if not found.
 */
export function getBeverageCategory(beverageName) {
  const entry = BEVERAGE_TAXONOMY[beverageName.toLowerCase()];
  if (!entry) return null;
  return CATEGORIES[entry.category] || null;
}

/**
 * Look up the category for a brand term.
 * Returns the category object from CATEGORIES, or null if not found.
 */
export function getBrandCategory(brandName) {
  const entry = BRAND_TAXONOMY[brandName.toLowerCase()];
  if (!entry) return null;
  return CATEGORIES[entry.category] || null;
}

/**
 * Get the display name for a beverage or brand.
 * Falls back to title-casing the raw name if not found in taxonomy.
 */
export function getDisplayName(name, type = 'beverage') {
  const taxonomy = type === 'brand' ? BRAND_TAXONOMY : BEVERAGE_TAXONOMY;
  const entry = taxonomy[name.toLowerCase()];

  if (entry) return entry.display;

  // Fallback: title-case the raw name
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get the parent group (alcoholic or non-alcoholic) for a term.
 * Works for both beverages and brands.
 */
export function getParentGroup(name, type = 'beverage') {
  const taxonomy = type === 'brand' ? BRAND_TAXONOMY : BEVERAGE_TAXONOMY;
  const entry = taxonomy[name.toLowerCase()];

  if (!entry) return null;

  const category = CATEGORIES[entry.category];
  if (!category) return null;

  return PARENT_GROUPS[category.parent] || null;
}