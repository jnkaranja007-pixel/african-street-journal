# How a story gets into the paper

The overnight desk writes about 220 stories a day for 55 countries. A story is
published only after it has passed every gate below, in this order. A gate either
lets the story through, sends it back to the writer once with a precise instruction,
or drops it, and then the next story in that country's queue takes its place.

The standard throughout is The Wall Street Journal, read through an African lens. The
paper covers money, markets, business, policy and who governs, for readers in Lagos,
Nairobi, Kinshasa and the diaspora. A coup or a war that changes who holds territory
is major news. A road crash or a single murder is not.

## The pipeline

| # | Gate | What it catches | What happens | Where |
|---|---|---|---|---|
| 1 | **Assignment** | Feed items with too little source text, weak single-outlet reports | Never assigned | `fetch-news.ps1`, `write-briefs.ps1` |
| 2 | **Feed-stage WSJ bar** | Routine crime and casualty reports before any model is paid | Never assigned | `Test-NewsBelowWsjBar`, `news-ranking.ps1` |
| 3 | **Writer** | Writes one story from one evidence packet, never seeing another story's facts. It first fills a plan that is never printed: who is affected, what the stake is, what a reader elsewhere needs explained, and what the news is | A draft | GPT-6 Luna (`ASJ_MODEL`) |
| 4 | **Contract** | Wrong shape: not 3 paragraphs, 70 to 220 words, a missing dek or why line | Sent back | `Get-DraftContractIssues` |
| 5 | **Facts** | A figure, month or date that is not in the source; a lens score with no grounded reason | Sent back | `Get-UngroundedNumbers`, `Get-ItemUngroundedMonths` |
| 6 | **Place** | A story that is not about the country it is filed under | Dropped | `countryLink`, `Get-StoryPlaceIssue` |
| 7 | **House style** | Copying the source, stock phrases, relative dates, a why line that guesses or restates, initials never spelled out (`Get-UnexplainedInitials`), and the WSJ copy rules (loaded words, graphic detail, toll headlines) | Sent back once to Claude Haiku 5.5 | `Get-DraftStyleIssues`, `wsj-standards.ps1` |
| 8 | **WSJ bar** | A crime, crash or killing that is not a national event | Dropped | `Test-WsjBar` |
| 9 | **Standards editor** | What code cannot judge: names and initials a reader elsewhere cannot place, a why line that says nothing new, a headline about the wrong thing, soft news | Dropped, or sent back once with fixes | `editor-desk.ps1` |
| 10 | **Final validation** | Anything the model returned that the desk did not ask for; real outlet URLs attached by code | Cleaned or dropped | `write-briefs.ps1` |
| 11 | **Front page** | Picks the top stories; a crash or crime story can never be one | Ranked | `Invoke-FrontRanking` |

Gates 4 to 8 are code: they never get tired and never disagree with themselves.
Gate 9 is a model, because some of the most important judgements are not countable.

## The standards editor (gate 9)

The editor reads every story beside the source packet it was written from and grades
it from 1 to 5 on six points:

- **context**: can a reader in another country tell who each person, body and place is?
- **headline**: does it state the story's main event?
- **why**: does "why it matters" say something the story does not, such as who pays
  or gains, by how much, or what happens next?
- **clarity**: is it plain and specific?
- **country**: is it really this country's news?
- **standards**: would the Journal print it?

What happens next:

- **Drop**: standards or country at 1, and the country has other copy: nothing to
  report, routine crime, tabloid copy, or foreign news. At most two a country a run. A country's only story
  is never dropped, because a stale page is worse.
- **Hold**: standards at 2 (soft news). The story is set aside and the next candidate
  in the country's queue is written to try for the slot. The soft story runs only if
  the country would otherwise be short.
- **Revise**: context, headline, why or clarity at 2 or below. The writer gets one
  rewrite with the editor's fixes. The fixes may only use facts from the packet:
  where the reader needs something the packet does not give, the fix is to cut, never
  to invent. The rewrite then goes through every check again (facts, place, style,
  WSJ bar), and it is kept only if the editor grades it higher than the draft.
- **Pass**: everything else.

The editor never blocks the paper. If it errors three times in a row, runs past 30
minutes (`EditorBudgetMinutes`) or makes 700 calls (`EditorMaxCalls`), the remaining
stories go out as the checks passed them, and the run summary says so.

The weekly review (`review-stories.ps1`) uses the same rubric. The standard the desk
enforces is the standard it is measured against, and the two cannot drift apart.

## The numbers to watch

Every desk run prints these on its GitHub summary page, under **Story quality**:

| Number | Healthy | If not |
|---|---|---|
| Stories written | about 200 or more | Check the run log for skipped countries |
| Kept with notes (style faults left after a rewrite) | under 15% of stories | The rewrite model may be failing; an issue opens automatically |
| Editor grade, published: mean | 3.5 or more | Read the editor's notes in the log |
| Editor grade, published: why | 3 or more | The why rule needs work |
| Editor errors / not read | 0 / 0 | An issue opens at 3 errors or 20 stories unread |
| Below the WSJ bar, dropped | a handful | A sudden jump means the crime filter is too wide |
| Reported cost | about $0.30 to $0.60 a run | Check the OpenRouter credit, since the desk stops silently at zero |

`data/desk-run-metrics.json` holds every number for the latest run. Each run's evidence
and log are saved as the `desk-evidence` artifact for 14 days.

## Changing the harness safely

Every change to a prompt, a check or a model is proven on the same stories before it
goes live. The **Model bake-off** workflow (`.github/workflows/bakeoff.yml`) does this:

1. Push the change to a branch.
2. Run the bake-off twice on the same day's evidence, once from `main` and once from
   the branch:

   ```
   gh workflow run bakeoff.yml --ref main     -f models=openai/gpt-6-luna -f evidence_run=<desk run id>
   gh workflow run bakeoff.yml --ref <branch> -f models=openai/gpt-6-luna -f evidence_run=<desk run id>
   ```

3. Compare the two summary tables: stories written, still flawed, cost, and the
   independent judge's grades. The judge is GPT-6.1 Terra, not the editor's model, so
   the desk is not marked by the editor it was taught by.
4. Merge only if the branch is better on quality and no worse on stories written.

A bake-off costs a few cents a model. Nothing it writes is committed or published.

## The tests

Every push runs these in **Checks**:

- `test-editor-desk.ps1`: the rubric, the parser that reads the editor's answer as
  untrusted, the drop, revise and pass rule, and the repair note.
- `test-desk-harness.ps1`: the real desk against a stand-in model. It covers style
  rewrites, a model that refuses or answers with nothing, and the standards editor
  dropping soft news, keeping a better rewrite, refusing a rewrite that invents a
  figure, and surviving an editor that answers with prose.
- `test-wsj-standards.ps1` and `test-news-ranking.ps1`: the WSJ bar and the crime
  filter, through an African lens.
- `test-story-contract.ps1`: the story shape.

## Cost

| Part | Model | About |
|---|---|---|
| Writer | GPT-6 Luna | $0.10 / $0.50 per million tokens |
| Style rewrites, ranking, editor | Claude Haiku 5.5 | $0.10 / $0.50 per million tokens |
| A desk run | all of the above | $0.30 to $0.60 |

Prices are from OpenRouter on 18 Nov 2026.
