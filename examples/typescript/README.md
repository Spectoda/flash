# Using Esptool-JS in a Typescript environment

This example contains code in `src/index.ts` which is invoked from `index.html`. We use Parcel to bundle resulting files for simplicity.

**NOTE:** This example is linked to the documentation generated from the source code. You may remove that dependency by removing `./docs/index.html` from `src/index.html` if needed. The NPM commands below will also generate documentation.

## Prerequirement

Put the firmware binary files (e.g., `bootloader.bin`, `firmware.bin`, etc.) into the `static/fw` directory.
**Note:** The application loads firmware from `static/fw` at runtime, so make sure your FW files are present there.

## Testing it locally

```bash
npm install
npm run dev
```

Then open http://localhost:1234 in Chrome or Edge. The `npm run dev` step will start Parcel, which launches a local HTTP server serving `index.html` with compiled `index.ts`.

## Generate build to publish

```bash
npm install
npm run build
```

Copy the contents of `dist` to your static pages service (such as Github Pages).
