# Roadmap and stage gates

Through the Chrome-extension phase, Leaf remains a working codename. Use descriptive public-facing naming; the extension name is still undecided and must avoid implying official arXiv affiliation.

Stages are ordered learning goals, not deadlines. Move forward only when the gate is evidenced; unresolved failures become issues with fixtures. Individual task state belongs in the maintainer's task tracker (access may be private).

| Stage | Bounded outcome | Gate before expanding |
| --- | --- | --- |
| 0. Existing paper site | Maintain the two published reading editions and source-faithful build | Reproducible build, regression tests, accessible responsive UI, explicit rights and provenance |
| 1. Import robustness | Test an unfamiliar third paper locally, then a varied 10–20-paper corpus | No silent loss of scientific content; every unsupported structure diagnosed; unknown input preserved; visual and semantic regressions recorded |
| 2. Minimal Chrome extension | Apply the reader to an existing arXiv HTML page, with an easy return to the original | Shared import/render path works without paper-specific branches; scoped permissions, no accounts, no hosted paper copies; keyboard/mobile-equivalent responsive and performance checks |
| 3. Local-first library / web | Save/import, organize, and search locally with exportable data | Versioned schema and migrations, source identity, offline behavior, rights-aware import/export, stable annotation anchors and recovery tested |
| 4. Native clients | Evaluate Mac first or another platform based on actual demand; later iOS/Android | Shared core is stable, platform accessibility/offline/storage needs understood; platform order is a separate decision |
| 5. Collaboration | Optional sharing and collaboration, only with explicit scope | Consent, access control, provenance, conflict handling, export/deletion, and content-sharing rights designed before implementation |

## Next milestone: one unfamiliar paper, local only

1. Select a third paper with useful structural differences (for example tables, multi-line mathematics, citations, or author metadata). Record the versioned source and license.
2. Import/read locally; do not add the full paper or figures to the public repository or published site without an appropriate license or permission.
3. Record source fingerprint, importer/normalizer versions, supported structures, diagnostics, and preservation results.
4. Compare representative mathematics, references, figures, and headings against the original HTML/PDF; check desktop and narrow layouts.
5. Add minimal redistributable synthetic regression fixtures for failures. Propose generic fixes separately; retain unknown source content.
6. Exit with an audit report and prioritized issues, not a new public paper release.

Only after this gate, grow the local corpus to 10–20 varied papers. Include different subject areas and structural patterns, rather than 20 near-identical templates. Record coverage and failures honestly; a passing corpus is not proof of arbitrary LaTeX support.
