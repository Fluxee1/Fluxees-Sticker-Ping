# Fluxee's Sticker Ping

This Foundry VTT module adds a custom sticker ping radial for Foundry VTT.

## How to use it

- Make sure **Token Controls** is active.
- Move your mouse over the canvas.
- Press **Ctrl + E** to open the sticker radial at your current mouse position.
- If **Enable Right-Click Hold** is turned on in settings, you can also hold right click on the canvas.
- Click a sticker to show it to everyone on the same scene.

Each sticker can have its own:

- animation style
- sound effect
- sound volume
- duration
- repeat-audio toggle
- GM-only toggle
- enabled/disabled state

## Included setup

The bundled sticker set currently includes:

- `modules/fluxees-ping/assets/ayoo.webp`
- `modules/fluxees-ping/assets/boohoo.webp`
- `modules/fluxees-ping/assets/d20.webp`
- `modules/fluxees-ping/assets/devious.webp`
- `modules/fluxees-ping/assets/durst.webp`
- `modules/fluxees-ping/assets/hello.webm`
- `modules/fluxees-ping/assets/holyskull.webp`
- `modules/fluxees-ping/assets/ikillu.webp`
- `modules/fluxees-ping/assets/pepe-business.webp`
- `modules/fluxees-ping/assets/redcircle.webp`
- `modules/fluxees-ping/assets/reverse.webp`
- `modules/fluxees-ping/assets/sadnana.webm`
- `modules/fluxees-ping/assets/woah.webp`
- `modules/fluxees-ping/assets/yellowguy.webp`

## Changing the stickers

Open **Game Settings -> Configure Settings -> Module Settings -> Fluxee's Sticker Ping**.

Open **Sticker Manager**.

Inside that pop-out window you can:

- add stickers
- drag stickers into order
- change the sticker name
- choose animation and sound options
- use **Browse** for sticker media or sound files
- preview the sticker before saving
- save the list

Supported sticker media:

- `.webp`
- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webm`

In practice, `.webm` is the best choice for animated stickers.

Example sticker paths:

```text
modules/fluxees-ping/assets/heart.webp
modules/fluxees-ping/assets/skull.png
worlds/my-world/uploads/stickers/warning.webm
```

## Other settings

- **Enable Right-Click Hold** turns the right-click hold trigger on or off.
- **Hold Duration (ms)** changes how long right click must be held.
- **Sticker Size** changes how large the image ping appears.
- **Display Duration (ms)** sets the default duration for new stickers and bundled resets.
- **Debug Logging** writes troubleshooting logs to the browser console.
