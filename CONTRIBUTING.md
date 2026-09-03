# Adding a saint

Curation is an input, not a step. Add files in a pull request on whatever
schedule suits you; the job reads whatever exists on the day it runs. Every day
already emits a valid record pointing at a generic liturgical-colour plate, so
nothing is broken while a day waits its turn — a curated saint is a strict
improvement that goes live on the next run, with no app release.

## The quick way: `npm run curate`

```bash
npm ci
npm run curate      # http://127.0.0.1:4173
```

This walks the outstanding queue soonest first, searches Wikimedia Commons,
gives you a crop box fixed at the render's 1440:3200 with guide lines where the
clock and notifications sit, and writes both files for you. It validates with
the same schema and geometry checks CI runs, so if it saves, CI will pass.

Two things it will not do for you, by design:

- **It will not clear the licence.** It only searches Commons and only offers
  files whose licence reads as free, and it copies `credit`, `license` and
  `source` from the file's own metadata rather than letting you type them. That
  is a floor, not a guarantee — read the file page it links before you save.
- **It will not write the blurb.** Commons' description is shown for reference
  and is never copied. An empty blurb is rejected.

The rest of this document describes the files themselves, which is what you need
if you are adding one by hand or reviewing somebody else's pull request.

## Pick something from the worklist

[`WORKLIST.md`](WORKLIST.md) lists upcoming days still showing a plate, soonest
first. It is regenerated on every run, so it prioritises itself.

The `Id` column is the id to use, and the `Kind` column says what you are
looking at:

- **`saint`** — a person in the martyrology. These are the valuable ones.
- **`day`** — a Sunday, a ferial weekday or a solemnity of the Lord. There is no
  saint to find; a curated image here is optional polish. Ids are stable across
  years, so one image for `easter-sunday` serves every Easter.

## Add two files

For an id of `john-bosco-priest`:

```
saints/john-bosco-priest.yaml
originals/john-bosco-priest.jpg
```

The two names must match. The id comes from the filename, never from a field
inside the file, so the two can never disagree.

### `saints/{id}.yaml`

```yaml
name: 'St. John Bosco'
years: '1815–1888'
blurb: >-
  Turin priest who built schools and workshops for boys left destitute by the
  city's industrial boom, and founded the Salesians to carry the work on.
credit: 'Photograph, c. 1880'
license: 'Public domain'
source: 'https://commons.wikimedia.org/wiki/File:Don_Bosco.jpg'
crop:
  x: 240
  y: 100
  width: 1400
  height: 3033
```

| Field     | Required | Notes                                                                                                        |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `name`    | yes      | Display name, as the app should show it.                                                                     |
| `years`   | no       | Life span. Omit it if the dates are not reliably known; it defaults to `""`.                                 |
| `blurb`   | yes      | One or two sentences. See below.                                                                             |
| `credit`  | yes      | Attribution line for the image, as the source states it.                                                     |
| `license` | yes      | The licence the image is actually under.                                                                     |
| `source`  | yes      | `http(s)` URL of the page you took the image from — the page, not the raw file, so the licensing is visible. |
| `crop`    | yes      | Region of the original to render, in pixels from its top-left.                                               |

Unknown fields are rejected rather than ignored, so a typo (`licence`) fails the
check instead of silently dropping your text.

### `originals/{id}.jpg`

`.jpg`, `.jpeg`, `.png` and `.webp` are accepted. Commit the original once and
never modify it.

The crop box is rendered at three sizes — 1440×3200, 1260×2800 and 1080×2400,
all exactly 20:9 — and rendering never upscales, so **the crop box must be at
least 1440×3200**. The two smaller sizes are pure downscales of that crop, so
nothing is trimmed after you have framed it.

Pick the crop with the lock screen in mind: the clock sits over the top third,
and notifications over the bottom. A face somewhere in the upper-middle reads
well.

## Writing the blurb

One or two sentences, present-tense-free, concrete. Say what the person
actually did, not what they are a symbol of. Aim for the level of detail in the
example above — a place, a period, and the thing they are remembered for.

## What CI checks, and what it cannot

`npm run validate` runs on every pull request. It checks:

- the YAML parses and every required field is present and non-empty
- `source` is a well-formed `http(s)` URL
- the `crop` box lies inside the original's bounds
- the crop is large enough to render every variant without upscaling
- every `saints/*.yaml` has a matching `originals/*`, and every original has a
  matching YAML

**CI cannot verify that an image is actually in the public domain, and it does
not try.** A non-empty `license` string proves nothing whatsoever — it is a
string. Nothing in this repository checks that the image is what you say it is,
that the licence you named is the licence it carries, or that you had the right
to include it.

**Licence clearance is the curator's responsibility.** Before you open a pull
request, satisfy yourself that the image is genuinely free to publish, and link
a `source` page where a reviewer can see the same evidence you did. Wikimedia
Commons file pages are ideal for this because they state the licence next to the
file.

Blurb quality is the same kind of thing: a human judgement that stays human.

## Do not edit `docs/`

`docs/` is entirely derived, and only the publish job writes there. A pull
request that changes it fails CI, which regenerates the tree for the window it
already holds and diffs the result. To change the output, change an input.
