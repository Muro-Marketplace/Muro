# Stock image prompts

For generating imagery for the Curated, Programmes and other thin pages. Paste one at a time into ChatGPT (or any image model).

## Two rules before you generate anything

**Never generate a fake artwork as the subject.** You are an art company. If a venue or artist spots AI-generated "art" in your marketing, it undercuts the one thing you sell: original work by real people. Every prompt below either keeps artwork out of frame, turns it away from camera, crops it, or throws it out of focus. Keep it that way.

**Generate one set, not twelve one-offs.** Add this line to the end of every prompt so the whole site looks like one photographer shot it:

> Consistent look across the set: natural daylight only, no flash, muted warm neutrals with soft greens, gentle film grain, 35mm documentary editorial style, nothing glossy or corporate-stock.

---

## Programmes page (`/programmes`)

**1. Hero, the bare wall problem**
> Wide-angle photograph of a modern independent office reception in a converted warehouse, exposed brick and pale plaster, tall industrial windows with mid-morning light, plywood reception desk, two mid-century chairs. The main wall is completely bare. Muted natural palette, soft shadows, shallow depth of field, editorial interior photography. No artwork, no posters, no people, no text. 16:9

**2. Installation in progress**
> Photograph of two people in plain workwear hanging a large framed picture on a pale office wall, one holding a spirit level, the other steadying the frame. Shot from behind and to the side so the picture face is turned away from camera. Warm afternoon light, real workplace clutter at the edges of frame, documentary style, unposed. 3:2

**3. The QR label, close**
> Close-up photograph of a small printed card mounted on a pale wall beside the corner of a picture frame. The card shows a QR code and a few lines of small text. Shot at a slight angle with shallow depth of field so the frame behind is soft and out of focus. Natural side light, visible paper texture. 1:1

**4. Hotel or restaurant context**
> Interior photograph of a quiet boutique hotel lounge in late afternoon, linen armchairs, low oak table, warm lamps, a long pale wall running the length of frame, empty. Calm and unhurried, muted greens and warm neutrals, editorial hospitality photography. No people, no artwork. 16:9

**5. Rotation, the swap**
> Photograph of two wrapped framed pictures leaning face-in against a pale office wall beside a small trolley, one gap on the wall where a picture has just come down, a faint clean rectangle on the paint. Morning light, documentary, no people. 3:2

---

## Curated page (`/curated`)

**6. The curator's desk**
> Overhead photograph of a curator's desk: an open laptop showing a grid of thumbnails too small to read, several printed photographs lying face down, a tape measure, a pencil, a mug of tea, on a scuffed wooden desk. Natural window light from the left, documentary style, no legible text anywhere. 3:2

**7. Measuring the wall**
> Photograph of a person's hands holding a tape measure against a pale painted café wall, marking a spot with a pencil. Café furniture soft in the background. Morning light, warm neutral tones, shot close and casual. 4:5

**8. The shortlist, physical**
> Photograph of five small printed photographs laid out in a row on a pale linen tablecloth, each face down or heavily cropped so no image is readable, a pencil resting across two of them. Overhead, soft daylight, quiet and considered. 16:9

---

## Venues page (`/venues`)

**9. Café before**
> Photograph of an independent café interior in the morning before opening, chairs still upturned on one table, an espresso machine, a long bare wall with visible plaster texture. Soft north light, warm wood and off-white, quiet and empty, documentary interior photography. No artwork, no people. 16:9

**10. Someone scanning**
> Photograph taken over the shoulder of a person seated at a café table, holding a phone up towards a wall. The wall is soft and out of focus behind. Natural window light, candid and unposed, muted colours. 3:2

---

## Artists page (`/artists`) and pricing

**11. Studio, nobody home**
> Photograph of a small artist's studio, canvases stacked facing the wall, brushes in jars, a paint-marked worktable, north-facing window light. Nobody in frame, lived-in and slightly untidy, documentary style. No finished artwork visible. 3:2

**12. Packing a piece**
> Photograph of a person's hands wrapping a framed picture in brown paper and bubble wrap on a studio floor, the picture face down, scissors and tape beside them. Overhead angle, natural light, documentary. 1:1

---

## Homepage and How It Works

**13. The handshake**
> Photograph of a café owner and a younger person mid-conversation beside a bare wall in a café, casual clothes, natural light, candid documentary style, warm neutral palette. 16:9

**14. Text-overlay banner**
> Abstract photograph of a large pale plaster wall with subtle texture, a soft diagonal of afternoon sunlight falling across it, a picture rail near the top of frame. Minimal and calm, generous empty space suitable for overlaid text. 21:9

---

## After generating

- Export at 2x the largest rendered size, then compress (the repo already serves images through Next's optimiser).
- Keep a short, honest alt text for each. Describe the scene, never invent a venue name or location. The Programmes page previously carried captions like "Office reception, Manchester" on stock photos that appeared elsewhere on the site as a Peckham café; that was removed for exactly this reason and should not come back.
- If you ever shoot the real thing, replace these first. One photograph of an actual Wallplace wall with a real artist's work beats all fourteen of these.
