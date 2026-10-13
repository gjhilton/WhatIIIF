/** Public URL of the original committed file, or undefined when not running against a GitHub repo. */
export function originalUrl({ repo, ref, path, lfs }) {
  if (!repo) return undefined;
  const host = lfs ? 'media.githubusercontent.com/media' : 'raw.githubusercontent.com';
  const encoded = `${ref}/${path}`.split('/').map(encodeURIComponent).join('/');
  return `https://${host}/${repo}/${encoded}`;
}
