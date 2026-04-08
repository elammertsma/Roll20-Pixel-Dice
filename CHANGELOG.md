# Pixels Dice for Roll20
## Changelog

All notable changes to this project are documented in this file.

## Pixels Dice for Roll20 [3.4.0] - 2026-04-08

### Added
- **Inline Modifier Editing**: You can now click on a custom modifier's name or value in the Hub to edit it directly.
- **Improved UI Components**: The shared Input component now supports auto-focus and standard keyboard shortcuts (Enter to save, Escape to cancel).

### Changed
- **Edit Mode Polish**: Focus management during inline editing now allows switching between name and value inputs without closing the editor.
- **Improved Performance**: Refined re-rendering logic for the Hub's custom modifier list.

## Pixels Dice for Roll20 [3.3.0] - 2026-04-07

Mostly visual touch-ups, UX refinements and bug-fixes.

### Added
- **Auto-opening Popup**: The extension popup now automatically opens when you refresh a Roll20 editor page or switch back to an existing Roll20 tab.
- **Auto-open Hub with Popup**: New setting to automatically open the Pixels Hub when entering a game, ensuring background dice reconnection.
- **Gentle Pulse Animation**: Added subtle visual feedback to the "Keep this tab open" sidebar warning in the Hub.
- **Roll Failure Detection**: If the extension cannot find the Roll20 chat input, a friendly error modal now appears in the popup.
- **Bluetooth Connection Guidance**: Added a dedicated modal in the Hub to handle Bluetooth "out of range" errors with specific retry instructions.

### Changed
- **Popup Auto-Open Restriction**: The extension popup now only auto-displays on `app.roll20.net/editor` to avoid cluttering unrelated pages.
- **Console Silence**: Implemented user-gesture tracking in the Hub to prevent benign browser warnings about blocked confirmation panels.
- **Popup Dice Summary**: Disconnected dice are now filtered out of the summary list in the popup for a cleaner interface.
- **Deselect Modifiers**: You can now click an already selected Stat, Save, or Skill in the popup to deselect it.

### Fixed
- **Advantage/Disadvantage Logic**: Fixed a regression where a single die's duplicate events were being treated as two separate rolls. This could happen when the die was still settling and reported die results rapidly in succession.
- **Simultaneous Detection**: Refined simultaneous roll detection to strictly require two physical dice with different Bluetooth IDs.
- **Roll Debounce**: Added a 1-second debounce for identical face values on the same die to improve physical rolling reliability.
- **Dice Persistence**: Fixed an issue where a die would remain in the popup summary even when the physical die was turned off or disconnected.
- **Hub Navigation Improvement**: Moving between tabs in the Hub from the popup no longer triggers a page reload or the "Are you sure you want to leave?" prompt.

---

## Pixels Dice for Roll20 [3.2.3] - 2026-04-06

Major update shifting to React, overhauling the UI, and introducing the Pixels Hub.

### Added
- **Introduced the Pixels Hub**: A central Bluetooth bridge for managing dice, templates, and settings.
- **Improved Modifiers**: Added stat, save, and skill modifiers that are now front-and-center in the new UI.
- **Advantage/Disadvantage**: Support for sequential (1 die twice), simultaneous (2 dice), and mixed (1 die + digital die) rolls.
- **Custom Modifiers**: Added support for generic bonuses and custom toggles (e.g., "Rage" or "Bane").
- **Visual Feedback**: Added signal strength indicators, low battery warnings, and animated roll status in the Popup and Hub.
- **Roll Styling**: Added support for Roll20's automatic critical success and failure highlighting.
- **Community Support**: Added donate buttons in the Hub and Popup.

### Changed
- **Tech Stack Shift**: Migrated the extension structure to React for better maintainability and performance.
- **Simplified UI**: Overhauled the distribution of features; dice info and template editors have been moved from the Popup to the Hub.
- **Smart Hub Management**: The Hub now opens discretely in a tab to the right of Roll20 and automatically closes when the session ends.
- **High-Res Assets**: Upgraded the logo to a higher resolution version.

### Fixed
- **Connection Reliability**: Refactored Bluetooth session management to improve stability.
- **Chat Integration**: Fixed chat field focus and reliability issues for roll injection.
- **Styling**: Fixed roll styling in chat to better match native Roll20 digital rolls.
- **Persistence**: Implemented local storage for template selection and modifier configurations.
