# E2E reader fixtures

`reader-topbar-toggle.spec.ts` exercises the center-tap topbar toggle across every
real (uploaded-file) reader type. It uploads real document fixtures rather than the
hardcoded demo books.

Small fixtures (`*.html`, `test.txt`, `test.pdf`) are committed. The following large
binaries are git-ignored to keep the repository lean and must be placed here manually
before running the spec. When absent, the corresponding test is skipped automatically.

| File | Reader | Approx size | Source |
|------|--------|-------------|--------|
| `dive-into-docker.epub` | epub | 7.3 MB | any EPUB ebook |
| `RESTful-Web-APIs.pdf` | pdf | 10.8 MB | any PDF document |
| `Docker-podman.docx` | word | 4.3 MB | any Word document |
| `AWS-digital-Transform.pptx` | ppt | 2.3 MB | any PowerPoint deck |
| `classic-books.xlsx` | excel | 50 KB | any Excel workbook |

File names must match exactly — the spec keys each reader to its filename stem for the
on-shelf book title. Any document of the matching type works; the content is irrelevant
to the topbar-toggle assertion.
