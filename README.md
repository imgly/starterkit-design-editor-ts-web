# Design Editor Starter Kit

Create stunning graphics and layouts for your web app — add text, images, shapes, and export to multiple formats. Built with [CE.SDK](https://img.ly/creative-sdk) by [IMG.LY](https://img.ly), runs entirely in the browser with no server dependencies.

<p>
  <a href="https://img.ly/docs/cesdk/js/starterkits/design-editor-8unj9u/">Documentation</a>
</p>

![Design Editor starter kit showing a graphic design interface](./hero.webp)

## Getting Started

### Clone the Repository

```bash
git clone https://github.com/imgly/starterkit-design-editor-ts-web.git
cd starterkit-design-editor-ts-web
```

### Install Dependencies

```bash
npm install
```

### Download Assets

CE.SDK requires engine assets (fonts, icons, UI elements) served from your `public/` directory.

```bash
curl -O https://cdn.img.ly/packages/imgly/cesdk-js/$UBQ_VERSION$/imgly-assets.zip
unzip imgly-assets.zip -d public/
rm imgly-assets.zip
```

### Run the Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

## Configuration

### Loading Content

Load content into the editor using one of these methods:

```typescript
// Create a blank design canvas
await cesdk.actions.run('scene.create');

// Load from a template archive
await cesdk.loadFromArchiveURL('https://example.com/template.zip');

// Load from a scene file
await cesdk.loadFromURL('https://example.com/scene.json');

// Load from an image
await cesdk.createFromImage('https://example.com/image.jpg');
```

See [Open the Editor](https://img.ly/docs/cesdk/web/guides/open-editor/) for all loading methods.

### Theming

```typescript
cesdk.ui.setTheme('dark'); // 'light' | 'dark' | 'system'
```

See [Theming](https://img.ly/docs/cesdk/web/ui-styling/theming/) for custom color schemes and styling.

### Localization

```typescript
cesdk.i18n.setTranslations({
  de: { 'common.save': 'Speichern' }
});
cesdk.i18n.setLocale('de');
```

See [Localization](https://img.ly/docs/cesdk/web/ui-styling/localization/) for supported languages and translation keys.

## Architecture

```
starterkit-design-editor-ts-web/
├── src/
│   ├── index.ts              # Application entry point
│   └── imgly/
│       ├── index.ts          # Editor initialization
│       ├── config/
│       │   ├── plugin.ts         # Main plugin orchestration
│       │   ├── actions.ts        # Load, Save, Export actions
│       │   ├── features.ts       # Feature toggles
│       │   ├── settings.ts       # Engine behavior
│       │   ├── i18n.ts           # Internationalization
│       │   └── ui/               # UI layout configuration
│       └── plugins/
│           └── background-removal.ts
├── public/                   # Static assets
├── package.json
└── vite.config.ts
```

## Key Capabilities

- **Text Editing** – Typography with fonts, styles, and effects
- **Image Placement** – Add, crop, and arrange images
- **Shapes & Graphics** – Vector shapes and design elements
- **Templates** – Start from pre-built design templates
- **Multi-Page** – Create multi-page documents
- **Export** – PNG, JPEG, PDF with quality controls

## Prerequisites

- **Node.js v20+** with npm – [Download](https://nodejs.org/)
- **Supported browsers** – Chrome 114+, Edge 114+, Firefox 115+, Safari 15.6+

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Editor doesn't load | Verify assets are accessible at `baseURL` |
| Assets don't appear | Check `public/assets/` directory exists |
| Watermark appears | Add your license key |

## Documentation

For complete integration guides and API reference, visit the [Design Editor Documentation](https://img.ly/docs/cesdk/starterkits/design-editor/).

## Translate (AI Image Translation)

The Translate dock entry takes a selected image block with rasterized text
and produces one new page per checked target language, each containing the
image with text translated by an image-edit LLM.

### Configuration

1. Copy `.env.example` to `.env` and set `VITE_IMGLY_AI_PROXY_URL` to your
   IMG.LY proxy URL.
2. Restart the dev server.

### Usage

1. Open the editor and select an image block (one with a raster image fill).
2. Click the **Translate** entry in the dock.
3. Pick a model from the dropdown (Nano Banana Edit, Gemini 2.5 Flash, etc.).
4. Check the target languages (German, English, Spanish, Russian, Chinese).
5. Click **Translate**.

For each checked language, a new page is appended to the document containing
only the translated image. The source page is left unchanged. The whole batch
is one undo step.

### Manual smoke checklist

1. Open the editor, load the default marketing scene, select the image block.
2. Open the Translate dock entry — panel opens, model dropdown populated,
   no languages checked, Translate button disabled with inline hint.
3. Check German, click Translate — one new page appended; original page
   unchanged; ⌘Z / Ctrl+Z undoes the new page.
4. Re-select source image, check three languages, click Translate — three
   new pages appended in checked order.
5. During a run, click Cancel — no pages appended; toast confirms. Note:
   cancellation takes effect after the source image finishes uploading to
   the provider's storage (a known limitation of `@fal-ai/client` —
   `storage.upload` does not yet honor `AbortSignal`). For small demo
   images this is near-instant.
6. Unset `VITE_IMGLY_AI_PROXY_URL`, restart the dev server, click Translate
   — clear toast about missing proxy URL.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">Built with <a href="https://img.ly/creative-sdk?utm_source=github&utm_medium=project&utm_campaign=starterkit-design-editor">CE.SDK</a> by <a href="https://img.ly?utm_source=github&utm_medium=project&utm_campaign=starterkit-design-editor">IMG.LY</a></p>
