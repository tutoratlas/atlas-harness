# Commercial Licensing Readiness — TODOs Before Shipping

> **Not legal advice.** This is an engineering checklist derived from auditing the
> repo's `LICENSE`, the vendored code in `.repos/`, all declared dependencies, and
> `assets/`. Have counsel confirm before commercial release.

## Summary

The codebase is a fork of **T3 Code** (© T3 Tools Inc, **MIT**). MIT permits commercial
use, modification, and resale **provided the copyright notice + license text are
retained**. The dependency tree is overwhelmingly permissive (MIT / Apache-2.0 / BSD /
ISC) with **no copyleft (GPL/AGPL/LGPL/SSPL) and no non-commercial licenses**.

Three categories of work are required before a commercial ship: **(1) rebrand**,
**(2) third-party terms & paid-service review**, **(3) attribution hygiene**.

---

## 1. Rebrand — remove T3 trademark/brand assets (REQUIRED)

MIT grants *copyright*, **not trademark**. The "T3 Code" / "T3 Tools" name and logos
cannot ship under our product.

- [ ] Replace/remove brand assets in `assets/prod/`, `assets/dev/`, `assets/nightly/`
      (`logo.svg`, `t3-black-*` favicons/icons, `black-*` / `blueprint-*` app icons).
- [ ] Find & replace hardcoded "T3 Code" / "T3 Tools" / "t3" product strings across the
      codebase (app titles, window/menu labels, `package.json` names like `@t3tools/*`,
      installer/winget/brew/AUR identifiers in `README.md`, update-server URLs).
- [ ] Replace product URLs/domains and Discord/support links.
- [ ] Confirm desktop app metadata (electron-builder appId, product name, publisher) is
      rebranded so releases don't ship as "T3 Code".

## 2. Third-party terms & paid services (REQUIRED REVIEW)

- [ ] **`@anthropic-ai/claude-agent-sdk`** — the only *proprietary*-licensed dep
      (`SEE LICENSE IN README`). Governed by **Anthropic Commercial ToS**; requires paid
      API/model access. Confirm our use complies and budget for metered API cost.
- [ ] **Bundled coding-agent CLIs** (Codex, Claude Code, Cursor, OpenCode) — the app is a
      GUI wrapper. Each has its **own ToS** that end-users must satisfy. Decide what we
      bundle vs. require users to install/authenticate themselves, and document it.
- [ ] **Clerk (`@clerk/*`)** — SDK is MIT (fine to embed), but the **hosted service
      requires a paid plan beyond the free tier** at commercial scale. Confirm plan/pricing
      or swap auth provider.
- [ ] Confirm we use base **`uniwind`** (MIT) only — **NOT** the separate proprietary
      `uniwind-pro` paid package.

## 3. Attribution & license hygiene (REQUIRED)

- [ ] **Retain** the existing MIT `LICENSE` (© T3 Tools Inc) and its copyright notice in
      distributed artifacts — required by MIT even after rebranding.
- [ ] Generate a `NOTICE` / third-party-licenses file aggregating dependency licenses
      (MIT/Apache-2.0/BSD/ISC) and ship it with the app (e.g. `license-checker` /
      `oss-attribution-generator` against the installed tree).
- [ ] Apache-2.0 deps (e.g. `@pierre/diffs`, Playwright, vendored `.repos/alchemy-effect`)
      require preserving any `NOTICE` content and the license text.
- [ ] Vendored reference code in `.repos/` (`effect-smol` MIT, `alchemy-effect`
      Apache-2.0): confirm these are dev-only references and **not bundled** into shipped
      artifacts; if bundled, include their LICENSE files.
- [ ] Fonts (DM Sans, JetBrains Mono via fontsource) are **SIL OFL** — commercial-OK, but
      include the OFL text if font files are redistributed.

## 4. Final verification (REQUIRED)

- [ ] Run a full dependency license scan against the **installed** tree (no `node_modules`
      present at audit time — declared-deps analysis only). Confirm zero
      GPL/AGPL/LGPL/SSPL/non-commercial licenses reach the shipped bundle.
- [ ] Legal sign-off on the above before public/commercial release.

---

## License facts (reference)

| Component | License | Commercial | Note |
|---|---|---|---|
| This repo (T3 Code) | MIT (© T3 Tools Inc) | ✅ | Retain notice; trademark NOT granted |
| `.repos/effect-smol` | MIT | ✅ | Reference checkout |
| `.repos/alchemy-effect` | Apache-2.0 | ✅ | Preserve NOTICE |
| Dependencies (135 declared) | MIT / Apache-2.0 / BSD / ISC | ✅ | No copyleft found |
| `@anthropic-ai/claude-agent-sdk` | Proprietary | ⚠️ | Anthropic Commercial ToS + paid API |
| Clerk service | MIT SDK / SaaS | ⚠️ | Paid plan at scale |
| `uniwind` (base) | MIT | ✅ | Avoid proprietary `uniwind-pro` |
| Fonts (DM Sans, JetBrains Mono) | SIL OFL | ✅ | Include OFL if redistributed |
