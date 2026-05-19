import chalk from "chalk";

interface StyleOptions {
  color?: boolean;
}

export function label(text: string, options: StyleOptions = {}): string {
  if (options.color === false) {
    return text;
  }
  if (options.color === true) {
    return `\u001b[96m${text}\u001b[39m`;
  }
  return chalk.cyan(text);
}

export function statusOk(text: string): string {
  return chalk.green(text);
}

export function statusWarning(text: string): string {
  return chalk.yellow(text);
}

export function statusError(text: string): string {
  return chalk.red(text);
}

export function formatKeyValue(
  key: string,
  value: string,
  width = 12,
  options: StyleOptions = {},
): string {
  return `${label(`${key}:`.padEnd(width), options)} ${value}`;
}
