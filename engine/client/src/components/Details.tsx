import { marked } from 'marked';
import { site } from '../site';
import { CopyField } from './CopyField';

const rows = () => [
  ...site.metadata.map(({ label, value }) => [label, value] as const),
  ['Dimensions', `${site.width.toLocaleString()} × ${site.height.toLocaleString()} px`] as const,
];

export function Details() {
  const { manifestUrl, infoUrl, fullUrl, originalUrl, description, attribution, rights } = site;
  return (
    <div className="details">
      <section>
        {description && <div className="prose" dangerouslySetInnerHTML={{ __html: marked.parse(description) as string }} />}
        <table className="meta">
          <tbody>
            {rows().map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
            {attribution && (
              <tr>
                <th scope="row">Attribution</th>
                <td>{attribution}</td>
              </tr>
            )}
            {rights && (
              <tr>
                <th scope="row">Rights</th>
                <td><a href={rights}>{rights}</a></td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Use this image in any IIIF viewer</h2>
        <CopyField label="Manifest URL" value={manifestUrl} />
        <CopyField label="Image service (info.json)" value={infoUrl} />
        <p className="links">
          <a href={`https://projectmirador.org/embed/?iiif-content=${encodeURIComponent(manifestUrl)}`}>Open in Mirador</a>
          <a href={`https://uv-v4.netlify.app/#?manifest=${encodeURIComponent(manifestUrl)}`}>Open in Universal Viewer</a>
          <a href={manifestUrl}>View manifest</a>
        </p>
        {(fullUrl || originalUrl) && (
          <p className="links">
            {fullUrl && <a href={fullUrl}>Download full-size JPEG</a>}
            {originalUrl && <a href={originalUrl}>Download original file</a>}
          </p>
        )}
      </section>
    </div>
  );
}
