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

| Command                 | What it does                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run validate`      | The curation checks CI runs on pull requests.                                                        |
| `npm run check:derived` | Regenerates `docs/` for the window it already holds, so a hand edit shows up as a diff.              |
| `npm run curate`        | Opens the curation tool on `127.0.0.1:4173` — see [Curating with the tool](#curating-with-the-tool). |
| `npm run plates`        | Redraws the fallback plates in `fallbacks/`. Rarely needed — see below.                              |

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
  "subject": {
    "id": "john-bosco-priest",
    "kind": "saint",
    "name": "St. John Bosco",
    "subtitle": "1815–1888",
    "blurb": "Turin priest who built schools and workshops for boys …",
    "notification": "St. John Bosco, pray for us!",
    "is_fallback": false,
    "source": "proper"
  },
  "image": {
    "credit": "Photograph, c. 1880",
    "license": "Public domain",
    "source": "https://commons.wikimedia.org/wiki/File:Don_Bosco.jpg",
    "is_placeholder": false,
    "variants": [
      { "w": 1440, "h": 3200, "url": "img/john-bosco-priest-1440x3200.jpg" },
      { "w": 1260, "h": 2800, "url": "img/john-bosco-priest-1260x2800.jpg" },
      { "w": 1080, "h": 2400, "url": "img/john-bosco-priest-1080x2400.jpg" }
    ]
  }
}
```

These are facts about shipped code, not preferences:

| Rule                                                          | Why                                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Coverage must be contiguous, and reach well past 7 days ahead | The app's prefetch catches `IOException` and abandons the rest of the window. A single 404 mid-window silently truncates it. |
| `subject` and `image` must always be present                  | They are the only fields with no default in the app's model. A day missing either fails to parse.                            |
| Variant `url`s are relative to `v1/`                          | The app joins them onto `{BASE_URL}/v1/`.                                                                                    |
| Adding fields is safe; renaming or removing is not            | The app ignores unknown keys. Removal breaks installed versions — that is what `schema` and the `v1/` path exist for.        |
| Everything else may be empty                                  | `celebration`, `color`, `rank`, `blurb` and `subtitle` all default to `""` in the app.                                       |
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

`subject.kind` says what the day is about, which is not always a saint:

| `kind`  | Meaning                              | Examples                                                                                   |
| ------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `saint` | a person, or people                  | John Bosco; Peter and Paul                                                                 |
| `feast` | in the martyrology, but not a person | the Nativity of the BVM, the Exaltation of the Holy Cross, All Saints, Our Lady of Sorrows |
| `day`   | the liturgical day itself            | Christmas, Easter, a Sunday, a feria                                                       |

It comes from romcal's canonization level, which is set for people and unset
for events and titles — structural rather than read off the name.

`subject.notification` is a short line to address the subject with. It is
derived for a `saint`, and for Our Lady under a title, and left empty
otherwise: "The Baptism of the Lord, pray for us!" is wrong, and no line beats
a wrong one. `notification:` in the subject's YAML overrides it, and is how a
`day` gets one at all.

`subject.subtitle` is the line under the name — a saint's dates, or whatever
suits a subject that has none. It is not always a year range, which is why it
is not called `years`.

`subject.source` says which of the three it was — `proper`, `optional`, or
`temporal` — so a reader can tell a memorial the day requires from one the
pipeline reached for. `is_fallback` stays exactly `source !== "proper"`.

### Days that take no saint but their own

The Triduum, the solemnities, the privileged Sundays of Advent, Lent and
Easter, Ash Wednesday, Holy Week, the Easter octave and the feasts of the Lord
admit no other celebration (UNLY nn. 59-61). Christmas Day is the Nativity, not
an obscure martyr who happens to share the date.

That set is not hand-listed. romcal names each precedence after its place in
the Table of Liturgical Days — `TRIDUUM_1`, `GENERAL_SOLEMNITY_3`,
`WEEKDAY_13` — and the adapter reads that rank back out. Ranks 1 to 5 are
privileged; `LOWEST_PRIVILEGED_TABLE_RANK` in `src/config.ts` is the whole
policy. In a typical year it closes 37 days, and it stays correct for years
nobody has computed yet.

Everything from rank 6 down — Sundays in Ordinary Time, feasts, ferial
weekdays — does admit a saint. Roughly 170 days a year currently fall through
to `temporal` there: they have no saint in the General Roman Calendar and are
waiting on a martyrology, which this repository does not yet have. The curation
tool keeps them in their own queue for that reason.

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

The three variant sizes — 1440×3200, 1260×2800 and 1080×2400, all exactly 20:9
— and the JPEG encoder settings in `src/config.ts` are **frozen**.

They are chosen for the app's selection rule, which takes the variant _nearest_
the screen by `|dw| + |dh|` rather than the smallest that covers it. Sharing one
aspect ratio means the crop box matches every variant, so the smaller two are
pure downscales and the preview is exactly what a device gets; 1260×2800 sits
where it minimises the worst-case upscale across the plausible width range
(~1.08×, against ~1.17× with only 1080 and 1440). Filenames are content-shaped (`{id}-{w}x{h}.jpg`), so a blob is
written once and never rewritten; every run checks for the file first and skips
it.

A global re-render would write ~650MB of fresh blobs that stay in history
forever, against a ~1GB GitHub Pages site limit. Doing it twice is
unrecoverable without a history rewrite. If the sizes genuinely must change,
that is a new repository and a bump to `v2/`, which the app's path-versioned
contract already supports.

Enlargement is the one exception, and it is per entry: `allow_upscale: true`
in a saint's YAML permits a crop below the render size, capped at
`MAX_UPSCALE` (3×). It is off unless the file says otherwise, so every enlarged
image is a recorded decision rather than a drift.

The same applies to `npm run plates`: redrawing a plate in `fallbacks/` has no
effect on anything already rendered into `docs/v1/img/`, by design.

## Curating with the tool

`npm run curate` serves a local page that walks the outstanding queue soonest
first, searches Wikimedia Commons, and writes `saints/{id}.yaml` and
`originals/{id}.*`. It binds to loopback, holds no state, and never writes under
`docs/`.

It lives in this repository rather than beside the app for one reason: the files
it produces are only correct if they satisfy rules that already exist here as
code — the curation schema, the "at least 1440×3200, never upscale" geometry,
and the id derivation. The tool imports those directly and validates before it
writes, so it cannot produce a pull request that CI will reject. Keeping it
anywhere else would mean a second copy of those rules, and a second copy drifts.

It adds **no dependency**: `node:http`, `fetch`, `sharp` and `yaml` were already
here.

It searches **Wikimedia Commons** by default and the **Met Museum's Open
Access collection** as a second source, chosen from a picker. The Met usually
holds a much larger scan of a painting than Commons does, which is what makes
it worth the extra adapter. Sources live behind one interface in
`src/curate/sources/`, so adding another is a file rather than a refactor.

Three deliberate constraints:

- **Only sources that publish a licence.** CI cannot verify that an image is
  free to publish, so the tool must not make it easy to save one that is not.
  Commons returns machine-readable licence and attribution per file, and the Met
  an explicit `isPublicDomain` flag, so `credit`, `license` and `source` are
  derived from the API rather than typed from memory. Files whose licence is not
  demonstrably free are dropped, and the count of what was dropped is shown. A
  generic image search would do the opposite, which is why there isn't one.
- **Attribution is re-read on save.** The client cannot assert a licence — the
  server fetches the file's metadata again and writes what Commons actually
  says.
- **The blurb is yours.** The tool will not write one, and the schema rejects an
  empty one. Commons' own description is shown for reference and never copied.
  Licence clearance stays a human judgement, as
  [CONTRIBUTING.md](CONTRIBUTING.md) says.

The queue separates **saints** from **days**. In a typical year roughly 167 days
have a saint available and about 198 are ferial days and Sundays where the
subject is the liturgical day itself, so the tool defaults to the saints —
walking strictly by date would spend most of its time on days with no saint to
find.

Flags: `--port=`, `--today=`, `--horizon=`, `--root=`.

## Adding a saint

See [CONTRIBUTING.md](CONTRIBUTING.md). `WORKLIST.md` is the same queue in file
form: upcoming days still on a placeholder, soonest first.
