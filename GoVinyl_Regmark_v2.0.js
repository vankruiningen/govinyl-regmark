/*
 * GoVinyl Regmark - Regmarks for the Summa Go suite
 * Places registration marks for cut-vinyl work around artboards or a selection in
 * Adobe Illustrator: cut and weed them on a roll cutter, then thru-cut on a flatbed
 * with a camera. Made for Summa GoSign and GoProduce; not a Summa product.
 * https://github.com/vankruiningen/govinyl-regmark
 *
 * Copyright (C) 2025-2026 Niels - van Kruiningen | Reclame
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * ExtendScript (ES3): no let/const, no JSON object, no Array.indexOf.
 */

var VERSION = "2.0";
var ISSUES_URL = "https://github.com/vankruiningen/govinyl-regmark/issues";
var MM_TO_PT = 2.834645669;
var PRESET_SIZES = [3, 5, 10];
var REGMARK_SPOT_NAME = "REGMARK";
var GROUP_PREFIX = "Regmarks - ";
var CORNER_KEYS = ["bl", "br", "tl", "tr"];

var DEFAULTS = {
    size: "5",
    shape: "Circle",
    offset: "5",
    maxInterval: "600",
    spacingMode: "interval", // "interval" | "count"
    countX: "3",             // marks along the width (top and bottom edge), corners included
    countY: "3",             // marks along the height (left and right edge), corners included
    useSelection: false,
    allArtboards: true,
    sideArtboard: "inside",
    sideSelection: "outside",
    arrow: true,
    arrowCorner: "bl",      // "bl" | "br" | "tl" | "tr"
    replace: true,
    layerMode: "new",        // "new" | "selection"
    layerName: "Regmark",    // the layer name Summa GoSign and GoProduce use for marks
    lockLayer: true,
    colorMode: "regmark",    // "regmark" | "selection"
    usageCount: 0
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trim(s) {
    return String(s).replace(/^\s+|\s+$/g, "");
}

/** Reads a number with a dot or a comma as decimal separator. Returns NaN on invalid input. */
function parseNumber(text) {
    var s = trim(text).replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
}

/** Like parseNumber, but also accepts a negative value (e.g. "-10" or "-2,5"). */
function parseSignedNumber(text) {
    var s = trim(text);
    var negative = s.charAt(0) === "-";
    var n = parseNumber(negative ? s.substring(1) : s);
    return negative ? -n : n;
}

function formatNumber(n) {
    return String(Math.round(n * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Settings (flat JSON file, no eval)
// ---------------------------------------------------------------------------

function getSettingsFile() {
    return new File(Folder.userData + "/GoVinyl/settings.json");
}

/** Older settings locations, newest first: early 2.0 builds, then version 1. */
function getLegacySettingsFiles() {
    return [
        new File(Folder.userData + "/SummaRegmarks/settings.json"),
        new File(Folder.myDocuments + "/SummaRegmarksSettings.json")
    ];
}

/**
 * Reads a flat object from text. Understands real JSON as well as the old
 * v1 format (unquoted keys, single-quoted strings).
 *
 * Hand-written on purpose: ExtendScript's regex engine loses capture groups
 * in alternations, which silently dropped every boolean and number.
 */
function parseSettings(text) {
    var result = {};
    var i = 0;
    var n = text.length;

    function isSpace(ch) {
        return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
    }
    function isWord(ch) {
        return /[A-Za-z0-9_]/.test(ch);
    }
    function skipSpace() {
        while (i < n && isSpace(text.charAt(i))) i++;
    }
    function readQuoted() {
        var quote = text.charAt(i++);
        var out = "";
        while (i < n) {
            var ch = text.charAt(i++);
            if (ch === "\\" && i < n) {
                out += text.charAt(i++);
            } else if (ch === quote) {
                break;
            } else {
                out += ch;
            }
        }
        return out;
    }

    while (i < n) {
        var ch = text.charAt(i);
        var key;
        if (ch === '"' || ch === "'") {
            key = readQuoted();
        } else if (isWord(ch)) {
            var keyStart = i;
            while (i < n && isWord(text.charAt(i))) i++;
            key = text.substring(keyStart, i);
        } else {
            i++; // braces, commas, brackets, whitespace
            continue;
        }

        skipSpace();
        if (text.charAt(i) !== ":") continue;
        i++;
        skipSpace();

        ch = text.charAt(i);
        if (ch === '"' || ch === "'") {
            result[key] = readQuoted();
        } else {
            var valueStart = i;
            while (i < n && !isSpace(text.charAt(i)) && ",})".indexOf(text.charAt(i)) < 0) i++;
            var raw = text.substring(valueStart, i);
            if (raw === "true") result[key] = true;
            else if (raw === "false") result[key] = false;
            else if (/^-?\d+(\.\d+)?$/.test(raw)) result[key] = parseFloat(raw);
        }
    }
    return result;
}

function serializeSettings(settings) {
    var parts = [];
    for (var key in settings) {
        if (!settings.hasOwnProperty(key)) continue;
        var value = settings[key];
        var out;
        if (typeof value === "boolean" || typeof value === "number") {
            out = String(value);
        } else {
            out = '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
        }
        parts.push('  "' + key + '": ' + out);
    }
    return "{\n" + parts.join(",\n") + "\n}\n";
}

function readTextFile(file) {
    if (!file.exists) return null;
    try {
        file.encoding = "UTF-8";
        if (!file.open("r")) return null;
        var text = file.read();
        file.close();
        return text;
    } catch (e) {
        return null;
    }
}

function loadSettings() {
    var settings = {};
    var key;
    for (key in DEFAULTS) {
        if (DEFAULTS.hasOwnProperty(key)) settings[key] = DEFAULTS[key];
    }

    var text = readTextFile(getSettingsFile());
    var legacy = getLegacySettingsFiles();
    for (var l = 0; text === null && l < legacy.length; l++) text = readTextFile(legacy[l]);
    if (text !== null) {
        var stored = parseSettings(text);
        for (key in DEFAULTS) {
            if (DEFAULTS.hasOwnProperty(key) && stored[key] !== undefined &&
                typeof stored[key] === typeof DEFAULTS[key]) {
                settings[key] = stored[key];
            } else if (key === "size" && typeof stored[key] === "number") {
                settings[key] = String(stored[key]); // v1 stored the size as a number
            }
        }
        // Early 2.0 builds defaulted to "Regmarks"; move those to Summa's name.
        if (settings.layerName === "Regmarks") settings.layerName = DEFAULTS.layerName;
    }
    return settings;
}

function saveSettings(settings) {
    var file = getSettingsFile();
    try {
        if (!file.parent.exists) file.parent.create();
        file.encoding = "UTF-8";
        if (!file.open("w")) throw new Error(file.error);
        file.write(serializeSettings(settings));
        file.close();
    } catch (e) {
        alert("Could not save settings: " + e);
    }
}

// ---------------------------------------------------------------------------
// Geometry (pure functions, no Illustrator objects)
// ---------------------------------------------------------------------------

/** Positions of intermediate marks between start and end, evenly spaced, corners excluded. */
function spacedPositions(start, end, maxInterval) {
    var positions = [];
    var distance = Math.abs(end - start);
    var intervals = Math.ceil(distance / maxInterval - 1e-9);
    if (intervals < 2) return positions;
    var step = (end - start) / intervals;
    for (var i = 1; i < intervals; i++) {
        positions.push(start + i * step);
    }
    return positions;
}

/** Positions of intermediate marks for a fixed number of marks per edge (corners included). */
function countedPositions(start, end, count) {
    var positions = [];
    var step = (end - start) / (count - 1);
    for (var i = 1; i < count - 1; i++) {
        positions.push(start + i * step);
    }
    return positions;
}

/** Whole number of marks per edge, at least 2 (the corners). NaN when invalid. */
function parseCount(text) {
    var n = parseNumber(text);
    return (!isNaN(n) && n >= 2 && n === Math.floor(n)) ? n : NaN;
}

/**
 * Computes all mark positions for one frame.
 * bounds: {left, top, right, bottom} in points (Illustrator: top > bottom).
 * opts:   {radius, offset, maxInterval, outside, arrow, arrowCorner} in points,
 *         or {countX, countY} (marks per edge, corners included) instead of maxInterval.
 * Returns {marks: [[x, y], ...], arrow: [x, y] or null, warning: text or null, error: text or null}.
 */
function computeLayout(bounds, opts) {
    var r = opts.radius;
    var sign = opts.outside ? -1 : 1;
    var inset = sign * (opts.offset + r);

    var lx = bounds.left + inset;
    var rx = bounds.right - inset;
    var ty = bounds.top - inset;
    var by = bounds.bottom + inset;

    var layout = { marks: [], arrow: null, warning: null, error: null };

    // At least one mark width must remain between two corner marks.
    if (rx - lx < 4 * r || ty - by < 4 * r) {
        layout.error = "too small for this size and offset";
        return layout;
    }

    layout.marks.push([lx, ty], [rx, ty], [lx, by], [rx, by]);
    layout.columns = { left: lx, right: rx, top: ty, bottom: by };

    var xs = opts.countX ? countedPositions(lx, rx, opts.countX) : spacedPositions(lx, rx, opts.maxInterval);
    var ys = opts.countY ? countedPositions(by, ty, opts.countY) : spacedPositions(by, ty, opts.maxInterval);
    layout.perHorizontal = xs.length + 2;
    layout.perVertical = ys.length + 2;
    layout.spacingX = (rx - lx) / (xs.length + 1);
    layout.spacingY = (ty - by) / (ys.length + 1);

    // Neighbouring marks need at least one mark width between them.
    if (layout.spacingX < 4 * r || layout.spacingY < 4 * r) {
        layout.marks = [];
        layout.error = "too many marks, they would touch";
        return layout;
    }
    var i;
    for (i = 0; i < xs.length; i++) {
        layout.marks.push([xs[i], ty], [xs[i], by]);
    }
    for (i = 0; i < ys.length; i++) {
        layout.marks.push([lx, ys[i]], [rx, ys[i]]);
    }

    if (opts.arrow) {
        // Orientation mark: next to the chosen corner mark, towards the middle of that edge.
        // Clear gap between the two marks is 2x the mark size (4r), edge to edge.
        var corner = opts.arrowCorner || "bl";
        var onLeft = corner.charAt(1) === "l";
        var ax = onLeft ? lx + 6 * r : rx - 6 * r;
        var ay = corner.charAt(0) === "t" ? ty : by;
        var neighbourDistance = xs.length > 0 ? xs[0] - lx : rx - lx;
        // Keep at least one radius clear of the next mark on that edge.
        if (7 * r > neighbourDistance - 2 * r) {
            layout.warning = "no room for the orientation mark";
        } else {
            layout.arrow = [ax, ay];
        }
    }

    return layout;
}

function unionBounds(a, b) {
    if (!a) return [b[0], b[1], b[2], b[3]];
    return [
        Math.min(a[0], b[0]),
        Math.max(a[1], b[1]),
        Math.max(a[2], b[2]),
        Math.min(a[3], b[3])
    ];
}

// ---------------------------------------------------------------------------
// Illustrator
// ---------------------------------------------------------------------------

function isClippingItem(item) {
    if (item.typename === "PathItem") return item.clipping;
    if (item.typename === "CompoundPathItem") {
        return item.pathItems.length > 0 && item.pathItems[0].clipping;
    }
    return false;
}

function findClippingPath(group) {
    for (var i = 0; i < group.pageItems.length; i++) {
        if (isClippingItem(group.pageItems[i])) return group.pageItems[i];
    }
    return null;
}

/** Visible bounds of an item; for a clipping mask only the mask itself counts. */
function getItemBounds(item) {
    if (item.typename === "GroupItem") {
        if (item.clipped) {
            var clip = findClippingPath(item);
            if (clip) return clip.geometricBounds;
        }
        var bounds = null;
        for (var i = 0; i < item.pageItems.length; i++) {
            bounds = unionBounds(bounds, getItemBounds(item.pageItems[i]));
        }
        if (bounds) return bounds;
    }
    return item.visibleBounds;
}

function hasObjectSelection(doc) {
    var sel = doc.selection;
    return !!sel && sel.typename !== "TextRange" && sel.length > 0;
}

function getSelectionBounds(doc) {
    var sel = doc.selection;
    var bounds = null;
    for (var i = 0; i < sel.length; i++) {
        bounds = unionBounds(bounds, getItemBounds(sel[i]));
    }
    return { left: bounds[0], top: bounds[1], right: bounds[2], bottom: bounds[3] };
}

function getArtboardBounds(doc, index) {
    var rect = doc.artboards[index].artboardRect;
    return { left: rect[0], top: rect[1], right: rect[2], bottom: rect[3] };
}

/**
 * Bleed from the PDF part of an .ai file: the difference between the
 * MediaBox (artboard + bleed) and the TrimBox (artboard) of a page.
 * Returns {left, top, right, bottom} in points, or null when not found.
 */
function bleedFromPdfText(text) {
    function readBox(at) {
        var open = text.indexOf("[", at);
        var close = text.indexOf("]", open);
        if (open < 0 || close < 0 || open - at > 12) return null;
        var parts = trim(text.substring(open + 1, close)).split(/\s+/);
        if (parts.length !== 4) return null;
        var box = [];
        for (var i = 0; i < 4; i++) {
            var n = parseFloat(parts[i]);
            if (isNaN(n)) return null;
            box.push(n);
        }
        return box;
    }
    var trimAt = text.indexOf("/TrimBox");
    if (trimAt < 0) return null;
    // The MediaBox of the same page is the one closest to its TrimBox.
    var before = text.lastIndexOf("/MediaBox", trimAt);
    var after = text.indexOf("/MediaBox", trimAt);
    var mediaAt = before < 0 ? after : (after < 0 ? before : (trimAt - before <= after - trimAt ? before : after));
    if (mediaAt < 0) return null;
    var trimBox = readBox(trimAt);
    var mediaBox = readBox(mediaAt);
    if (!trimBox || !mediaBox) return null;
    function clean(v) {
        return Math.max(0, Math.round(v * 1000) / 1000);
    }
    return {
        left: clean(trimBox[0] - mediaBox[0]),
        bottom: clean(trimBox[1] - mediaBox[1]),
        right: clean(mediaBox[2] - trimBox[2]),
        top: clean(mediaBox[3] - trimBox[3])
    };
}

/**
 * The document bleed. Illustrator does not expose it to scripts, so it is read
 * from the saved .ai file (which must be saved with PDF compatibility, the default).
 * Returns {left, top, right, bottom} in points, or null when unknown.
 */
function readDocumentBleed(doc) {
    try {
        var file = doc.fullName;
        if (!file || !file.exists || !/\.ai$/i.test(file.name)) return null;
        file.encoding = "BINARY";
        if (!file.open("r")) return null;
        var text = file.read(2097152); // the page boxes sit near the start of the file
        file.close();
        return bleedFromPdfText(text);
    } catch (e) {
        return null;
    }
}

function getScaleFactor(doc) {
    try {
        if (doc.scaleFactor) return doc.scaleFactor; // Large Canvas
    } catch (e) {
        // Does not exist in older Illustrator versions
    }
    return 1;
}

function isSolidColor(color) {
    if (!color) return false;
    var t = color.typename;
    return t === "CMYKColor" || t === "RGBColor" || t === "SpotColor" ||
        t === "GrayColor" || t === "LabColor";
}

/** First solid fill colour of an item, otherwise its stroke colour. Searches groups depth-first. */
function findItemColor(item) {
    var i, color;
    switch (item.typename) {
        case "PathItem":
            if (item.clipping) return null;
            if (item.filled && isSolidColor(item.fillColor)) return item.fillColor;
            if (item.stroked && isSolidColor(item.strokeColor)) return item.strokeColor;
            return null;
        case "CompoundPathItem":
            for (i = 0; i < item.pathItems.length; i++) {
                color = findItemColor(item.pathItems[i]);
                if (color) return color;
            }
            return null;
        case "GroupItem":
            for (i = 0; i < item.pageItems.length; i++) {
                color = findItemColor(item.pageItems[i]);
                if (color) return color;
            }
            return null;
        case "TextFrame":
            try {
                color = item.textRange.characterAttributes.fillColor;
                if (isSolidColor(color)) return color;
                color = item.textRange.characterAttributes.strokeColor;
                if (isSolidColor(color)) return color;
            } catch (e) {
                // Mixed or unreadable attributes
            }
            return null;
    }
    return null;
}

function getSelectionColor(doc) {
    if (!hasObjectSelection(doc)) return null;
    var sel = doc.selection;
    for (var i = 0; i < sel.length; i++) {
        var color = findItemColor(sel[i]);
        if (color) return color;
    }
    return null;
}

/** Spot colour "REGMARK" at 100%; created (as black) when the document does not have it yet. */
function getRegmarkColor(doc) {
    var spot = null;
    var wanted = REGMARK_SPOT_NAME.toLowerCase();
    for (var i = 0; i < doc.spots.length; i++) {
        if (doc.spots[i].name.toLowerCase() === wanted) {
            spot = doc.spots[i];
            break;
        }
    }
    if (!spot) {
        var base;
        if (doc.documentColorSpace === DocumentColorSpace.RGB) {
            base = new RGBColor();
            base.red = 0;
            base.green = 0;
            base.blue = 0;
        } else {
            base = new CMYKColor();
            base.cyan = 0;
            base.magenta = 0;
            base.yellow = 0;
            base.black = 100;
        }
        spot = doc.spots.add();
        spot.name = REGMARK_SPOT_NAME;
        spot.colorType = ColorModel.SPOT;
        spot.color = base;
    }
    var color = new SpotColor();
    color.spot = spot;
    color.tint = 100;
    return color;
}

function getOrCreateLayer(doc, name) {
    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].name === name) return doc.layers[i];
    }
    var layer = doc.layers.add();
    layer.name = name;
    return layer;
}

function removeGroupsNamed(layer, name) {
    for (var i = layer.groupItems.length - 1; i >= 0; i--) {
        if (layer.groupItems[i].name === name) layer.groupItems[i].remove();
    }
}

function drawMark(container, x, y, radius, color, square) {
    var mark;
    if (square) {
        mark = container.pathItems.rectangle(y + radius, x - radius, radius * 2, radius * 2);
    } else {
        mark = container.pathItems.ellipse(y + radius, x - radius, radius * 2, radius * 2);
    }
    mark.filled = true;
    mark.stroked = false;
    mark.fillColor = color;
    return mark;
}

/**
 * Places the marks for all targets. Returns a list of warnings.
 * targets: [{name, bounds, replaceable}]
 * opts.color and opts.selectionLayer are resolved by the caller.
 */
function placeMarks(doc, targets, opts) {
    var warnings = [];
    var mmToPt = MM_TO_PT / getScaleFactor(doc);
    var layoutOpts = {
        radius: opts.size * mmToPt / 2,
        offset: opts.offset * mmToPt,
        maxInterval: opts.maxInterval * mmToPt,
        countX: opts.spacingMode === "count" ? opts.countX : 0,
        countY: opts.spacingMode === "count" ? opts.countY : 0,
        outside: opts.outside,
        arrow: opts.arrow,
        arrowCorner: opts.arrowCorner
    };

    // Compute everything first, so no empty layer is left behind when nothing fits.
    var jobs = [];
    var i, j;
    for (i = 0; i < targets.length; i++) {
        var layout = computeLayout(targets[i].bounds, layoutOpts);
        if (layout.error) {
            warnings.push(targets[i].name + ": skipped, " + layout.error + ".");
            continue;
        }
        if (layout.warning) warnings.push(targets[i].name + ": " + layout.warning + ".");
        jobs.push({ target: targets[i], layout: layout });
    }
    if (jobs.length === 0) return warnings;

    var ownLayer = !opts.selectionLayer;
    var layer = ownLayer ? getOrCreateLayer(doc, opts.layerName) : opts.selectionLayer;
    if (ownLayer) {
        layer.locked = false;
        layer.visible = true;
    }

    for (i = 0; i < jobs.length; i++) {
        var target = jobs[i].target;
        var marks = jobs[i].layout.marks;
        var groupName = GROUP_PREFIX + target.name;
        if (opts.replace && target.replaceable) removeGroupsNamed(layer, groupName);

        var group = layer.groupItems.add();
        group.name = groupName;
        for (j = 0; j < marks.length; j++) {
            drawMark(group, marks[j][0], marks[j][1], layoutOpts.radius, opts.color, opts.square);
        }
        if (jobs[i].layout.arrow) {
            // Extra mark next to the bottom-left one, same shape as the others.
            drawMark(group, jobs[i].layout.arrow[0], jobs[i].layout.arrow[1], layoutOpts.radius, opts.color, opts.square)
                .name = "Orientation mark";
        }
    }

    // Only ever lock the dedicated regmarks layer, never the user's artwork layer.
    if (ownLayer) layer.locked = opts.lockLayer;
    return warnings;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

/**
 * Opens a web page in the default browser. ExtendScript cannot open an https
 * address directly on macOS, so this goes through a tiny redirecting HTML file.
 */
function openUrl(url) {
    try {
        var file = new File(Folder.temp + "/govinyl_link.html");
        file.encoding = "UTF-8";
        file.open("w");
        file.write('<html><head><meta http-equiv="refresh" content="0; url=' + url + '"></head></html>');
        file.close();
        if (!file.execute()) throw new Error("could not open the browser");
    } catch (e) {
        prompt("Please open this page in your browser:", url);
    }
}

var LABEL_WIDTH = 120;

/** A form row in macOS style: right-aligned label, controls to the right of it. */
function addRow(parent, label) {
    var row = parent.add("group");
    row.orientation = "row";
    row.alignChildren = ["left", "center"];
    row.spacing = 8;
    var text = row.add("statictext", undefined, label || "");
    text.preferredSize.width = LABEL_WIDTH;
    text.justify = "right";
    return row;
}

/** Starts a section: a thin divider (except above the first one) and a bold heading. */
function addSection(parent, title) {
    if (parent.children.length > 0) {
        var line = parent.add("panel");
        line.alignment = "fill";
        line.minimumSize.height = 2;
        line.maximumSize.height = 2;
    }
    var heading = parent.add("statictext", undefined, title);
    try {
        var font = heading.graphics.font;
        heading.graphics.font = ScriptUI.newFont(font.name, "BOLD", font.size);
    } catch (e) {
        // Fonts cannot be changed in every Illustrator version; a plain heading is fine.
    }
}

/**
 * Corner picker: a small drawn "artboard" with a clickable dot on each corner.
 * The chosen corner is a filled blue dot, the others are hollow.
 * Returns {box, value(), setOnChange(fn), setEnabled(bool)}.
 */
function addCornerPicker(parent, selected) {
    var W = 110;
    var H = 72;
    var R = 8;          // dot radius
    var PAD = R + 2;    // distance from the control edge to a dot centre

    var centres = {
        tl: [PAD, PAD],
        tr: [W - PAD, PAD],
        bl: [PAD, H - PAD],
        br: [W - PAD, H - PAD]
    };
    var current = centres[selected] ? selected : "bl";
    var enabled = true;
    var onChange = null;

    var box = parent.add("group");
    box.preferredSize = [W, H];

    box.onDraw = function () {
        var g = this.graphics;
        var a = enabled ? 1 : 0.35;
        var line = g.newPen(g.PenType.SOLID_COLOR, [0.85, 0.85, 0.85, a], 2);
        var paper = g.newBrush(g.BrushType.SOLID_COLOR, [1, 1, 1, enabled ? 0.10 : 0.04]);
        var hole = g.newBrush(g.BrushType.SOLID_COLOR, [0.22, 0.22, 0.22, 1]);
        var accent = g.newBrush(g.BrushType.SOLID_COLOR, [0.20, 0.55, 1.00, a]);
        var ring = g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, a], 2);

        // The artboard. Each shape starts a new path, or fills would pile up.
        g.newPath();
        g.rectPath(PAD, PAD, W - 2 * PAD, H - 2 * PAD);
        g.fillPath(paper);
        g.newPath();
        g.rectPath(PAD, PAD, W - 2 * PAD, H - 2 * PAD);
        g.strokePath(line);

        // The four corner dots
        for (var key in centres) {
            if (!centres.hasOwnProperty(key)) continue;
            var c = centres[key];
            g.newPath();
            g.ellipsePath(c[0] - R, c[1] - R, 2 * R, 2 * R);
            g.fillPath(key === current ? accent : hole);
            g.newPath();
            g.ellipsePath(c[0] - R, c[1] - R, 2 * R, 2 * R);
            g.strokePath(key === current ? ring : line);
        }
    };

    function redraw() {
        box.hide();
        box.show();
    }

    box.addEventListener("mousedown", function (event) {
        if (!enabled) return;
        var best = current;
        var bestDistance = Infinity;
        for (var key in centres) {
            if (!centres.hasOwnProperty(key)) continue;
            var dx = event.clientX - centres[key][0];
            var dy = event.clientY - centres[key][1];
            var d = dx * dx + dy * dy;
            if (d < bestDistance) {
                bestDistance = d;
                best = key;
            }
        }
        current = best;
        redraw();
        if (onChange) onChange(current);
    });

    return {
        box: box,
        value: function () {
            return current;
        },
        setOnChange: function (fn) {
            onChange = fn;
            fn(current);
        },
        setEnabled: function (on) {
            enabled = on;
            redraw();
        }
    };
}

/** Shows the dialog. Returns the chosen options, or null when cancelled. */
function showDialog(doc, settings) {
    var result = null;
    var hasSelection = hasObjectSelection(doc);
    var i;

    var dialog = new Window("dialog", "GoVinyl Regmark " + VERSION + " \u2013 Regmarks for the Summa Go suite");
    dialog.orientation = "column";
    dialog.alignChildren = "left";
    dialog.margins = 20;
    dialog.spacing = 10;

    var main = dialog.add("group");
    main.orientation = "row";
    main.alignChildren = ["left", "top"];
    main.spacing = 24;
    var form = main.add("group");
    form.orientation = "column";
    form.alignChildren = "left";
    form.spacing = 10;
    var side = main.add("group");
    side.orientation = "column";
    side.alignChildren = "left";
    side.spacing = 10;

    // --- Marks ---
    addSection(form, "Marks");

    var sizeRow = addRow(form, "Size:");
    var sizeLabels = [];
    for (i = 0; i < PRESET_SIZES.length; i++) sizeLabels.push(PRESET_SIZES[i] + " mm");
    sizeLabels.push("Custom");
    var sizeList = sizeRow.add("dropdownlist", undefined, sizeLabels);
    var customIndex = PRESET_SIZES.length;
    var sizeIndex = customIndex;
    for (i = 0; i < PRESET_SIZES.length; i++) {
        if (parseNumber(settings.size) === PRESET_SIZES[i]) sizeIndex = i;
    }
    sizeList.selection = sizeIndex;
    var customGroup = sizeRow.add("group");
    customGroup.spacing = 6;
    var customInput = customGroup.add("edittext", undefined, sizeIndex === customIndex ? settings.size : "");
    customInput.characters = 6;
    customGroup.add("statictext", undefined, "mm");

    function isCustomSize() {
        return !!sizeList.selection && sizeList.selection.index === customIndex;
    }
    sizeList.onChange = function () {
        customGroup.visible = isCustomSize();
        if (isCustomSize()) customInput.active = true;
    };
    customGroup.visible = isCustomSize();

    var shapeRow = addRow(form, "Shape:");
    var circleRadio = shapeRow.add("radiobutton", undefined, "Circle");
    var squareRadio = shapeRow.add("radiobutton", undefined, "Square");
    if (settings.shape === "Square") squareRadio.value = true; else circleRadio.value = true;

    var offsetRow = addRow(form, "Offset:");
    var offsetInput = offsetRow.add("edittext", undefined, settings.offset);
    offsetInput.characters = 6;
    offsetRow.add("statictext", undefined, "mm");

    var spacingRow = addRow(form, "Spacing by:");
    var byIntervalRadio = spacingRow.add("radiobutton", undefined, "Max. interval");
    var byCountRadio = spacingRow.add("radiobutton", undefined, "Number of marks");
    if (settings.spacingMode === "count") byCountRadio.value = true; else byIntervalRadio.value = true;

    var intervalRow = addRow(form, "Max. interval:");
    var intervalInput = intervalRow.add("edittext", undefined, settings.maxInterval);
    intervalInput.characters = 6;
    intervalRow.add("statictext", undefined, "mm");
    var intervalResult = intervalRow.add("statictext", undefined, "");
    intervalResult.characters = 20;

    var countRow = addRow(form, "Marks per side:");
    countRow.add("statictext", undefined, "W");
    var countXInput = countRow.add("edittext", undefined, settings.countX);
    countXInput.characters = 3;
    countRow.add("statictext", undefined, "H");
    var countYInput = countRow.add("edittext", undefined, settings.countY);
    countYInput.characters = 3;
    var countResult = countRow.add("statictext", undefined, "");
    countResult.characters = 20;

    // Last computed result, used to carry values over when switching mode.
    var lastResult = null;

    function updateSpacingMode() {
        intervalInput.enabled = byIntervalRadio.value;
        countXInput.enabled = byCountRadio.value;
        countYInput.enabled = byCountRadio.value;
    }
    byIntervalRadio.onClick = function () {
        // Smallest whole-mm interval that keeps the current spacing.
        if (lastResult) intervalInput.text = String(Math.ceil(Math.max(lastResult.spacingX, lastResult.spacingY) - 1e-6));
        updateSpacingMode();
    };
    byCountRadio.onClick = function () {
        if (lastResult) {
            countXInput.text = String(lastResult.countX);
            countYInput.text = String(lastResult.countY);
        }
        updateSpacingMode();
    };
    updateSpacingMode();

    var cornerRow = addRow(form, "Orientation mark:");
    var cornerPicker = addCornerPicker(cornerRow, settings.arrowCorner);
    var cornerSide = cornerRow.add("group");
    cornerSide.orientation = "column";
    cornerSide.alignChildren = "left";
    cornerSide.spacing = 6;
    var cornerHint = cornerSide.add("statictext", undefined, "Click a corner:");
    cornerHint.enabled = false;
    var cornerText = cornerSide.add("statictext", undefined, "Bottom right");
    cornerText.characters = 12;
    var noCornerCheck = cornerSide.add("checkbox", undefined, "None");
    noCornerCheck.value = !settings.arrow;

    var CORNER_NAMES = { tl: "Top left", tr: "Top right", bl: "Bottom left", br: "Bottom right" };
    try {
        var boldFont = cornerText.graphics.font;
        cornerText.graphics.font = ScriptUI.newFont(boldFont.name, "BOLD", boldFont.size);
    } catch (e) {
        // A plain label is fine.
    }
    function updateCorner() {
        var off = noCornerCheck.value;
        cornerPicker.setEnabled(!off);
        cornerHint.visible = !off;
        cornerText.text = off ? "No mark" : CORNER_NAMES[cornerPicker.value()];
        updatePreview();
    }
    cornerPicker.setOnChange(updateCorner);
    noCornerCheck.onClick = updateCorner;

    // --- Placement ---
    addSection(form, "Placement");

    var aroundRow = addRow(form, "Around:");
    var artboardRadio = aroundRow.add("radiobutton", undefined, "Artboard");
    var selectionRadio = aroundRow.add("radiobutton", undefined, "Selection");
    if (settings.useSelection) selectionRadio.value = true; else artboardRadio.value = true;

    var scopeRow = addRow(form, "Artboards:");
    var allRadio = scopeRow.add("radiobutton", undefined, "All (" + doc.artboards.length + ")");
    var currentRadio = scopeRow.add("radiobutton", undefined, "Current only");
    if (settings.allArtboards) allRadio.value = true; else currentRadio.value = true;

    var sideRow = addRow(form, "Position:");
    var insideRadio = sideRow.add("radiobutton", undefined, "Inside Selection");
    var outsideRadio = sideRow.add("radiobutton", undefined, "Outside Selection");
    // Wide enough for "Selection"; the text follows the Around choice.
    insideRadio.preferredSize.width = 130;
    outsideRadio.preferredSize.width = 140;

    var sides = { artboard: settings.sideArtboard, selection: settings.sideSelection };

    function currentMode() {
        return selectionRadio.value ? "selection" : "artboard";
    }
    function showSide() {
        var target = selectionRadio.value ? "Selection" : "Artboard";
        insideRadio.text = "Inside " + target;
        outsideRadio.text = "Outside " + target;
        if (sides[currentMode()] === "outside") outsideRadio.value = true; else insideRadio.value = true;
        scopeRow.enabled = artboardRadio.value;
    }
    function storeSide() {
        sides[currentMode()] = outsideRadio.value ? "outside" : "inside";
    }
    artboardRadio.onClick = showSide;
    selectionRadio.onClick = showSide;
    insideRadio.onClick = storeSide;
    outsideRadio.onClick = storeSide;
    showSide();

    // --- Output ---
    addSection(form, "Output");

    var layerRow = addRow(form, "Layer:");
    var newLayerRadio = layerRow.add("radiobutton", undefined, "New Layer");
    var sameLayerRadio = layerRow.add("radiobutton", undefined, "As selection");
    sameLayerRadio.enabled = hasSelection;
    if (hasSelection && settings.layerMode === "selection") sameLayerRadio.value = true;
    else newLayerRadio.value = true;

    var layerNameRow = addRow(form, "Layer name:");
    var layerInput = layerNameRow.add("edittext", undefined, settings.layerName);
    layerInput.characters = 22;
    var lockCheck = layerNameRow.add("checkbox", undefined, "Lock layer");
    lockCheck.value = settings.lockLayer;

    function updateLayerName() {
        layerNameRow.enabled = newLayerRadio.value;
    }
    newLayerRadio.onClick = updateLayerName;
    sameLayerRadio.onClick = updateLayerName;
    updateLayerName();

    var colorRow = addRow(form, "Color:");
    var regmarkColorRadio = colorRow.add("radiobutton", undefined, REGMARK_SPOT_NAME);
    var selectionColorRadio = colorRow.add("radiobutton", undefined, "Color of selection");
    selectionColorRadio.enabled = hasSelection;
    if (hasSelection && settings.colorMode === "selection") selectionColorRadio.value = true;
    else regmarkColorRadio.value = true;

    var replaceRow = addRow(form);
    var replaceCheck = replaceRow.add("checkbox", undefined, "Replace existing marks of the same artboard");
    replaceCheck.value = settings.replace;

    if (!hasSelection) {
        var hintRow = addRow(form);
        var hint = hintRow.add("statictext", undefined,
            "Select artwork first to use the selection's layer or color.");
        hint.enabled = false;
    }

    // --- Live preview (right column) ---
    addSection(side, "Preview");
    var PW = 260;
    var PH = 180;
    var canvas = side.add("group");
    canvas.preferredSize = [PW, PH];
    var captionTop = side.add("statictext", undefined, "");
    captionTop.characters = 36;
    var captionBottom = side.add("statictext", undefined, "");
    captionBottom.characters = 36;
    var captionLegend = side.add("statictext", undefined, "");
    captionLegend.characters = 36;
    captionLegend.enabled = false;
    var captionBleed = side.add("statictext", undefined, "");
    captionBleed.characters = 36;
    captionBleed.enabled = false;

    var scaleFactor = getScaleFactor(doc);
    var artboardIndex = doc.artboards.getActiveArtboardIndex();
    var artboardBounds = getArtboardBounds(doc, artboardIndex);
    var selectionBounds = hasSelection ? getSelectionBounds(doc) : null;
    var documentBleed = readDocumentBleed(doc);
    var hasBleed = !!documentBleed && (documentBleed.left > 0 || documentBleed.top > 0 ||
        documentBleed.right > 0 || documentBleed.bottom > 0);
    var previewState = null;

    function describeBleed() {
        if (!documentBleed) {
            try {
                if (doc.fullName.exists) return "Bleed: not found (save as .ai with PDF compatibility).";
            } catch (e) {
                // Never saved
            }
            return "Bleed: unknown until the document is saved.";
        }
        if (!hasBleed) return "Bleed: none set in the document.";
        var mmPerPt = scaleFactor / MM_TO_PT;
        var sides = [documentBleed.top, documentBleed.right, documentBleed.bottom, documentBleed.left];
        var same = sides[0] === sides[1] && sides[1] === sides[2] && sides[2] === sides[3];
        var text = same ? formatNumber(Math.round(sides[0] * mmPerPt * 10) / 10) + " mm"
            : "T " + formatNumber(Math.round(sides[0] * mmPerPt * 10) / 10) +
              " R " + formatNumber(Math.round(sides[1] * mmPerPt * 10) / 10) +
              " B " + formatNumber(Math.round(sides[2] * mmPerPt * 10) / 10) +
              " L " + formatNumber(Math.round(sides[3] * mmPerPt * 10) / 10) + " mm";
        return "Red = bleed: " + text + (doc.saved ? "" : " (as last saved)") + ".";
    }

    canvas.onDraw = function () {
        var g = this.graphics;
        g.newPath();
        g.rectPath(0, 0, PW, PH);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [0.40, 0.40, 0.40, 1]));
        if (!previewState) return;

        var st = previewState;
        var f = st.frame;
        var points = st.layout.marks.concat(st.layout.arrow ? [st.layout.arrow] : []);
        var bleed = st.bleed;
        var minX = f.left, maxX = f.right, minY = f.bottom, maxY = f.top;
        if (bleed) {
            minX -= bleed.left;
            maxX += bleed.right;
            minY -= bleed.bottom;
            maxY += bleed.top;
        }
        for (var k = 0; k < points.length; k++) {
            minX = Math.min(minX, points[k][0] - st.radius);
            maxX = Math.max(maxX, points[k][0] + st.radius);
            minY = Math.min(minY, points[k][1] - st.radius);
            maxY = Math.max(maxY, points[k][1] + st.radius);
        }
        var M = 12;
        var scale = Math.min((PW - 2 * M) / (maxX - minX), (PH - 2 * M) / (maxY - minY));
        var ox = (PW - (maxX - minX) * scale) / 2;
        var oy = (PH - (maxY - minY) * scale) / 2;
        function px(x) { return ox + (x - minX) * scale; }
        function py(y) { return oy + (maxY - y) * scale; } // Illustrator y runs upwards

        if (bleed) {
            g.newPath();
            g.rectPath(px(f.left - bleed.left), py(f.top + bleed.top),
                (f.right - f.left + bleed.left + bleed.right) * scale,
                (f.top - f.bottom + bleed.top + bleed.bottom) * scale);
            g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [0.93, 0.45, 0.45, 1]));
        }
        g.newPath();
        g.rectPath(px(f.left), py(f.top), (f.right - f.left) * scale, (f.top - f.bottom) * scale);
        g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [0.96, 0.96, 0.96, 1]));

        // Small marks are drawn larger so they stay visible. To keep the picture
        // honest, the enlarged mark grows away from the artboard edge, so a mark
        // that touches the edge from inside (or outside) still does so.
        var realR = st.radius * scale;
        var r = Math.max(3.5, realR);
        var grow = r - realR;
        var cols = st.layout.columns;
        var eps = st.radius / 100;
        function push(value, column, edge) {
            if (Math.abs(value - column) > eps) return 0;
            return value < edge ? -1 : (value > edge ? 1 : 0);
        }
        // Screen centre of a mark, grown away from the nearest artboard edge.
        function centre(p) {
            var sx = push(p[0], cols.left, f.left) || push(p[0], cols.right, f.right);
            var sy = push(p[1], cols.top, f.top) || push(p[1], cols.bottom, f.bottom);
            return [px(p[0]) + sx * grow, py(p[1]) - sy * grow]; // screen y runs downwards
        }
        function dot(p, brush, at) {
            var c = at || centre(p);
            var cx = c[0];
            var cy = c[1];
            g.newPath();
            if (st.square) g.rectPath(cx - r, cy - r, 2 * r, 2 * r);
            else g.ellipsePath(cx - r, cy - r, 2 * r, 2 * r);
            g.fillPath(brush);
        }
        var black = g.newBrush(g.BrushType.SOLID_COLOR, [0.05, 0.05, 0.05, 1]);
        for (k = 0; k < st.layout.marks.length; k++) dot(st.layout.marks[k], black);
        if (st.layout.arrow) {
            // Keep the real proportion to its corner mark: centres 3 mark sizes apart,
            // measured with the (possibly enlarged) preview size.
            var a = st.layout.arrow;
            var onLeft = Math.abs(a[0] - cols.left) < Math.abs(a[0] - cols.right);
            var corner = centre([onLeft ? cols.left : cols.right, a[1]]);
            var at = [corner[0] + (onLeft ? 6 : -6) * r, corner[1]];
            dot(a, g.newBrush(g.BrushType.SOLID_COLOR, [0.20, 0.55, 1.00, 1]), at);
        }
    };

    function showMessage(text) {
        previewState = null;
        captionTop.text = text;
        captionBottom.text = "";
        captionLegend.text = "";
        captionBleed.text = "";
    }

    function updatePreview() {
        if (!canvas) return; // called while the dialog is still being built
        var size = isCustomSize() ? parseNumber(customInput.text)
            : (sizeList.selection ? PRESET_SIZES[sizeList.selection.index] : NaN);
        var offset = parseSignedNumber(offsetInput.text);
        var byCount = byCountRadio.value;
        var maxInterval = parseNumber(intervalInput.text);
        var countX = parseCount(countXInput.text);
        var countY = parseCount(countYInput.text);
        var spacingValid = byCount ? !isNaN(countX) && !isNaN(countY)
            : !isNaN(maxInterval) && maxInterval >= 2 * size;
        var bounds = selectionRadio.value ? selectionBounds : artboardBounds;
        intervalResult.text = "";
        countResult.text = "";
        lastResult = null;

        if (!bounds) {
            showMessage("Nothing selected.");
        } else if (isNaN(size) || size <= 0 || isNaN(offset) || !spacingValid) {
            showMessage("Enter valid values to see the preview.");
        } else {
            var mmToPt = MM_TO_PT / scaleFactor;
            var layout = computeLayout(bounds, {
                radius: size * mmToPt / 2,
                offset: offset * mmToPt,
                maxInterval: maxInterval * mmToPt,
                countX: byCount ? countX : 0,
                countY: byCount ? countY : 0,
                outside: outsideRadio.value,
                arrow: !noCornerCheck.value,
                arrowCorner: cornerPicker.value()
            });
            if (layout.error) {
                showMessage("Too small: " + layout.error + ".");
            } else {
                previewState = {
                    frame: bounds,
                    layout: layout,
                    radius: size * mmToPt / 2,
                    square: squareRadio.value,
                    bleed: (!selectionRadio.value && hasBleed) ? documentBleed : null
                };
                lastResult = {
                    countX: layout.perHorizontal,
                    countY: layout.perVertical,
                    spacingX: layout.spacingX / mmToPt,
                    spacingY: layout.spacingY / mmToPt
                };
                if (byCount) {
                    countResult.text = "= " + formatNumber(Math.round(lastResult.spacingX * 10) / 10) + " \u00D7 " +
                        formatNumber(Math.round(lastResult.spacingY * 10) / 10) + " mm";
                } else {
                    intervalResult.text = "= " + lastResult.countX + " \u00D7 " + lastResult.countY + " marks";
                }
                var total = layout.marks.length + (layout.arrow ? 1 : 0);
                captionTop.text = "Top/bottom: " + layout.perHorizontal + " marks   Left/right: " +
                    layout.perVertical + " marks";
                captionBottom.text = "Spacing " + Math.round(layout.spacingX / mmToPt) + " x " +
                    Math.round(layout.spacingY / mmToPt) + " mm   Total: " + total + " marks";
                var where = selectionRadio.value ? "Selection" : "Artboard " + (artboardIndex + 1) +
                    (allRadio.value && doc.artboards.length > 1 ? " (same on every artboard)" : "");
                captionLegend.text = where + (layout.arrow ? ". Blue = orientation mark." :
                    (layout.warning ? ". No room for the orientation mark." : "."));
                captionBleed.text = selectionRadio.value ? "" : describeBleed();
            }
        }
        canvas.hide();
        canvas.show();
    }

    // Refresh the preview on every change, keeping existing handlers.
    function hook(control, eventName) {
        var previous = control[eventName];
        control[eventName] = function () {
            if (previous) previous.apply(this, arguments);
            updatePreview();
        };
    }
    hook(sizeList, "onChange");
    hook(customInput, "onChanging");
    hook(offsetInput, "onChanging");
    hook(intervalInput, "onChanging");
    hook(countXInput, "onChanging");
    hook(countYInput, "onChanging");
    hook(byIntervalRadio, "onClick");
    hook(byCountRadio, "onClick");
    hook(circleRadio, "onClick");
    hook(squareRadio, "onClick");
    hook(artboardRadio, "onClick");
    hook(selectionRadio, "onClick");
    hook(insideRadio, "onClick");
    hook(outsideRadio, "onClick");
    hook(allRadio, "onClick");
    hook(currentRadio, "onClick");
    updatePreview();

    // --- Buttons: macOS order, default button on the far right ---
    var buttons = dialog.add("group");
    buttons.orientation = "row";
    buttons.alignment = "fill";
    buttons.alignChildren = ["left", "center"];
    buttons.margins = [0, 10, 0, 0];
    var feedbackButton = buttons.add("button", undefined, "Feedback\u2026");
    var footer = buttons.add("statictext", undefined, "v" + VERSION + "  \u00A9 van Kruiningen | Reclame");
    footer.enabled = false;
    footer.alignment = ["fill", "center"];
    var cancelButton = buttons.add("button", undefined, "Cancel", { name: "cancel" });
    var okButton = buttons.add("button", undefined, "Place Marks", { name: "ok" });
    // Keep the buttons at their natural size; the footer text takes up the slack.
    feedbackButton.maximumSize.width = 110;
    cancelButton.maximumSize.width = 100;
    okButton.maximumSize.width = 120;

    feedbackButton.onClick = function () {
        openUrl(ISSUES_URL);
    };

    /** Reads and validates the input. Returns {error} or the options. */
    function readInput() {
        var size = NaN;
        if (isCustomSize()) {
            size = parseNumber(customInput.text);
        } else if (sizeList.selection) {
            size = PRESET_SIZES[sizeList.selection.index];
        }
        if (isNaN(size) || size <= 0) return { error: "Enter a valid size (mm, greater than 0)." };

        var offset = parseSignedNumber(offsetInput.text);
        if (isNaN(offset)) return { error: "Enter a valid offset in mm (negative values move the marks past the edge)." };

        var spacingMode = byCountRadio.value ? "count" : "interval";
        var maxInterval = parseNumber(intervalInput.text);
        var countX = parseCount(countXInput.text);
        var countY = parseCount(countYInput.text);
        if (spacingMode === "interval") {
            if (isNaN(maxInterval) || maxInterval < 2 * size) {
                return { error: "The max. interval must be at least 2x the mark size (" + formatNumber(2 * size) + " mm)." };
            }
        } else if (isNaN(countX) || isNaN(countY)) {
            return { error: "Enter a whole number of marks per side (2 or more, corners included)." };
        }
        // Keep the unused fields' last valid values for next time.
        if (isNaN(maxInterval) || maxInterval < 2 * size) maxInterval = parseNumber(settings.maxInterval);
        if (isNaN(countX)) countX = parseCount(settings.countX);
        if (isNaN(countY)) countY = parseCount(settings.countY);

        var layerName = trim(layerInput.text);
        if (newLayerRadio.value && layerName === "") return { error: "Enter a layer name." };

        if (selectionRadio.value && !hasSelection) {
            return { error: "Nothing is selected.\nSelect one or more objects first, or choose 'Artboard'." };
        }

        var color = null;
        if (selectionColorRadio.value) {
            color = getSelectionColor(doc);
            if (!color) {
                return { error: "No solid fill or stroke color found in the selection.\nChoose '" + REGMARK_SPOT_NAME + "' instead." };
            }
        }

        storeSide();
        return {
            size: size,
            square: squareRadio.value,
            offset: offset,
            maxInterval: maxInterval,
            spacingMode: spacingMode,
            countX: countX,
            countY: countY,
            arrow: !noCornerCheck.value,
            arrowCorner: cornerPicker.value(),
            useSelection: selectionRadio.value,
            allArtboards: allRadio.value,
            outside: outsideRadio.value,
            sideArtboard: sides.artboard,
            sideSelection: sides.selection,
            layerMode: sameLayerRadio.value ? "selection" : "new",
            layerName: layerName === "" ? settings.layerName : layerName,
            lockLayer: lockCheck.value,
            colorMode: selectionColorRadio.value ? "selection" : "regmark",
            color: color,
            replace: replaceCheck.value
        };
    }

    okButton.onClick = function () {
        var input = readInput();
        if (input.error) {
            alert(input.error);
            return;
        }
        result = input;
        dialog.close(1);
    };

    if (dialog.show() !== 1) return null;
    return result;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function main() {
    if (app.documents.length === 0) {
        alert("Please open a document first.");
        return;
    }
    var doc = app.activeDocument;

    try {
        var settings = loadSettings();
        var opts = showDialog(doc, settings);
        if (!opts) return;

        var usageCount = settings.usageCount + 1;
        saveSettings({
            size: formatNumber(opts.size),
            shape: opts.square ? "Square" : "Circle",
            offset: formatNumber(opts.offset),
            maxInterval: isNaN(opts.maxInterval) ? DEFAULTS.maxInterval : formatNumber(opts.maxInterval),
            spacingMode: opts.spacingMode,
            countX: isNaN(opts.countX) ? DEFAULTS.countX : String(opts.countX),
            countY: isNaN(opts.countY) ? DEFAULTS.countY : String(opts.countY),
            useSelection: opts.useSelection,
            allArtboards: opts.allArtboards,
            sideArtboard: opts.sideArtboard,
            sideSelection: opts.sideSelection,
            arrow: opts.arrow,
            arrowCorner: opts.arrowCorner,
            replace: opts.replace,
            layerMode: opts.layerMode,
            layerName: opts.layerName,
            lockLayer: opts.lockLayer,
            colorMode: opts.colorMode,
            usageCount: usageCount
        });

        var targets = [];
        if (opts.useSelection) {
            targets.push({ name: "Selection", bounds: getSelectionBounds(doc), replaceable: false });
        } else if (opts.allArtboards) {
            for (var i = 0; i < doc.artboards.length; i++) {
                targets.push({ name: "Artboard " + (i + 1), bounds: getArtboardBounds(doc, i), replaceable: true });
            }
        } else {
            var index = doc.artboards.getActiveArtboardIndex();
            targets.push({ name: "Artboard " + (index + 1), bounds: getArtboardBounds(doc, index), replaceable: true });
        }

        // Resolve layer and colour before anything is drawn.
        opts.selectionLayer = (opts.layerMode === "selection") ? doc.selection[0].layer : null;
        if (!opts.color) opts.color = getRegmarkColor(doc);

        var warnings = placeMarks(doc, targets, opts);
        if (warnings.length > 0) {
            alert("Please note:\n\n" + warnings.join("\n"));
        }

        if (usageCount === 10) {
            if (confirm("You have now used this plugin 10 times!\n\nWould you like to give feedback to help improve it?")) {
                openUrl(ISSUES_URL);
            }
        }
    } catch (e) {
        alert("An error occurred: " + e + (e.line ? " (line " + e.line + ")" : ""));
    }
}

main();
