"""Export the ISO review and evidence inventory using Python standard library only.

Does not access production, credentials, network or change application files.
"""
from pathlib import Path
import csv
import hashlib
import html
import os
import re
import zipfile
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
STEM = 'EVALUACION_ISO_42001_TR_24368_CIBERDOJO'
SOURCE = DOCS / (STEM + '.md')
SKIP = {'node_modules', '.git', '.agents', '.claude', '.codex', 'build', 'dist',
        '__pycache__', '.temp', '.branches', '.gcloud-config'}
EXTENSIONS = {'.md', '.ts', '.tsx', '.js', '.cjs', '.mjs', '.py', '.sql', '.html',
              '.json', '.toml', '.yml', '.yaml', '.css', '.docx', '.pdf', '.csv'}


def inventory():
    paths = set(ROOT.glob('*.md'))
    for name in ['manual-central-admin.html', 'frontend/static-server.js',
                 'frontend/package.json', 'frontend/README.md', 'package.json']:
        paths.add(ROOT / name)
    for folder in ['frontend/src', 'central-admin-app', 'supabase', 'scripts', 'tests',
                   '.github', 'docs', 'proposal', 'Banco de preguntas']:
        for base, dirs, names in os.walk(ROOT / folder):
            dirs[:] = [d for d in dirs if d not in SKIP]
            for name in names:
                p = Path(base) / name
                if p.suffix.lower() in EXTENSIONS and not name.startswith('.') and not name.endswith('lock.json'):
                    paths.add(p)
    for p in (ROOT / 'release/cyberdojo-clean-repo').rglob('*.md'):
        if not any(part in SKIP for part in p.relative_to(ROOT).parts):
            paths.add(p)
    paths.update((ROOT / 'frases').glob('*.pdf'))
    # Keep deliverables out of their own source inventory.
    paths = {p for p in paths if p.is_file() and not p.name.startswith((STEM, 'ISO_CIBERDOJO_'))
             and p.name != Path(__file__).name}
    rows = []
    for p in sorted(paths):
        relative = p.relative_to(ROOT).as_posix()
        data = p.read_bytes()
        if p.suffix == '.pdf':
            coverage = 'Inventariado; contenido binario no validado integralmente'
        elif p.suffix == '.docx':
            coverage = 'Texto extraido; enfoque y muestra revisados'
        elif relative.startswith('release/'):
            coverage = 'Documento historico; indexacion y busqueda tematica'
        else:
            coverage = 'Inventario y busqueda tematica; lectura focalizada segun informe'
        hits = ''
        if p.suffix not in {'.pdf', '.docx'}:
            text = data.decode('utf-8', errors='replace')
            hits = len(re.findall(r'42001|24368|audit|consent|privac|retention|retenci|approval|approved|riesgo|risk|sesgo|bias|provider|proveedor|fallback', text, re.I))
        rows.append([relative, len(data), hashlib.sha256(data).hexdigest(), coverage, hits])
    with (DOCS / 'ISO_CIBERDOJO_INVENTARIO.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['archivo', 'bytes', 'sha256', 'alcance_de_revision', 'coincidencias_tematicas_no_equivalen_a_validacion'])
        writer.writerows(rows)
    return len(rows)


def blocks(text):
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', c) for c in cells):
                    rows.append(cells)
                i += 1
            yield 'table', rows
            continue
        match = re.match(r'^(#{1,6}) (.*)', line)
        if match:
            yield 'h' + str(len(match[1])), match[2]
        elif re.match(r'^(- |\d+\. )', line):
            yield 'li', line
        else:
            yield 'p', line
        i += 1


def plain(text):
    text = re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'\1 (\2)', text)
    return text.replace('**', '').replace('`', '')


def inline_html(text):
    text = html.escape(text)
    text = re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'`([^`]+)`', r'<code>\1</code>', text)


def export_html(content):
    body = []
    for kind, value in blocks(content):
        if kind == 'table':
            rows = []
            for index, cells in enumerate(value):
                tag = 'th' if index == 0 else 'td'
                rows.append('<tr>' + ''.join(f'<{tag}>{inline_html(c)}</{tag}>' for c in cells) + '</tr>')
            body.append('<div class="table"><table>' + ''.join(rows) + '</table></div>')
        else:
            tag = 'p' if kind == 'li' else kind
            body.append(f'<{tag}>{inline_html(value)}</{tag}>')
    document = '''<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CiberDojo · Evaluación ISO 42001 y TR 24368</title>
<style>
body{max-width:1120px;margin:48px auto;padding:0 28px;font:16px/1.55 system-ui,sans-serif;color:#172b39;background:#fff}
h1{font-size:32px;line-height:1.2}h2{font-size:24px;margin-top:44px;border-bottom:2px solid #237785;padding-bottom:8px}
h3{font-size:19px;margin-top:30px}p{margin:12px 0}a{color:#096778}code{font-size:.86em;overflow-wrap:anywhere}
.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;margin:18px 0}
td,th{border:1px solid #bbc9d0;padding:9px;vertical-align:top;text-align:left;overflow-wrap:anywhere}
th{background:#eaf1f4}tr:nth-child(even) td{background:#f8fafb}
@media print{@page{size:A4;margin:17mm}body{margin:0;padding:0;font-size:10pt;max-width:none}h1{font-size:22pt}h2{font-size:16pt;break-after:avoid}h3{font-size:12pt;break-after:avoid}table{font-size:8pt}tr{break-inside:avoid}.table{overflow:visible}a{color:inherit;text-decoration:none}}
</style><body>''' + '\n'.join(body) + '</body></html>'
    (DOCS / (STEM + '.html')).write_text(document, encoding='utf-8')


def paragraph(text, style=None):
    props = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ''
    return f'<w:p>{props}<w:r><w:t xml:space="preserve">{escape(plain(text))}</w:t></w:r></w:p>'


def export_docx(content):
    body = []
    for kind, value in blocks(content):
        if kind == 'table':
            cols = max(map(len, value))
            width = 9360 // cols
            table = ['<w:tbl><w:tblPr><w:tblStyle w:val="ReviewTable"/><w:tblW w:w="9360" w:type="dxa"/></w:tblPr>',
                     '<w:tblGrid>' + f'<w:gridCol w:w="{width}"/>' * cols + '</w:tblGrid>']
            for i, cells in enumerate(value):
                table.append('<w:tr><w:trPr><w:cantSplit/>' + ('<w:tblHeader/>' if i == 0 else '') + '</w:trPr>')
                for cell in cells:
                    shade = '<w:shd w:fill="EAF1F4"/>' if i == 0 else ''
                    table.append(f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shade}</w:tcPr>' + paragraph(cell, 'TableText') + '</w:tc>')
                table.append('</w:tr>')
            table.append('</w:tbl>')
            body.append(''.join(table))
        else:
            body.append(paragraph(value, {'h1': 'Title', 'h2': 'Heading1', 'h3': 'Heading2'}.get(kind)))
    ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    document = f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="{ns}"><w:body>' + ''.join(body) + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1273" w:bottom="1134" w:left="1273"/></w:sectPr></w:body></w:document>'
    styles = f'''<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="{ns}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="176778"/><w:sz w:val="29"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:spacing w:before="220"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table text"/><w:rPr><w:sz w:val="17"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="ReviewTable"><w:name w:val="Review Table"/><w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="BBC9D0"/><w:left w:val="single" w:sz="4" w:color="BBC9D0"/><w:bottom w:val="single" w:sz="4" w:color="BBC9D0"/><w:right w:val="single" w:sz="4" w:color="BBC9D0"/><w:insideH w:val="single" w:sz="4" w:color="BBC9D0"/><w:insideV w:val="single" w:sz="4" w:color="BBC9D0"/>
</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>'''
    types = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
    rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    document_rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    with zipfile.ZipFile(DOCS / (STEM + '.docx'), 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in {'[Content_Types].xml': types, '_rels/.rels': rels,
                           'word/document.xml': document, 'word/styles.xml': styles,
                           'word/_rels/document.xml.rels': document_rels}.items():
            z.writestr(name, data.encode('utf-8'))


if __name__ == '__main__':
    content = SOURCE.read_text(encoding='utf-8')
    count = inventory()
    export_html(content)
    export_docx(content)
    print(f'Inventario: {count} archivos. Exportados HTML y DOCX desde {SOURCE.name}.')
