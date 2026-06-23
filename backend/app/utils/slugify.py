import re
import uuid


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")
    if not slug:
        slug = f"cat-{uuid.uuid4().hex[:8]}"
    return slug
