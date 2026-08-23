/**
 * Console formatting helpers for the release tooling.
 *
 * Colour is opt-out rather than assumed: a redirected stream, a `NO_COLOR`
 * in the environment, or a `--no-color` on the command line all fall back
 * to plain text, so output stays readable in a CI log or a captured file.
 * Everything here is ASCII on purpose — these scripts run in Windows
 * consoles that still default to a legacy code page.
 */

// Escaped rather than literal ESC bytes: the repo normalises line endings
// and these files travel through Windows editors, so raw control
// characters in source are a needless hazard.
const CODES = {
  reset: '[0m',
  bold: '[1m',
  dim: '[2m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  blue: '[34m',
  magenta: '[35m',
  cyan: '[36m',
  white: '[37m',
};

/**
 * The style names `paint` accepts. Named so that a caller passing a colour
 * that does not exist is a type error rather than a silently unpainted line.
 *
 * @typedef {keyof typeof CODES} Style
 */

let colourEnabled = false;

/**
 * Decides once, at startup, whether this run emits ANSI colour.
 *
 * @param {{ forceOff?: boolean }} [options]
 */
export function configureColour(options = {}) {
  if (options.forceOff) {
    colourEnabled = false;
    return colourEnabled;
  }
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') {
    colourEnabled = false;
    return colourEnabled;
  }
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') {
    colourEnabled = true;
    return colourEnabled;
  }
  colourEnabled = Boolean(process.stdout.isTTY);
  return colourEnabled;
}

/**
 * Wraps text in one or more colour codes, or returns it untouched when
 * colour is disabled.
 *
 * @param {string} text
 * @param {...Style} styles
 */
export function paint(text, ...styles) {
  if (!colourEnabled || styles.length === 0) return text;
  const prefix = styles.map((style) => CODES[style] ?? '').join('');
  return `${prefix}${text}${CODES.reset}`;
}

/** Writes a line to stdout. */
export function say(text = '') {
  process.stdout.write(`${text}\n`);
}

/**
 * Writes a dim, indented line — used for the command a step is about to run.
 *
 * @param {string} text
 */
export function detail(text) {
  say(paint(`   ${text}`, 'dim'));
}

/**
 * Writes an indented `[OK] ...` line.
 *
 * @param {string} text
 */
export function ok(text) {
  say(paint(`   [OK]   ${text}`, 'green'));
}

/**
 * Writes an indented `[WARN] ...` line.
 *
 * @param {string} text
 */
export function warn(text) {
  say(paint(`   [WARN] ${text}`, 'yellow'));
}

/**
 * Writes an indented `[FAIL] ...` line.
 *
 * @param {string} text
 */
export function fail(text) {
  say(paint(`   [FAIL] ${text}`, 'red'));
}

/**
 * Formats a timestamp as `yyyy-MM-dd HH:mm:ss`, local time.
 *
 * @param {Date} date
 */
export function formatTimestamp(date) {
  /** @param {number} value */
  const pad = (value) => String(value).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return stamp;
}
