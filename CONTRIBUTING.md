# Adding a saint

Curation is an input, not a step. Every day already emits a valid record
pointing at a generic liturgical-colour plate, so nothing is broken while a day
waits its turn — a curated saint is a strict improvement that goes live on the
next publish, with no app release.

## Where to work

**Curate on `main`.** The publish job runs on every push to `main` that touches
`saints/` or `originals/`: it regenerates `docs/` and commits it for you, live
in a couple of minutes.

Use `dev` and a pull request for changes to the pipeline itself — `src/`,
workflows, dependencies. That is where review earns its keep.

```bash
git pull                     # the publish bot commits to main; start current
npm run curate               # http://127.0.0.1:4173 — search, crop, save
npm run validate             # schema + crop geometry, ~5s
git add saints originals
git commit -m "Add St. N"
git push
```

`git pull` first is the one that bites: the bot has almost certainly pushed
since your last session.

You do not need `npm run generate` — that is the publish job's business. Run it
if you want to see the output locally, but then commit `docs/` too, or the job
will simply redo it.

## `npm run curate`

Walks the outstanding queue soonest first, searches for images, gives you a crop
box fixed at the render's 1440:3200, and writes both files. It validates with
the same schema and geometry checks CI runs, so if it saves, CI will pass.

Two things it will not do, by design:

- **It will not clear the licence.** It offers only files whose licence reads as
  free, and copies `credit`, `license` and `source` from the file's own metadata
  rather than letting you type them. That is a floor, not a guarantee — read the
  file page it links before you save.
- **It will not write the blurb.** The source's description is shown for
  reference and never copied. An empty blurb is rejected.

**Queue views.** _Saints_ is the work that matters. _Major_ is the privileged
days — Christmas, Easter, the Sundays of Advent and Lent — which take no saint
but their own, so the subject is final and worth an image. _Awaiting_ is
ordinary days with no saint in the calendar, waiting on a martyrology rather
than on you. _Curated_ and _All_ are what they sound like.

**Filters.** _Filter out small images_ (on) asks for files at least as large as
the largest variant. _Exclude buildings_ (off) negates _church_, _chapel_,
_street_ and similar — photographs of things named after a saint rather than
images of the saint. It is blunt, and will also drop a painting whose
description names the church holding it.

The search box reaches Commons untouched, so you can add your own terms:
`-window`, `incategory:Paintings`, `insource:Goya`. See
[Help:CirrusSearch](https://www.mediawiki.org/wiki/Help:CirrusSearch).

**Sources.** _Wikimedia Commons_ is the default. _Met Museum_ often holds a far
larger scan of the same painting — worth trying whenever the Commons copy is too
small. The Met publishes no dimensions, so its results say _"size checked when
you pick it"_; the crop is checked against the downloaded bytes before anything
is written either way.

Re-saving an existing saint overwrites the entry **and deletes its rendered
images**, because renders are keyed by id and size and are otherwise never
rewritten. The next publish redraws them from the new crop.

## The files

For an id of `john-bosco-priest`, taken from
[`WORKLIST.md`](WORKLIST.md)'s `Id` column:

```
saints/john-bosco-priest.yaml
originals/john-bosco-priest.jpg
```

The names must match. The id comes from the filename, never a field inside the
file, so the two can never disagree.

```yaml
name: 'St. John Bosco'
subtitle: '1815–1888'
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

| Field           | Required | Notes                                                                                                    |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `name`          | yes      | Display name, as the app should show it.                                                                 |
| `subtitle`      | no       | The line under the name — a saint's dates, or whatever suits a subject with none.                        |
| `blurb`         | yes      | One or two sentences. See below.                                                                         |
| `credit`        | yes      | Attribution line, as the source states it.                                                               |
| `license`       | yes      | The licence the image is actually under.                                                                 |
| `source`        | yes      | `http(s)` URL of the page you took the image from — the page, not the raw file, so licensing is visible. |
| `crop`          | yes      | Region of the original to render, in pixels from its top-left.                                           |
| `notification`  | no       | Overrides the derived line. See below.                                                                   |
| `allow_upscale` | no       | `true` to permit a crop smaller than 1440×3200, enlarged to reach it.                                    |

Unknown fields are rejected rather than ignored, so a typo (`licence`) fails the
check instead of silently dropping your text.

`.jpg`, `.jpeg`, `.png` and `.webp` are accepted for the original. Commit it
once and never modify it.

## Crop

The crop is rendered at 1440×3200, 1260×2800 and 1080×2400, all exactly 20:9.
The two smaller sizes are pure downscales, so nothing is trimmed after you have
framed it.

Two dashed guides cross the crop box at 33% and 72%, marking roughly where the
lock screen's clock and notification shade sit. **Aim to keep the face in the
band between them.** The positions are estimates rather than measurements from a
device, so treat them as a hint, not a boundary.

By default **the crop must be at least 1440×3200**, because enlarging makes an
image soft. `allow_upscale: true` permits a smaller crop enlarged up to **3×**
and no further. The escape hatch exists for a real reason: large files on
Commons are overwhelmingly modern photographs, while scans of paintings are old
uploads and small — so the rule quietly selects against exactly the artwork this
project wants. The tool shows the factor before you commit, and **Preview at
full size** renders exactly what will ship. Look at it: at 2.8× an image keeps
its composition and loses its brushwork.

## The notification line

A short address shown with the image. It is derived from what the subject is,
not from how its name is spelled: a person in the martyrology gets
`{name}, pray for us!`, and everything else gets nothing, because a wrong line
is worse than none — "The Baptism of the Lord, pray for us!" addresses an event.
Titles of Our Lady are the one exception, being addressed like a person.

The tool shows the derived line as **greyed placeholder text**, not as a value.
Leave the field blank to accept it and nothing is written to the file, so
improving the wording later still reaches every entry that accepted it. Type
something to override — compound saints are the usual case: _"Saints Cornelius,
Pope, and Cyprian, Bishop, Martyrs, pray for us!"_ wants shortening by hand.

## The blurb

One or two sentences, concrete. Say what the person actually did, not what they
are a symbol of. Aim for the level of detail in the example above — a place, a
period, and the thing they are remembered for.

## What CI checks, and what it cannot

`npm run validate` runs on every push to `main` and every pull request. It
checks that the YAML parses with every required field non-empty, that `source`
is a well-formed `http(s)` URL, that the crop lies inside the original and is
large enough for every variant, and that each `saints/*.yaml` has a matching
original and vice versa.

**CI cannot verify that an image is free to publish, and does not try.** A
non-empty `license` string proves nothing — it is a string. Nothing here checks
that the image is what you say it is, that the licence you named is the one it
carries, or that you had the right to include it.

**Licence clearance is yours.** Satisfy yourself the image is genuinely free,
and link a `source` page where a reviewer can see the same evidence you did.
Commons file pages are ideal because they state the licence beside the file.

Blurb quality is the same kind of thing: a human judgement that stays human.

## Do not edit `docs/`

`docs/` is entirely derived, and only the publish job writes there. A push or
pull request that changes it fails CI, which regenerates the tree and compares.
To change the output, change an input.
