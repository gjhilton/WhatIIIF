import { useEffect, useState } from 'react';
import { site, type ViewerId } from './site';
import { viewers } from './viewers';
import { ViewerPane } from './components/ViewerPane';
import { Details } from './components/Details';

const initialViewer = (): ViewerId => {
  const asked = new URLSearchParams(location.search).get('viewer');
  return asked && asked in viewers ? (asked as ViewerId) : site.viewer;
};

export function App() {
  const [viewer, setViewer] = useState(initialViewer);
  useEffect(() => {
    document.title = site.title;
  }, []);

  const choose = (id: ViewerId) => {
    setViewer(id);
    const url = new URL(location.href);
    url.searchParams.set('viewer', id);
    history.replaceState(null, '', url);
  };

  return (
    <>
      <header className="masthead">
        <div>
          <h1>{site.title}</h1>
          {site.summary && <p>{site.summary}</p>}
        </div>
        <div className="toggle" role="group" aria-label="Viewer">
          {(Object.keys(viewers) as ViewerId[]).map((id) => (
            <button key={id} type="button" aria-pressed={id === viewer} onClick={() => choose(id)}>
              {viewers[id].label}
            </button>
          ))}
        </div>
      </header>
      <ViewerPane viewer={viewer} />
      <main className="content">
        <Details />
      </main>
    </>
  );
}
