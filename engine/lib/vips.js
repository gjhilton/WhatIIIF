import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const maxBuffer = 64 * 1024 * 1024;

export const vips = (...args) => run('vips', args.map(String), { maxBuffer });

/** Whether the image has an embedded ICC colour profile (vipsheader prints the whole profile, or fails when there is none). */
export const hasProfile = (file) => run('vipsheader', ['-f', 'icc-profile-data', file], { maxBuffer }).then(() => true, () => false);

/** Reads one header field; enum values come back as their lowercase nick (e.g. "srgb", "uchar"). */
export async function header(file, field) {
  const { stdout } = await run('vipsheader', ['-f', field, file]);
  const value = stdout.trim();
  const enumValue = value.match(/VIPS_[A-Z]+_(\w+)\)?$/);
  return enumValue ? enumValue[1].toLowerCase() : value;
}
