# Docs-as-Code Math Course Template

A repository for managing and typesetting mathematical courses as a single Quarto book.

This template uses **Quarto**, **Lua filters**, and **Python scripts** to produce typeset and accessible course materials in HTML and PDF format from a single codebase. 

## ✨ Features

+ **Single Source of Truth:** Shared macros, metadata, and styles are defined once and applied globally throughout the course.
+ **Smart Profiles:** Compile student-facing versions (public) or instructor-facing materials (with solutions/rubrics and other sensitive materials) via the `instructor` profile. 
+ **Accessibility:** Easily build HTML and PDF versions of course materials, or invoke [`axe-core`](https://github.com/dequelabs/axe-core) to assess WCAG standards. 
+ **Automated Builds & Chopping:** A centralized script (`build.sh`) manages rendering by invoking a Python script (`chopper.py`) that slices master PDFs into individual files.
+ **Unified Cross-References:** Because the project is built around a single book, from which working materials are excised, cross-references (to Theorems, Exercises, etc.) across documents are possible!

## 🛠️ Prerequisites

To compile this repository, you must have:

+ The [Quarto CLI](https://quarto.org/docs/get-started/) installed.
+ A modern TeX distribution (TeX Live, MacTeX, or Quarto's native TinyTeX installation).
+ **Python 3** (The build script will automatically generate a `.venv` and install `pypdf` using `pip`).
+ A Bash-compatible terminal.

## 🚀 Usage

### Set up

After cloning the repo, configure the `_variables.yml` and `_quarto.yml` files with your relevant course information, and be sure to set the `export-dir` variable to your desired output folder. When developing course materials, add references to public-facing ("open") content into `_quarto.yml` and instructor-only ("closed") material into `_quarto-instructor.yml`. From here, adjust the syllabus materials and then begin developing specific course materials.

Note that public-facing content can also be conditionally enhanced in instructor mode. For example, we can write homework solutions inside a `when-profile="instructor"` block (see `hw-0.qmd` for an example); these solutions will only render when we build the instructor version.

Compiled master PDFs (Homework, Exams, Syllabus, etc.) will automatically be placed into the `_site/` directory (for students) or the `_instructor/` directory. In addition, the `build.sh` script will excise individual materials from the master build; these will appear in `export-dir`. 

To render student-facing ("open") materials to PDF, use:

```
./build.sh -s
```

To render instructor versions of these materials and other "closed" content—such as exams, answer keys, or handouts that are not intended for public distribution, use the simpler command:

```
./build.sh
```

The `build.sh` script also accepts `-p` (preview), `-a` (accessible) modes, and `-f` (full build) modes. The first of these is useful for live-editing course materials, while the second can be used to assess WCAG compliance for HTML materials. For help, run

```
./build.sh -h
```

### 📂 Repository Structure

+ `build.sh`: The script containing several common build commands.
+ `_quarto.yml`: Controls formatting, book structure, and profile definitions for public-facing book (website).
+ `_quarto-instructor.yml`: Implements a profile for rendering all files, including exams and solution manuals.
+ `_quarto-accessible.yml`: Allows the use of `axe-core` for live accessibility audits.
+ `_variables.yml`: Contains course configuration data used to auto-populate files.
+ `_macros.qmd`: Shared LaTeX macros injected into all working files.
+ `.scripts/`: A folder for typesetting logic scripts.
    + `chopper.py`: Slices the compiled master PDF into individual files for student use.
    + `*.lua`:  Pandoc filters that handle formatting, exam logic, and autonumbering.
+ `homework/hw-*.qmd`, `exams/exam-*.qmd`, etc.: Markdown content files.
+ `_site/`, `_instructor/`, and `_accessible`: The directories where builds place the resulting files, depending on the profile.

### Deployment

To learn more about publishing the Quarto book to the web, see the official [publishing overview](https://quarto.org/docs/publishing/). In particular, [Netlify](https://quarto.org/docs/publishing/netlify.html) is especially convenient. Because the student-facing materials are controlled by the default profile, updating a course website is as easy as:

```
quarto publish netlify
```