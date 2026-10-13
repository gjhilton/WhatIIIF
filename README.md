# whatiiif

Turn one high-resolution image into a zoomable [IIIF](https://iiif.io) image on GitHub Pages. No server:
a GitHub Action slices your image into static tiles and publishes them with a preview page.

## Use it

1. Click **Use this template** to make your own copy of this repository.
2. In your copy: **Settings → Pages → Source: GitHub Actions**.
3. Put **one** image (TIFF, PNG or JPEG) in `content/`, commit and push.

A minute or so later your site is live at `https://<you>.github.io/<repo>/`. It shows the image in
OpenSeadragon (switchable to Mirador) and gives you two URLs to paste into any IIIF viewer:

- **Manifest** – `…/iiif/manifest.json`
- **Image service** – `…/iiif/image/info.json`

Large images (over 100 MB) work: `.gitattributes` already sends images in `content/` through Git LFS.
GitHub's free LFS quota is 1 GB storage and 1 GB bandwidth a month, and each build downloads the image once.

## Describe it (optional)

Edit `content/whatiiif.toml` (every setting is commented there) for title, attribution, rights,
extra metadata and viewer choice. Add `content/description.md` for longer text shown on the page.
`rights` takes a Creative Commons or RightsStatements.org URL, the only kinds IIIF viewers recognise;
put any other terms in `attribution`.

## What gets published

IIIF Image API 3.0 level 0 tiles (JPEG, sRGB), small whole-image sizes, a full-size JPEG and a Presentation 3.0 manifest.
Photos are turned upright if the camera only recorded their rotation, and colours are converted to sRGB using the
image's embedded colour profile, so wide-gamut and CMYK originals look the same at every zoom level.
The original file is **not** copied to the site; the manifest links to it in your repository. If the site would exceed
GitHub Pages' size limit, the full-size JPEG is dropped first. Set `publish.full = false` to skip it.

## Try it locally

Needs Node 22+ and libvips (`brew install vips` / `apt install libvips-tools`).

```sh
npm install
npm run build      # slices content/ into dist/
npm run preview    # http://localhost:4173
npm test
```

`npm run test:smoke` goes further: it builds sample sites and opens them in a real browser with both viewers,
failing if either asks for a file that was not published. It needs a browser once:
`npx playwright install chromium-headless-shell`.

Locally the manifest and image ids point at `http://localhost:4173`; on GitHub they are derived from your Pages URL
(or `base_url` in the TOML for a custom domain).

## Staying up to date

Everything in `engine/` (slicer, manifest builder, validator, preview page) is owned by the template; everything in
`content/` is yours. The **Update** workflow opens a pull request when a new template release appears, replacing only
`engine/`, `package.json` and `package-lock.json`. Enable **Settings → Actions → General → Allow GitHub Actions to
create and approve pull requests** for it. If `.github/workflows/` changed upstream the PR says so, and you copy
those files by hand (GitHub does not let automation edit workflow files).

Template maintainers: set `engine/UPSTREAM` to `owner/repo` and bump `engine/VERSION` with each release.

## Licence

MIT © g.j.hilton. See [LICENSE](LICENSE).
