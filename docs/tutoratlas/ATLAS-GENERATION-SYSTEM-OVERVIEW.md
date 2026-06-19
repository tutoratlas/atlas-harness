# Atlas Tuition — Educational Material Generation System
## Technical Overview for CTO (Hanwei)

**Document Version:** 1.0  
**Date:** May 2026  
**Author:** Joe Long  
**Classification:** Internal Technical Documentation

---

## Executive Summary

This document provides a comprehensive technical overview of the codebase and systems I have built to generate educational materials for General Paper (GP), Integrated Programme (IP) English, and Secondary English tuition. The system supports multiple students (Trevor, Ryan, Caelen, Jake, and Ms Zhang) with differentiated content, automated PDF generation, and leverages LLMs for essay feedback through OCR-based image processing.

---

## 1. System Architecture Overview

### 1.1 Core Philosophy

The generation system follows a **hierarchical agent-based architecture** where:

- **Repository-level rules** define universal standards (British English, universal document format, PDF generation standards)
- **Folder-level AGENTS.md files** provide student-specific scaffolding and pedagogical approaches
- **Skills files** encode reusable generation workflows for common tasks
- **Python scripts** handle PDF rendering, corpus ingestion, and content validation

### 1.2 Directory Structure

```
Atlas Tuition/
??? .cursor/rules/                    # Universal workspace rules
?   ??? universal-document-format.mdc  # No student/date metadata in documents
?   ??? pdf-generation-standards.mdc   # UTF-8, font handling, Chrome rendering
?   ??? chinese-pdf-generation.mdc     # CJK font support for Ms Zhang
??? .cursor/skills/                   # Student-specific skills
?   ??? gp-essay-question-curator.md   # Question bank curation for A-Level
?   ??? caelen-essay-questions.md      # NUS High argumentative questions
??? .codex/skills/                    # Premium compendium workflows
?   ??? atlas-compendium-builder/      # Full exam compendium generation
?   ??? atlas-ig-carousel-generator/   # Social media content
??? Atlas-institution/                # Per-student teaching materials
?   ??? ASRJC Trevor Novena GP/        # JC1 A-Level GP (Trevor)
?   ??? RV GP (Ryan)/                  # JC2 A-Level GP (Ryan)
?   ??? NUS High (Caelen Joanna)/      # Sec 4 IP English (Caelen)
?   ??? O Levels/Geylang Jake Sec 1 G3/ # Sec 1 Secondary English
?   ??? Ms Zhang GP Online/            # Adult private candidate (Chinese)
??? atlas-compendium-gp/              # Commercial GP product line
?   ??? A Levels/gp-compendium/        # Student-facing content packs
?   ??? scripts/                       # Build/ingestion pipelines
??? IB English and Lit/                # International Baccalaureate materials
```

---

## 2. The Harness: Agent-Based Content Generation

### 2.1 AGENTS.md System

Each student folder contains an `AGENTS.md` file that acts as a **context harness** for AI content generation. These files encode:

**Student Profile Information:**
- Academic level (Sec 1, Sec 4 IP, JC1, JC2, Adult private candidate)
- Exam pathway (O-Level 1184, A-Level 8881, IELTS)
- Learning characteristics (e.g., Jake: "reluctant, disengaged writer")
- Language background (e.g., Ms Zhang: Chinese-dominant, IELTS Band 5)

**Pedagogical Approach:**
- Scaffolding sequence (e.g., Jake: Talk ? Write a little ? Shape it ? Improve it)
- Difficulty control rules (e.g., "One skill per task", "Plain language first")
- Material formats by stage (conversation starters, guided frames, models)

**Syllabus Alignment:**
- Specific MOE syllabus references (2020 Secondary G3, 2026 A-Level 8881)
- Component focus areas (Paper 1 essays, Paper 2 comprehension/AQ, Situational Writing)

### 2.2 Example: Differentiated AGENTS.md Structure

| Student | Level | Key Differentiator |
|---------|-------|-------------------|
| Trevor | JC1 GP | Novena-based, five-stage conceptual scaffold |
| Ryan | JC2 GP | Raffles IP background, AI/science focus |
| Caelen | Sec 4 IP | Emerging trends focus, GP-style argumentative |
| Jake | Sec 1 G3 | Engagement-first, reluctant-writer profile |
| Ms Zhang | Adult | Near-zero foundation, Chinese-dominant, tiered models |

### 2.3 Skills-Based Workflow Reuse

**gp-essay-question-curator** (for all A-Level students):
- Reads topic content from student week folders
- Selects relevant questions from central question bank
- Groups by themes derived from content
- Outputs standalone themed question files

**caelen-essay-questions** (Caelen-specific):
- Generates 10 GP-style questions on given themes
- Distributed across command-word styles (Assess, Discuss, How Far, etc.)
- Includes search terms for current affairs research
- Provides student-facing tips with "Think about / Possible evidence / Challenge yourself"

**atlas-compendium-builder** (premium product line):
- Full exam compendium workflow for PSLE/O-Level/A-Level/IELTS
- Evidence integrity via sources registry
- Quote verification gates (verify every quote or convert to hooks)
- Modular + master PDF packaging

---

## 3. The Pipeline: Content Production Flow

### 3.1 Weekly Material Generation Workflow

```
???????????????????????????????????????????????????????????????????????
?                    WEEKLY CONTENT PIPELINE                         ?
???????????????????????????????????????????????????????????????????????
?                                                                     ?
?  1. TOPIC SELECTION                                                 ?
?     ??? Tutor identifies weekly theme (e.g., "AI & Society")       ?
?                                                                     ?
?  2. CONTEXT HARNESS LOADING                                           ?
?     ??? AI reads AGENTS.md for student profile & approach          ?
?                                                                     ?
?  3. CONTENT GENERATION                                                ?
?     ??? Content guide (markdown)                                    ?
?     ??? Essay questions (curated from bank or generated)            ?
?     ??? Model paragraphs/essays (tiered by student level)             ?
?     ??? Comprehension passages (for Sec 1/JC1)                        ?
?                                                                     ?
?  4. PDF RENDERING                                                     ?
?     ??? Markdown ? HTML (via Python markdown library)               ?
?     ??? HTML ? PDF (via Chrome headless or ReportLab)               ?
?     ??? Font embedding (Helvetica Neue / Arial Unicode)             ?
?                                                                     ?
?  5. QUALITY GATES                                                     ?
?     ??? Universal format check (no student names/dates)             ?
?     ??? British English verification                                ?
?     ??? UTF-8 character validation                                    ?
?                                                                     ?
?  6. DELIVERY                                                          ?
?     ??? PDFs shared with student for weekly session                 ?
?                                                                     ?
???????????????????????????????????????????????????????????????????????
```

### 3.2 PDF Rendering Technologies

**Method 1: Chrome Headless (Preferred for complex layouts)**
```python
# Chrome headless rendering with print CSS
subprocess.run([
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    f"--print-to-pdf={output_path}",
    html_path.resolve().as_uri()
])
```

**Method 2: ReportLab + BeautifulSoup (For controlled typography)**
```python
# Used in Jake's Sec 1 materials and Ms Zhang content
# Custom font registration (Helvetica Neue from macOS TTC)
# Markdown ? HTML ? ReportLab Paragraph flowables
# Table rendering, list handling, inline formatting
```

**Font Strategy:**
- **English-only:** Helvetica Neue (extracted from `/System/Library/Fonts/HelveticaNeue.ttc`)
- **CJK support:** Noto Sans CJK SC / Arial Unicode
- **British English:** Iowan Old Style, Palatino Linotype

---

## 4. Special Components

### 4.1 Essay Marking with OCR (Ryan's Week)

During Ryan's Week 10 (AI & Science Technology), I implemented an **image-based essay marking pipeline**:

```
???????????????????????????????????????????????????????????????????
?              ESSAY MARKING VIA OCR PIPELINE                    ?
???????????????????????????????????????????????????????????????????
?                                                                  ?
?  INPUT: Student essay as photograph (handwritten or printed)     ?
?                                                                  ?
?  STEP 1: OCR EXTRACTION                                          ?
?     ??? Vision-capable LLM extracts text from image            ?
?         - Handles handwriting variations                         ?
?         - Preserves paragraph structure                         ?
?                                                                  ?
?  STEP 2: CONTENT ANALYSIS                                        ?
?     ??? LLM analyzes essay against GP rubrics:                 ?
?         - Question comprehension                                 ?
?         - Argument structure                                     ?
?         - Evidence usage                                         ?
?         - Language and register                                  ?
?                                                                  ?
?  STEP 3: FEEDBACK GENERATION                                     ?
?     ??? Structured feedback document:                            ?
?         - Strengths identified                                    ?
?         - Areas for improvement (prioritized)                   ?
?         - Specific examples from student's text                 ?
?         - Targeted revision suggestions                           ?
?                                                                  ?
?  OUTPUT: PDF feedback guide for tutor review                     ?
?                                                                  ?
???????????????????????????????????????????????????????????????????
```

**Key Files:**
- `Atlas-institution/RV GP (Ryan) /Week 10/AI Essay Evaluation Checklist.pdf`
- Generated feedback documents with inline annotations

### 4.2 Ms Zhang: Chinese Market & Translation Considerations

Ms Zhang represents a **unique case** — an adult private candidate with Chinese-dominant language background preparing for A-Level GP.

**Technical Adaptations:**

1. **Bilingual Scaffolding Policy:**
   - **Materials are English-only** (no Chinese text in documents)
   - **Tutor may use Mandarin verbally** in sessions
   - Sentence frames and vocabulary ladders provided for productive English

2. **Foundation-First Scaffold (F1-F5):**
   - F1: Question deconstruction
   - F2: Paragraph construction (PEE structure)
   - F3: Essay structure
   - F4: Evidence and current affairs
   - F5: Register and evaluation

3. **Tiered Model Essays:**
   - Tier 1 (Developing): 520-580 words, simple sentences, one Singapore example
   - Tier 2 (Consolidating): 620-700 words, sentence variety, counter-argument
   - Tier 3 (Competent): Reference to Holy Communion Notes (external resource)

4. **PDF Font Handling:**
   - Uses `wordWrap='LTR'` for English (not 'CJK')
   - Helvetica Neue via fontTools + reportlab TTFont
   - No Chinese characters in PDF generation to avoid encoding issues

**Conceptual Significance:**
This represents a **test case for Chinese-market GP tuition** — demonstrating how the same content pipeline can adapt for Mandarin-speaking students preparing for Singapore A-Levels. The English-only material policy ensures documents remain usable across contexts while verbal Mandarin support reduces comprehension friction.

### 4.3 KS Bull Essay Ingestion & Style Learning

**KS Bull Integration** (from Raffles Institution's student publication):

```
???????????????????????????????????????????????????????????????????
?               KS BULL INGESTION PIPELINE                       ?
???????????????????????????????????????????????????????????????????
?                                                                  ?
?  SOURCE: Holy Grail Drive — KS Bull essays (PDF scans)          ?
?                                                                  ?
?  STEP 1: CORPUS SCANNING                                         ?
?     ??? ingest_holy_grail_gp.py                                 ?
?         - SHA256 hashing for deduplication                      ?
?         - JC code detection (RI, RJC, HCI, etc.)                ?
?         - Year and paper component classification               ?
?         - Syllabus format tagging (legacy 8807 vs 8881)        ?
?                                                                  ?
?  STEP 2: METADATA REGISTRY                                       ?
?     ??? YAML-based past_papers.yaml                             ?
?         - paper_id, provider, JC, year, exam_type              ?
?         - local_path references (symlinks to private corpus)     ?
?         - Notes on syllabus format and paper code                ?
?                                                                  ?
?  STEP 3: STYLE ANALYSIS (LLM-based)                              ?
?     ??? Analysis of KS Bull essays for:                          ?
?         - Natural, authentic student voice                       ?
?         - Sophisticated argumentation patterns                   ?
?         - Singapore-context grounding                            ?
?         - Evaluation and nuance techniques                       ?
?                                                                  ?
?  STEP 4: STYLE TRANSFER TO MODEL ESSAYS                          ?
?     ??? Generated model essays incorporate:                      ?
?         - Conversational yet formal register                     ?
?         - Specific, local examples (not generic)                 ?
?         - Natural evaluation moves (not formulaic)               ?
?         - Varied sentence structure (not template-driven)        ?
?                                                                  ?
???????????????????????????????????????????????????????????????????
```

**Key Files:**
- `atlas-compendium-gp/scripts/ingest_holy_grail_gp.py` (610 lines)
- `atlas-compendium-gp/A Levels/gp-compendium/data/past_papers.yaml`
- References to KS Bull in multiple model essay documents

### 4.4 Jake's Sec 1: Narrative Comprehension & Writing

**Jake's Profile:** Sec 1 G3, "reluctant, disengaged writer" — confidence issues, wide gap between spoken and written output.

**Generation Approach:**

1. **Engagement-First Scaffolding:**
   - Stage 1: Talk it out (verbal discussion)
   - Stage 2: Write a little (low-pressure sentence production)
   - Stage 3: Shape it (WHAT/WHY/SO WHAT structure)
   - Stage 4: Improve it (vocabulary, sentence variety)

2. **Narrative Comprehension Passages:**
   - Generated relatable, interesting fiction passages
   - Literal ? inferential ? language for effect progression
   - 150-250 word passages with 3-5 questions max
   - Topics: sport, fairness, technology, natural world

3. **Discursive Writing Foundations:**
   - Formal email writing (Week 2)
   - PEEL elaboration (Week 3)
   - Body paragraphs and counterarguments

4. **Build Pipeline:**
   - `build_pdfs.py` — ReportLab-based renderer
   - Custom styles for Sec 1 readability (9pt body, 18pt title)
   - Skips AGENTS.md and Student Profile.md from PDF generation

**Example Week Structure:**
```
Week 3 (20 Apr) - Narrative Comprehension/
??? Reading Materials/                    # Generated fiction passages
?   ??? Passage: [Topic].md
??? Session Notes — Narrative Comprehension Intro.md
??? (rendered to PDF with custom styling)
```

---

## 5. Technical Implementation Details

### 5.1 Universal Document Format Enforcement

All documents must comply with `universal-document-format.mdc`:

| Prohibited | Required |
|-----------|----------|
| Student names (Ryan, Caelen, etc.) | Generic labels: "Annotations — techniques used" |
| Session/week numbers | Topic-only headers |
| Specific dates | "Prepared by Atlas Tuition" |
| "Atlas AI" references | No AI attribution |
| Student-specific annotations | "Tutor note" (generic) |

**Why:** Documents are shared across students and reused across sessions. Embedding identifiers makes them single-use.

### 5.2 PDF Generation Standards

**UTF-8 Handling:**
```python
# Strip U+FFFD (replacement character) before generation
# Test rendering with em-dashes, smart quotes, non-Latin scripts
# Chrome headless preferred for reliable typography
```

**Multilingual Support:**
```css
/* English-first */
font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;

/* Bilingual (English + Chinese) */
font-family: "Iowan Old Style", "Noto Sans CJK SC", Palatino, Georgia, serif;
```

**Font Extraction (macOS Helvetica Neue):**
```python
from fontTools.ttLib import TTCollection
from reportlab.pdfbase.ttfonts import TTFont

TTC = "/System/Library/Fonts/HelveticaNeue.ttc"
ttc = TTCollection(TTC)
for name, (idx, path) in faces.items():
    ttc.fonts[idx].save(path)
    pdfmetrics.registerFont(TTFont(name, path))
```

### 5.3 Quality Assurance Gates

**Before PDF Export:**
- [ ] British English spelling enforced
- [ ] All quotes verified or converted to hook templates
- [ ] Sources registered in sources.yaml
- [ ] No student/date metadata present
- [ ] UTF-8 validation passed

**After PDF Generation:**
- [ ] Open in Preview — check punctuation renders
- [ ] Search for Chinese/non-Latin phrases — confirm searchable
- [ ] No U+FFFD or placeholder characters
- [ ] Margins, headers, tables formatted correctly

---

## 6. Commercial Product Line: Atlas Compendium GP

### 6.1 Product Architecture

```
atlas-compendium-gp/
??? A Levels/gp-compendium/
?   ??? student/                      # Customer-facing content
?   ?   ??? theme-pack-01-science-tech-ai.mdx
?   ?   ??? paper-1-masterclass.mdx
?   ?   ??? flashcards-printable.md
?   ??? tutor/                        # Tutor-only materials
?   ?   ??? diagnostics-playbooks.md
?   ??? data/                         # Content registries
?   ?   ??? past_papers.yaml          # Ingested from Holy Grail
?   ?   ??? sources.yaml              # Evidence registry
?   ?   ??? examples.yaml             # Case study database
?   ??? _private/                     # Gitignored content
?       ??? holy-grail-drive/         # Symlink to local corpus
??? scripts/                          # Build automation
?   ??? build_pdf.py                  # Master PDF generation
?   ??? build_master_student_pdf.py   # Student-facing compilation
?   ??? ingest_holy_grail_gp.py       # Corpus ingestion
?   ??? validate_compendium_data.py   # Data integrity checks
??? Final Shop Docs/                  # Marketing/delivery materials
```

### 6.2 Web Application Architecture (Future)

**Stack:**
- Frontend: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
- Backend: Supabase (PostgreSQL + Auth + Storage)
- Payments: Stripe (Checkout + Subscriptions)
- Hosting: Vercel (Edge network)
- Content: MDX (Markdown + React components)

**Key Features:**
- Row-level security (RLS) for content access control
- Device fingerprinting (3-device limit per account)
- Watermarking ("Licensed to [email]")
- Copy protection (disabled right-click, keyboard shortcuts)
- Reading progress tracking (25%, 50%, 75%, 100% milestones)

See `ARCHITECTURE-DIAGRAM.md` for full technical specification.

---

## 7. Summary: Technical Achievements

### 7.1 Scale of Operation

| Metric | Value |
|--------|-------|
| Active Students | 5 (Trevor, Ryan, Caelen, Jake, Ms Zhang) |
| Student AGENTS.md Files | 9 (hierarchical inheritance) |
| Reusable Skills | 4 (compendium, essay curator, IG carousel, Caelen questions) |
| Python Scripts | 15+ (PDF, ingestion, validation) |
| Weekly Materials Generated | 10-20 PDFs/week |
| KS Bull Essays Ingested | 100+ (corpus for style learning) |

### 7.2 Key Innovations

1. **Hierarchical Context Harness**: AGENTS.md inheritance allows student-specific adaptation while maintaining universal standards

2. **OCR-Based Essay Marking**: Vision LLM integration enables feedback on handwritten or photographed essays

3. **Universal Document Format**: Systematic removal of student/date metadata enables content reuse

4. **Tiered Model Essays**: Foundation-to-competent tiering for differentiated learners (especially Ms Zhang)

5. **KS Bull Style Learning**: Corpus ingestion and style transfer for authentic, natural writing voice

6. **Automated PDF Pipeline**: Markdown ? HTML ? PDF with font embedding and UTF-8 validation

### 7.3 Future Technical Directions

1. **Web Application Deployment**: Next.js + Supabase + Stripe stack ready for commercial launch

2. **Expanded OCR Integration**: Extend vision-based marking to all students, not just Ryan

3. **Chinese Market Expansion**: Ms Zhang model as template for Mandarin-speaking GP students

4. **Automated Content Validation**: Enhanced QA gates with automated quote verification

5. **Analytics Integration**: PostHog + Sentry for usage tracking and error monitoring

---

## Appendix: Key File References

| File | Purpose |
|------|---------|
| `.cursor/rules/universal-document-format.mdc` | Document standardization |
| `.cursor/rules/pdf-generation-standards.mdc` | PDF rendering specs |
| `atlas-compendium-gp/scripts/ingest_holy_grail_gp.py` | KS Bull corpus ingestion |
| `Atlas-institution/*/AGENTS.md` | Per-student context harnesses |
| `Atlas-institution/O Levels/Geylang Jake Sec 1 G3/build_pdfs.py` | Sec 1 PDF renderer |
| `atlas-compendium-gp/ARCHITECTURE-DIAGRAM.md` | Web app technical spec |

---

**Document End**
