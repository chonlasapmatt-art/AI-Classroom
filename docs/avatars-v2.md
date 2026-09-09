# Avatars, version 2

How the pixel avatars are drawn, stored and extended. Read this before adding a hat.

The short version: an avatar is a stack of small drawings on a 24-unit grid, coloured by six CSS
custom properties, and stored either as a catalogue id or as a flat JSON object of trait ids. Nothing
is an image file. Nothing reads a clock or a random seed.

---

## 1. The layer contract

`EnhancedPixelAvatar` draws nine layers, back to front, and nothing may pass its own:

| # | Layer | What lives there |
|---|-------|------------------|
| 1 | `back_aura` | magic aura, dark mist, digital grid, elemental motes |
| 2 | `back_accessory` | wings, tails, capes, a floating tome |
| 3 | `body_base` | one per race: human, dragonkin, demon, beastfolk, spirit, robot |
| 4 | `bottom_clothing` | trousers, skirt, robe hem, greaves |
| 5 | `top_clothing` | uniform, hoodie, mage robe, chestplate, lab coat… |
| 6 | `face_features` | eyes and mouth, plus anything worn over them |
| 7 | `hair_headpiece` | hair, and horns, ears or a hat worn on it |
| 8 | `front_accessory` | held items, pets, a lantern |
| 9 | `front_fx` | sparkles, flame orbs, arcs, falling leaves |

The order is not stylistic. Wings go behind a body, a hat goes in front of hair, a held staff in
front of both. A trait that must cover another says so with `hides`, which suppresses that layer
entirely rather than drawing over it — an occluded drawing still costs a paint, and a leaderboard of
forty avatars is where the frames go.

Every body keeps the same boxes so clothes never have to know what they are covering:

* head `x 7–17, y 6–16`
* torso `x 6–18, y 17–23`

Bands, so anything that keeps to them composes with anything else: hair `y 2–9`, eyes `9.5–12`,
mouth `12.5–14`, tops `17–20`, bottoms `20–23`.

---

## 2. Adding a trait

One table row and one draw function, both in the same file, and nothing to register anywhere else.

1. Add a `Sprite` to the right table in `apps/web/src/features/avatars/avatarSprites.tsx`:

```tsx
{
  id: 'crown', name: 'มงกุฎ', tags: ['crown', 'มงกุฎ'], price: 120,
  draw: () => (<g>
    {px(8, 2, 8, 2, ACCENT)}
    {px(8, 1, 1.5, 1.5, ACCENT)}
    {px(14.5, 1, 1.5, 1.5, ACCENT)}
  </g>)
}
```

2. That is usually all. The tables in `avatarTraits.tsx` compose the combining layers automatically:
   a hair *shape* × a *headpiece* is a hairstyle, an *eye shape* × *eyewear* is a face. Adding one
   headpiece adds twelve hairstyles, one per shape.

3. If the new thing costs points, add it to the SQL in
   `supabase/migrations/202609090011_a_student_assembles_their_own_avatar.sql` as well — see §5.
   `avatarTraitPrices.test.ts` fails until the two agree.

### The 8-bit rules

* **Half a unit is the finest position allowed.** Anything else is drawn between two pixels.
  `avatarSchema.test.tsx` measures every rectangle of every trait.
* **No sprite names a colour.** Every fill is `var(--av-…)`; white and the shared outline `#1a1030`
  are the only literals, for teeth and lines. A hard-coded hex is a colour the customiser's picker
  cannot reach, and it is invisible until somebody picks the one shirt that will not change. There
  is a test for this too.
* **At most six shades per material** — base, shadow, highlight, outline and two accents. The first
  four are derived; a fifth invented shade is what makes a set look like several people drew it.
* **Name it in Thai.** Ids and tags may be English; the name is read by the person choosing it.

---

## 3. Tinting

Six colours, set once on the `<svg>` and read by every rectangle:

```
--av-skin  --av-hair  --av-primary  --av-secondary  --av-accent  --av-magic
```

Each also publishes `-shadow`, `-highlight` and `-outline`, derived by moving lightness in fixed
steps (`shadeOf` in `avatarSchema.ts`) with a small saturation correction so a darkened colour does
not read as grey. Recolouring an avatar is six string assignments and no redraw at all.

A trait declares which of the six it actually uses in `tintable`, so the colour drawer only offers
swatches that will do something.

---

## 4. What is stored

`students.avatar_config` is JSONB and holds one of two shapes.

**Version 1** — the original, still the majority, and never migrated in place:

```json
{ "archetype": 3, "palette": 1, "skinTone": 2, "hair": 4, "accessory": 0, "badge": 1, "outfit": "hoodie" }
```

Indexes address arrays in `avatarThemes.ts` **by position**. Those arrays may be appended to and must
never be reordered: inserting a hair style at the front would restyle every child in the school.

**Version 2** — anything built in the customiser:

```json
{
  "v": 2, "race": "dragonkin", "element": "ice",
  "layers": { "hair_headpiece": "hair_mohawk__hornsdragon", "top_clothing": "top_chestplate" },
  "tints": { "primary": "#7c3aed", "skin": "#f2d0b3" }
}
```

`ThemedAvatar` switches on one field: a config with `layers` goes to the compositor, everything else
to the legacy renderer, unchanged. `migrateConfig` *describes* a v1 config as v2 — which race it was
already drawing, which six colours it was already made of — and deliberately adds no layers, so a
migrated config nobody has edited still renders down the old path.

`avatarLegacyRender.test.tsx` pins all 160 original catalogue ids by checksum, with full markup for
one per theme. Regenerating that fixture is a decision to change what existing avatars look like.

### Ids are a promise

A record stores an id and nothing else, so `avatar_042` and `hair_bob__wizardhat` must mean the same
drawing next term and on every device. Append; never rename.

---

## 5. The economy

Roughly half the fantasy traits cost points (20–150); the rest are free, so a child who joined this
morning never opens the customiser to a wall of padlocks. A test walks every layer and insists on a
free option in each.

Prices exist in two places on purpose, and are checked against each other:

* `avatarSprites.tsx` — what the app charges.
* `avatar_trait_price(text)` in the migration — what the server charges, computed from the id
  (`hair_bob__wizardhat` = a free shape plus an eighty-point hat) rather than listed, because listing
  all 181 priced combinations would be 181 chances to disagree.

`set_own_avatar_config` is the only way a student writes a build of their own. It validates the shape,
refuses any priced trait not already in `unlockedOutfits`, and **rebuilds** the stored object rather
than merging what arrived — `unlockedOutfits` and `spentPoints` are the purse, written by
`redeem_outfit` alone.

Catalogue avatars are free, including ones that wear priced traits. They are the curated set — the
thing a child picks when they do not want to assemble anything — and the prices are what assembling
your own costs.

---

## 6. Animation

Poses live in `ThemedAvatar.module.css` and every one of them steps:

```css
.walk .figure { animation: stepWalk 0.64s steps(4) infinite; }
```

`steps(n)` is not a stylistic choice on a sprite. A figure that eases between frames renders at
fractional positions and stops reading as pixels; `avatarAnimation.test.tsx` reads the stylesheet and
refuses any action pose whose timing function eases.

Blinking is **one shared schedule for the whole page** (`avatarBlink.ts`). Forty avatars each wanting
an irregular three-to-five-second rhythm is forty timer chains firing forty renders at forty
different moments — the exact shape that makes a mid-range tablet stutter — and nobody can tell
whether two avatars blinked a hundred milliseconds apart. The timer stops when the last avatar
unmounts.

`prefers-reduced-motion` holds every pose still. A held frame is information; a loop is decoration.

---

## 7. The catalogue

1000 entries, in two halves:

* `avatar_001…160` — the originals, flat configs, untouched.
* `avatar_161…1000` — generated in `avatarGenerated.ts` from the trait tables.

Generated, not written: eight hundred hand-written entries would be eight hundred chances to pair a
wizard hat with a spacesuit. Each race draws from a pool that keeps it recognisable (a dragon gets
horns and wings; a ghost gets no cape, having no legs to hang one from), and entry *n* is a pure
function of *n*.

Two things the generator learnt the hard way:

* **A stride is not a spread.** Picking with `index * 5` against a table of twenty-five reaches five
  of them and no more, which left the "นักเวทย์" chip empty. Picks go through a bit-mixing hash.
* **The chip and the label must agree.** A character named จอมเวทย์ for the staff it carries was
  filed under คลาสสิก because the name read the held item and the category did not.

Duplicates are refused by `lookSignature`, shared by the generator and the test that proves there
are none.

---

## 8. The screen

`AvatarDesigner.tsx` — "เลือก Avatar ขั้นสูง" — replaced both the old picker and the old studio. The
catalogue is the front door because most people want a character rather than a construction kit;
the drawers are one press away and start from whatever is on screen.

Saving means one of two things, and the difference is what a record can hold:

* a catalogue pick stores an **id** (`onSave`), the way it always has;
* a drawer edit produces a combination no id names, so it stores a **config** (`onSaveConfig`) — and
  only where something can save one. A teacher dressing a pupil writes through the roster; a student
  writes their own record through `set_own_avatar_config`. Without either the drawers say so rather
  than accepting edits and losing them.

A page of tiles is mounted at a time. Every tile is a live figure with an idle animation, and a
thousand at once is a phone that stops responding while it lays out avatars nobody has scrolled to.
