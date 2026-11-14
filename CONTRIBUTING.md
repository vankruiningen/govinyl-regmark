# Contributing

Thanks for helping improve GoVinyl Regmark! Bug reports, ideas and code changes are all welcome.

## Reporting a problem or an idea
Use [Issues](https://github.com/vankruiningen/govinyl-regmark/issues/new/choose) and pick the form that fits. Please include your Illustrator version, macOS or Windows, and your plotter and cutting software (GoProduce, GoSign or something else). A screenshot or a small `.ai` file that shows the problem helps a lot.

## Changing the code
1. Fork the repository and create a branch for your change.
2. Edit `GoVinyl_Regmark_v….js`. Keep it one file, so people can install it by downloading a single script. For a new version, raise `VERSION` in the script, rename the file to match (`git mv GoVinyl_Regmark_v2.1.js GoVinyl_Regmark_v2.2.js`) and add a section to `CHANGELOG.md`; the tests check that file name and version agree.
3. Run the tests (see below) and try the script in Illustrator.
4. Describe your change in `CHANGELOG.md`.
5. Open a pull request and describe what you changed and how you tested it.

### Things to know about Illustrator scripts
- Illustrator runs scripts as **ExtendScript**, an old JavaScript dialect (ES3): no `let`, `const`, arrow functions, `JSON`, `Array.indexOf` or template strings.
- ExtendScript's regular expressions lose capture groups in some alternations. Keep regular expressions simple, or parse by hand.
- Keep the source file ASCII only; use escapes such as `"\u00A9"` (for ©) for special characters.
- Coordinates are in points and the y axis runs upwards. On a Large Canvas document Illustrator scales everything by `doc.scaleFactor`.

## Running the tests
The geometry and settings code has no Illustrator dependencies and can be tested with [Node.js](https://nodejs.org):

```bash
node tests/regmarks.test.js
```

The tests cover mark positions, spacing by interval and by count, the orientation mark, and reading and writing settings. The dialog and the drawing in Illustrator still need a manual check.

## License
By contributing you agree that your contribution is released under the [GNU General Public License v3.0](LICENSE), like the rest of the project.
