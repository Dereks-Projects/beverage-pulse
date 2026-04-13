// lib/taxonomy.js
// ==========================================================================
// SINGLE SOURCE OF TRUTH for all tracked beverages and brands.
//
// Every term tracked by BeveragePulse is defined here. The Reddit
// scraper, Google Trends cron, YouTube cron, and the frontend all
// import from this file. Add a term here and it flows everywhere.
//
// Structure:
//   CATEGORIES       - category definitions with colors and parent groups
//   BEVERAGE_TAXONOMY - subcategory-level beverage terms (no parent terms)
//   BRAND_TAXONOMY    - brand names organized by category
//   BEVERAGE_TERMS    - flat array of beverage search strings (for scraper)
//   BRAND_TERMS       - flat array of brand search strings (for scraper)
//   Utility functions - display names, category lookups, parent groups
// ==========================================================================

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
  energy: {
    id: 'energy',
    label: 'Energy',
    parent: 'non-alcoholic',
    color: '#DC2626',
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
// Beverage taxonomy (subcategories only, no parent terms)
// --------------------------------------------------------------------------
export const BEVERAGE_TAXONOMY = {
  // ----- Spirits -----
  vodka:              { display: 'Vodka',              category: 'spirits' },
  gin:                { display: 'Gin',                category: 'spirits' },
  rum:                { display: 'Rum',                category: 'spirits' },
  tequila:            { display: 'Tequila',            category: 'spirits' },
  mezcal:             { display: 'Mezcal',             category: 'spirits' },
  bourbon:            { display: 'Bourbon',            category: 'spirits' },
  rye:                { display: 'Rye',                category: 'spirits' },
  scotch:             { display: 'Scotch',             category: 'spirits' },
  'irish whiskey':    { display: 'Irish Whiskey',      category: 'spirits' },
  'single malt':      { display: 'Single Malt',        category: 'spirits' },
  cognac:             { display: 'Cognac',             category: 'spirits' },
  brandy:             { display: 'Brandy',             category: 'spirits' },
  armagnac:           { display: 'Armagnac',           category: 'spirits' },
  amaro:              { display: 'Amaro',              category: 'spirits' },
  aperitif:           { display: 'Aperitif',           category: 'spirits' },
  liqueur:            { display: 'Liqueur',            category: 'spirits' },
  soju:               { display: 'Soju',               category: 'spirits' },
  absinthe:           { display: 'Absinthe',           category: 'spirits' },

  // ----- Wine (varietals and styles only) -----
  'pinot noir':       { display: 'Pinot Noir',         category: 'wine' },
  'cabernet sauvignon': { display: 'Cabernet Sauvignon', category: 'wine' },
  merlot:             { display: 'Merlot',             category: 'wine' },
  chardonnay:         { display: 'Chardonnay',         category: 'wine' },
  'sauvignon blanc':  { display: 'Sauvignon Blanc',    category: 'wine' },
  riesling:           { display: 'Riesling',           category: 'wine' },
  'pinot grigio':     { display: 'Pinot Grigio',       category: 'wine' },
  malbec:             { display: 'Malbec',             category: 'wine' },
  zinfandel:          { display: 'Zinfandel',          category: 'wine' },
  syrah:              { display: 'Syrah',              category: 'wine' },
  'rosé':             { display: 'Rosé',               category: 'wine' },
  rose:               { display: 'Rosé',               category: 'wine' },
  'sparkling wine':   { display: 'Sparkling Wine',     category: 'wine' },
  champagne:          { display: 'Champagne',          category: 'wine' },
  prosecco:           { display: 'Prosecco',           category: 'wine' },
  'natural wine':     { display: 'Natural Wine',       category: 'wine' },
  'orange wine':      { display: 'Orange Wine',        category: 'wine' },
  sake:               { display: 'Sake',               category: 'wine' },
  port:               { display: 'Port',               category: 'wine' },
  vermouth:           { display: 'Vermouth',           category: 'wine' },

  // ----- Beer (styles only) -----
  ipa:                { display: 'IPA',                category: 'beer' },
  lager:              { display: 'Lager',              category: 'beer' },
  stout:              { display: 'Stout',              category: 'beer' },
  porter:             { display: 'Porter',             category: 'beer' },
  pilsner:            { display: 'Pilsner',            category: 'beer' },
  'pale ale':         { display: 'Pale Ale',           category: 'beer' },
  'hazy ipa':         { display: 'Hazy IPA',           category: 'beer' },
  'sour beer':        { display: 'Sour Beer',          category: 'beer' },
  'wheat beer':       { display: 'Wheat Beer',         category: 'beer' },
  belgian:            { display: 'Belgian',            category: 'beer' },
  kolsch:             { display: 'Kölsch',             category: 'beer' },
  'hard cider':       { display: 'Hard Cider',         category: 'beer' },

  // ----- RTD -----
  'hard seltzer':     { display: 'Hard Seltzer',       category: 'rtd' },
  'canned cocktail':  { display: 'Canned Cocktail',    category: 'rtd' },
  'ranch water':      { display: 'Ranch Water',        category: 'rtd' },
  'hard tea':         { display: 'Hard Tea',           category: 'rtd' },
  'hard lemonade':    { display: 'Hard Lemonade',      category: 'rtd' },
  'vodka soda':       { display: 'Vodka Soda',         category: 'rtd' },
  'hard kombucha':    { display: 'Hard Kombucha',      category: 'rtd' },

  // ----- Coffee & Tea -----
  espresso:           { display: 'Espresso',           category: 'coffee-tea' },
  'cold brew':        { display: 'Cold Brew',          category: 'coffee-tea' },
  matcha:             { display: 'Matcha',             category: 'coffee-tea' },
  chai:               { display: 'Chai',               category: 'coffee-tea' },
  'nitro coffee':     { display: 'Nitro Coffee',       category: 'coffee-tea' },
  'bubble tea':       { display: 'Bubble Tea',         category: 'coffee-tea' },
  'iced coffee':      { display: 'Iced Coffee',        category: 'coffee-tea' },

  // ----- Non-Alcoholic -----
  mocktail:           { display: 'Mocktail',           category: 'non-alc' },
  'non-alcoholic beer': { display: 'Non-Alcoholic Beer', category: 'non-alc' },
  'non-alcoholic wine': { display: 'Non-Alcoholic Wine', category: 'non-alc' },
  'non-alcoholic spirits': { display: 'Non-Alcoholic Spirits', category: 'non-alc' },
  kombucha:           { display: 'Kombucha',           category: 'non-alc' },
  'functional beverage': { display: 'Functional Beverage', category: 'non-alc' },

  // ----- Energy -----
  'energy drink':     { display: 'Energy Drink',       category: 'energy' },

  // ----- THC -----
  'thc beverage':     { display: 'THC Beverage',       category: 'thc' },
  'thc seltzer':      { display: 'THC Seltzer',        category: 'thc' },
  'cbd drink':        { display: 'CBD Drink',          category: 'thc' },
};

// --------------------------------------------------------------------------
// Brand taxonomy
// --------------------------------------------------------------------------
export const BRAND_TAXONOMY = {
  // ----- Spirits: Vodka -----
  titos:              { display: "Tito's",             category: 'spirits' },
  'grey goose':       { display: 'Grey Goose',         category: 'spirits' },
  absolut:            { display: 'Absolut',            category: 'spirits' },
  smirnoff:           { display: 'Smirnoff',           category: 'spirits' },
  'ketel one':        { display: 'Ketel One',          category: 'spirits' },
  belvedere:          { display: 'Belvedere',          category: 'spirits' },
  'deep eddy':        { display: 'Deep Eddy',          category: 'spirits' },
  wheatley:           { display: 'Wheatley',           category: 'spirits' },

  // ----- Spirits: Gin -----
  hendricks:          { display: "Hendrick's",         category: 'spirits' },
  tanqueray:          { display: 'Tanqueray',          category: 'spirits' },
  beefeater:          { display: 'Beefeater',          category: 'spirits' },
  'bombay sapphire':  { display: 'Bombay Sapphire',    category: 'spirits' },
  aviation:           { display: 'Aviation',           category: 'spirits' },
  empress:            { display: 'Empress',            category: 'spirits' },

  // ----- Spirits: Tequila/Mezcal -----
  'don julio':        { display: 'Don Julio',          category: 'spirits' },
  patron:             { display: 'Patrón',             category: 'spirits' },
  casamigos:          { display: 'Casamigos',          category: 'spirits' },
  'jose cuervo':      { display: 'Jose Cuervo',        category: 'spirits' },
  'clase azul':       { display: 'Clase Azul',         category: 'spirits' },
  espolon:            { display: 'Espolón',            category: 'spirits' },
  lunazul:            { display: 'Lunazul',            category: 'spirits' },
  fortaleza:          { display: 'Fortaleza',          category: 'spirits' },
  'el jimador':       { display: 'El Jimador',         category: 'spirits' },
  'gran malo':        { display: 'Gran Malo',          category: 'spirits' },
  codigo:             { display: 'Codigo',             category: 'spirits' },
  cincoro:            { display: 'Cincoro',            category: 'spirits' },
  'del maguey':       { display: 'Del Maguey',         category: 'spirits' },

  // ----- Spirits: Whiskey/Bourbon -----
  'jack daniels':     { display: "Jack Daniel's",      category: 'spirits' },
  'makers mark':      { display: "Maker's Mark",       category: 'spirits' },
  'woodford reserve': { display: 'Woodford Reserve',   category: 'spirits' },
  bulleit:            { display: 'Bulleit',            category: 'spirits' },
  'wild turkey':      { display: 'Wild Turkey',        category: 'spirits' },
  'buffalo trace':    { display: 'Buffalo Trace',      category: 'spirits' },
  'four roses':       { display: 'Four Roses',         category: 'spirits' },
  'knob creek':       { display: 'Knob Creek',         category: 'spirits' },
  jameson:            { display: 'Jameson',            category: 'spirits' },
  bushmills:          { display: 'Bushmills',          category: 'spirits' },
  redbreast:          { display: 'Redbreast',          category: 'spirits' },
  'crown royal':      { display: 'Crown Royal',        category: 'spirits' },
  fireball:           { display: 'Fireball',           category: 'spirits' },

  // ----- Spirits: Scotch -----
  macallan:           { display: 'Macallan',           category: 'spirits' },
  glenfiddich:        { display: 'Glenfiddich',        category: 'spirits' },
  lagavulin:          { display: 'Lagavulin',          category: 'spirits' },
  balvenie:           { display: 'Balvenie',           category: 'spirits' },
  laphroaig:          { display: 'Laphroaig',          category: 'spirits' },
  talisker:           { display: 'Talisker',           category: 'spirits' },
  glendronach:        { display: 'GlenDronach',        category: 'spirits' },
  oban:               { display: 'Oban',               category: 'spirits' },
  'johnnie walker':   { display: 'Johnnie Walker',     category: 'spirits' },

  // ----- Spirits: Cognac/Brandy -----
  hennessy:           { display: 'Hennessy',           category: 'spirits' },
  courvoisier:        { display: 'Courvoisier',        category: 'spirits' },
  'remy martin':      { display: 'Rémy Martin',        category: 'spirits' },
  'grand marnier':    { display: 'Grand Marnier',      category: 'spirits' },

  // ----- Spirits: Rum -----
  bacardi:            { display: 'Bacardi',            category: 'spirits' },
  'captain morgan':   { display: 'Captain Morgan',     category: 'spirits' },
  malibu:             { display: 'Malibu',             category: 'spirits' },

  // ----- Wine -----
  'josh cellars':     { display: 'Josh Cellars',       category: 'wine' },
  meiomi:             { display: 'Meiomi',             category: 'wine' },
  apothic:            { display: 'Apothic',            category: 'wine' },
  'la crema':         { display: 'La Crema',           category: 'wine' },
  caymus:             { display: 'Caymus',             category: 'wine' },
  'kim crawford':     { display: 'Kim Crawford',       category: 'wine' },
  barefoot:           { display: 'Barefoot',           category: 'wine' },
  'yellow tail':      { display: 'Yellow Tail',        category: 'wine' },
  duckhorn:           { display: 'Duckhorn',           category: 'wine' },
  decoy:              { display: 'Decoy',              category: 'wine' },
  bogle:              { display: 'Bogle',              category: 'wine' },
  'santa margherita': { display: 'Santa Margherita',   category: 'wine' },
  'veuve clicquot':   { display: 'Veuve Clicquot',     category: 'wine' },
  moet:               { display: 'Moët',               category: 'wine' },
  'dom perignon':     { display: 'Dom Pérignon',       category: 'wine' },
  justin:             { display: 'Justin',             category: 'wine' },
  daou:               { display: 'Daou',               category: 'wine' },
  'bread & butter':   { display: 'Bread & Butter',     category: 'wine' },
  'dark horse':       { display: 'Dark Horse',         category: 'wine' },
  franzia:            { display: 'Franzia',            category: 'wine' },
  'black box':        { display: 'Black Box',          category: 'wine' },
  banfi:              { display: 'Banfi',              category: 'wine' },
  'dr. loosen':       { display: 'Dr. Loosen',         category: 'wine' },
  'chateau ste michelle': { display: 'Chateau Ste. Michelle', category: 'wine' },
  'rodney strong':    { display: 'Rodney Strong',      category: 'wine' },
  'robert mondavi':   { display: 'Robert Mondavi',     category: 'wine' },
  'kendall-jackson':  { display: 'Kendall-Jackson',    category: 'wine' },
  'cupcake vineyards': { display: 'Cupcake Vineyards', category: 'wine' },
  'sutter home':      { display: 'Sutter Home',        category: 'wine' },
  woodbridge:         { display: 'Woodbridge',         category: 'wine' },
  coppola:            { display: 'Coppola',            category: 'wine' },
  'j lohr':           { display: 'J. Lohr',            category: 'wine' },
  beringer:           { display: 'Beringer',           category: 'wine' },
  ruffino:            { display: 'Ruffino',            category: 'wine' },
  '19 crimes':        { display: '19 Crimes',          category: 'wine' },
  'menage a trois':   { display: 'Ménage à Trois',     category: 'wine' },

  // ----- Beer -----
  guinness:           { display: 'Guinness',           category: 'beer' },
  modelo:             { display: 'Modelo',             category: 'beer' },
  corona:             { display: 'Corona',             category: 'beer' },
  heineken:           { display: 'Heineken',           category: 'beer' },
  'stella artois':    { display: 'Stella Artois',      category: 'beer' },
  'blue moon':        { display: 'Blue Moon',          category: 'beer' },
  'sam adams':        { display: 'Sam Adams',          category: 'beer' },
  'sierra nevada':    { display: 'Sierra Nevada',      category: 'beer' },
  lagunitas:          { display: 'Lagunitas',          category: 'beer' },
  'dogfish head':     { display: 'Dogfish Head',       category: 'beer' },
  founders:           { display: 'Founders',           category: 'beer' },
  'voodoo ranger':    { display: 'Voodoo Ranger',      category: 'beer' },
  'goose island':     { display: 'Goose Island',       category: 'beer' },
  shiner:             { display: 'Shiner',             category: 'beer' },
  yuengling:          { display: 'Yuengling',          category: 'beer' },
  budweiser:          { display: 'Budweiser',          category: 'beer' },
  'bud light':        { display: 'Bud Light',          category: 'beer' },
  'coors light':      { display: 'Coors Light',        category: 'beer' },
  'miller lite':      { display: 'Miller Lite',        category: 'beer' },
  'pabst blue ribbon': { display: 'Pabst Blue Ribbon', category: 'beer' },

  // ----- RTD -----
  'white claw':       { display: 'White Claw',         category: 'rtd' },
  truly:              { display: 'Truly',              category: 'rtd' },
  'high noon':        { display: 'High Noon',          category: 'rtd' },
  surfside:           { display: 'Surfside',           category: 'rtd' },
  cutwater:           { display: 'Cutwater',           category: 'rtd' },
  beatbox:            { display: 'Beatbox',            category: 'rtd' },
  'on the rocks':     { display: 'On The Rocks',       category: 'rtd' },
  nutrl:              { display: 'Nütrl',              category: 'rtd' },
  carbliss:           { display: 'Carbliss',           category: 'rtd' },
  'long drink':       { display: 'Long Drink',         category: 'rtd' },
  monaco:             { display: 'Monaco',             category: 'rtd' },
  onda:               { display: 'Onda',               category: 'rtd' },
  buzzballz:          { display: 'BuzzBallz',          category: 'rtd' },
  'sun cruiser':      { display: 'Sun Cruiser',        category: 'rtd' },
  'tip top':          { display: 'Tip Top',            category: 'rtd' },

  // ----- Non-Alc brands -----
  'athletic brewing': { display: 'Athletic Brewing',   category: 'non-alc' },
  seedlip:            { display: 'Seedlip',            category: 'non-alc' },
  lyres:              { display: "Lyre's",             category: 'non-alc' },
  'ritual zero':      { display: 'Ritual Zero',        category: 'non-alc' },
  'heineken 0.0':     { display: 'Heineken 0.0',       category: 'non-alc' },
  'guinness 0.0':     { display: 'Guinness 0.0',       category: 'non-alc' },
  'brewdog af':       { display: 'BrewDog AF',         category: 'non-alc' },
  gruvi:              { display: 'Gruvi',              category: 'non-alc' },
  surely:             { display: 'Surely',             category: 'non-alc' },
  'free af':          { display: 'Free AF',            category: 'non-alc' },
  partake:            { display: 'Partake',            category: 'non-alc' },
  'liquid death':     { display: 'Liquid Death',       category: 'non-alc' },
  olipop:             { display: 'Olipop',             category: 'non-alc' },
  poppi:              { display: 'Poppi',              category: 'non-alc' },

  // ----- Energy brands -----
  celsius:            { display: 'Celsius',            category: 'energy' },
  monster:            { display: 'Monster',            category: 'energy' },
  'red bull':         { display: 'Red Bull',           category: 'energy' },
  prime:              { display: 'Prime',              category: 'energy' },
  'ghost energy':     { display: 'Ghost Energy',       category: 'energy' },
  'alani nu':         { display: 'Alani Nu',           category: 'energy' },
  zoa:                { display: 'ZOA',                category: 'energy' },

  // ----- THC brands -----
  cann:               { display: 'Cann',               category: 'thc' },
  pamos:              { display: 'Pamos',              category: 'thc' },
  wynk:               { display: 'Wynk',               category: 'thc' },
  'cycling frog':     { display: 'Cycling Frog',       category: 'thc' },
  wunder:             { display: 'Wunder',             category: 'thc' },
};

// --------------------------------------------------------------------------
// Exported term arrays for the Reddit scraper and data services.
// These are the search strings. redditService.js imports these
// directly instead of maintaining its own lists.
// --------------------------------------------------------------------------
export const BEVERAGE_TERMS = Object.keys(BEVERAGE_TAXONOMY);
export const BRAND_TERMS = Object.keys(BRAND_TAXONOMY);

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