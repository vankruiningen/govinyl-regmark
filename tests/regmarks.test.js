// Tests for the parts of GoVinyl_Regmark_v*.js that do not need Illustrator.
// Run with: node tests/regmarks.test.js
//
// The script is loaded in a sandbox without documents, so main() stops at
// "Please open a document first." and the helper functions become available.

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

// The script file carries its version in the name, e.g. GoVinyl_Regmark_v2.1.js.
const root = path.join(__dirname, "..");
const scripts = fs.readdirSync(root).filter((name) => /^GoVinyl_Regmark_v\d+(\.\d+)*\.js$/.test(name));
if (scripts.length !== 1) {
    console.error("Expected exactly one GoVinyl_Regmark_v*.js in the project root, found: " + (scripts.join(", ") || "none"));
    process.exit(1);
}
const scriptName = scripts[0];
const scriptPath = path.join(root, scriptName);
const alerts = [];
const ctx = { app: { documents: { length: 0 } }, alert: (m) => alerts.push(m) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(scriptPath, "utf8"), ctx);

const P = 2.834645669; // points per mm
const mm = (v) => Math.round((v / P) * 100) / 100;
const point = (p) => Array.from(p, mm);

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log("  ok    " + name);
    } catch (e) {
        console.log("  FAIL  " + name);
        console.log(e);
        process.exitCode = 1;
    }
}

// A 1000 x 700 mm artboard, 5 mm marks, 5 mm offset, inside the frame.
// Corner mark centres are then at 7.5 mm from every edge.
const board = { left: 0, top: 0, right: 1000 * P, bottom: -700 * P };
const base = { radius: 2.5 * P, offset: 5 * P, maxInterval: 600 * P, outside: false, arrow: true, arrowCorner: "bl" };

console.log("GoVinyl Regmark tests");

test("script without a document asks to open one", () => {
    assert.deepStrictEqual(alerts, ["Please open a document first."]);
});

test("numbers accept a dot or a comma", () => {
    assert.strictEqual(ctx.parseNumber("5,5"), 5.5);
    assert.strictEqual(ctx.parseNumber(" 10 "), 10);
    assert.ok(isNaN(ctx.parseNumber("")));
    assert.ok(isNaN(ctx.parseNumber("abc")));
    assert.ok(isNaN(ctx.parseNumber("-3")));
});

test("offset may be negative", () => {
    assert.strictEqual(ctx.parseSignedNumber("-10"), -10);
    assert.strictEqual(ctx.parseSignedNumber("-2,5"), -2.5);
    assert.strictEqual(ctx.parseSignedNumber("4"), 4);
    assert.ok(isNaN(ctx.parseSignedNumber("-")));
    assert.ok(isNaN(ctx.parseSignedNumber("--3")));
});

test("offset 0 makes the mark touch the edge, inside or outside", () => {
    const inside = ctx.computeLayout(board, { ...base, offset: 0, arrow: false });
    const outside = ctx.computeLayout(board, { ...base, offset: 0, outside: true, arrow: false });
    assert.deepStrictEqual(point(inside.marks[0]), [2.5, -2.5]);
    assert.deepStrictEqual(point(outside.marks[0]), [-2.5, 2.5]);
});

test("negative offset inside the artboard puts marks past the edge", () => {
    // offset -10 mm, 5 mm marks: centre at 2.5 - 10 = -7.5 mm, i.e. 7.5 mm outside
    const L = ctx.computeLayout(board, { ...base, offset: -10 * P });
    assert.deepStrictEqual(point(L.marks[0]), [-7.5, 7.5]);
});

test("mark counts must be whole numbers of 2 or more", () => {
    assert.strictEqual(ctx.parseCount("3"), 3);
    assert.ok(isNaN(ctx.parseCount("1")));
    assert.ok(isNaN(ctx.parseCount("2,5")));
    assert.ok(isNaN(ctx.parseCount("")));
});

test("corners and intermediate marks by interval", () => {
    const L = ctx.computeLayout(board, base);
    assert.strictEqual(L.error, null);
    assert.deepStrictEqual(Array.from(L.marks.slice(0, 4), point), [[7.5, -7.5], [992.5, -7.5], [7.5, -692.5], [992.5, -692.5]]);
    assert.strictEqual(L.perHorizontal, 3);
    assert.strictEqual(L.perVertical, 3);
    assert.strictEqual(L.marks.length, 8);
});

test("marks outside the artboard", () => {
    const L = ctx.computeLayout(board, { ...base, outside: true });
    assert.deepStrictEqual(point(L.marks[0]), [-7.5, 7.5]);
});

test("no intermediate marks when the corners are exactly one interval apart", () => {
    const L = ctx.computeLayout({ left: 0, top: 0, right: 615 * P, bottom: -615 * P }, base);
    assert.strictEqual(L.marks.length, 4);
});

test("an artboard that is too small is refused", () => {
    const L = ctx.computeLayout({ left: 0, top: 0, right: 20 * P, bottom: -200 * P }, base);
    assert.ok(L.error);
});

test("orientation mark is left out when it does not fit", () => {
    const L = ctx.computeLayout({ left: 0, top: 0, right: 30 * P, bottom: -200 * P }, base);
    assert.strictEqual(L.arrow, null);
    assert.ok(L.warning);
});

test("orientation mark: clear gap of twice the mark size, at each corner", () => {
    const expected = { bl: [22.5, -692.5], br: [977.5, -692.5], tl: [22.5, -7.5], tr: [977.5, -7.5] };
    for (const corner of Object.keys(expected)) {
        const L = ctx.computeLayout(board, { ...base, arrowCorner: corner });
        assert.deepStrictEqual(point(L.arrow), expected[corner], corner);
    }
});

test("spacing by number of marks", () => {
    const L = ctx.computeLayout(board, { ...base, maxInterval: NaN, countX: 5, countY: 4, arrow: false });
    assert.strictEqual(L.perHorizontal, 5);
    assert.strictEqual(L.perVertical, 4);
    assert.strictEqual(L.marks.length, 4 + 2 * 3 + 2 * 2);
    assert.ok(Math.abs(L.spacingX / P - 246.25) < 1e-6);
    assert.ok(Math.abs(L.spacingY / P - 228.333333) < 1e-4);
});

test("two marks per side means corners only", () => {
    const L = ctx.computeLayout(board, { ...base, countX: 2, countY: 2, arrow: false });
    assert.strictEqual(L.marks.length, 4);
});

test("too many marks is refused", () => {
    const L = ctx.computeLayout(board, { ...base, countX: 200, countY: 3, arrow: false });
    assert.ok(L.error && /too many/.test(L.error));
});

test("switching from interval to counts and back keeps the counts", () => {
    const a = ctx.computeLayout(board, { ...base, maxInterval: 300 * P, arrow: false });
    const interval = Math.ceil(Math.max(a.spacingX, a.spacingY) / P - 1e-6);
    const b = ctx.computeLayout(board, { ...base, maxInterval: interval * P, arrow: false });
    assert.strictEqual(b.perHorizontal, a.perHorizontal);
    assert.strictEqual(b.perVertical, a.perVertical);
});

test("bleed is read from the page boxes of an .ai file", () => {
    const page = "<</ArtBox[10 10 50 50]/BleedBox[0.0 0.0 289.134 194.436]/MediaBox[0.0 0.0 289.134 194.436]" +
        "/TrimBox[2.83464 2.83464 286.299 191.601]/Type/Page>>";
    assert.deepStrictEqual({ ...ctx.bleedFromPdfText("%PDF " + page) },
        { left: 2.835, bottom: 2.835, right: 2.835, top: 2.835 });
    assert.deepStrictEqual({ ...ctx.bleedFromPdfText("<</MediaBox[0 0 100 100]/TrimBox[0 0 100 100]>>") },
        { left: 0, bottom: 0, right: 0, top: 0 });
    assert.strictEqual(ctx.bleedFromPdfText("no boxes here"), null);
});

test("settings from version 1 are read", () => {
    const old = "({size:3,shape:'Square',offset:'7.5',maxInterval:'600',useSelection:true,allArtboards:false,usageCount:4})";
    assert.deepStrictEqual({ ...ctx.parseSettings(old) },
        { size: 3, shape: "Square", offset: "7.5", maxInterval: "600", useSelection: true, allArtboards: false, usageCount: 4 });
});

test("settings survive saving and reading, with Mac line endings", () => {
    const settings = { size: "5", layerName: 'Reg "A"\\x, y}', replace: false, lockLayer: true, usageCount: 12, offset: "" };
    const text = ctx.serializeSettings(settings);
    JSON.parse(text);
    assert.deepStrictEqual({ ...ctx.parseSettings(text) }, settings);
    assert.deepStrictEqual({ ...ctx.parseSettings(text.replace(/\n/g, "\r")) }, settings);
});

test("file name matches the version in the script", () => {
    assert.strictEqual(scriptName, "GoVinyl_Regmark_v" + ctx.VERSION + ".js");
});

test("source is ASCII only", () => {
    const source = fs.readFileSync(scriptPath, "utf8");
    assert.ok(/^[\x00-\x7F]*$/.test(source));
});

console.log(passed + " passed" + (process.exitCode ? ", some FAILED" : ""));
