# BeveragePulse

Beverage intelligence at the crossroads of behavioral and data science.

## What It Does

BeveragePulse tracks what people are saying and searching about beverages and brands. It pulls data from two independent sources, scores and ranks every tracked term, and presents the results in a visual dashboard built for beverage directors and F&B professionals.

The product answers one question: which way is the wind blowing?

## Data Sources

**Reddit (Social Listening)**
Monitors 43+ beverage-related subreddits weekly. Counts mentions of tracked beverage categories and brand names. Weights each mention by the popularity of the post it appeared in (upvotes). This tells you what industry professionals, enthusiasts, and consumers are actively discussing.

**Google Trends (Search Behavior)**
Pulls search interest data (0-100 scale) for every tracked term. Measures how often real consumers type a beverage or brand name into Google. This tells you what mainstream consumers are curious about, researching, or looking to buy.

## Key Features

- **Dual-signal intelligence:** Reddit engagement and Google search interest displayed side by side on every card
- **Divergence detection:** Flags when social buzz and consumer search disagree, surfacing opportunities and watch items
- **Alcoholic / Non-Alcoholic split view:** Toggle between worlds instantly
- **Category filtering:** Spirits, Wine, Beer, RTD, Coffee & Tea, Non-Alc, THC
- **Sort controls:** Rank by score, mentions, or name
- **Auto-rotating ticker:** Cycles through Top Reddit, Top Google, and Biggest Movers
- **Expandable detail panels:** Tap any card to see subreddit breakdown, all metrics with plain-English explanations, and divergence analysis
- **Data freshness indicators:** Green (current), yellow (aging), red (stale) so you always know how old the data is
- **Mobile-first design:** Scannable at arm's length on a phone at a bar

## Tech Stack

- **Frontend:** Next.js (React), CSS Modules
- **Backend:** Next.js API Routes
- **Database:** MongoDB (Mongoose)
- **Data Collection:** snoowrap (Reddit API), google-trends-api
- **Fonts:** Inter (body), JetBrains Mono (numbers)

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB running locally
- Reddit API credentials (client ID, client secret, username, password)
- pnpm package manager

### Installation
```bash
cd beverage-pulse
pnpm install
```

### Environment Variables

Create a `.env.local` file in the project root:
MONGODB_URI=mongodb://localhost:27017/beverage-trends
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_username
REDDIT_PASSWORD=your_password

### Run the Development Server
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Trigger a Data Refresh

Open your browser console (F12 > Console) at localhost:3000 and run:
```js
fetch('/api/refresh', { method: 'POST' }).then(r => r.text()).then(console.log)
```

This scrapes Reddit (2-3 minutes) then fetches Google Trends data (2-3 minutes). Watch the terminal for progress.

## Project Structure
beverage-pulse/
app/
page.js                     # Dashboard homepage
page.module.css             # Homepage styles
layout.js                   # Root layout (fonts, global styles)
globals.css                 # Design system tokens
about/
page.js                   # Methodology and data explanation
page.module.css           # About page styles
api/
beverage-trends/
route.js                # GET beverage data
brand-trends/
route.js                # GET brand data
refresh/
route.js                # POST trigger Reddit + Google scrape
lib/
db.js                       # MongoDB connection utility
redditService.js            # Reddit scraping service
googleTrends.js             # Google Trends data service
taxonomy.js                 # Beverage/brand classification
models/
BeverageTrend.js            # MongoDB beverage schema
BrandTrend.js               # MongoDB brand schema
components/
Dashboard.jsx               # Main dashboard with filters and sort
TrendCard.jsx               # Individual trend card
TrendCard.module.css
TrendDetail.jsx             # Expandable detail panel
TrendDetail.module.css
FilterBar.jsx               # Category filter pills
FilterBar.module.css
ViewToggle.jsx              # Alcoholic / Non-Alc / All toggle
ViewToggle.module.css
SortToggle.jsx              # Sort by score / mentions / name
SortToggle.module.css
TickerBar.jsx               # Auto-rotating market ticker
TickerBar.module.css
DataFreshness.jsx           # Data age indicators
DataFreshness.module.css
NavMenu.jsx                 # Hamburger navigation menu
NavMenu.module.css
Tooltip.jsx                 # Help tooltip component
Tooltip.module.css
Footer.jsx                  # Site footer
Footer.module.css

## Scoring Model

**Reddit Score** = Mention count x Post popularity (upvotes). A mention in a post with 500 upvotes counts far more than one with 2 upvotes. This filters noise and surfaces terms generating real engagement.

**Google Interest** = 0-100 relative search volume. 100 means peak search popularity for that term in the past 7 days. Not an absolute count, a relative measure for comparison.

**Divergence Signal** = When the normalized Reddit score and Google interest score differ by 15+ points:
- *Search > Buzz:* Consumers are searching more than the industry is discussing. Potential buying opportunity.
- *Buzz > Search:* Industry is excited but mainstream consumers are not searching yet. Watch list.

## Taxonomy

Every tracked term is classified into a category and parent group:

| Parent | Categories |
|--------|-----------|
| Alcoholic | Spirits, Wine, Beer, RTD |
| Non-Alcoholic | Coffee & Tea, Non-Alc, THC |

## Roadmap

- [ ] Shared header across all pages
- [ ] Desktop tooltip help icons
- [ ] Mobile responsive final pass
- [ ] SEO metadata for all pages
- [ ] Favicon and branding
- [ ] Deploy preparation
- [ ] Composite sentiment score (Reddit + Google + YouTube + website intelligence)
- [ ] AI sentiment analysis (positive/negative/neutral classification)
- [ ] Related search terms from Google Trends
- [ ] Weekly automated scrape schedule
- [ ] Trend velocity and breakout detection
- [ ] Weekly digest report

## License

Proprietary. All rights reserved. Informative Media.