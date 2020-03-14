#!/usr/bin/env node
/* eslint-env node */
const fs = require('fs-extra')
const path = require('path')
const assert = require('assert')
const globby = require('globby')
const cheerio = require('cheerio')
const trimNewlines = require('trim-newlines')
const yargs = require('yargs')
const merge = require('lodash.merge')
const keywords = require('../keywords.json')

// This script generates a JSON file that contains
// information about input SVG files.

const {argv} = yargs
  .usage('Usage: $0 --input <input file paths> --output <output file path>')
  .example('$0 --input icons/**/*.svg --output build/data.json')
  .option('input', {
    alias: 'i',
    type: 'array',
    demandOption: true,
    describe: 'Input SVG files'
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    describe: 'Ouput JSON file. Defaults to stdout if no output file is provided.'
  })

// The `argv.input` array could contain globs (e.g. "**/*.svg").
const filePaths = globby.sync(argv.input)

if (filePaths.length === 0) {
  // eslint-disable-next-line no-console
  console.error('Input file(s) not found')
  process.exit(1)
}

let exitCode = 0

const icons = filePaths.map(filepath => {
  try {
    const filename = path.parse(filepath).base
    const filenamePattern = /(.+)-([0-9]+).svg$/

    assert(
      filenamePattern.test(filename),
      `${filename}: Invalid filename. Please append the height of the SVG to the end of the filename (e.g. alert-16.svg).`
    )

    const [, name, height] = filename.match(filenamePattern)
    const svg = fs.readFileSync(path.resolve(filepath), 'utf8')
    const svgElement = cheerio.load(svg)('svg')
    const svgWidth = parseInt(svgElement.attr('width'))
    const svgHeight = parseInt(svgElement.attr('height'))
    const svgViewBox = svgElement.attr('viewBox')
    const svgPath = trimNewlines(svgElement.html()).trim()

    assert(svgWidth, `${filename}: Missing width attribute.`)
    assert(svgHeight, `${filename}: Missing height attribute.`)
    assert(svgViewBox, `${filename}: Missing viewBox attribute.`)
    assert(svgHeight === parseInt(height), `${filename}: Height in filename does not match height attribute of SVG`)

    const viewBoxPattern = /0 0 ([0-9]+) ([0-9]+)/

    assert(viewBoxPattern.test(svgViewBox), `${filename}: Invalid viewBox attribute.`)

    const [, viewBoxWidth, viewBoxHeight] = svgViewBox.match(viewBoxPattern)

    assert(svgWidth === parseInt(viewBoxWidth), `${filename}: width attribute and viewBox width do not match.`)
    assert(svgHeight === parseInt(viewBoxHeight), `${filename}: height attribute and viewBox height do not match.`)

    return {
      name,
      keywords: keywords[name] || [],
      width: svgWidth,
      height: svgHeight,
      path: svgPath
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error)
    // Instead of exiting immediately, we set exitCode to 1 and continue
    // iterating through the rest of the SVGs. This allows us to identify all
    // the SVGs that have errors, not just the first one. An exit code of 1
    // indicates that an error occured.
    // Reference: https://nodejs.org/api/process.html#process_exit_codes
    exitCode = 1
    return null
  }
})

// Exit early if any errors occured.
if (exitCode !== 0) {
  process.exit(exitCode)
}

const iconsByName = icons.reduce(
  (acc, icon) =>
    merge(acc, {
      [icon.name]: {
        name: icon.name,
        keywords: icon.keywords,
        heights: {
          [icon.height]: {
            width: icon.width,
            path: icon.path
          }
        }
      }
    }),
  {}
)

if (argv.output) {
  fs.outputJsonSync(path.resolve(argv.output), iconsByName)
} else {
  process.stdout.write(JSON.stringify(iconsByName))
}
