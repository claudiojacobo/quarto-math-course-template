# Quarto Math Course Template

A whole math course (lecture notes, homework, exams, handouts, syllabus) written once, as one [Quarto](https://quarto.org) book, and built into **a website and PDFs** from the same files. For a course built from it, see [Math 362](https://math362.cjgg.me/syllabus/main.html) at Carleton College and its [PDF](https://math362.cjgg.me/Math-362.pdf).

The formatting machinery lives in the [mathkit extension](https://github.com/claudiojacobo/quarto-extensions/tree/main/mathkit/_extensions/mathkit), included in this repository under `_extensions/`, so this template holds only your course.

## What you get

+ **One source, two formats.** A website (light and dark mode) and a PDF of the whole course, with cross-references between everything: a homework problem can cite a theorem in the notes.
+ **Student and instructor versions.** Solutions, exams and other private material appear only in the instructor build.
+ **One PDF per document.** `build.sh` splits the course PDF into a PDF for each homework, exam, handout and the syllabus.
+ **Exams that add themselves up.** Questions and parts carry points; the grade table and totals are generated.
+ **Shared math macros** for the web and the PDF, plus your own in `macros.tex`.
+ **Blocks and theorem environments** that look alike on the web and on paper.
+ **Accessibility.** Colors checked against WCAG AA, an [axe-core](https://github.com/dequelabs/axe-core) audit of the website, and an optional tagged PDF (PDF/UA-2) with MathML for screen readers.
+ **Copyable math.** Selecting rendered math on the website copies its LaTeX source.

## Quick start

### 1. Make your copy

Click **Use this template** on GitHub and create a new repository. **Make it private if it will hold exams or solutions**: anything in a public repository is public, even if the website doesn't show it. Then clone your new repository.

### 2. Install the tools

You need:

+ [Quarto](https://quarto.org/docs/get-started/) 1.6 or newer.
+ A TeX distribution with LuaLaTeX: [TeX Live](https://tug.org/texlive/) 2025 or newer (on macOS, MacTeX), which includes every package the PDF uses. Quarto's own TinyTeX also works and installs missing packages on the first build.
+ Python 3 (`build.sh` makes its own virtual environment and installs two small packages into it).
+ A terminal with Bash (macOS, Linux, or WSL on Windows).

On a Mac with [Homebrew](https://brew.sh):

```bash
brew install --cask quarto
brew install --cask mactex-no-gui
brew install python
```

### 3. Build it

Then, from the repository folder:

```bash
./build.sh --preview     # the website, live: edits show up as you save
./build.sh               # the instructor PDF, split into one PDF per document
```

The first PDF build takes a while (LaTeX caches fonts on first use). The course PDF lands in `_instructor/`, and the split PDFs in `Exports/`, which opens when the build finishes. If both work, your setup is complete.

## Make it yours

Change these, in roughly this order:

| File | What to change |
| --- | --- |
| `_variables.yml` | Course name and number, term, instructor, office hours, links, textbook. The syllabus and exam headers read these. Also `exports-directory`, where split PDFs go. |
| `_quarto.yml` | `book:` title, subtitle, course url, author, page footer, and the list of chapters (notes) and appendices (homework, practice exams, syllabus) that **students** see. |
| `_quarto-instructor.yml` | Documents only the **instructor** build includes (exams, handouts). |
| `index.qmd` | The website's front page. |
| `syllabus/` | Your policies (`main.qmd`), schedule (`_course-schedule.qmd`) and grading (`_grades-table.qmd`). |
| `macros.tex` | Your own math macros (delete the sample `\Hsq`). |
| `references.bib` | Your references (cite with `@key`). |
| `favicon.ico`, `robots.txt` | Your icon; instructions for which crawlers may read the site (by default, it turns away AI crawlers). |

When you are ready, replace the sample content in `notes/`, `homework/`, `exams/` and `handouts/` with your own material. Keep the files whose names start with `_` (`_homework-header.qmd`, `_exam-header.qmd`, …): they are shared headers that other pages include.

## Writing course materials

**Notes.** Each chapter is a `.qmd` file in `notes/`, listed under `chapters:` in `_quarto.yml`. Theorems, definitions and so on use Quarto's syntax, and can be cited anywhere in the course:

```markdown
::: {#thm-pythagoras}
#### Pythagorean Theorem
For a right triangle with legs $a, b$ and hypotenuse $c$, we have $a^2 + b^2 = c^2$.
:::
```

**The concept map.** `concepts.qmd` enables an optional feature which draws every definition, theorem, example, and so on, in the notes as a directed graph, with an arrow from A to B when B uses A. An item declares what it uses on a line of its own, as cross-references, which takes advantage of auto-completion in standard editors:

```markdown
::: {#cor-coherence-count}
[@def-hypersquare @prp-cube-faces]{.uses}
A hypersquare $\Hsq{n}$ satisfies exactly …
:::
```

The line doesn't appear on the page or in the PDF, and the map page itself is website-only. Render the whole site (`quarto render && quarto preview`) to update the map. Layouts, search, the List view and the rest are described under "Concept map" in mathkit's README.

**The map is optional**, and so are the `.uses` lines: without them the map still shows every item, just with no arrows between them. To leave the map out entirely, delete `concepts.qmd` and its line under `chapters:` in `_quarto.yml`. Any `.uses` lines you've written can stay; they never appear on the page or in the PDF.

**Homework.** Each assignment is a file in `homework/` starting with `# Homework 3 {.centered-title}`, listed under `appendices:`. Its exercises (`::: {#exr-name} … :::`) are numbered 3.1, 3.2, … in the PDF; see [the section on numbering](#why-homework-is-lettered-on-the-web-and-numbered-in-the-pdf) below.

**Exams and quizzes.** Wrap the exam in `::::: {.exam}`, and give each question (and each part) its points; see `exams/midterm-1.qmd`:

```markdown
::: {#prb-name .question points=10}
A question worth 10 points.
:::

:::: {#prb-other .question}
A question with parts:
::: {#prb-other-a .part points=3}
The first part.
:::
::::
```

The `[GRADETABLE]` line in `exams/_exam-header.qmd` becomes a table of questions and points, and `@prb-name` cites a question. `{.exam total=28}` overrides the total (for example, when students choose questions to skip).

**Instructor-only content.** Anything inside

```markdown
:::: {.content-visible when-profile="instructor"}
… solutions, notes to yourself …
::::
```

appears only in the instructor build (see `homework/hw-0.qmd`). Content inside `when-format="html"` appears only on the website, such as the clickable solutions in `exams/practice-1.qmd`, which keep the student PDF clean.

**Blocks.** Colored boxes for remarks, warnings, tips and so on:

```markdown
::: {.block-info}
::: {.block-header}
A title, which may contain $math$
:::
The content.
:::
```

The types are `info`, `code`, `success`, `attention`, `warning`, `danger`, `note`, `tip`, `current`, `scholar`, `personal`, and `school`.

**Math macros.** About a hundred macros come with mathkit (`\Rb` for ℝ, `\Abs{x}`, `\Norm{v}`, …; listed in its `macros.tex`). Add your own to `macros.tex` in this folder:

```latex
\newcommand{\Avg}[1]{\langle #1 \rangle}
```

Use `\renewcommand` to change one of mathkit's.

**More:** diagrams (mermaid, with colored node classes), code cells, and 3D plots with Sage are covered in the [mathkit README](https://github.com/claudiojacobo/quarto-extensions/tree/main/mathkit/_extensions/mathkit). Diagrams in the PDF need Google Chrome installed; Sage needs Sage.

## Building and publishing

`build.sh` runs Quarto for you and prints the exact command it uses, in case you prefer to run Quarto directly.

| Command | What it does |
| --- | --- |
| `./build.sh` | Instructor PDF in `_instructor/`, split into `Exports/` |
| `./build.sh --student` | Student PDF in `_site/`, split into `Exports/` |
| `./build.sh --preview` | The instructor website, live-updating as you edit (add `--student` for the student one) |
| `./build.sh --full` | Website and PDF together |
| `./build.sh --accessible` | The student website, live, with an axe-core accessibility report on each page |
| `./build.sh --tagged` | The accessible (tagged) PDF; slow, so only when you need it |

**Publishing the website.** The student version is the default, so publishing never includes instructor material. With [Netlify](https://quarto.org/docs/publishing/netlify.html), for example:

```bash
quarto publish netlify
```

See Quarto's [publishing guide](https://quarto.org/docs/publishing/) for other hosts.

## Accessibility

+ **Website:** `./build.sh --accessible` lists problems axe-core finds on each page. Give every image alt text (`![Description of the image](picture.png)`, or `fig-alt` on a figure).
+ **PDF:** `./build.sh --tagged` makes a tagged PDF (PDF/UA-2) in which every formula carries MathML. Check it with [veraPDF](https://verapdf.org) using the PDF/UA-2 profile. Tagging has a few requirements on how math is written (for example, `aligned` rather than `gathered`); they are listed under *Accessible PDF* in the [mathkit README](https://github.com/claudiojacobo/quarto-extensions/tree/main/mathkit/_extensions/mathkit#accessible-pdf).

## Updating mathkit

```bash
quarto update claudiojacobo/quarto-extensions/mathkit
```

Then rebuild and commit the updated `_extensions/` folder. Quarto reads your pages during the update, so update **before** using anything a new version adds (such as a new file to include).

## Troubleshooting

+ **`Permission denied` running `build.sh`:** make it executable with `chmod +x build.sh`.
+ **A Python error while `build.sh` installs packages:** delete the `.venv` folder and run it again.
+ **A LaTeX error naming a package:** with TeX Live, update it (`sudo tlmgr update --self --all`); with TinyTeX, run `quarto install tinytex --update-path`.
+ **`Command \… already defined`:** a macro in `macros.tex` uses a name mathkit or LaTeX already has; use `\renewcommand`, or another name.
+ **The PDF build stalls on a page with a diagram:** Quarto draws diagrams with headless Chrome, which occasionally hangs. Stop the build (Ctrl-C) and run it again.

## What's in this repository

```
_quarto.yml               the book: chapters, appendices, formats          ← edit
_quarto-instructor.yml    instructor-only documents                        ← edit
_quarto-accessible.yml    profile for --accessible (axe-core audit)
_quarto-tagged.yml        profile for --tagged (accessible PDF)
_variables.yml            course details used in headers and the syllabus  ← edit
macros.tex                your math macros                                 ← edit
index.qmd, references.qmd, references.bib
notes/  homework/  exams/  handouts/  syllabus/                            ← your course
build.sh                  builds, previews, splits PDFs
.scripts/chopper.py       splits the course PDF into one PDF per document
_extensions/              the mathkit extension (update, don't edit)
robots.txt  favicon.ico
```

Builds go to `_site/` (student), `_instructor/`, `_accessible/` and `Exports/`, none of which are committed.

## Why homework is lettered on the web and numbered in the PDF

In the sample course ([Math 362](https://math362.cjgg.me)), assignments are due weekly and do not neatly align with sequential textbook chapters. Therefore, they are placed in the `appendices` block of the `_quarto.yml` file. Because of how Quarto handles appendices, the HTML versions of these assignments are automatically labeled alphabetically (e.g., Appendix A, Appendix B). However, in the PDF version of the course, we've chosen to label them numerically (e.g., Homework 0, Homework 1). This divergence is a deliberate design choice to maximize stability and cross-referencing compatibility within Quarto's underlying engine.

To bridge this gap, this template includes an `auto-numbering.lua` script. When you write `# Homework 0 {.centered-title}` or `# Homework A {.centered-title}` at the top of an assignment, the script automatically parses the identifier and labels the content within as "Exercise 0.1" or "Exercise A.1," respectively, for the PDF output (and, as indicated, centers the titles).

Short of restructuring the book so that assignments exist as standard chapters or subsections, you have three main options for utilizing this template:

1. **Use numerical labeling in PDFs:** Use numerical headers, trusting that students can mentally map 0 ↦ A, 1 ↦ B, and so on, between the PDF and HTML versions.
2. **Use alphabetical labeling globally:** Title your headers alphabetically (e.g., `# Homework A`) so the PDF and HTML outputs match.
3. **Disable numbering completely:** Use `# Homework 0 {.unnumbered .centered-title}` to eliminate numbering. **This will prevent you from cross-referencing homework problems** throughout the rest of your book.

While it is possible to force Quarto to visually strip or overwrite these alphabetical prefixes using complex Lua filters or Javascript, we intentionally avoid doing so here to prevent complications in the long-term maintenance of this project.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed; see [LICENSE](LICENSE).
