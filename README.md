# Loot Ledger for Owlbear Rodeo

Loot Ledger is a standalone Owlbear Rodeo extension created by **CorgiTheCat**. Customize your D20 dice, reuse DM loot presets, and resolve shared loot rolls in Owlbear Rodeo.

## Install

Add the deployed `https://.../manifest.json` URL as a custom Owlbear Rodeo extension and enable Loot Ledger in your room. The GM selects a token and chooses **Loot Ledger — Manage** to create a pool. Players select that token and choose **Loot Ledger — Roll** after the GM opens a session.

For local development, run `npm install` and `npm run owlbear:local`, then use `http://localhost:5184/manifest.json` on the same computer. Other players need a shared HTTPS deployment.

## Dice

The built-in 3D renderer works without an account. A player can also choose **Settings → Use dddice** and enter the slug of the same dddice room used in Owlbear and an API key for an account in that room. The key and optional passcode are kept in browser session storage, while the room slug is remembered locally. The GM's Loot session resolves the roll before dddice displays it. dddice does not change odds, inventory, or the result.

## Source

`src/loot/systems/LootEngine.js` contains the loot rules, `src/loot/background.js` manages token context menus and GM roll requests, and `src/loot/main.js` provides the English player and GM UI. Loot data is stored under the `com.corgi.loot-ledger` namespace on the selected token.

## Roll modifiers

Players can use the minus/plus buttons or type a whole number into Roll modifier, including bonuses such as +4 or +7 and negative penalties. The modifier is added once, after Normal/Advantage/Disadvantage selects a die. The full total is displayed and saved to history; reward lookup clamps to 2–20, while a selected natural 1 always awards nothing. For example, D20 18 + 7 = 25 uses loot-table value 20. DM table percentages describe unmodified rolls. The 3D dice continue to display their natural face values.

## D20 display (v1.4.0)

Every pool uses D20. The built-in display combines large numbered dice and full multi-axis rotation with gravity, floor impacts, damped bounces, shadows and tray boundaries. Roll duration follows simulated rotational inertia, launch energy and friction, without a fixed animation deadline. The result is revealed after every die loses its kinetic energy and settles onto its committed face. Advantage and Disadvantage use separate tray lanes to keep both dice readable. This is presentation physics: the GM still resolves loot independently. The optional dddice renderer keeps its own animation.

## Throw consistency (v1.4.1)

Ground rotation follows travel velocity. A forward simulation determines the stopping point from remaining energy. The initial orientation is solved before playback so the committed numbered face arrives at rest without a late turn or a changed label. The result face points toward the camera from its final position.

## Unlimited drops and DM rates (v1.5.1)

Drops have no stock count and can repeat indefinitely until the DM closes the session. Existing stock values are ignored. Only the DM configures relative Drop rates before opening a session; 0 disables an item. D20 maps these rates to reward faces 2–20 in 5% steps, with at least one face per enabled item and at most 19 enabled items. The DM preview displays the actual rounded odds. Rarity (Common through Artifact) is a display label and never changes the configured rate. Player roll messages cannot change these settings. Money ranges still control the amount awarded per drop.

Dice launch from randomly chosen edges with varied positions, directions and spin. Extra resistance at low speed shortens the slow tail without setting a fixed roll duration.

## Natural 1 (v1.5.2)

The selected natural die value of 1 awards no item or currency, regardless of modifier, and is recorded as No loot. Advantage uses the higher die; Disadvantage uses the lower. D20 faces 2–20 carry rewards (95% total probability at modifier 0 in Normal mode). Other rolls with penalties clamp to 2. An empty drop does not invoke currency amount generation.

## Netlify deployment

For manual deployment, build with `npm ci` then `npm run build` and upload the contents of `dist` (or its ZIP) to Netlify Drop. The root of the upload must contain index.html, manifest.json, background.html, loot.html, _headers, loot-icon.png and assets/.

For a Git-connected deployment, netlify.toml specifies Node 22, `npm run build`, and publish directory `dist`. No environment variables or server are required. Do not add a catch-all redirect: this is a multi-page extension.

Connect Netlify to `CorgiTheCat/Loot-Ledger`, select the `main` branch, and leave the base directory empty. Netlify builds the source automatically; `dist` and `node_modules` are excluded from Git. To preserve existing browser presets and dice styles, connect this repository to your existing Netlify site and keep its permanent hostname.

Use the permanent production hostname, then install `https://YOUR-SITE.netlify.app/manifest.json` in Owlbear. The homepage displays the correct install link for its current host. The manifest and its HTML pages must load without a Netlify login or password challenge for Owlbear and room participants. The supplied _headers allows Owlbear embedding and avoids caching old manifests.

The browser's local DM drafts and dddice settings belong to the old origin and do not automatically transfer to Netlify. Active sessions and histories stored on Owlbear tokens remain in the same namespace. Re-enter local drafts/settings on the new host. Remove the old hosted extension from the room before enabling the Netlify copy to avoid running duplicate background handlers.

## Creator and icon

Created by **CorgiTheCat**. The icon is the creator-supplied treasure chest and D20 image, used for the manifest, extension action, token menus and homepage.

Token-based loot drops with DM-controlled rates and rarity, animated D20 rolls, player bonuses, and a shared roll history.

## Reusable DM presets (v1.6.0)

The DM editor includes Your loot library. Add entries, give the preset a name, and choose Save as new preset. Open Manage on another token, select the saved preset and choose Load into this token, adjust the draft if needed, then begin a session. Presets copy item names, icons, descriptions, categories, rates, rarity, money settings and cache name. Each loaded copy receives new entry IDs; draft changes do not modify the preset. Update selected replaces a saved template explicitly. Delete selected has an Undo delete action, and loading can be undone while editing the draft.

Preset libraries are scoped to the DM identity and the extension website's browser storage, independent of token IDs. They persist across tokens, rooms and browser reloads on the same device/browser and hostname. They do not sync to another browser/device or hosting domain. Active sessions can be saved as presets but must be closed before loading a new pool. Player UI does not expose preset management.

## Player dice customization (v1.7.0)

In v1.7.2, Customize dice is a prominent full-width button directly below the loot session title, above the dice tray. It includes a palette icon, a description of the appearance options, and an expanded state for keyboard and screen-reader users.

In v1.7.1, choose a non-Solid pattern to unlock Pattern color and Pattern size (25%–400%). Pattern colors are independent of the body color. Size changes the marks and their spacing, leaving the die and its numbers the same size. These settings update the live preview and are saved with the player's existing appearance. Older saved styles receive the default gold pattern color and 100% size.

Players open Customize dice to edit body, number and edge colors; ten quick swatches and color pickers allow any RGB color. There are five bundled system font choices, five material finishes with metallic/roughness sliders, and six procedural patterns. A live 3D preview shows unsaved edits. Save & use dice stores the normalized style for that player's identity on the same browser/website and selects Built-in dice. Cancel discards edits; Reset preview restores the default look until saved. The dice retain the chosen colors when rolling and highlight the kept Advantage/Disadvantage die without replacing its color. Number 6 and 9 have orientation marks. Styles do not affect loot rates, authoritative results or motion physics. dddice uses its own dice themes.
