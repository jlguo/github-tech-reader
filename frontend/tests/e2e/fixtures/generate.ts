import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_DIR = path.join(__dirname, "test-files");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeZip(filepath: string, entries: { name: string; data: Buffer | string; stored?: boolean }[]) {
  const archiver = require("archiver");
  ensureDir(path.dirname(filepath));
  const output = fs.createWriteStream(filepath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", () => {});
  archive.pipe(output);
  for (const e of entries) {
    if (e.stored) {
      archive.append(e.data, { name: e.name, store: true });
    } else {
      archive.append(e.data, { name: e.name });
    }
  }
  archive.finalize();
}

export function generateTestFiles() {
  ensureDir(FIXTURE_DIR);

  fs.writeFileSync(path.join(FIXTURE_DIR, "test.txt"), "Test TXT File\n\nThis is a test text file.\n".repeat(20));

  fs.writeFileSync(
    path.join(FIXTURE_DIR, "test.html"),
    `<!DOCTYPE html><html><head><title>Test HTML</title></head><body>
<h1>Test HTML Document</h1>
<p>This is a test HTML file for the reader.</p>
<h2>Section A</h2>
<p>Content of section A.</p>
<h2>Section B</h2>
<p>Content of section B.</p>
</body></html>`,
  );

  const minimalPdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF`;
  fs.writeFileSync(path.join(FIXTURE_DIR, "test.pdf"), minimalPdf);

  const docxXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Test Document</w:t></w:r></w:p>
<w:p><w:r><w:t>This is a test Word document for the reader.</w:t></w:r></w:p>
<w:p><w:r><w:t>It has multiple paragraphs.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Section 2</w:t></w:r></w:p>
<w:p><w:r><w:t>The reader should display this content properly.</w:t></w:r></w:p>
</w:body>
</w:document>`;

  const xlsxSheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Item 1</t></is></c><c r="B2"><v>100</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Item 2</t></is></c><c r="B3"><v>200</v></c></row>
<row r="4"><c r="A4" t="inlineStr"><is><t>Item 3</t></is></c><c r="B4"><v>300</v></c></row>
</sheetData>
</worksheet>`;

  const pptxSlide = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Test Slide Title</a:t></a:r></a:p><a:p><a:r><a:rPr lang="en-US"/><a:t>This is slide content for testing.</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld>
</p:sld>`;

  const epubOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>Test EPUB</dc:title>
<dc:creator>Test Author</dc:creator>
<dc:identifier id="BookId">test-001</dc:identifier>
<dc:language>en</dc:language>
</metadata>
<manifest>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="ch1" href="chapter1.html" media-type="application/xhtml+xml"/>
<item id="ch2" href="chapter2.html" media-type="application/xhtml+xml"/>
</manifest>
<spine toc="ncx"><itemref idref="ch1"/><itemref idref="ch2"/></spine>
</package>`;

  const epubNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="test-001"/></head>
<docTitle><text>Test EPUB</text></docTitle>
<navMap>
<navPoint id="n1"><navLabel><text>Chapter 1</text></navLabel><content src="chapter1.html"/></navPoint>
<navPoint id="n2"><navLabel><text>Chapter 2</text></navLabel><content src="chapter2.html"/></navPoint>
</navMap>
</ncx>`;

  const epubCh1 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head>
<body><h1>Chapter 1</h1><p>This is the first chapter of the test EPUB file.</p><p>It contains multiple paragraphs for testing the reader.</p></body></html>`;

  const epubCh2 = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 2</title></head>
<body><h1>Chapter 2</h1><p>This is the second chapter of the test EPUB file.</p><p>The reader should navigate between chapters.</p></body></html>`;

  const zipFiles: Record<string, { name: string; data: string; stored?: boolean }[]> = {
    "test.docx": [
      { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: "word/document.xml", data: docxXml },
    ],
    "test.xlsx": [
      { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet1.xml", data: xlsxSheet },
    ],
    "test.pptx": [
      { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>' },
      { name: "ppt/presentation.xml", data: '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></p:sldIdLst></p:presentation>' },
      { name: "ppt/_rels/presentation.xml.rels", data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>' },
      { name: "ppt/slides/slide1.xml", data: pptxSlide },
    ],
    "test.epub": [
      { name: "mimetype", data: "application/epub+zip", stored: true },
      { name: "META-INF/container.xml", data: '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
      { name: "content.opf", data: epubOpf },
      { name: "toc.ncx", data: epubNcx },
      { name: "chapter1.html", data: epubCh1 },
      { name: "chapter2.html", data: epubCh2 },
    ],
  };

  for (const [filename, entries] of Object.entries(zipFiles)) {
    writeZip(path.join(FIXTURE_DIR, filename), entries);
  }
}

export function getFixturePath(filename: string): string {
  return path.join(FIXTURE_DIR, filename);
}

export const TEST_FILES = [
  { file: "test.txt", title: "e2e-txt", type: "txt", badge: "TXT" },
  { file: "test.epub", title: "e2e-epub", type: "epub", badge: "EPUB" },
  { file: "test.pdf", title: "e2e-pdf", type: "pdf", badge: "PDF" },
  { file: "test.docx", title: "e2e-docx", type: "word", badge: "WORD" },
  { file: "test.xlsx", title: "e2e-xlsx", type: "excel", badge: "EXCEL" },
  { file: "test.pptx", title: "e2e-pptx", type: "ppt", badge: "PPT" },
  { file: "test.html", title: "e2e-html", type: "html", badge: "HTML" },
] as const;
