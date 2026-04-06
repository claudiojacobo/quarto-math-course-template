# Docs-as-Code Math Course Template

A repository for managing and typesetting mathematical courses as a single Quarto book.

This template uses Quarto, Lua, and Python to produce typeset and accessible course materials in HTML and PDF formats from a single codebase. **For an example of a course built using this template**, see [Math 362](https://math362.cjgg.me/syllabus/main.html) at Carleton College (and its accompanying [PDF](https://math362.cjgg.me/Math-362.pdf)).

## ✨ Features

+ **Single Source of Truth:** Shared macros, metadata, and styles are defined once and applied globally throughout the course.
+ **Smart Profiles:** Compile student-facing versions (public) or instructor-facing materials (with solutions/rubrics and other sensitive materials) via the `instructor` profile. 
+ **Accessibility:** Easily build HTML and PDF versions of course materials, or invoke [`axe-core`](https://github.com/dequelabs/axe-core) to assess WCAG standards. 
+ **Automated Builds & Chopping:** A centralized script (`build.sh`) manages rendering via Quarto and invoking a python tool (`chopper.py`) that slices master PDFs into individual files.
+ **Unified Cross-References:** Because the project is built around a single book, from which working materials are excised, cross-references (to Theorems, Exercises, etc.) across documents are possible!

## 🛠️ Prerequisites

To compile this repository, you must have:

+ The [Quarto CLI](https://quarto.org/docs/get-started/).
+ A modern TeX distribution (TeX Live, MacTeX, or Quarto's native TinyTeX installation).
+ **Python 3** (The build script will automatically generate a virtual environment and install required packages via `pip`).
+ A Bash-compatible terminal.

On a Mac, these are all easily obtained via [Homebrew](https://brew.sh/):

```bash
brew install --cask quarto
brew install --cask mactex-no-gui
```

## 🚀 Usage

### Set up

After cloning the repo, configure the `_quarto.yml` and `_variables.yml` files with your relevant course information, and be sure to set the `export-dir` variable to your desired output folder. 

Next, run `./build.sh` and view the resulting PDFs in `_instructor` and the directory you just specified to ensure all packages are properly configured. Review the auto-generated syllabus to ensure your information is thoroughly populated, then implement your own course policies!

### Workflow

When developing course materials, place new `*.qmd` files into the `homework/`, `notes/`, and other such directories. Add references to these documents in the top-level `.yml` files:

+ Public-facing ("open") content goes into `_quarto.yml`
+ Instructor-only ("closed") materials go into `_quarto-instructor.yml`. 

Note that public-facing content can also be conditionally enhanced in instructor mode. For example, we can write homework solutions inside a `when-profile="instructor"` block (see [`hw-0.qmd`](homework/hw-0.qmd) for an example)---these will only render when we build the instructor version---or make clickable solutions that are only available online (`when-format="html"`; see [`practice-1.qmd`](exams/practice-1.qmd)).

Compiled master PDFs (Homework, Exams, Syllabus, etc.) will automatically be placed into the `_site/` directory (for students) or the `_instructor/` directory. In addition, the `build.sh` script will excise individual materials from these PDFs, which will appear in `export-dir`. 

To render student-facing ("open") materials to PDF, use:

```
./build.sh --student
```

To render instructor versions of these materials and other "closed" content—such as exams, answer keys, or handouts that are not intended for public distribution, use the simpler command:

```
./build.sh
```

The `build.sh` script also accepts `-p` (`--preview`), `-a` (`--accessible`) modes, and `-f` (`--full` build) modes. The first of these is useful for live-editing course materials, while the second can be used to assess WCAG compliance for HTML materials. For help, run

```
./build.sh --help
```
Note that the script displays the Quarto command it runs, in case you prefer to interact more directly with the software.

### 📂 Repository Contents

+ The materials you will regularly edit are:
    + `_quarto.yml`: Controls formatting and structure data for public-facing book (website). Add student-facing materials here.
    + `_quarto-instructor.yml`: Implements a profile for rendering all course content. Add instructor-facing materials here.
    + `_variables.yml`: Contains course configuration data used to auto-populate files.
    + `_macros.qmd`: Shared LaTeX macros (**make sure to include these in all working files!**)
    + `homework/hw-*.qmd`, `exams/exam-*.qmd`, etc: These files contain the actual course content.
    + `index.qmd`: The website landing page.
    + `references.bib`: Contains all course references.

+ Additional materials of interest:
    + `_site/`, `_instructor/`, and `_accessible/`: The directories where builds place exported files, depending on the profile.
    + `build.sh`: The script containing several common build commands.
    + `.scripts/`: A hidden folder for typesetting logic scripts.
        + `chopper.py`: Slices the compiled master PDF into individual files for student use.
        + `*.lua`:  Pandoc filters that handle formatting, exam logic, and autonumbering.
    + `_quarto-accessible.yml`: Allows the use of `axe-core` for live accessibility audits.
    + `before-title.tex`: Part of the [current solution](https://github.com/orgs/quarto-dev/discussions/12838) to global TeX macros for Quarto books.
    + `favicon.ico`: Replace this with your own personal branding!

### Deployment

To learn more about publishing the Quarto book to the web, see the official [publishing overview](https://quarto.org/docs/publishing/). In particular, [Netlify](https://quarto.org/docs/publishing/netlify.html) is especially convenient. Because the student-facing materials are controlled by the default profile, updating a course website is as easy as:

```
quarto publish netlify
```