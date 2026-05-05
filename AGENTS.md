# AGENTS.md — `modules/flash`

Pravidla pro TypeScript fork/vrstvu `esptool-js` a web flashing flow pro ESP
controllery.

## Role modulu

- Modul vlastní Web Serial flashing knihovnu nad `esptool-js` a příklady pro
  firmware flashing.
- Veřejná knihovní hranice je `src/index.ts` a build výstupy `lib/index.js`,
  `lib/index.d.ts` a `bundle.js`.
- Spectoda Studio integrace, firmware hosting a produkční release flow patří
  mimo tenhle public/library povrch.

## Nejdřív otevři

- `README.md`
- `package.json`
- `CHANGELOG.md`
- `src/index.ts`
- `src/webserial.ts`
- `src/esploader.ts`
- relevantní example podklady, pokud řešíš browser flow

## Pravidla práce

- Používej npm. `package-lock.json` je lokální source of truth pro dependency
  pinning v tomhle modulu.
- Při změně public API aktualizuj exporty v `src/index.ts` a ověř generované
  typy přes build.
- `npm test` zatím není reálný test suite; nepoužívej ho jako validační gate.
- Flash, erase a reset operace jsou destruktivní pro připojený ESP controller.
  Nespouštěj je bez jasného targetu, firmware binárek a souhlasu.

## Ověření

- `npm install`
- `npm run build`
- `npm run lint`
- Browser smoke přes Browser Use jen pro UI/example flow; reálné Web Serial
  flashing funguje jen v Chrome/Edge s fyzickým ESP zařízením a uživatelským
  výběrem portu.
