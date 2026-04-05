#!/usr/bin/env bash
set -e

# default build is instructor-facing ("closed") render to pdf
STUDENT=0
PREVIEW=0
ACCESSIBLE=0
FULL=0

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -p|--preview) PREVIEW=1 ;;
        -s|--student) STUDENT=1 ;;
        -f|--full) 
            PREVIEW=0
            FULL=1
            ;;
        -a|--accessible) 
            PREVIEW=1
            STUDENT=1
            FULL=0
            ACCESSIBLE=1
            ;;
        -h|--help)
            echo "Usage: ./build.sh [options]"
            echo "Options:"
            echo "  -p, --preview      Preview (with live edits) instead of PDF build"
            echo "  -s, --student      Build/preview student-facing ("open") version"
            echo "  -a, --accessible   Run accessibility checker (forces student preview mode)"
            echo "  -f, --full         Render both HTML and PDF formats (non-preview)"
            echo "  -h, --help         Show this help message"
            exit 0
            ;;
        *) 
            echo "❌ Unknown parameter passed: $1"
            echo "Use -h or --help for usage."
            exit 1 
            ;;
    esac
    shift
done

echo "🚀 Starting build..."
if [ ! -d ".venv" ]; then
    echo "📦 Virtual environment not found. Creating .venv..."
    python3 -m venv .venv
fi

echo "🔧 Activating virtual environment..."
source .venv/bin/activate

echo "🔍 Checking dependencies..."
pip install --quiet -r requirements.txt

# Build the Quarto command dynamically
Q_CMD=(quarto)

if [[ $PREVIEW -eq 1 ]]; then
    Q_CMD+=(preview)
else
    Q_CMD+=(render)
    if [[ $FULL -eq 0 ]]; then
        Q_CMD+=(--to pdf)
    fi
fi

if [[ $STUDENT -eq 0 ]]; then
    Q_CMD+=(--profile instructor)
fi

if [[ $ACCESSIBLE -eq 1 ]]; then
    Q_CMD+=(--profile accessible)
fi

echo "⚙️  Executing: ${Q_CMD[*]}"
"${Q_CMD[@]}"

if [[ $PREVIEW -eq 0 ]]; then
    if [[ $STUDENT -eq 1 ]]; then
        CHOP_DIR="_site"
    else
        CHOP_DIR="_instructor"
    fi
    
    echo "🪓 Chopping PDF in $CHOP_DIR..."
    python3 .scripts/chopper.py "$CHOP_DIR"
fi

echo "✅ Build complete."