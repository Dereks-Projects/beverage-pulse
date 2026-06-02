// lib/rankingRule.js
// ==========================================================================
// BeveragePulse Ranking Rule
//
// SINGLE SOURCE OF TRUTH.
//   This file is the one and only place the ranking rule lives. The
//   ranking service imports RANKING_RULE from here and sends it to the
//   reasoning model inside the prompt. There is no second copy. If the
//   rule changes, it changes here, and the version below changes with it.
//
// VERSION STAMP.
//   RULE_VERSION is written onto every ranking the service produces.
//   That makes it possible to look at any week's rankings and know
//   exactly which version of the rule generated them. If a ranking is
//   ever stamped with an old version, you know the rule and the run
//   have fallen out of step.
//
// WHAT THE MODEL SEES.
//   The reasoning model receives this rule plus four signals and their
//   short history for each brand on the weekly shortlist. It receives
//   nothing else. No web access, no outside knowledge. Every placement
//   it returns must trace back to these numbers.
//
// KNOWN LIMITATION (documented, not yet solved).
//   We rank individual products, not parent companies, because a
//   beverage director stocks products. A product can ride a parent
//   company's momentum that our product-level signals never see (for
//   example, corporate news about a distillery's owner). We accept this
//   blind spot for now. If we ever close it, we close it with stored,
//   auditable data, never a live web lookup.
// ==========================================================================

export const RULE_VERSION = 'v1';

export const RANKING_RULE = `
PURPOSE

Decide the weekly order of beverage brands by answering one question:
which brand is gaining cultural momentum fastest right now, with enough
real activity behind it to be believable. Rank for what is coming, not
for what is merely loud or large.

THE FOUR SIGNALS

Each brand comes with four signals and a short history of each.

- Buzz: a raw count of community conversation this week. This is a
  LEVEL, a quantity, not a percentage.
- News: the percent change in press coverage against its recent
  baseline. This is a VELOCITY.
- Social: the percent change in creator attention against its recent
  baseline. This is a VELOCITY.
- WikiTrend: the percent change in public discovery interest against
  its recent baseline. This is a VELOCITY.

News, Social, and WikiTrend are the three momentum signals. Buzz is the
activity floor.

Never add these numbers together. A level and a percentage are
different units that measure different things. Reason about them
separately.

USE ONLY THESE NUMBERS

Rank using only the four signals and their history. Do not use outside
knowledge, prior familiarity with a brand, or any information not
present in the supplied numbers. Every placement must be explainable
from these numbers alone.

HOW TO RANK

1. Lead with concordance.
   A brand rises when two or more momentum signals are rising together.
   Agreement across signals is the strongest evidence that something
   real is building. A single momentum signal rising alone, however
   large, is a single spike. Treat it with caution and hold it back,
   because one signal is how noise gets in.

2. Confirm with Buzz.
   Buzz does not lead the rank. It confirms it. Rising momentum backed
   by healthy Buzz is believable. Rising momentum with almost no Buzz
   may be a measurement artifact and ranks lower. High Buzz on its own,
   with flat or falling momentum, does not reach the top tier. That
   brand is here, not coming.

3. Penalize contradiction.
   When signals fight each other, for example one momentum signal
   surging while another collapses, lower the brand. Do not rank on a
   story the numbers themselves disagree on.

4. Distrust extremes and thin baselines.
   Treat extreme readings, especially a -100% value or a number built
   on very little baseline data, as suspect. Dampen them rather than
   reward them. A brand should not rank on a number you would not
   defend out loud.

5. Expect press to cool.
   Coverage of an individual product arrives in waves around a release
   and then fades. A falling News signal is often a release moment
   passing, not a brand dying. Do not over-punish a News cooldown when
   the other signals stay healthy.

HANDLING MISSING OR THIN DATA

- A missing signal is missing data, not a zero. Leave it out of the
  concordance count and judge the brand on the signals it has.
- Thin history, meaning only a few entries, is neutral. Never read a
  trend into too little history. The absence of a clear trend is not
  evidence of one.

WHEN YOU MAY DEVIATE

Apply this rule literally. You may deviate only under one of these
named conditions, and you must state which one, by number, in your
rationale:

(1) A signal is missing, so concordance is judged on the remaining
    signals.
(2) Two brands are effectively tied, and one has deeper, corroborating
    history.

Outside these two conditions, do not invent your own framework. There
is no third reason.

WHAT EVERY PLACEMENT REQUIRES

For each brand you rank, give a short rationale that cites only the four
signals and their history, and names any deviation condition used by
its number. A skeptical reader should be able to ask why a brand sits
where it does and find the answer entirely in that rationale.
`;