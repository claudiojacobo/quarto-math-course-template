import re
import os
import sys
import yaml
import subprocess
from pathlib import Path
from pypdf import PdfReader, PdfWriter

INPUT_DIRECTORY = sys.argv[1] if len(sys.argv) > 1 else "_instructor"

with open("_variables.yml", "r") as file:
    config = yaml.safe_load(file)

OUTPUT_DIRECTORY = os.path.expanduser(config.get("exports-directory", "./Exports"))

def open_directory(output_dir):
    """
    Open directory with default file manager.
    """
    dir_path = Path(output_dir).expanduser()
    try:
        if sys.platform == 'darwin':
            subprocess.run(['open', str(dir_path)])
        elif sys.platform == 'win32':
            os.startfile(str(dir_path))
        else:
            subprocess.run(['xdg-open', str(dir_path)])
        print(f"📂 Opened directory: {dir_path}")
    except Exception as e:
        print(f"⚠️ Could not open directory: {e}")

def extract_bookmarks(outline, reader, level=1):
    """
    Recursively flattens the PDF outline into a list of dictionaries.
    Tags bookmarks that act as 'parents' (like Part headings) and tracks heading depth.
    """
    bookmarks = []
    for i, item in enumerate(outline):
        if isinstance(item, list):
            bookmarks.extend(extract_bookmarks(item, reader, level + 1))
        else:
            title = item.title
            page_num = reader.get_page_number(item.page)
            
            is_parent = False
            if i + 1 < len(outline) and isinstance(outline[i+1], list):
                is_parent = True
                
            bookmarks.append({
                "title": title,
                "page": page_num,
                "is_parent": is_parent,
                "level": level
            })
    return bookmarks

def chop_master_pdf(output_dir="_chopped", skip_body=True):
    """
    Finds the master PDF in the target dir, slices it by chapter, and outputs result.
    """
    pdf_files = list(Path(INPUT_DIRECTORY).glob("*.pdf"))
    
    if not pdf_files:
        print(f"❌ Error: No PDF found in '{INPUT_DIRECTORY}/'.")
        return
        
    master_path = pdf_files[0]
    print(f"📖 Found master PDF: {master_path.name}")
    
    out_dir = Path(output_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    
    reader = PdfReader(master_path)
    total_pages = len(reader.pages)
    
    raw_bookmarks = extract_bookmarks(reader.outline, reader)
    
    # Determine the sub-document level
    # Quarto puts Chapters at level 1 (or level 2 if using Parts)
    # We find the deepest level of a known main document to establish our cutoff
    doc_level = 1
    for b in raw_bookmarks:
        if b["title"] in ["Syllabus", "References"] or "Homework" in b["title"]:
            if b["level"] > doc_level:
                doc_level = b["level"]
                
    # Filter out sub-sections (## and ###) that are deeper than the document level
    bookmarks = [b for b in raw_bookmarks if b["level"] <= doc_level]

    # Filter out duplicate boundaries
    cuts = []
    seen_pages = set()
    for b in bookmarks:
        if b["page"] not in seen_pages:
            cuts.append(b)
            seen_pages.add(b["page"])

    print(f"✂️ Found {len(cuts)} structural sections. Slicing...")

    reached_endmatter = False
    for i, cut in enumerate(cuts):
        
        # Skip course notes (these are published elsewhere)
        if skip_body and not reached_endmatter:
            if cut["title"] == "References":
                reached_endmatter = True
            else:
                print(f"  ⏭️ Skipping main text: {cut['title']}")
                continue

        start_page = cut["page"]
        end_page = cuts[i+1]["page"] if i + 1 < len(cuts) else total_pages
        length = end_page - start_page
        
        if cut["is_parent"] and length == 1:
            print(f"  ⏭️ Skipping title page: {cut['title']}")
            continue
        
        writer = PdfWriter()
        for p in range(start_page, end_page):
            writer.add_page(reader.pages[p])
        safe_title = re.sub(r'[^a-zA-Z0-9_\- ]', '', cut["title"]).strip()
        out_file = out_dir / f"{safe_title}.pdf"
        with open(out_file, "wb") as f:
            writer.write(f)
            
        print(f"📄 Saved: {out_file.name} (Pages {start_page+1}-{end_page})")

if __name__ == "__main__":
    chop_master_pdf(OUTPUT_DIRECTORY)
    open_directory(OUTPUT_DIRECTORY)