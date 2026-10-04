# Pip-OS Interface Kit

A CSS and JavaScript kit for building web pages that look like they run on a Pip-Boy. It has no dependencies and no build step.

Open `index.html` in a browser to see every component, plus a working Pip-Boy you can click through.

## Quick start

```html
<link rel="stylesheet" href="css/pipboy.css">
<script src="js/pipboy.js" defer></script>

<body class="pip pip-page">
  ...
</body>
```

`pip` sets the fonts, colors and glow. `pip-page` adds scanlines and a vignette over the whole page. The stylesheet loads its fonts (Roboto Condensed and VT323) from Google Fonts.

## Files

| Path | What it is |
| --- | --- |
| `css/pipboy.css` | Tokens, screen effects and all components |
| `js/pipboy.js` | Behaviors, wired up automatically from HTML attributes; exposes `window.Pip` |
| `index.html` | Docs: a live demo of each component with copyable markup |
| `examples/vault-59.html` | Landing page with a S.P.E.C.I.A.L. point budget and an application form |
| `examples/trading-post.html` | Barter shop with a cart, carry weight and hold-to-trade checkout |
| `examples/settlement.html` | Settlement dashboard with a chart, job assignments, map and radio log |

## Changing the tube color

Every color is mixed from two tokens: `--phos` (the lit phosphor) and `--tube` (the unlit glass). Pick a tube with `data-phosphor`:

| Value | Color |
| --- | --- |
| `p1` | Green (default) |
| `p3` | Amber |
| `p4` | White |
| `p7` | Blue |

```html
<html data-phosphor="p3">              <!-- whole page -->
<div data-phosphor="p7">...</div>      <!-- just this part -->
```

You can also switch from script with `Pip.setPhosphor("p3")`. The viewer's choice is saved in `localStorage`.

## Screen effects

- `.pip-crt` turns any box into a CRT screen: curved-glass shading, scanlines and a slow refresh band.
- `.pip-scanlines`, `.pip-flicker`, `.pip-blink` and `.pip-cursor` can be added to any element.
- `Pip.setFx(name, on)` turns `scan`, `roll`, `glow` or `flicker` on or off for the whole page.

All animation stops when the viewer has reduced motion turned on.

## Components

Every component is a class starting with `pip-`. The docs page shows the markup for each one.

- **Controls:** `pip-btn` (with `--primary`, `--danger`, `--hold`), `pip-input`, `pip-select`, `pip-check`, `pip-radio`, `pip-toggle`, `pip-segmented`, `pip-stepper`, `pip-range`
- **Navigation:** `pip-tabs`, `pip-subtabs`, `pip-pager`
- **Data:** `pip-list`, `pip-readout`, `pip-meter`, `pip-bar`, `pip-table`, `pip-tag`, `pip-panel`, `pip-disclosure`
- **Feedback:** `pip-alert`, `pip-toast`, `pip-dialog`, `pip-loader`
- **HUD:** `pip-compass`, `pip-map`, `pip-scope`, `pip-condition`
- **Terminal:** `pip-terminal`, `pip-hack` (the password-hacking minigame)

## JavaScript

`pipboy.js` sets up components automatically when the page loads. If you add markup later, call `Pip.init(element)`.

| Call | What it does |
| --- | --- |
| `Pip.toast({ title, body, icon })` | Shows a notification that leaves after about 4 seconds |
| `await Pip.confirm({ title, body, confirmLabel, cancelLabel, danger })` | Opens a dialog; resolves to `true` or `false` |
| `Pip.type(element)` | Types out the element's terminal lines |
| `Pip.power(element, "on" \| "off" \| "cycle")` | Plays the CRT power animation |
| `Pip.setMeter(element, value, rads)` | Updates a meter |
| `Pip.compass(element).set(degrees)` | Turns a compass |
| `Pip.scope(element).set({ freq, amp })` | Changes the oscilloscope wave |

Components report changes through events that bubble up from them: `pip:tab`, `pip:select`, `pip:change`, `pip:page`, `pip:confirm`, `pip:marker`, `pip:unlocked`, `pip:locked` and `pip:phosphor`.

## To do

`barterPrice()` in `examples/trading-post.html` still returns the listed price unchanged. Write the rule for how Charisma (1 to 10) changes what the trader charges. Every price on the page uses it.

## Credits

The scanline mask and alarm techniques come from Codemotion's article [Creating a Fallout-style UI using modern CSS](https://www.codemotion.com/magazine/frontend/creating-a-fallout-style-ui-using-modern-css/).

This is a fan-made design kit. Fallout and Pip-Boy belong to their owners.
