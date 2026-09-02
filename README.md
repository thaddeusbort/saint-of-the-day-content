# saint-of-the-day-content

The content pipeline behind the **Saint of the Day** Android app
([`thaddeusbort/saint-of-the-day`](https://github.com/thaddeusbort/saint-of-the-day)).

The app is shipped and frozen. It fetches pre-rendered JSON and images over
HTTPS and applies them to the lock screen; it computes nothing. This repository
produces everything it reads.

There is no server, no API and no database. A scheduled job writes a tree of
static files, commits them, and GitHub Pages serves them.

```
https://thaddeusbort.github.io/saint-of-the-day-content
```

The app appends `/v1` itself, and is pointed here by its `saintoftheday.baseUrl`
Gradle property.

## Running it locally

Requires Node 22 or newer.

```bash
npm ci
npm run generate     # writes docs/ and WORKLIST.md
npm test
npm run lint
```

`npm run generate` takes two optional flags, both only for reproducing a
particular run:

```bash
node dist/cli/generate.js --today=2026-09-01   # pin the window
node dist/cli/generate.js --root=/tmp/scratch  # write somewhere else
```

Other commands:

| Command                 | What it does                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `npm run validate`      | The curation checks CI runs on pull requests.                                           |
| `npm run check:derived` | Regenerates `docs/` for the window it already holds, so a hand edit shows up as a diff. |
| `npm run plates`        | Redraws the fallback plates in `fallbacks/`. Rarely needed — see below.                 |

## What a run does

1. Compute the liturgical calendar for `[today - 7, today + 400]`.
2. Resolve a subject for each day.
3. Emit the day JSON — a curated record where `saints/{id}.yaml` exists, a
   placeholder record otherwise.
4. Render any variant JPEG that does not already exist, and skip every one that
   does.
5. Delete published days that have fallen outside the window.
6. Rewrite `WORKLIST.md`.
7. Commit.

It runs nightly and on every push to `main`, so merged curation goes live in
minutes rather than waiting for midnight.

## Layout

```
saints/         hand-curated, one YAML per subject
originals/      source images, committed once, never modified
fallbacks/      generic plates, one per liturgical colour
src/            the generator, including the romcal adapter
tests/
docs/           <- GitHub Pages publishes this directory
  .nojekyll
  v1/{yyyy}/{MM-dd}.json
  v1/img/{id}-{w}x{h}.jpg
WORKLIST.md     generated curation queue
```

Pages is configured to publish from the **`main` branch, `/docs` folder** — not
the `actions/deploy-pages` artifact flow. GitHub disables scheduled workflows
after 60 days of repository inactivity, and committing the output is what keeps
the repository active, as well as giving a diffable record of what was
published.

**Only the job writes under `docs/`.** It is entirely derived. To change the
output, change an input.

## The data contract

One file per day at `v1/{yyyy}/{MM-dd}.json`:

```json
{
  "schema": 1,
  "date": "2026-01-31",
  "season": "ordinary",
  "color": "white",
  "rank": "memorial",
  "celebration": "Saint John Bosco, Priest",
  "all_celebrations": ["Saint John Bosco, Priest"],
  "saint": {
    "id": "john-bosco-priest",
    "name": "St. John Bosco",
    "years": "1815–1888",
    "blurb": "Turin priest who built schools and workshops for boys …",
    "is_fallback": false
  },
  "image": {
    "credit": "Photograph, c. 1880",
    "license": "Public domain",
    "source": "https://commons.wikimedia.org/wiki/File:Don_Bosco.jpg",
    "is_placeholder": false,
    "variants": [
      { "w": 1290, "h": 2796, "url": "img/john-bosco-priest-1290x2796.jpg" },
      { "w": 1179, "h": 2556, "url": "img/john-bosco-priest-1179x2556.jpg" },
      { "w": 1080, "h": 2400, "url": "img/john-bosco-priest-1080x2400.jpg" }
    ]
  }
}
```

These are facts about shipped code, not preferences:

| Rule                                                          | Why                                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Coverage must be contiguous, and reach well past 7 days ahead | The app's prefetch catches `IOException` and abandons the rest of the window. A single 404 mid-window silently truncates it. |
| `saint` and `image` must always be present                    | They are the only fields with no default in the app's model. A day missing either fails to parse.                            |
| Variant `url`s are relative to `v1/`                          | The app joins them onto `{BASE_URL}/v1/`.                                                                                    |
| Adding fields is safe; renaming or removing is not            | The app ignores unknown keys. Removal breaks installed versions — that is what `schema` and the `v1/` path exist for.        |
| Everything else may be empty                                  | `celebration`, `color`, `rank`, `blurb` and `years` all default to `""` in the app.                                          |
| Serve a trailing margin, not just today forward               | The app reads the _device's_ local date. UTC+14 asks for tomorrow by the job's clock; UTC-12 asks for yesterday.             |

`is_fallback: true` means one thing and nothing else: **the liturgical day has
no proper celebration of a saint, so the pipeline chose the subject.**

`is_placeholder: true` on the image means the day is showing a generic
liturgical-colour plate rather than a curated picture. The app ignores it; the
worklist generator reads it.

## How the subject is chosen

Only about a fifth of days in the General Roman Calendar carry a proper
celebration of a saint. The pipeline takes, in order:

1. The day's own celebration, if it commemorates someone in the martyrology —
   `is_fallback: false`.
2. Otherwise a coinciding optional memorial, if the day carries one —
   `is_fallback: true`.
3. Otherwise the liturgical day itself: a Sunday, a ferial weekday, or a
   solemnity of the Lord — `is_fallback: true`.

Subject ids are romcal identifiers with underscores replaced by hyphens
(`john_bosco_priest` → `john-bosco-priest`), so they are stable from year to
year. That holds for temporal days too: a curated image for
`easter-sunday` serves every Easter.

## The liturgical calendar

[romcal](https://github.com/romcal/romcal) (MIT) computes the calendar. It is
pinned to the exact build `3.0.0-dev.140` rather than a range.

That version deserves a word, because the `latest` dist-tag points at 1.3.0,
published in January 2020. The 3.x line is where the work actually happens —
it was publishing within days of this repository being written — and 1.3.0
depends on `moment` and `moment-recur`, ships no TypeScript types, and returns
exactly one celebration per day, which would make `all_celebrations` a
single-element array. Before taking the dependency the 3.x build was checked
for the things that matter here:

- MIT licensed and actively published.
- Exposes per date: celebration name, rank, liturgical colour, season, and the
  full list of coinciding celebrations.
- Transfers impeded solemnities correctly — St Joseph in 2023 to 20 March, the
  Annunciation in 2024 to 8 April. This is the hardest part of the domain and
  the main reason to take the dependency at all.
- Byte-stable output across runs and across instances.

Because it is a prerelease, the version is pinned exactly and never floated. An
upgrade is a deliberate change: run the suite, and read the `docs/` diff.

romcal's vocabulary is confined to `src/calendar/adapter.ts`, which maps it onto
the types in `src/calendar/types.ts`. Nothing else imports romcal. The adapter
throws on an unmapped season, colour or rank, so a romcal upgrade that
introduces one fails the build rather than publishing blank fields.

## Determinism

Same inputs, byte-identical outputs. No timestamps, no `generated_at`, no
uuids, fixed key order, fixed JSON formatting, fixed JPEG encoder settings.

This is load-bearing rather than hygiene. Git history never shrinks. A run that
rewrote all 408 day files nightly would cost roughly 150MB a year of
unreclaimable history; a deterministic one changes two files on a typical night
— the day arriving at one edge and the day pruned at the other — and costs
under a megabyte a year.

A test generates twice and asserts the tree is identical.

## Never re-render an existing image

The three variant sizes and the JPEG encoder settings in `src/config.ts` are
**frozen**. Filenames are content-shaped (`{id}-{w}x{h}.jpg`), so a blob is
written once and never rewritten; every run checks for the file first and skips
it.

A global re-render would write ~650MB of fresh blobs that stay in history
forever, against a ~1GB GitHub Pages site limit. Doing it twice is
unrecoverable without a history rewrite. If the sizes genuinely must change,
that is a new repository and a bump to `v2/`, which the app's path-versioned
contract already supports.

The same applies to `npm run plates`: redrawing a plate in `fallbacks/` has no
effect on anything already rendered into `docs/v1/img/`, by design.

## Adding a saint

See [CONTRIBUTING.md](CONTRIBUTING.md). `WORKLIST.md` is the queue: upcoming
days still on a placeholder, soonest first.
