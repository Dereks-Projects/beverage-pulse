// lib/taxonomy.js
// ==========================================================================
// SINGLE SOURCE OF TRUTH for all tracked beverages and brands.
//
// Every term tracked by BeveragePulse is defined here. The Reddit
// scraper, Google News cron, YouTube cron, Wikipedia cron, and the
// frontend all import from this file. Add a term here and it flows
// everywhere.
//
// Structure:
//   CATEGORIES        - category definitions with colors and parent groups
//   BEVERAGE_TAXONOMY - subcategory-level beverage terms
//   BRAND_TAXONOMY    - brand names organized by category
//   BEVERAGE_TERMS    - flat array of beverage search strings
//   BRAND_TERMS       - flat array of brand search strings
//   Utility functions - display names, category lookups, search terms,
//                       Wikipedia article title lookups
//
// DISAMBIGUATION (Google News / YouTube):
//   Brands with common English names include a `searchTerm` field.
//   Google and YouTube crons use searchTerm instead of the raw key
//   to avoid polluted results. Reddit matching uses the raw key
//   plus a context filter for the redditAmbiguous brands.
//
// WIKIPEDIA (added 2026-05-04):
//   Each entry may include an optional `wikipediaTitle` field that
//   maps the local key/display name to the actual Wikipedia article
//   title. Examples: "buffalo trace" maps to "Buffalo Trace
//   Distillery"; "knob creek" maps to "Knob Creek (bourbon)";
//   "sake" maps to "Sake". When wikipediaTitle is absent, the
//   display name is used as the article title. The
//   getWikipediaTitle() helper handles this fallback.
//
//   For brands or categories without a Wikipedia article, the
//   Wikipedia cron will receive a 404 and record null cleanly.
//   No special handling needed in the taxonomy.
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
  bourbon:            { display: 'Bourbon',            category: 'spirits', wikipediaTitle: 'Bourbon whiskey' },
  rye:                { display: 'Rye',                category: 'spirits', wikipediaTitle: 'Rye whiskey' },
  scotch:             { display: 'Scotch',             category: 'spirits', wikipediaTitle: 'Scotch whisky' },
  'irish whiskey':    { display: 'Irish Whiskey',      category: 'spirits' },
  'single malt':      { display: 'Single Malt',        category: 'spirits', wikipediaTitle: 'Single malt whisky' },
  cognac:             { display: 'Cognac',             category: 'spirits' },
  brandy:             { display: 'Brandy',             category: 'spirits' },
  armagnac:           { display: 'Armagnac',           category: 'spirits', wikipediaTitle: 'Armagnac (brandy)' },
  amaro:              { display: 'Amaro',              category: 'spirits', wikipediaTitle: 'Amaro (liqueur)' },
  aperitif:           { display: 'Aperitif',           category: 'spirits', wikipediaTitle: 'Apéritif and digestif' },
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
  'pinot grigio':     { display: 'Pinot Grigio',       category: 'wine', wikipediaTitle: 'Pinot gris' },
  malbec:             { display: 'Malbec',             category: 'wine' },
  zinfandel:          { display: 'Zinfandel',          category: 'wine' },
  syrah:              { display: 'Syrah',              category: 'wine' },
  'rosé':             { display: 'Rosé',               category: 'wine', wikipediaTitle: 'Rosé' },
  rose:               { display: 'Rosé',               category: 'wine', wikipediaTitle: 'Rosé' },
  'sparkling wine':   { display: 'Sparkling Wine',     category: 'wine' },
  champagne:          { display: 'Champagne',          category: 'wine' },
  prosecco:           { display: 'Prosecco',           category: 'wine' },
  'natural wine':     { display: 'Natural Wine',       category: 'wine' },
  'orange wine':      { display: 'Orange Wine',        category: 'wine' },
  sake:               { display: 'Sake',               category: 'wine' },
  port:               { display: 'Port',               category: 'wine', wikipediaTitle: 'Port wine' },
  vermouth:           { display: 'Vermouth',           category: 'wine' },

  // ----- Beer (styles only) -----
  ipa:                { display: 'IPA',                category: 'beer', wikipediaTitle: 'India pale ale' },
  lager:              { display: 'Lager',              category: 'beer' },
  stout:              { display: 'Stout',              category: 'beer' },
  porter:             { display: 'Porter',             category: 'beer', wikipediaTitle: 'Porter (beer)' },
  pilsner:            { display: 'Pilsner',            category: 'beer' },
  'pale ale':         { display: 'Pale Ale',           category: 'beer', wikipediaTitle: 'Pale ale' },
  'hazy ipa':         { display: 'Hazy IPA',           category: 'beer', wikipediaTitle: 'New England IPA' },
  'sour beer':        { display: 'Sour Beer',          category: 'beer' },
  'wheat beer':       { display: 'Wheat Beer',         category: 'beer' },
  belgian:            { display: 'Belgian',            category: 'beer', wikipediaTitle: 'Beer in Belgium' },
  kolsch:             { display: 'Kölsch',             category: 'beer', wikipediaTitle: 'Kölsch (beer)' },
  'hard cider':       { display: 'Hard Cider',         category: 'beer', wikipediaTitle: 'Cider' },

  // ----- RTD -----
  'hard seltzer':     { display: 'Hard Seltzer',       category: 'rtd' },
  'canned cocktail':  { display: 'Canned Cocktail',    category: 'rtd', wikipediaTitle: 'Cocktail' },
  'ranch water':      { display: 'Ranch Water',        category: 'rtd' },
  'hard tea':         { display: 'Hard Tea',           category: 'rtd', wikipediaTitle: 'Hard Tea' },
  'hard lemonade':    { display: 'Hard Lemonade',      category: 'rtd', wikipediaTitle: 'Mike\'s Hard Lemonade' },
  'vodka soda':       { display: 'Vodka Soda',         category: 'rtd' },
  'hard kombucha':    { display: 'Hard Kombucha',      category: 'rtd', wikipediaTitle: 'Kombucha' },

  // ----- Coffee & Tea -----
  espresso:           { display: 'Espresso',           category: 'coffee-tea' },
  'cold brew':        { display: 'Cold Brew',          category: 'coffee-tea', wikipediaTitle: 'Cold brew coffee' },
  matcha:             { display: 'Matcha',             category: 'coffee-tea' },
  chai:               { display: 'Chai',               category: 'coffee-tea', wikipediaTitle: 'Masala chai' },
  'nitro coffee':     { display: 'Nitro Coffee',       category: 'coffee-tea', wikipediaTitle: 'Nitro coffee' },
  'bubble tea':       { display: 'Bubble Tea',         category: 'coffee-tea' },
  'iced coffee':      { display: 'Iced Coffee',        category: 'coffee-tea' },

  // ----- Non-Alcoholic -----
  mocktail:           { display: 'Mocktail',           category: 'non-alc', wikipediaTitle: 'Non-alcoholic mixed drink' },
  'non-alcoholic beer': { display: 'Non-Alcoholic Beer', category: 'non-alc', wikipediaTitle: 'Low-alcohol beer' },
  'non-alcoholic wine': { display: 'Non-Alcoholic Wine', category: 'non-alc' },
  'non-alcoholic spirits': { display: 'Non-Alcoholic Spirits', category: 'non-alc', wikipediaTitle: 'Non-alcoholic spirit' },
  kombucha:           { display: 'Kombucha',           category: 'non-alc' },
  'functional beverage': { display: 'Functional Beverage', category: 'non-alc', wikipediaTitle: 'Functional beverage' },

  // ----- Energy -----
  'energy drink':     { display: 'Energy Drink',       category: 'energy' },

  // ----- THC -----
  'thc beverage':     { display: 'THC Beverage',       category: 'thc', wikipediaTitle: 'Cannabis-infused drink' },
  'thc seltzer':      { display: 'THC Seltzer',        category: 'thc', wikipediaTitle: 'Cannabis-infused drink' },
  'cbd drink':        { display: 'CBD Drink',          category: 'thc', wikipediaTitle: 'Cannabidiol' },
};

// --------------------------------------------------------------------------
// Brand taxonomy
//
// searchTerm: disambiguated phrase for Google and YouTube searches.
// redditAmbiguous: true if raw key produces false matches in Reddit.
// wikipediaTitle: actual Wikipedia article title when it differs
//   from the display name. Falls back to display name when absent.
// --------------------------------------------------------------------------
export const BRAND_TAXONOMY = {
  // ----- Spirits: Vodka -----
  titos:              { display: "Tito's",             category: 'spirits', wikipediaTitle: "Tito's Handmade Vodka" },
  'grey goose':       { display: 'Grey Goose',         category: 'spirits', searchTerm: 'Grey Goose vodka', wikipediaTitle: 'Grey Goose (vodka)' },
  absolut:            { display: 'Absolut',            category: 'spirits', searchTerm: 'Absolut vodka', wikipediaTitle: 'Absolut Vodka' },
  smirnoff:           { display: 'Smirnoff',           category: 'spirits' },
  'ketel one':        { display: 'Ketel One',          category: 'spirits' },
  belvedere:          { display: 'Belvedere',          category: 'spirits', searchTerm: 'Belvedere vodka', wikipediaTitle: 'Belvedere (vodka)' },
  'deep eddy':        { display: 'Deep Eddy',          category: 'spirits', searchTerm: 'Deep Eddy vodka', wikipediaTitle: 'Deep Eddy Vodka' },
  wheatley:           { display: 'Wheatley',           category: 'spirits', searchTerm: 'Wheatley vodka', wikipediaTitle: 'Wheatley Vodka' },

  // ----- Spirits: Gin -----
  hendricks:          { display: "Hendrick's",         category: 'spirits', searchTerm: "Hendrick's gin", wikipediaTitle: "Hendrick's Gin" },
  tanqueray:          { display: 'Tanqueray',          category: 'spirits' },
  beefeater:          { display: 'Beefeater',          category: 'spirits', searchTerm: 'Beefeater gin', wikipediaTitle: 'Beefeater Gin' },
  'bombay sapphire':  { display: 'Bombay Sapphire',    category: 'spirits' },
  aviation:           { display: 'Aviation',           category: 'spirits', searchTerm: 'Aviation gin', wikipediaTitle: 'Aviation American Gin' },
  empress:            { display: 'Empress',            category: 'spirits', searchTerm: 'Empress gin', wikipediaTitle: 'Empress 1908 Gin' },

  // ----- Spirits: Tequila/Mezcal -----
  'don julio':        { display: 'Don Julio',          category: 'spirits', searchTerm: 'Don Julio tequila', wikipediaTitle: 'Don Julio' },
  patron:             { display: 'Patrón',             category: 'spirits', searchTerm: 'Patron tequila', redditAmbiguous: true, wikipediaTitle: 'Patrón' },
  casamigos:          { display: 'Casamigos',          category: 'spirits' },
  'jose cuervo':      { display: 'Jose Cuervo',        category: 'spirits' },
  'clase azul':       { display: 'Clase Azul',         category: 'spirits' },
  espolon:            { display: 'Espolón',            category: 'spirits', wikipediaTitle: 'Espolón' },
  lunazul:            { display: 'Lunazul',            category: 'spirits' },
  fortaleza:          { display: 'Fortaleza',          category: 'spirits', searchTerm: 'Fortaleza tequila', wikipediaTitle: 'Tequila Fortaleza' },
  'el jimador':       { display: 'El Jimador',         category: 'spirits', wikipediaTitle: 'El Jimador' },
  'gran malo':        { display: 'Gran Malo',          category: 'spirits', searchTerm: 'Gran Malo tequila' },
  codigo:             { display: 'Codigo',             category: 'spirits', searchTerm: 'Codigo tequila' },
  cincoro:            { display: 'Cincoro',            category: 'spirits' },
  'del maguey':       { display: 'Del Maguey',         category: 'spirits' },

  // ----- Spirits: Whiskey/Bourbon -----
  'jack daniels':     { display: "Jack Daniel's",      category: 'spirits', wikipediaTitle: "Jack Daniel's" },
  'makers mark':      { display: "Maker's Mark",       category: 'spirits', wikipediaTitle: "Maker's Mark" },
  'woodford reserve': { display: 'Woodford Reserve',   category: 'spirits' },
  bulleit:            { display: 'Bulleit',            category: 'spirits', wikipediaTitle: 'Bulleit Bourbon' },
  'wild turkey':      { display: 'Wild Turkey',        category: 'spirits', searchTerm: 'Wild Turkey bourbon', wikipediaTitle: 'Wild Turkey (bourbon)' },
  'buffalo trace':    { display: 'Buffalo Trace',      category: 'spirits', searchTerm: 'Buffalo Trace bourbon', wikipediaTitle: 'Buffalo Trace Distillery' },
  'four roses':       { display: 'Four Roses',         category: 'spirits', searchTerm: 'Four Roses bourbon', wikipediaTitle: 'Four Roses' },
  'knob creek':       { display: 'Knob Creek',         category: 'spirits', searchTerm: 'Knob Creek bourbon', wikipediaTitle: 'Knob Creek (bourbon)' },
  jameson:            { display: 'Jameson',            category: 'spirits', searchTerm: 'Jameson whiskey', wikipediaTitle: 'Jameson Irish Whiskey' },
  bushmills:          { display: 'Bushmills',          category: 'spirits', wikipediaTitle: 'Bushmills (whiskey)' },
  redbreast:          { display: 'Redbreast',          category: 'spirits', searchTerm: 'Redbreast whiskey', wikipediaTitle: 'Redbreast (whiskey)' },
  'crown royal':      { display: 'Crown Royal',        category: 'spirits' },
  fireball:           { display: 'Fireball',           category: 'spirits', searchTerm: 'Fireball whiskey', redditAmbiguous: true, wikipediaTitle: 'Fireball Cinnamon Whisky' },

  // ----- Spirits: Scotch -----
  macallan:           { display: 'Macallan',           category: 'spirits', wikipediaTitle: 'The Macallan distillery' },
  glenfiddich:        { display: 'Glenfiddich',        category: 'spirits' },
  lagavulin:          { display: 'Lagavulin',          category: 'spirits', wikipediaTitle: 'Lagavulin distillery' },
  balvenie:           { display: 'Balvenie',           category: 'spirits', wikipediaTitle: 'The Balvenie distillery' },
  laphroaig:          { display: 'Laphroaig',          category: 'spirits', wikipediaTitle: 'Laphroaig distillery' },
  talisker:           { display: 'Talisker',           category: 'spirits', wikipediaTitle: 'Talisker distillery' },
  glendronach:        { display: 'GlenDronach',        category: 'spirits', wikipediaTitle: 'Glendronach distillery' },
  oban:               { display: 'Oban',               category: 'spirits', searchTerm: 'Oban scotch', wikipediaTitle: 'Oban distillery' },
  'johnnie walker':   { display: 'Johnnie Walker',     category: 'spirits' },

  // ----- Spirits: Cognac/Brandy -----
  hennessy:           { display: 'Hennessy',           category: 'spirits' },
  courvoisier:        { display: 'Courvoisier',        category: 'spirits' },
  'remy martin':      { display: 'Rémy Martin',        category: 'spirits', wikipediaTitle: 'Rémy Martin' },
  'grand marnier':    { display: 'Grand Marnier',      category: 'spirits' },

  // ----- Spirits: Rum -----
  bacardi:            { display: 'Bacardi',            category: 'spirits' },
  'captain morgan':   { display: 'Captain Morgan',     category: 'spirits' },
  malibu:             { display: 'Malibu',             category: 'spirits', searchTerm: 'Malibu rum', redditAmbiguous: true, wikipediaTitle: 'Malibu (rum)' },

  // ----- Wine -----
  'josh cellars':     { display: 'Josh Cellars',       category: 'wine' },
  meiomi:             { display: 'Meiomi',             category: 'wine' },
  apothic:            { display: 'Apothic',            category: 'wine', searchTerm: 'Apothic wine' },
  'la crema':         { display: 'La Crema',           category: 'wine', searchTerm: 'La Crema wine' },
  caymus:             { display: 'Caymus',             category: 'wine', wikipediaTitle: 'Caymus Vineyards' },
  'kim crawford':     { display: 'Kim Crawford',       category: 'wine', searchTerm: 'Kim Crawford wine', wikipediaTitle: 'Kim Crawford Wines' },
  barefoot:           { display: 'Barefoot',           category: 'wine', searchTerm: 'Barefoot wine', redditAmbiguous: true, wikipediaTitle: 'Barefoot Wine' },
  'yellow tail':      { display: 'Yellow Tail',        category: 'wine', searchTerm: 'Yellow Tail wine', wikipediaTitle: 'Yellow Tail (wine)' },
  duckhorn:           { display: 'Duckhorn',           category: 'wine', wikipediaTitle: 'Duckhorn Vineyards' },
  decoy:              { display: 'Decoy',              category: 'wine', searchTerm: 'Decoy wine', redditAmbiguous: true },
  bogle:              { display: 'Bogle',              category: 'wine', searchTerm: 'Bogle wine' },
  'santa margherita': { display: 'Santa Margherita',   category: 'wine' },
  'veuve clicquot':   { display: 'Veuve Clicquot',     category: 'wine' },
  moet:               { display: 'Moët',               category: 'wine', wikipediaTitle: 'Moët & Chandon' },
  'dom perignon':     { display: 'Dom Pérignon',       category: 'wine', wikipediaTitle: 'Dom Pérignon' },
  justin:             { display: 'Justin',             category: 'wine', searchTerm: 'Justin wines', redditAmbiguous: true, wikipediaTitle: 'Justin Vineyards & Winery' },
  daou:               { display: 'Daou',               category: 'wine', wikipediaTitle: 'DAOU Vineyards' },
  'bread & butter':   { display: 'Bread & Butter',     category: 'wine', searchTerm: 'Bread and Butter wine' },
  'dark horse':       { display: 'Dark Horse',         category: 'wine', searchTerm: 'Dark Horse wine', redditAmbiguous: true },
  franzia:            { display: 'Franzia',            category: 'wine' },
  'black box':        { display: 'Black Box',          category: 'wine', searchTerm: 'Black Box wine', redditAmbiguous: true },
  banfi:              { display: 'Banfi',              category: 'wine', wikipediaTitle: 'Castello Banfi' },
  'dr. loosen':       { display: 'Dr. Loosen',         category: 'wine' },
  'chateau ste michelle': { display: 'Chateau Ste. Michelle', category: 'wine', wikipediaTitle: 'Chateau Ste. Michelle' },
  'rodney strong':    { display: 'Rodney Strong',      category: 'wine', searchTerm: 'Rodney Strong wine', wikipediaTitle: 'Rodney Strong Vineyards' },
  'robert mondavi':   { display: 'Robert Mondavi',     category: 'wine', wikipediaTitle: 'Robert Mondavi Winery' },
  'kendall-jackson':  { display: 'Kendall-Jackson',    category: 'wine' },
  'cupcake vineyards': { display: 'Cupcake Vineyards', category: 'wine' },
  'sutter home':      { display: 'Sutter Home',        category: 'wine', wikipediaTitle: 'Sutter Home Family Vineyards' },
  woodbridge:         { display: 'Woodbridge',         category: 'wine', searchTerm: 'Woodbridge wine', redditAmbiguous: true },
  coppola:            { display: 'Coppola',            category: 'wine', searchTerm: 'Coppola wine', redditAmbiguous: true, wikipediaTitle: 'Francis Ford Coppola Winery' },
  'j lohr':           { display: 'J. Lohr',            category: 'wine', wikipediaTitle: 'J. Lohr Vineyards & Wines' },
  beringer:           { display: 'Beringer',           category: 'wine', wikipediaTitle: 'Beringer Vineyards' },
  ruffino:            { display: 'Ruffino',            category: 'wine' },
  '19 crimes':        { display: '19 Crimes',          category: 'wine', wikipediaTitle: '19 Crimes' },
  'menage a trois':   { display: 'Ménage à Trois',     category: 'wine', searchTerm: 'Menage a Trois wine' },

  // ----- Beer -----
  guinness:           { display: 'Guinness',           category: 'beer' },
  modelo:             { display: 'Modelo',             category: 'beer', searchTerm: 'Modelo beer', wikipediaTitle: 'Grupo Modelo' },
  corona:             { display: 'Corona',             category: 'beer', searchTerm: 'Corona beer', redditAmbiguous: true, wikipediaTitle: 'Corona (beer)' },
  heineken:           { display: 'Heineken',           category: 'beer', wikipediaTitle: 'Heineken' },
  'stella artois':    { display: 'Stella Artois',      category: 'beer' },
  'blue moon':        { display: 'Blue Moon',          category: 'beer', searchTerm: 'Blue Moon beer', redditAmbiguous: true, wikipediaTitle: 'Blue Moon (beer)' },
  'sam adams':        { display: 'Sam Adams',          category: 'beer', searchTerm: 'Sam Adams beer', wikipediaTitle: 'Samuel Adams (beer)' },
  'sierra nevada':    { display: 'Sierra Nevada',      category: 'beer', searchTerm: 'Sierra Nevada beer', wikipediaTitle: 'Sierra Nevada Brewing Company' },
  lagunitas:          { display: 'Lagunitas',          category: 'beer', wikipediaTitle: 'Lagunitas Brewing Company' },
  'dogfish head':     { display: 'Dogfish Head',       category: 'beer', wikipediaTitle: 'Dogfish Head Brewery' },
  founders:           { display: 'Founders',           category: 'beer', searchTerm: 'Founders brewing', redditAmbiguous: true, wikipediaTitle: 'Founders Brewing Company' },
  'voodoo ranger':    { display: 'Voodoo Ranger',      category: 'beer', wikipediaTitle: 'New Belgium Brewing Company' },
  'goose island':     { display: 'Goose Island',       category: 'beer', searchTerm: 'Goose Island beer', wikipediaTitle: 'Goose Island Beer Company' },
  shiner:             { display: 'Shiner',             category: 'beer', searchTerm: 'Shiner beer', wikipediaTitle: 'Spoetzl Brewery' },
  yuengling:          { display: 'Yuengling',          category: 'beer', wikipediaTitle: 'Yuengling' },
  budweiser:          { display: 'Budweiser',          category: 'beer' },
  'bud light':        { display: 'Bud Light',          category: 'beer' },
  'coors light':      { display: 'Coors Light',        category: 'beer' },
  'miller lite':      { display: 'Miller Lite',        category: 'beer' },
  'pabst blue ribbon': { display: 'Pabst Blue Ribbon', category: 'beer' },

  // ----- RTD -----
  'white claw':       { display: 'White Claw',         category: 'rtd', wikipediaTitle: 'White Claw Hard Seltzer' },
  truly:              { display: 'Truly',              category: 'rtd', searchTerm: 'Truly hard seltzer', redditAmbiguous: true, wikipediaTitle: 'Truly Hard Seltzer' },
  'high noon':        { display: 'High Noon',          category: 'rtd', searchTerm: 'High Noon cocktail', redditAmbiguous: true, wikipediaTitle: 'High Noon Hard Seltzer' },
  surfside:           { display: 'Surfside',           category: 'rtd', searchTerm: 'Surfside cocktail' },
  cutwater:           { display: 'Cutwater',           category: 'rtd', searchTerm: 'Cutwater cocktail', wikipediaTitle: 'Cutwater Spirits' },
  beatbox:            { display: 'Beatbox',            category: 'rtd', searchTerm: 'Beatbox beverages', redditAmbiguous: true, wikipediaTitle: 'BeatBox Beverages' },
  'on the rocks':     { display: 'On The Rocks',       category: 'rtd', searchTerm: 'On The Rocks cocktail', redditAmbiguous: true },
  nutrl:              { display: 'Nütrl',              category: 'rtd' },
  carbliss:           { display: 'Carbliss',           category: 'rtd' },
  'long drink':       { display: 'Long Drink',         category: 'rtd', searchTerm: 'Long Drink cocktail', redditAmbiguous: true, wikipediaTitle: 'The Long Drink' },
  monaco:             { display: 'Monaco',             category: 'rtd', searchTerm: 'Monaco cocktails', redditAmbiguous: true },
  onda:               { display: 'Onda',               category: 'rtd', searchTerm: 'Onda tequila seltzer', redditAmbiguous: true },
  buzzballz:          { display: 'BuzzBallz',          category: 'rtd', wikipediaTitle: 'BuzzBallz' },
  'sun cruiser':      { display: 'Sun Cruiser',        category: 'rtd', searchTerm: 'Sun Cruiser iced tea cocktail' },
  'tip top':          { display: 'Tip Top',            category: 'rtd', searchTerm: 'Tip Top cocktails', redditAmbiguous: true },

  // ----- Non-Alc brands -----
  'athletic brewing': { display: 'Athletic Brewing',   category: 'non-alc', wikipediaTitle: 'Athletic Brewing Company' },
  seedlip:            { display: 'Seedlip',            category: 'non-alc' },
  lyres:              { display: "Lyre's",             category: 'non-alc', searchTerm: "Lyre's non-alcoholic" },
  'ritual zero':      { display: 'Ritual Zero',        category: 'non-alc', searchTerm: 'Ritual Zero Proof' },
  'heineken 0.0':     { display: 'Heineken 0.0',       category: 'non-alc', wikipediaTitle: 'Heineken' },
  'guinness 0.0':     { display: 'Guinness 0.0',       category: 'non-alc', wikipediaTitle: 'Guinness' },
  'brewdog af':       { display: 'BrewDog AF',         category: 'non-alc', wikipediaTitle: 'BrewDog' },
  gruvi:              { display: 'Gruvi',              category: 'non-alc' },
  surely:             { display: 'Surely',             category: 'non-alc', searchTerm: 'Surely wines non-alcoholic', redditAmbiguous: true },
  'free af':          { display: 'Free AF',            category: 'non-alc', searchTerm: 'Free AF beverages' },
  partake:            { display: 'Partake',            category: 'non-alc', searchTerm: 'Partake brewing', redditAmbiguous: true, wikipediaTitle: 'Partake Brewing' },
  'liquid death':     { display: 'Liquid Death',       category: 'non-alc' },
  olipop:             { display: 'Olipop',             category: 'non-alc', wikipediaTitle: 'OLIPOP' },
  poppi:              { display: 'Poppi',              category: 'non-alc', searchTerm: 'Poppi soda', wikipediaTitle: 'Poppi (drink)' },

  // ----- Energy brands -----
  celsius:            { display: 'Celsius',            category: 'energy', searchTerm: 'Celsius energy drink', redditAmbiguous: true, wikipediaTitle: 'Celsius Holdings' },
  monster:            { display: 'Monster',            category: 'energy', searchTerm: 'Monster energy drink', redditAmbiguous: true, wikipediaTitle: 'Monster Energy' },
  'red bull':         { display: 'Red Bull',           category: 'energy' },
  prime:              { display: 'Prime',              category: 'energy', searchTerm: 'Prime energy drink', redditAmbiguous: true, wikipediaTitle: 'Prime (drink)' },
  'ghost energy':     { display: 'Ghost Energy',       category: 'energy', wikipediaTitle: 'Ghost (brand)' },
  'alani nu':         { display: 'Alani Nu',           category: 'energy', wikipediaTitle: 'Alani Nu' },
  zoa:                { display: 'ZOA',                category: 'energy', searchTerm: 'ZOA energy drink', wikipediaTitle: 'Zoa (energy drink)' },

  // ----- THC brands -----
  cann:               { display: 'Cann',               category: 'thc', searchTerm: 'Cann THC drinks', redditAmbiguous: true },
  pamos:              { display: 'Pamos',              category: 'thc', searchTerm: 'Pamos THC beverage' },
  wynk:               { display: 'Wynk',               category: 'thc', searchTerm: 'Wynk THC seltzer' },
  'cycling frog':     { display: 'Cycling Frog',       category: 'thc' },
  wunder:             { display: 'Wunder',             category: 'thc', searchTerm: 'Wunder THC drink', redditAmbiguous: true },
};

// --------------------------------------------------------------------------
// Exported term arrays for the Reddit scraper and data services.
// --------------------------------------------------------------------------
export const BEVERAGE_TERMS = Object.keys(BEVERAGE_TAXONOMY);
export const BRAND_TERMS = Object.keys(BRAND_TAXONOMY);

/**
 * Get the search term for a brand (used by Google News and YouTube
 * crons). Returns the searchTerm if defined, otherwise raw name.
 */
export function getSearchTerm(brandName) {
  const entry = BRAND_TAXONOMY[brandName.toLowerCase()];
  if (entry && entry.searchTerm) return entry.searchTerm;
  return brandName;
}

/**
 * Check if a brand term is known to be ambiguous on Reddit.
 */
export function isRedditAmbiguous(brandName) {
  const entry = BRAND_TAXONOMY[brandName.toLowerCase()];
  return entry ? !!entry.redditAmbiguous : false;
}

/**
 * Get the Wikipedia article title for a brand or beverage. Returns
 * the explicit wikipediaTitle if defined, otherwise the display
 * name. The Wikipedia cron uses this to look up pageviews.
 *
 * @param {string} name  taxonomy key
 * @param {string} type  'brand' or 'beverage'
 */
export function getWikipediaTitle(name, type = 'brand') {
  const taxonomy = type === 'brand' ? BRAND_TAXONOMY : BEVERAGE_TAXONOMY;
  const entry = taxonomy[name.toLowerCase()];
  if (!entry) return name;
  if (entry.wikipediaTitle) return entry.wikipediaTitle;
  return entry.display;
}

// --------------------------------------------------------------------------
// Utility functions
// --------------------------------------------------------------------------

export function getBeverageCategory(beverageName) {
  const entry = BEVERAGE_TAXONOMY[beverageName.toLowerCase()];
  if (!entry) return null;
  return CATEGORIES[entry.category] || null;
}

export function getBrandCategory(brandName) {
  const entry = BRAND_TAXONOMY[brandName.toLowerCase()];
  if (!entry) return null;
  return CATEGORIES[entry.category] || null;
}

export function getDisplayName(name, type = 'beverage') {
  const taxonomy = type === 'brand' ? BRAND_TAXONOMY : BEVERAGE_TAXONOMY;
  const entry = taxonomy[name.toLowerCase()];

  if (entry) return entry.display;

  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getParentGroup(name, type = 'beverage') {
  const taxonomy = type === 'brand' ? BRAND_TAXONOMY : BEVERAGE_TAXONOMY;
  const entry = taxonomy[name.toLowerCase()];

  if (!entry) return null;

  const category = CATEGORIES[entry.category];
  if (!category) return null;

  return PARENT_GROUPS[category.parent] || null;
}