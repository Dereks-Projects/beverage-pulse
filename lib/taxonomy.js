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
// EXPANSION 2026-05-11:
//   Brand taxonomy expanded from 153 to ~505 entries to give the
//   AI ranking layer a real candidate pool and to populate every
//   category filter with meaningful depth. Distribution:
//     Spirits: ~150 (bourbon depth, tequila depth, mezcal real coverage)
//     Wine:    ~140 (the previously most undersized category)
//     Beer:    ~80  (national craft, regional standouts)
//     RTD:     ~55  (fastest-moving segment)
//     Non-Alc: ~45  (exploding category)
//     Energy:  ~20
//     THC:     ~15
//
// DISAMBIGUATION (Google News / YouTube):
//   Brands with common English names include a `searchTerm` field.
//   Google and YouTube crons use searchTerm instead of the raw key
//   to avoid polluted results. Reddit matching uses the raw key
//   plus a context filter for the redditAmbiguous brands.
//
// WIKIPEDIA:
//   Each entry may include an optional `wikipediaTitle` field that
//   maps the local key/display name to the actual Wikipedia article
//   title. When absent, the display name is used as the article
//   title. The getWikipediaTitle() helper handles fallback.
//
//   For brands or categories without a Wikipedia article, the
//   Wikipedia cron will receive a 404 and record null cleanly.
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
  'hard lemonade':    { display: 'Hard Lemonade',      category: 'rtd', wikipediaTitle: "Mike's Hard Lemonade" },
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

  // ========================================================================
  // SPIRITS (~150 brands)
  // ========================================================================

  // ----- Vodka -----
  titos:              { display: "Tito's",             category: 'spirits', wikipediaTitle: "Tito's Handmade Vodka" },
  'grey goose':       { display: 'Grey Goose',         category: 'spirits', searchTerm: 'Grey Goose vodka', wikipediaTitle: 'Grey Goose (vodka)' },
  absolut:            { display: 'Absolut',            category: 'spirits', searchTerm: 'Absolut vodka', wikipediaTitle: 'Absolut Vodka' },
  smirnoff:           { display: 'Smirnoff',           category: 'spirits' },
  'ketel one':        { display: 'Ketel One',          category: 'spirits' },
  belvedere:          { display: 'Belvedere',          category: 'spirits', searchTerm: 'Belvedere vodka', wikipediaTitle: 'Belvedere (vodka)' },
  'deep eddy':        { display: 'Deep Eddy',          category: 'spirits', searchTerm: 'Deep Eddy vodka', wikipediaTitle: 'Deep Eddy Vodka' },
  wheatley:           { display: 'Wheatley',           category: 'spirits', searchTerm: 'Wheatley vodka', wikipediaTitle: 'Wheatley Vodka' },
  'svedka':           { display: 'Svedka',             category: 'spirits', wikipediaTitle: 'Svedka Vodka' },
  'new amsterdam':    { display: 'New Amsterdam',      category: 'spirits', searchTerm: 'New Amsterdam vodka', redditAmbiguous: true },
  pinnacle:           { display: 'Pinnacle',           category: 'spirits', searchTerm: 'Pinnacle vodka', redditAmbiguous: true },
  skyy:               { display: 'Skyy',               category: 'spirits', searchTerm: 'Skyy vodka', wikipediaTitle: 'Skyy vodka' },
  'stolichnaya':      { display: 'Stolichnaya',        category: 'spirits' },
  'three olives':     { display: 'Three Olives',       category: 'spirits', searchTerm: 'Three Olives vodka' },
  hangar1:            { display: 'Hangar 1',           category: 'spirits', searchTerm: 'Hangar 1 vodka', wikipediaTitle: 'Hangar 1 Vodka' },
  'reyka':            { display: 'Reyka',              category: 'spirits', searchTerm: 'Reyka vodka' },

  // ----- Gin -----
  hendricks:          { display: "Hendrick's",         category: 'spirits', searchTerm: "Hendrick's gin", wikipediaTitle: "Hendrick's Gin" },
  tanqueray:          { display: 'Tanqueray',          category: 'spirits' },
  beefeater:          { display: 'Beefeater',          category: 'spirits', searchTerm: 'Beefeater gin', wikipediaTitle: 'Beefeater Gin' },
  'bombay sapphire':  { display: 'Bombay Sapphire',    category: 'spirits' },
  aviation:           { display: 'Aviation',           category: 'spirits', searchTerm: 'Aviation gin', wikipediaTitle: 'Aviation American Gin' },
  empress:            { display: 'Empress',            category: 'spirits', searchTerm: 'Empress gin', wikipediaTitle: 'Empress 1908 Gin' },
  'the botanist':     { display: 'The Botanist',       category: 'spirits', searchTerm: 'The Botanist gin' },
  monkey47:           { display: 'Monkey 47',          category: 'spirits', searchTerm: 'Monkey 47 gin', wikipediaTitle: 'Monkey 47' },
  sipsmith:           { display: 'Sipsmith',           category: 'spirits' },
  'st george':        { display: "St. George",         category: 'spirits', searchTerm: "St. George gin", wikipediaTitle: 'St. George Spirits' },
  'roku gin':         { display: 'Roku',               category: 'spirits', searchTerm: 'Roku gin', wikipediaTitle: 'Roku (gin)' },
  'plymouth':         { display: 'Plymouth',           category: 'spirits', searchTerm: 'Plymouth gin', wikipediaTitle: 'Plymouth Gin Distillery' },
  'gin mare':         { display: 'Gin Mare',           category: 'spirits' },
  'fords gin':        { display: "Ford's Gin",         category: 'spirits' },

  // ----- Tequila -----
  'jose cuervo':      { display: 'Jose Cuervo',        category: 'spirits' },
  'don julio':        { display: 'Don Julio',          category: 'spirits', searchTerm: 'Don Julio tequila', wikipediaTitle: 'Don Julio' },
  patron:             { display: 'Patrón',             category: 'spirits', searchTerm: 'Patron tequila', redditAmbiguous: true, wikipediaTitle: 'Patrón' },
  casamigos:          { display: 'Casamigos',          category: 'spirits' },
  '1800':             { display: '1800',               category: 'spirits', searchTerm: '1800 tequila', redditAmbiguous: true, wikipediaTitle: '1800 Tequila' },
  'clase azul':       { display: 'Clase Azul',         category: 'spirits' },
  espolon:            { display: 'Espolón',            category: 'spirits', wikipediaTitle: 'Espolón' },
  lunazul:            { display: 'Lunazul',            category: 'spirits' },
  fortaleza:          { display: 'Fortaleza',          category: 'spirits', searchTerm: 'Fortaleza tequila', wikipediaTitle: 'Tequila Fortaleza' },
  'el jimador':       { display: 'El Jimador',         category: 'spirits', wikipediaTitle: 'El Jimador' },
  hornitos:           { display: 'Hornitos',           category: 'spirits', searchTerm: 'Hornitos tequila', wikipediaTitle: 'Hornitos Tequila' },
  sauza:              { display: 'Sauza',              category: 'spirits', searchTerm: 'Sauza tequila', wikipediaTitle: 'Sauza Tequila' },
  herradura:          { display: 'Herradura',          category: 'spirits', searchTerm: 'Herradura tequila', wikipediaTitle: 'Herradura (tequila)' },
  milagro:            { display: 'Milagro',            category: 'spirits', searchTerm: 'Milagro tequila', redditAmbiguous: true },
  '818':              { display: '818',                category: 'spirits', searchTerm: '818 tequila', redditAmbiguous: true, wikipediaTitle: '818 Tequila' },
  teremana:           { display: 'Teremana',           category: 'spirits', wikipediaTitle: 'Teremana' },
  'cazadores':        { display: 'Cazadores',          category: 'spirits', searchTerm: 'Cazadores tequila' },
  'tequila ocho':     { display: 'Tequila Ocho',       category: 'spirits' },
  'casa noble':       { display: 'Casa Noble',         category: 'spirits', searchTerm: 'Casa Noble tequila' },
  volcan:             { display: 'Volcan',             category: 'spirits', searchTerm: 'Volcan tequila' },
  'gran centenario': { display: 'Gran Centenario',     category: 'spirits' },
  'mi campo':         { display: 'Mi Campo',           category: 'spirits', searchTerm: 'Mi Campo tequila' },
  'gran coramino':    { display: 'Gran Coramino',      category: 'spirits' },
  'casa dragones':    { display: 'Casa Dragones',      category: 'spirits' },
  'avion':            { display: 'Avión',              category: 'spirits', searchTerm: 'Avion tequila', wikipediaTitle: 'Avión (tequila)' },
  'gran malo':        { display: 'Gran Malo',          category: 'spirits', searchTerm: 'Gran Malo tequila' },
  codigo:             { display: 'Codigo',             category: 'spirits', searchTerm: 'Codigo tequila' },
  cincoro:            { display: 'Cincoro',            category: 'spirits' },
  'partida':          { display: 'Partida',            category: 'spirits', searchTerm: 'Partida tequila' },
  'tres generaciones': { display: 'Tres Generaciones', category: 'spirits' },
  corralejo:          { display: 'Corralejo',          category: 'spirits', searchTerm: 'Corralejo tequila' },

  // ----- Mezcal -----
  'del maguey':       { display: 'Del Maguey',         category: 'spirits' },
  'ilegal':           { display: 'Ilegal',             category: 'spirits', searchTerm: 'Ilegal mezcal', redditAmbiguous: true },
  vago:               { display: 'Vago',               category: 'spirits', searchTerm: 'Vago mezcal', redditAmbiguous: true },
  banhez:             { display: 'Banhez',             category: 'spirits', searchTerm: 'Banhez mezcal' },
  bozal:              { display: 'Bozal',              category: 'spirits', searchTerm: 'Bozal mezcal' },
  'el silencio':      { display: 'El Silencio',        category: 'spirits', searchTerm: 'El Silencio mezcal' },
  '400 conejos':      { display: '400 Conejos',        category: 'spirits', searchTerm: '400 Conejos mezcal' },
  'montelobos':       { display: 'Montelobos',         category: 'spirits', searchTerm: 'Montelobos mezcal' },
  'rey campero':      { display: 'Rey Campero',        category: 'spirits', searchTerm: 'Rey Campero mezcal' },
  'mezcal union':     { display: 'Mezcal Unión',       category: 'spirits' },

  // ----- Whiskey/Bourbon -----
  'jack daniels':     { display: "Jack Daniel's",      category: 'spirits', wikipediaTitle: "Jack Daniel's" },
  'jim beam':         { display: 'Jim Beam',           category: 'spirits' },
  'makers mark':      { display: "Maker's Mark",       category: 'spirits', wikipediaTitle: "Maker's Mark" },
  'woodford reserve': { display: 'Woodford Reserve',   category: 'spirits' },
  bulleit:            { display: 'Bulleit',            category: 'spirits', wikipediaTitle: 'Bulleit Bourbon' },
  'wild turkey':      { display: 'Wild Turkey',        category: 'spirits', searchTerm: 'Wild Turkey bourbon', wikipediaTitle: 'Wild Turkey (bourbon)' },
  'buffalo trace':    { display: 'Buffalo Trace',      category: 'spirits', searchTerm: 'Buffalo Trace bourbon', wikipediaTitle: 'Buffalo Trace Distillery' },
  'four roses':       { display: 'Four Roses',         category: 'spirits', searchTerm: 'Four Roses bourbon', wikipediaTitle: 'Four Roses' },
  'knob creek':       { display: 'Knob Creek',         category: 'spirits', searchTerm: 'Knob Creek bourbon', wikipediaTitle: 'Knob Creek (bourbon)' },
  'old forester':     { display: 'Old Forester',       category: 'spirits', searchTerm: 'Old Forester bourbon', wikipediaTitle: 'Old Forester' },
  'evan williams':    { display: 'Evan Williams',      category: 'spirits', searchTerm: 'Evan Williams bourbon', wikipediaTitle: 'Evan Williams (bourbon)' },
  blantons:           { display: "Blanton's",          category: 'spirits', wikipediaTitle: "Blanton's" },
  'eagle rare':       { display: 'Eagle Rare',         category: 'spirits' },
  'pappy van winkle': { display: 'Pappy Van Winkle',   category: 'spirits', wikipediaTitle: 'Old Rip Van Winkle Distillery' },
  'weller':           { display: 'Weller',             category: 'spirits', searchTerm: 'W.L. Weller bourbon', wikipediaTitle: 'W. L. Weller Distillery' },
  larceny:            { display: 'Larceny',            category: 'spirits', searchTerm: 'Larceny bourbon', redditAmbiguous: true },
  'henry mckenna':    { display: 'Henry McKenna',      category: 'spirits' },
  michters:           { display: "Michter's",          category: 'spirits', wikipediaTitle: "Michter's" },
  'rabbit hole':      { display: 'Rabbit Hole',        category: 'spirits', searchTerm: 'Rabbit Hole bourbon', redditAmbiguous: true },
  bookers:            { display: "Booker's",           category: 'spirits', searchTerm: "Booker's bourbon", wikipediaTitle: "Booker's Bourbon" },
  bakers:             { display: "Baker's",            category: 'spirits', searchTerm: "Baker's bourbon", redditAmbiguous: true },
  'basil hayden':     { display: 'Basil Hayden',       category: 'spirits' },
  'angels envy':      { display: "Angel's Envy",       category: 'spirits' },
  'heaven hill':      { display: 'Heaven Hill',        category: 'spirits', wikipediaTitle: 'Heaven Hill' },
  'old grand-dad':    { display: 'Old Grand-Dad',      category: 'spirits', wikipediaTitle: 'Old Grand-Dad' },
  'old fitzgerald':   { display: 'Old Fitzgerald',     category: 'spirits', wikipediaTitle: 'Old Fitzgerald' },
  stagg:              { display: 'Stagg',              category: 'spirits', searchTerm: 'Stagg bourbon', redditAmbiguous: true, wikipediaTitle: 'George T. Stagg' },
  'elijah craig':     { display: 'Elijah Craig',       category: 'spirits', wikipediaTitle: 'Elijah Craig (bourbon)' },
  'bardstown':        { display: 'Bardstown Bourbon Co', category: 'spirits', searchTerm: 'Bardstown bourbon', wikipediaTitle: 'Bardstown Bourbon Company' },
  whistlepig:         { display: 'WhistlePig',         category: 'spirits', wikipediaTitle: 'WhistlePig Whiskey' },
  highwest:           { display: 'High West',          category: 'spirits', searchTerm: 'High West whiskey' },
  'sazerac':          { display: 'Sazerac',            category: 'spirits', searchTerm: 'Sazerac rye', wikipediaTitle: 'Sazerac Company' },
  jameson:            { display: 'Jameson',            category: 'spirits', searchTerm: 'Jameson whiskey', wikipediaTitle: 'Jameson Irish Whiskey' },
  bushmills:          { display: 'Bushmills',          category: 'spirits', wikipediaTitle: 'Bushmills (whiskey)' },
  redbreast:          { display: 'Redbreast',          category: 'spirits', searchTerm: 'Redbreast whiskey', wikipediaTitle: 'Redbreast (whiskey)' },
  'tullamore dew':    { display: 'Tullamore D.E.W.',   category: 'spirits', wikipediaTitle: 'Tullamore Dew' },
  'crown royal':      { display: 'Crown Royal',        category: 'spirits' },
  fireball:           { display: 'Fireball',           category: 'spirits', searchTerm: 'Fireball whiskey', redditAmbiguous: true, wikipediaTitle: 'Fireball Cinnamon Whisky' },
  'jefferson':        { display: "Jefferson's",        category: 'spirits', searchTerm: "Jefferson's bourbon", redditAmbiguous: true },
  'russells reserve': { display: "Russell's Reserve",  category: 'spirits' },
  '1792':             { display: '1792',               category: 'spirits', searchTerm: '1792 bourbon' },
  noahmill:           { display: "Noah's Mill",        category: 'spirits' },
  'old elk':          { display: 'Old Elk',            category: 'spirits', searchTerm: 'Old Elk bourbon' },
  'new riff':         { display: 'New Riff',           category: 'spirits', searchTerm: 'New Riff bourbon' },
  'castle and key':   { display: 'Castle & Key',       category: 'spirits', searchTerm: 'Castle and Key bourbon' },
  'pinhook':          { display: 'Pinhook',            category: 'spirits', searchTerm: 'Pinhook bourbon' },
  'james e pepper':   { display: 'James E. Pepper',    category: 'spirits' },

  // ----- Scotch -----
  macallan:           { display: 'Macallan',           category: 'spirits', wikipediaTitle: 'The Macallan distillery' },
  glenfiddich:        { display: 'Glenfiddich',        category: 'spirits' },
  glenlivet:          { display: 'Glenlivet',          category: 'spirits', wikipediaTitle: 'The Glenlivet distillery' },
  lagavulin:          { display: 'Lagavulin',          category: 'spirits', wikipediaTitle: 'Lagavulin distillery' },
  balvenie:           { display: 'Balvenie',           category: 'spirits', wikipediaTitle: 'The Balvenie distillery' },
  laphroaig:          { display: 'Laphroaig',          category: 'spirits', wikipediaTitle: 'Laphroaig distillery' },
  talisker:           { display: 'Talisker',           category: 'spirits', wikipediaTitle: 'Talisker distillery' },
  glendronach:        { display: 'GlenDronach',        category: 'spirits', wikipediaTitle: 'Glendronach distillery' },
  oban:               { display: 'Oban',               category: 'spirits', searchTerm: 'Oban scotch', wikipediaTitle: 'Oban distillery' },
  'johnnie walker':   { display: 'Johnnie Walker',     category: 'spirits' },
  'highland park':    { display: 'Highland Park',      category: 'spirits', wikipediaTitle: 'Highland Park distillery' },
  'glenmorangie':     { display: 'Glenmorangie',       category: 'spirits' },
  'ardbeg':           { display: 'Ardbeg',             category: 'spirits', wikipediaTitle: 'Ardbeg distillery' },
  'dewars':           { display: "Dewar's",            category: 'spirits', wikipediaTitle: "Dewar's" },
  'chivas regal':     { display: 'Chivas Regal',       category: 'spirits' },
  'monkey shoulder':  { display: 'Monkey Shoulder',    category: 'spirits' },

  // ----- Cognac/Brandy -----
  hennessy:           { display: 'Hennessy',           category: 'spirits' },
  courvoisier:        { display: 'Courvoisier',        category: 'spirits' },
  'remy martin':      { display: 'Rémy Martin',        category: 'spirits', wikipediaTitle: 'Rémy Martin' },
  'grand marnier':    { display: 'Grand Marnier',      category: 'spirits' },
  martell:            { display: 'Martell',            category: 'spirits', wikipediaTitle: 'Martell (cognac)' },
  'd-usse':           { display: "D'Usse",             category: 'spirits', wikipediaTitle: "D'Ussé" },
  'st remy':          { display: 'St-Rémy',            category: 'spirits' },
  'paul masson':      { display: 'Paul Masson',        category: 'spirits', wikipediaTitle: 'Paul Masson' },
  'e&j':              { display: 'E&J',                category: 'spirits', searchTerm: 'E&J brandy', wikipediaTitle: 'E & J Gallo Winery' },

  // ----- Rum -----
  bacardi:            { display: 'Bacardi',            category: 'spirits' },
  'captain morgan':   { display: 'Captain Morgan',     category: 'spirits' },
  malibu:             { display: 'Malibu',             category: 'spirits', searchTerm: 'Malibu rum', redditAmbiguous: true, wikipediaTitle: 'Malibu (rum)' },
  'mount gay':        { display: 'Mount Gay',          category: 'spirits', searchTerm: 'Mount Gay rum', wikipediaTitle: 'Mount Gay Rum' },
  'el dorado':        { display: 'El Dorado',          category: 'spirits', searchTerm: 'El Dorado rum', redditAmbiguous: true },
  'plantation rum':   { display: 'Planteray',          category: 'spirits', searchTerm: 'Planteray rum' },
  'havana club':      { display: 'Havana Club',        category: 'spirits', wikipediaTitle: 'Havana Club' },
  'kraken':           { display: 'Kraken',             category: 'spirits', searchTerm: 'Kraken rum', redditAmbiguous: true, wikipediaTitle: 'The Kraken Rum' },
  'gosling':          { display: "Gosling's",          category: 'spirits', searchTerm: "Gosling's rum", wikipediaTitle: "Gosling's" },
  'mr. black':        { display: 'Mr. Black',          category: 'spirits', searchTerm: 'Mr. Black coffee liqueur' },
  diplomatico:        { display: 'Diplomático',        category: 'spirits' },
  'flor de cana':     { display: 'Flor de Caña',       category: 'spirits' },
  'appleton':         { display: 'Appleton Estate',    category: 'spirits', wikipediaTitle: 'Appleton Estate' },
  'wray and nephew':  { display: 'Wray & Nephew',      category: 'spirits' },

  // ----- Other Spirits -----
  aperol:             { display: 'Aperol',             category: 'spirits' },
  campari:            { display: 'Campari',            category: 'spirits' },
  jagermeister:       { display: 'Jägermeister',       category: 'spirits', wikipediaTitle: 'Jägermeister' },
  'fernet branca':    { display: 'Fernet Branca',      category: 'spirits' },
  cynar:              { display: 'Cynar',              category: 'spirits' },
  'st germain':       { display: 'St-Germain',         category: 'spirits', wikipediaTitle: 'St-Germain (liqueur)' },
  cointreau:          { display: 'Cointreau',          category: 'spirits' },
  chambord:           { display: 'Chambord',           category: 'spirits', searchTerm: 'Chambord liqueur', wikipediaTitle: 'Chambord (liqueur)' },
  baileys:            { display: 'Baileys',            category: 'spirits', wikipediaTitle: 'Baileys Irish Cream' },
  kahlua:             { display: 'Kahlúa',             category: 'spirits' },
  drambuie:           { display: 'Drambuie',           category: 'spirits' },
  chartreuse:         { display: 'Chartreuse',         category: 'spirits', searchTerm: 'Chartreuse liqueur', redditAmbiguous: true, wikipediaTitle: 'Chartreuse (liqueur)' },
  pernod:             { display: 'Pernod',             category: 'spirits', searchTerm: 'Pernod absinthe' },
  amarula:            { display: 'Amarula',            category: 'spirits' },
  'tia maria':        { display: 'Tia Maria',          category: 'spirits' },

  // ========================================================================
  // WINE (~140 brands)
  // ========================================================================

  // ----- Mass-Market Domestic -----
  'josh cellars':     { display: 'Josh Cellars',       category: 'wine' },
  meiomi:             { display: 'Meiomi',             category: 'wine' },
  apothic:            { display: 'Apothic',            category: 'wine', searchTerm: 'Apothic wine' },
  'la crema':         { display: 'La Crema',           category: 'wine', searchTerm: 'La Crema wine' },
  'kim crawford':     { display: 'Kim Crawford',       category: 'wine', searchTerm: 'Kim Crawford wine', wikipediaTitle: 'Kim Crawford Wines' },
  barefoot:           { display: 'Barefoot',           category: 'wine', searchTerm: 'Barefoot wine', redditAmbiguous: true, wikipediaTitle: 'Barefoot Wine' },
  'yellow tail':      { display: 'Yellow Tail',        category: 'wine', searchTerm: 'Yellow Tail wine', wikipediaTitle: 'Yellow Tail (wine)' },
  'sutter home':      { display: 'Sutter Home',        category: 'wine', wikipediaTitle: 'Sutter Home Family Vineyards' },
  woodbridge:         { display: 'Woodbridge',         category: 'wine', searchTerm: 'Woodbridge wine', redditAmbiguous: true },
  'cupcake vineyards': { display: 'Cupcake Vineyards', category: 'wine' },
  'liberty creek':    { display: 'Liberty Creek',      category: 'wine', searchTerm: 'Liberty Creek wine' },
  'bota box':         { display: 'Bota Box',           category: 'wine' },
  franzia:            { display: 'Franzia',            category: 'wine' },
  'black box':        { display: 'Black Box',          category: 'wine', searchTerm: 'Black Box wine', redditAmbiguous: true },
  'peter vella':      { display: 'Peter Vella',        category: 'wine' },
  'carlo rossi':      { display: 'Carlo Rossi',        category: 'wine', wikipediaTitle: 'Carlo Rossi (wine)' },
  'charles shaw':     { display: 'Charles Shaw',       category: 'wine', wikipediaTitle: 'Charles Shaw wine' },
  'menage a trois':   { display: 'Ménage à Trois',     category: 'wine', searchTerm: 'Menage a Trois wine' },
  '19 crimes':        { display: '19 Crimes',          category: 'wine', wikipediaTitle: '19 Crimes' },
  cavit:              { display: 'Cavit',              category: 'wine', searchTerm: 'Cavit wine' },
  'gallo':            { display: 'Gallo',              category: 'wine', searchTerm: 'Gallo Family Vineyards', wikipediaTitle: 'E & J Gallo Winery' },
  'livingston cellars': { display: 'Livingston Cellars', category: 'wine' },
  'dark horse':       { display: 'Dark Horse',         category: 'wine', searchTerm: 'Dark Horse wine', redditAmbiguous: true },
  'bread & butter':   { display: 'Bread & Butter',     category: 'wine', searchTerm: 'Bread and Butter wine' },

  // ----- California Premium -----
  caymus:             { display: 'Caymus',             category: 'wine', wikipediaTitle: 'Caymus Vineyards' },
  duckhorn:           { display: 'Duckhorn',           category: 'wine', wikipediaTitle: 'Duckhorn Vineyards' },
  decoy:              { display: 'Decoy',              category: 'wine', searchTerm: 'Decoy wine', redditAmbiguous: true },
  bogle:              { display: 'Bogle',              category: 'wine', searchTerm: 'Bogle wine' },
  'kendall-jackson':  { display: 'Kendall-Jackson',    category: 'wine' },
  'robert mondavi':   { display: 'Robert Mondavi',     category: 'wine', wikipediaTitle: 'Robert Mondavi Winery' },
  beringer:           { display: 'Beringer',           category: 'wine', wikipediaTitle: 'Beringer Vineyards' },
  'j lohr':           { display: 'J. Lohr',            category: 'wine', wikipediaTitle: 'J. Lohr Vineyards & Wines' },
  'rodney strong':    { display: 'Rodney Strong',      category: 'wine', searchTerm: 'Rodney Strong wine', wikipediaTitle: 'Rodney Strong Vineyards' },
  coppola:            { display: 'Coppola',            category: 'wine', searchTerm: 'Coppola wine', redditAmbiguous: true, wikipediaTitle: 'Francis Ford Coppola Winery' },
  daou:               { display: 'Daou',               category: 'wine', wikipediaTitle: 'DAOU Vineyards' },
  justin:             { display: 'Justin',             category: 'wine', searchTerm: 'Justin wines', redditAmbiguous: true, wikipediaTitle: 'Justin Vineyards & Winery' },
  'opus one':         { display: 'Opus One',           category: 'wine', wikipediaTitle: 'Opus One Winery' },
  silvanaoak:         { display: 'Silver Oak',         category: 'wine', searchTerm: 'Silver Oak wine', wikipediaTitle: 'Silver Oak Cellars' },
  'jordan winery':    { display: 'Jordan',             category: 'wine', searchTerm: 'Jordan winery' },
  rombauer:           { display: 'Rombauer',           category: 'wine', searchTerm: 'Rombauer wine', wikipediaTitle: 'Rombauer Vineyards' },
  'frank family':     { display: 'Frank Family',       category: 'wine', searchTerm: 'Frank Family wine' },
  'cakebread cellars': { display: 'Cakebread Cellars', category: 'wine', wikipediaTitle: 'Cakebread Cellars' },
  'far niente':       { display: 'Far Niente',         category: 'wine', wikipediaTitle: 'Far Niente Winery' },
  'stags leap':       { display: "Stag's Leap",        category: 'wine', searchTerm: "Stag's Leap wine cellars" },
  'shafer':           { display: 'Shafer',             category: 'wine', searchTerm: 'Shafer vineyards', wikipediaTitle: 'Shafer Vineyards' },
  'screaming eagle':  { display: 'Screaming Eagle',    category: 'wine', wikipediaTitle: 'Screaming Eagle Winery and Vineyards' },
  ridge:              { display: 'Ridge',              category: 'wine', searchTerm: 'Ridge vineyards', redditAmbiguous: true, wikipediaTitle: 'Ridge Vineyards' },
  'turley':           { display: 'Turley',             category: 'wine', searchTerm: 'Turley wine cellars' },
  'au bon climat':    { display: 'Au Bon Climat',      category: 'wine' },
  'sea smoke':        { display: 'Sea Smoke',          category: 'wine', searchTerm: 'Sea Smoke pinot noir' },
  'avaline':          { display: 'Avaline',            category: 'wine', searchTerm: 'Avaline wine', wikipediaTitle: 'Avaline' },
  'twomey':           { display: 'Twomey',             category: 'wine', searchTerm: 'Twomey wine' },
  'orin swift':       { display: 'Orin Swift',         category: 'wine' },
  prisoner:           { display: 'The Prisoner',       category: 'wine', searchTerm: 'The Prisoner wine', redditAmbiguous: true, wikipediaTitle: 'The Prisoner Wine Company' },

  // ----- Other Domestic -----
  'chateau ste michelle': { display: 'Chateau Ste. Michelle', category: 'wine', wikipediaTitle: 'Chateau Ste. Michelle' },
  'columbia crest':   { display: 'Columbia Crest',     category: 'wine', wikipediaTitle: 'Columbia Crest' },
  'king estate':      { display: 'King Estate',        category: 'wine', searchTerm: 'King Estate winery', wikipediaTitle: 'King Estate Winery' },
  'a to z':           { display: 'A to Z Wineworks',   category: 'wine', searchTerm: 'A to Z wineworks' },
  'erath':            { display: 'Erath',              category: 'wine', searchTerm: 'Erath wine' },
  'willamette valley vineyards': { display: 'Willamette Valley Vineyards', category: 'wine' },
  'argyle':           { display: 'Argyle',             category: 'wine', searchTerm: 'Argyle winery', redditAmbiguous: true },

  // ----- French / Champagne -----
  'veuve clicquot':   { display: 'Veuve Clicquot',     category: 'wine' },
  moet:               { display: 'Moët',               category: 'wine', wikipediaTitle: 'Moët & Chandon' },
  'dom perignon':     { display: 'Dom Pérignon',       category: 'wine', wikipediaTitle: 'Dom Pérignon' },
  krug:               { display: 'Krug',               category: 'wine', searchTerm: 'Krug champagne' },
  'louis roederer':   { display: 'Louis Roederer',     category: 'wine' },
  'perrier jouet':    { display: 'Perrier-Jouët',      category: 'wine' },
  'taittinger':       { display: 'Taittinger',         category: 'wine' },
  'pol roger':        { display: 'Pol Roger',          category: 'wine' },
  ruinart:            { display: 'Ruinart',            category: 'wine' },
  'laurent perrier':  { display: 'Laurent-Perrier',    category: 'wine' },
  bollinger:          { display: 'Bollinger',          category: 'wine' },
  'andre':            { display: 'André',              category: 'wine', searchTerm: 'André sparkling wine', wikipediaTitle: 'André (wine)' },
  'la marca':         { display: 'La Marca',           category: 'wine', searchTerm: 'La Marca prosecco' },
  'mionetto':         { display: 'Mionetto',           category: 'wine', searchTerm: 'Mionetto prosecco' },
  'whispering angel': { display: 'Whispering Angel',   category: 'wine', searchTerm: 'Whispering Angel rosé' },
  'miraval':          { display: 'Miraval',            category: 'wine', searchTerm: 'Miraval rosé', wikipediaTitle: 'Château Miraval' },
  'chateau d-esclans': { display: "Château d'Esclans", category: 'wine' },
  'hampton water':    { display: 'Hampton Water',      category: 'wine', searchTerm: 'Hampton Water rosé' },

  // ----- Italian -----
  'santa margherita': { display: 'Santa Margherita',   category: 'wine' },
  ruffino:            { display: 'Ruffino',            category: 'wine' },
  banfi:              { display: 'Banfi',              category: 'wine', wikipediaTitle: 'Castello Banfi' },
  'antinori':         { display: 'Antinori',           category: 'wine', wikipediaTitle: 'Antinori' },
  'gaja':             { display: 'Gaja',               category: 'wine', wikipediaTitle: 'Gaja (winery)' },
  'frescobaldi':      { display: 'Frescobaldi',        category: 'wine' },
  'masi':             { display: 'Masi',               category: 'wine', searchTerm: 'Masi wine' },
  'allegrini':        { display: 'Allegrini',          category: 'wine' },
  'stella rosa':      { display: 'Stella Rosa',        category: 'wine' },
  'cavit':            { display: 'Cavit',              category: 'wine', searchTerm: 'Cavit wine' },

  // ----- Spanish / Portuguese -----
  'marques de caceres': { display: 'Marqués de Cáceres', category: 'wine' },
  'la rioja alta':    { display: 'La Rioja Alta',      category: 'wine' },
  'cvne':             { display: 'CVNE',               category: 'wine', searchTerm: 'CVNE wine' },
  'muga':             { display: 'Muga',               category: 'wine', searchTerm: 'Muga wine' },
  'protos':           { display: 'Protos',             category: 'wine', searchTerm: 'Protos wine', redditAmbiguous: true },
  freixenet:          { display: 'Freixenet',          category: 'wine', wikipediaTitle: 'Freixenet' },
  'codorniu':         { display: 'Codorníu',           category: 'wine' },

  // ----- Argentinian / Chilean / Australian / South African -----
  catena:             { display: 'Catena',             category: 'wine', searchTerm: 'Catena Zapata' },
  'trapiche':         { display: 'Trapiche',           category: 'wine', searchTerm: 'Trapiche wine' },
  'penfolds':         { display: 'Penfolds',           category: 'wine', wikipediaTitle: 'Penfolds' },
  'jacobs creek':     { display: "Jacob's Creek",      category: 'wine', wikipediaTitle: "Jacob's Creek (wine)" },
  'concha y toro':    { display: 'Concha y Toro',      category: 'wine', wikipediaTitle: 'Concha y Toro' },
  'casillero del diablo': { display: 'Casillero del Diablo', category: 'wine' },
  'kanonkop':         { display: 'Kanonkop',           category: 'wine' },

  // ----- German -----
  'dr. loosen':       { display: 'Dr. Loosen',         category: 'wine' },
  'donnhoff':         { display: 'Dönnhoff',           category: 'wine' },
  'selbach-oster':    { display: 'Selbach-Oster',      category: 'wine' },

  // ----- New Zealand -----
  'cloudy bay':       { display: 'Cloudy Bay',         category: 'wine', wikipediaTitle: 'Cloudy Bay Vineyards' },
  'oyster bay':       { display: 'Oyster Bay',         category: 'wine', searchTerm: 'Oyster Bay wines', wikipediaTitle: 'Oyster Bay Wines' },

  // ========================================================================
  // BEER (~80 brands)
  // ========================================================================

  // ----- Macro / Imports -----
  budweiser:          { display: 'Budweiser',          category: 'beer' },
  'bud light':        { display: 'Bud Light',          category: 'beer' },
  'coors light':      { display: 'Coors Light',        category: 'beer' },
  'miller lite':      { display: 'Miller Lite',        category: 'beer' },
  'pabst blue ribbon': { display: 'Pabst Blue Ribbon', category: 'beer' },
  'natural light':    { display: 'Natural Light',      category: 'beer' },
  'busch light':      { display: 'Busch Light',        category: 'beer' },
  'michelob ultra':   { display: 'Michelob Ultra',     category: 'beer' },
  'keystone light':   { display: 'Keystone Light',     category: 'beer' },
  yuengling:          { display: 'Yuengling',          category: 'beer', wikipediaTitle: 'Yuengling' },
  guinness:           { display: 'Guinness',           category: 'beer' },
  modelo:             { display: 'Modelo',             category: 'beer', searchTerm: 'Modelo beer', wikipediaTitle: 'Grupo Modelo' },
  corona:             { display: 'Corona',             category: 'beer', searchTerm: 'Corona beer', redditAmbiguous: true, wikipediaTitle: 'Corona (beer)' },
  heineken:           { display: 'Heineken',           category: 'beer', wikipediaTitle: 'Heineken' },
  'stella artois':    { display: 'Stella Artois',      category: 'beer' },
  'pacifico':         { display: 'Pacifico',           category: 'beer', searchTerm: 'Pacifico beer' },
  'dos equis':        { display: 'Dos Equis',          category: 'beer', wikipediaTitle: 'Dos Equis' },
  'tecate':           { display: 'Tecate',             category: 'beer', searchTerm: 'Tecate beer', wikipediaTitle: 'Tecate (beer)' },
  'peroni':           { display: 'Peroni',             category: 'beer', wikipediaTitle: 'Peroni Brewery' },
  'asahi':            { display: 'Asahi',              category: 'beer', searchTerm: 'Asahi beer', wikipediaTitle: 'Asahi Breweries' },
  'sapporo':          { display: 'Sapporo',            category: 'beer', searchTerm: 'Sapporo beer', wikipediaTitle: 'Sapporo Brewery' },

  // ----- Macro Craft / National Craft -----
  'blue moon':        { display: 'Blue Moon',          category: 'beer', searchTerm: 'Blue Moon beer', redditAmbiguous: true, wikipediaTitle: 'Blue Moon (beer)' },
  'sam adams':        { display: 'Sam Adams',          category: 'beer', searchTerm: 'Sam Adams beer', wikipediaTitle: 'Samuel Adams (beer)' },
  'sierra nevada':    { display: 'Sierra Nevada',      category: 'beer', searchTerm: 'Sierra Nevada beer', wikipediaTitle: 'Sierra Nevada Brewing Company' },
  'new belgium':      { display: 'New Belgium',        category: 'beer', wikipediaTitle: 'New Belgium Brewing Company' },
  lagunitas:          { display: 'Lagunitas',          category: 'beer', wikipediaTitle: 'Lagunitas Brewing Company' },
  'dogfish head':     { display: 'Dogfish Head',       category: 'beer', wikipediaTitle: 'Dogfish Head Brewery' },
  'voodoo ranger':    { display: 'Voodoo Ranger',      category: 'beer', wikipediaTitle: 'New Belgium Brewing Company' },
  founders:           { display: 'Founders',           category: 'beer', searchTerm: 'Founders brewing', redditAmbiguous: true, wikipediaTitle: 'Founders Brewing Company' },
  'goose island':     { display: 'Goose Island',       category: 'beer', searchTerm: 'Goose Island beer', wikipediaTitle: 'Goose Island Beer Company' },
  shiner:             { display: 'Shiner',             category: 'beer', searchTerm: 'Shiner beer', wikipediaTitle: 'Spoetzl Brewery' },
  'stone brewing':    { display: 'Stone',              category: 'beer', searchTerm: 'Stone Brewing', wikipediaTitle: 'Stone Brewing' },
  'firestone walker': { display: 'Firestone Walker',   category: 'beer', wikipediaTitle: 'Firestone Walker Brewing Company' },
  'deschutes':        { display: 'Deschutes',          category: 'beer', searchTerm: 'Deschutes Brewery' },
  'bells':            { display: "Bell's",             category: 'beer', searchTerm: "Bell's Brewery", wikipediaTitle: "Bell's Brewery" },
  'oskar blues':      { display: 'Oskar Blues',        category: 'beer', wikipediaTitle: 'Oskar Blues Brewery' },
  'troegs':           { display: "Tröegs",             category: 'beer', searchTerm: "Tröegs Brewing" },
  'allagash':         { display: 'Allagash',           category: 'beer', searchTerm: 'Allagash Brewing', wikipediaTitle: 'Allagash Brewing Company' },
  'ballast point':    { display: 'Ballast Point',      category: 'beer', wikipediaTitle: 'Ballast Point Brewing Company' },
  'sweetwater':       { display: 'SweetWater',         category: 'beer', searchTerm: 'SweetWater brewing', wikipediaTitle: 'SweetWater Brewing Company' },
  'terrapin':         { display: 'Terrapin',           category: 'beer', searchTerm: 'Terrapin Beer', redditAmbiguous: true },
  'odell':            { display: 'Odell',              category: 'beer', searchTerm: 'Odell Brewing', redditAmbiguous: true },
  'great divide':     { display: 'Great Divide',       category: 'beer', searchTerm: 'Great Divide Brewing' },
  'avery':            { display: 'Avery',              category: 'beer', searchTerm: 'Avery Brewing', redditAmbiguous: true },
  'left hand':        { display: 'Left Hand',          category: 'beer', searchTerm: 'Left Hand Brewing', redditAmbiguous: true },
  'rogue':            { display: 'Rogue',              category: 'beer', searchTerm: 'Rogue Ales', redditAmbiguous: true, wikipediaTitle: 'Rogue Ales' },
  'widmer brothers':  { display: 'Widmer Brothers',    category: 'beer' },
  'pyramid':          { display: 'Pyramid',            category: 'beer', searchTerm: 'Pyramid Breweries', redditAmbiguous: true },
  '21st amendment':   { display: '21st Amendment',     category: 'beer', wikipediaTitle: '21st Amendment Brewery' },
  'anchor':           { display: 'Anchor',             category: 'beer', searchTerm: 'Anchor Brewing', redditAmbiguous: true, wikipediaTitle: 'Anchor Brewing Company' },
  'magic hat':        { display: 'Magic Hat',          category: 'beer', searchTerm: 'Magic Hat Brewing' },
  'harpoon':          { display: 'Harpoon',            category: 'beer', searchTerm: 'Harpoon Brewery', redditAmbiguous: true },
  'long trail':       { display: 'Long Trail',         category: 'beer', searchTerm: 'Long Trail Brewing' },
  'narragansett':     { display: 'Narragansett',       category: 'beer', searchTerm: 'Narragansett Beer' },
  'abita':            { display: 'Abita',              category: 'beer', searchTerm: 'Abita Brewing' },
  'great lakes':      { display: 'Great Lakes',        category: 'beer', searchTerm: 'Great Lakes Brewing', redditAmbiguous: true },
  'bell':             { display: 'Bell',               category: 'beer', searchTerm: 'Bell Brewing', redditAmbiguous: true },
  'founders all day': { display: 'Founders All Day IPA', category: 'beer' },
  'maine beer':       { display: 'Maine Beer Company', category: 'beer' },
  'tree house':       { display: 'Tree House',         category: 'beer', searchTerm: 'Tree House Brewing', redditAmbiguous: true },
  'trillium':         { display: 'Trillium',           category: 'beer', searchTerm: 'Trillium Brewing' },
  'monkish':          { display: 'Monkish',            category: 'beer', searchTerm: 'Monkish Brewing' },
  'other half':       { display: 'Other Half',         category: 'beer', searchTerm: 'Other Half Brewing', redditAmbiguous: true },
  'cigar city':       { display: 'Cigar City',         category: 'beer', searchTerm: 'Cigar City Brewing', wikipediaTitle: 'Cigar City Brewing' },
  'jolly pumpkin':    { display: 'Jolly Pumpkin',      category: 'beer' },
  'russian river':    { display: 'Russian River',      category: 'beer', searchTerm: 'Russian River Brewing', redditAmbiguous: true },
  'fat tire':         { display: 'Fat Tire',           category: 'beer', searchTerm: 'Fat Tire beer', wikipediaTitle: 'Fat Tire (beer)' },
  'garage beer':      { display: 'Garage Beer',        category: 'beer' },
  'athletic brewing': { display: 'Athletic Brewing',   category: 'beer', wikipediaTitle: 'Athletic Brewing Company' },

  // ----- Cider -----
  'angry orchard':    { display: 'Angry Orchard',      category: 'beer', wikipediaTitle: 'Angry Orchard' },
  strongbow:          { display: 'Strongbow',          category: 'beer', wikipediaTitle: 'Strongbow Cider' },
  woodchuck:          { display: 'Woodchuck',          category: 'beer', searchTerm: 'Woodchuck Cider', wikipediaTitle: 'Woodchuck Cidery' },
  ace:                { display: 'ACE',                category: 'beer', searchTerm: 'ACE Cider', redditAmbiguous: true },

  // ========================================================================
  // RTD (~55 brands)
  // ========================================================================

  // ----- Hard Seltzer -----
  'white claw':       { display: 'White Claw',         category: 'rtd', wikipediaTitle: 'White Claw Hard Seltzer' },
  truly:              { display: 'Truly',              category: 'rtd', searchTerm: 'Truly hard seltzer', redditAmbiguous: true, wikipediaTitle: 'Truly Hard Seltzer' },
  'high noon':        { display: 'High Noon',          category: 'rtd', searchTerm: 'High Noon cocktail', redditAmbiguous: true, wikipediaTitle: 'High Noon Hard Seltzer' },
  'bud light seltzer': { display: 'Bud Light Seltzer', category: 'rtd' },
  'corona seltzer':   { display: 'Corona Seltzer',     category: 'rtd' },
  press:              { display: 'PRESS',              category: 'rtd', searchTerm: 'PRESS seltzer', redditAmbiguous: true },
  'lone river':       { display: 'Lone River',         category: 'rtd', searchTerm: 'Lone River Ranch Water' },
  'topo chico':       { display: 'Topo Chico',         category: 'rtd', searchTerm: 'Topo Chico hard seltzer', wikipediaTitle: 'Topo Chico' },
  '-196':             { display: '-196',               category: 'rtd', searchTerm: '-196 chu-hi' },
  vizzy:              { display: 'Vizzy',              category: 'rtd', searchTerm: 'Vizzy hard seltzer' },
  bonv:               { display: 'BON V!V',            category: 'rtd', searchTerm: 'BON V!V seltzer' },

  // ----- Canned Cocktails -----
  surfside:           { display: 'Surfside',           category: 'rtd', searchTerm: 'Surfside iced tea vodka', wikipediaTitle: 'Surfside' },
  cutwater:           { display: 'Cutwater',           category: 'rtd', searchTerm: 'Cutwater cocktail', wikipediaTitle: 'Cutwater Spirits' },
  'on the rocks':     { display: 'On The Rocks',       category: 'rtd', searchTerm: 'On The Rocks cocktail', redditAmbiguous: true },
  nutrl:              { display: 'Nütrl',              category: 'rtd' },
  carbliss:           { display: 'Carbliss',           category: 'rtd' },
  beatbox:            { display: 'Beatbox',            category: 'rtd', searchTerm: 'Beatbox beverages', redditAmbiguous: true, wikipediaTitle: 'BeatBox Beverages' },
  'long drink':       { display: 'Long Drink',         category: 'rtd', searchTerm: 'Long Drink cocktail', redditAmbiguous: true, wikipediaTitle: 'The Long Drink' },
  monaco:             { display: 'Monaco',             category: 'rtd', searchTerm: 'Monaco cocktails', redditAmbiguous: true },
  onda:               { display: 'Onda',               category: 'rtd', searchTerm: 'Onda tequila seltzer', redditAmbiguous: true },
  buzzballz:          { display: 'BuzzBallz',          category: 'rtd', wikipediaTitle: 'BuzzBallz' },
  'sun cruiser':      { display: 'Sun Cruiser',        category: 'rtd', searchTerm: 'Sun Cruiser iced tea cocktail' },
  'tip top':          { display: 'Tip Top',            category: 'rtd', searchTerm: 'Tip Top cocktails', redditAmbiguous: true },
  'fishers island':   { display: 'Fishers Island',     category: 'rtd', searchTerm: 'Fishers Island Lemonade' },
  'happy thursday':   { display: 'Happy Thursday',     category: 'rtd', searchTerm: 'Happy Thursday spiked' },
  'high brew':        { display: 'High Brew',          category: 'rtd', searchTerm: 'High Brew cocktails' },
  'doc bys':          { display: "Doc's",              category: 'rtd', searchTerm: "Doc's hard cider", redditAmbiguous: true },
  loverboy:           { display: 'Loverboy',           category: 'rtd', searchTerm: 'Loverboy hard tea', redditAmbiguous: true },
  '21seeds':          { display: '21Seeds',            category: 'rtd', searchTerm: '21Seeds tequila' },
  'social hour':      { display: 'Social Hour',        category: 'rtd', searchTerm: 'Social Hour cocktails' },
  'ranch rider':      { display: 'Ranch Rider',        category: 'rtd', searchTerm: 'Ranch Rider Ranch Water' },
  'jose cuervo sparkling margarita': { display: 'Cuervo Sparkling', category: 'rtd', searchTerm: 'Jose Cuervo Sparkling Margarita' },
  'jack daniels country cocktails': { display: "Jack Daniel's Country Cocktails", category: 'rtd' },
  'new mix':          { display: 'New Mix',            category: 'rtd', searchTerm: 'New Mix tequila' },
  'mamitas':          { display: 'Mamitas',            category: 'rtd', searchTerm: 'Mamitas tequila seltzer' },
  'casa azul':        { display: 'Casa Azul',          category: 'rtd', searchTerm: 'Casa Azul tequila soda' },

  // ----- Hard Tea / Lemonade -----
  'twisted tea':      { display: 'Twisted Tea',        category: 'rtd', wikipediaTitle: 'Twisted Tea' },
  'mikes hard':       { display: "Mike's Hard",        category: 'rtd', searchTerm: "Mike's Hard Lemonade", wikipediaTitle: "Mike's Hard Lemonade" },
  'four loko':        { display: 'Four Loko',          category: 'rtd', wikipediaTitle: 'Four Loko' },
  'natty daddy':      { display: 'Natty Daddy',        category: 'rtd', searchTerm: 'Natty Daddy beer' },
  'simply spiked':    { display: 'Simply Spiked',      category: 'rtd', searchTerm: 'Simply Spiked Lemonade' },
  'arnold palmer spiked': { display: 'Arnold Palmer Spiked', category: 'rtd' },

  // ========================================================================
  // NON-ALC (~45 brands)
  // ========================================================================

  // ----- Non-Alc Beer -----
  'athletic brewing non alc': { display: 'Athletic', category: 'non-alc', searchTerm: 'Athletic Brewing non-alcoholic', wikipediaTitle: 'Athletic Brewing Company' },
  'heineken 0.0':     { display: 'Heineken 0.0',       category: 'non-alc', wikipediaTitle: 'Heineken' },
  'guinness 0.0':     { display: 'Guinness 0.0',       category: 'non-alc', wikipediaTitle: 'Guinness' },
  'brewdog af':       { display: 'BrewDog AF',         category: 'non-alc', wikipediaTitle: 'BrewDog' },
  'partake':          { display: 'Partake',            category: 'non-alc', searchTerm: 'Partake brewing', redditAmbiguous: true, wikipediaTitle: 'Partake Brewing' },
  'budweiser zero':   { display: 'Budweiser Zero',     category: 'non-alc' },
  'corona non alc':   { display: 'Corona Non-Alc',     category: 'non-alc', searchTerm: 'Corona Cero' },
  'lagunitas hop water': { display: 'Hop Water', category: 'non-alc', searchTerm: 'Lagunitas Hop Water' },

  // ----- Non-Alc Spirits -----
  seedlip:            { display: 'Seedlip',            category: 'non-alc' },
  lyres:              { display: "Lyre's",             category: 'non-alc', searchTerm: "Lyre's non-alcoholic" },
  'ritual zero':      { display: 'Ritual Zero',        category: 'non-alc', searchTerm: 'Ritual Zero Proof' },
  monday:             { display: 'Monday',             category: 'non-alc', searchTerm: 'Monday Zero Alcohol', redditAmbiguous: true },
  'free af':          { display: 'Free AF',            category: 'non-alc', searchTerm: 'Free AF beverages' },
  'three spirit':     { display: 'Three Spirit',       category: 'non-alc', searchTerm: 'Three Spirit drinks' },
  amass:              { display: 'Amass',              category: 'non-alc', searchTerm: 'Amass botanic', redditAmbiguous: true },
  'kin euphorics':    { display: 'Kin Euphorics',      category: 'non-alc' },
  ghia:               { display: 'Ghia',               category: 'non-alc', searchTerm: 'Ghia aperitif', redditAmbiguous: true },
  curious:            { display: 'Curious Elixirs',    category: 'non-alc', searchTerm: 'Curious Elixirs', redditAmbiguous: true },
  spiritless:         { display: 'Spiritless',         category: 'non-alc', searchTerm: 'Spiritless Kentucky 74' },

  // ----- Non-Alc Wine -----
  surely:             { display: 'Surely',             category: 'non-alc', searchTerm: 'Surely wines non-alcoholic', redditAmbiguous: true },
  gruvi:              { display: 'Gruvi',              category: 'non-alc' },
  'noughty':          { display: 'Noughty',            category: 'non-alc', searchTerm: 'Noughty wine' },
  'fre':              { display: 'Fré',                category: 'non-alc', searchTerm: 'Fre alcohol removed wine' },
  ariel:              { display: 'Ariel',              category: 'non-alc', searchTerm: 'Ariel non-alcoholic wine', redditAmbiguous: true },

  // ----- Functional / Better-for-you -----
  'liquid death':     { display: 'Liquid Death',       category: 'non-alc' },
  olipop:             { display: 'Olipop',             category: 'non-alc', wikipediaTitle: 'OLIPOP' },
  poppi:              { display: 'Poppi',              category: 'non-alc', searchTerm: 'Poppi soda', wikipediaTitle: 'Poppi (drink)' },
  'health-ade':       { display: 'Health-Ade',         category: 'non-alc', searchTerm: 'Health-Ade kombucha' },
  'gt kombucha':      { display: "GT's",               category: 'non-alc', searchTerm: "GT's Kombucha" },
  recess:             { display: 'Recess',             category: 'non-alc', searchTerm: 'Recess CBD', redditAmbiguous: true },
  'kin':              { display: 'Kin',                category: 'non-alc', searchTerm: 'Kin Euphorics', redditAmbiguous: true },
  'de soi':           { display: 'De Soi',             category: 'non-alc' },
  hiyo:               { display: 'Hiyo',               category: 'non-alc', searchTerm: 'Hiyo functional' },
  'culture pop':      { display: 'Culture Pop',        category: 'non-alc' },
  spindrift:          { display: 'Spindrift',          category: 'non-alc', searchTerm: 'Spindrift sparkling water', wikipediaTitle: 'Spindrift Beverage Co.' },
  waterloo:           { display: 'Waterloo',           category: 'non-alc', searchTerm: 'Waterloo sparkling water', redditAmbiguous: true },
  lacroix:            { display: 'LaCroix',            category: 'non-alc', wikipediaTitle: 'La Croix Sparkling Water' },
  'aha':              { display: 'AHA',                category: 'non-alc', searchTerm: 'AHA sparkling water', redditAmbiguous: true },
  bubly:              { display: 'Bubly',              category: 'non-alc', wikipediaTitle: 'Bubly' },

  // ========================================================================
  // ENERGY (~20 brands)
  // ========================================================================
  celsius:            { display: 'Celsius',            category: 'energy', searchTerm: 'Celsius energy drink', redditAmbiguous: true, wikipediaTitle: 'Celsius Holdings' },
  monster:            { display: 'Monster',            category: 'energy', searchTerm: 'Monster energy drink', redditAmbiguous: true, wikipediaTitle: 'Monster Energy' },
  'red bull':         { display: 'Red Bull',           category: 'energy' },
  prime:              { display: 'Prime',              category: 'energy', searchTerm: 'Prime energy drink', redditAmbiguous: true, wikipediaTitle: 'Prime (drink)' },
  'ghost energy':     { display: 'Ghost Energy',       category: 'energy', wikipediaTitle: 'Ghost (brand)' },
  'alani nu':         { display: 'Alani Nu',           category: 'energy', wikipediaTitle: 'Alani Nu' },
  zoa:                { display: 'ZOA',                category: 'energy', searchTerm: 'ZOA energy drink', wikipediaTitle: 'Zoa (energy drink)' },
  bang:               { display: 'Bang',               category: 'energy', searchTerm: 'Bang energy', redditAmbiguous: true, wikipediaTitle: 'Bang (drink)' },
  rockstar:           { display: 'Rockstar',           category: 'energy', searchTerm: 'Rockstar energy', redditAmbiguous: true, wikipediaTitle: 'Rockstar (drink)' },
  '5 hour energy':    { display: '5-hour Energy',      category: 'energy', wikipediaTitle: '5-hour Energy' },
  reign:              { display: 'Reign',              category: 'energy', searchTerm: 'Reign energy drink', redditAmbiguous: true },
  cyclone:            { display: 'Cyclone',            category: 'energy', searchTerm: 'Cyclone energy', redditAmbiguous: true },
  noos:               { display: 'NOOS',               category: 'energy', searchTerm: 'NOOS energy' },
  guru:               { display: 'GURU',               category: 'energy', searchTerm: 'GURU energy', redditAmbiguous: true },
  'c4':               { display: 'C4',                 category: 'energy', searchTerm: 'C4 energy drink', redditAmbiguous: true, wikipediaTitle: 'Nutrabolt' },
  'mtn dew kickstart': { display: 'Mtn Dew Kickstart', category: 'energy' },
  amp:                { display: 'AMP',                category: 'energy', searchTerm: 'AMP energy drink', redditAmbiguous: true, wikipediaTitle: 'Amp (drink)' },
  'lucozade':         { display: 'Lucozade',           category: 'energy', wikipediaTitle: 'Lucozade' },
  'vital proteins':   { display: 'Vital Proteins',     category: 'energy', searchTerm: 'Vital Proteins energy' },
  bloom:              { display: 'Bloom',              category: 'energy', searchTerm: 'Bloom Nutrition energy', redditAmbiguous: true },

  // ========================================================================
  // THC (~15 brands)
  // ========================================================================
  cann:               { display: 'Cann',               category: 'thc', searchTerm: 'Cann THC drinks', redditAmbiguous: true },
  pamos:              { display: 'Pamos',              category: 'thc', searchTerm: 'Pamos THC beverage' },
  wynk:               { display: 'Wynk',               category: 'thc', searchTerm: 'Wynk THC seltzer' },
  'cycling frog':     { display: 'Cycling Frog',       category: 'thc' },
  wunder:             { display: 'Wunder',             category: 'thc', searchTerm: 'Wunder THC drink', redditAmbiguous: true },
  'happi':            { display: 'Happi',              category: 'thc', searchTerm: 'Happi THC drink', redditAmbiguous: true },
  '1906':             { display: '1906',               category: 'thc', searchTerm: '1906 THC drink' },
  'high seas':        { display: 'High Seas',          category: 'thc', searchTerm: 'High Seas THC' },
  'artet':            { display: 'Artet',              category: 'thc', searchTerm: 'Artet cannabis' },
  'kalo':             { display: 'Kalo',               category: 'thc', searchTerm: 'Kalo THC drink', redditAmbiguous: true },
  'mary jones':       { display: 'Mary Jones',         category: 'thc', searchTerm: 'Mary Jones cannabis soda' },
  'major':            { display: 'Major',              category: 'thc', searchTerm: 'Major THC drink', redditAmbiguous: true },
  'rebel rabbit':     { display: 'Rebel Rabbit',       category: 'thc', searchTerm: 'Rebel Rabbit THC' },
  'levia':            { display: 'Levia',              category: 'thc', searchTerm: 'Levia cannabis seltzer' },
  'two roots':        { display: 'Two Roots',          category: 'thc', searchTerm: 'Two Roots THC' },
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