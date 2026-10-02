# Fluxee's Sticker Ping

Fluxee's Sticker Ping adds a fast radial sticker picker to Foundry VTT so players and GMs can play animated stickers directly onto the canvas.

[Join the Discord!](https://discord.gg/KahMNDkRtK)

## Features

- Open a radial picker right on the canvas
- Ping sticker media with animation and optional sound
- Use per-sticker settings for animation, duration, volume, repeat audio, and GM-only visibility
- Preview each sticker before saving it
- Reorder stickers with drag and drop
- Reset back to the bundled sticker set at any time

## Compatibility

Tested on Foundry VTT **13 and 14**. The manifest requires at least **13** and
marks **14** as the latest verified generation, with no maximum restriction.
The latest user-reported tests passed on **Foundry 14.368** with **dnd5e 6.0.5**,
including the popped-out Sticker Manager and sticker pings and sounds received
by a second player.

## Quick Start

### Installation (Foundry VTT 13 and 14)

Open **Setup -> Add-on Modules -> Install Module** and paste this into **Manifest URL**:

`https://github.com/Fluxee1/Fluxees-Sticker-Ping/releases/latest/download/module.json`

Click **Install**, then enable **Fluxee's Sticker Ping** in your world's module settings.

For a manual installation, download `fluxees-ping.zip` from the
[latest download](https://github.com/Fluxee1/Fluxees-Sticker-Ping/releases/latest)
and extract its contents into `Data/modules/fluxees-ping/`, so `module.json` is
directly inside that folder. Restart Foundry, then enable the module in your world.

### Using Stickers

1. Make sure **Token Controls** is active.
2. Move your mouse over the canvas.
3. Press **Ctrl + E** to open the radial menu.
4. Click a sticker to ping it on the scene.

If **Enable Right-Click Hold** is enabled in settings, you can also hold right click on the canvas to open the radial.

## Sticker Manager

Open **Game Settings -> Configure Settings -> Module Settings -> Fluxee's Sticker Ping**, then open **Sticker Manager**.

From there you can:

- add or remove stickers
- drag stickers into order
- choose sticker media and sound files
- set animation style
- adjust sound volume
- set sticker duration
- toggle repeat audio
- toggle GM-only visibility
- preview the full effect before saving

## Supported Media

Sticker media supports:

- `.webp`
- `.png`
- `.jpg`
- `.jpeg`
- `.webm`

Use `.webm` for animated stickers.

Sound effects can be assigned per sticker and previewed directly from Sticker Manager.

## Settings

- **Enable Right-Click Hold** turns the hold-to-open trigger on or off
- **Hold Duration (ms)** changes how long right click must be held before the radial opens
- **Sticker Size** changes how large sticker pings appear on the canvas
- **Display Duration (ms)** sets the default duration for new stickers and bundled resets

## Credits and License

- Sticker artwork: [OpenMoji](https://openmoji.org/), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Sound effects: [Dragon-Studio on Pixabay](https://pixabay.com/users/dragon-studio-38165424/)

The module's original code and documentation are licensed under the [MIT License](LICENSE).
Bundled artwork and sounds have separate terms; see [Third-Party Asset Notices](THIRD_PARTY_NOTICES.md).
