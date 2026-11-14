# Changelog

## 2.0 - 2026-11-14

First public release, as **GoVinyl Regmark** (previously the in-house script *Summa Regmarks VKR Standard*).

### Added
- Live preview in the dialog with the marks, the number of marks per edge, the actual spacing, the total, and the document bleed.
- *Spacing by*: a maximum interval or a fixed number of marks per side (width and height), each showing what the other works out to.
- Corner picker for the orientation mark (any of the four corners), or none.
- Size presets of 3, 5 and 10 mm, plus a custom size.
- *Inside* or *Outside* the artboard (or selection), remembered separately for artboard and selection; a negative offset moves the marks past the edge.
- *Layer*: *New Layer* (default name `Regmark`, as used by Summa GoSign and GoProduce, optionally locked) or *As selection*.
- *Color*: the spot color `REGMARK` or the color of the selection.
- Option to replace existing marks of the same artboard instead of stacking them.
- macOS-style dialog with the version number in the window title and in the file name.

### Changed
- The orientation mark has the same shape as the other marks (no more triangle), with a clear gap of twice the mark size.
- Settings are stored as JSON in the user application-data folder; settings from version 1 are taken over once.
- Feedback goes to GitHub Issues.
- Released under the GNU General Public License v3.0.

### Fixed
- Selection mode with nothing selected no longer places marks outside the artboard.
- Invalid or empty offsets no longer produce broken positions; a decimal comma (`5,5`) is read correctly.
- Artboards that are too small are skipped with a message instead of producing overlapping marks.
- Selections with a clipping mask use the mask, not the hidden content.

## 1.0 - 2025-11-25
- In-house first version: circle or square marks of 1, 3, 5 or 10 mm around the artboard(s) or a selection, with a triangle as orientation mark.
