"""YouTube transcript extraction and formatting for CrewAI book generation."""

from __future__ import annotations

import re
from urllib.parse import urlparse, parse_qs


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from various URL formats.

    Supports:
        - https://www.youtube.com/watch?v=VIDEO_ID
        - https://youtu.be/VIDEO_ID
        - https://www.youtube.com/embed/VIDEO_ID
        - https://www.youtube.com/v/VIDEO_ID
        - https://www.youtube.com/shorts/VIDEO_ID
        - youtube.com/watch?v=VIDEO_ID (no scheme)
    """
    if not url:
        raise ValueError("Empty URL")

    url = url.strip()

    # youtu.be shortlink
    if "youtu.be" in url:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        video_id = parsed.path.lstrip("/").split("?")[0]
        if video_id:
            return video_id

    # youtube.com variants
    parsed = urlparse(url if "://" in url else f"https://{url}")

    # /embed/VIDEO_ID, /v/VIDEO_ID, /shorts/VIDEO_ID
    path_match = re.search(
        r"/(?:embed|v|shorts)/([a-zA-Z0-9_-]{11})", parsed.path
    )
    if path_match:
        return path_match.group(1)

    # ?v=VIDEO_ID
    query_params = parse_qs(parsed.query)
    if "v" in query_params:
        return query_params["v"][0]

    raise ValueError(f"Could not extract video ID from URL: {url}")


async def extract_transcript(video_id: str) -> dict:
    """Extract transcript text and metadata for a YouTube video.

    Returns:
        dict with keys: video_id, transcript_text, segments (list of
        {start, duration, text}), language, video_title (if available)
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
    except Exception as e:
        raise RuntimeError(
            f"Failed to fetch transcript list for video {video_id}: {e}"
        ) from e

    # Prefer manual captions, fall back to auto-generated
    try:
        transcript = transcript_list.find_manually_created_transcript(["zh-Hans", "zh", "en"])
    except Exception:
        try:
            transcript = transcript_list.find_generated_transcript(["zh-Hans", "zh", "en"])
        except Exception:
            # Last resort: any available transcript
            transcript = next(iter(transcript_list))

    fetched = transcript.fetch()
    language = transcript.language_code

    segments = []
    full_text_parts = []
    for snippet in fetched:
        segments.append({
            "start": snippet.start,
            "duration": snippet.duration,
            "text": snippet.text,
        })
        full_text_parts.append(snippet.text)

    full_text = " ".join(full_text_parts)

    return {
        "video_id": video_id,
        "language": language,
        "transcript_text": full_text,
        "segments": segments,
    }


def format_transcript_snapshot(
    transcript_data: dict,
    video_title: str = "",
    channel_name: str = "",
) -> str:
    """Format transcript data into a snapshot suitable for CrewAI book planning.

    The snapshot format is designed to look like structured content that the
    CrewAI planning/writing agents can process — similar to how GitHub repo
    files are formatted in _build_textual_snapshot.

    Returns a markdown string with video info + timestamped transcript.
    """
    parts = []

    # Header / metadata
    parts.append(f"## Video: {video_title or 'YouTube Video'}")
    if channel_name:
        parts.append(f"**Channel**: {channel_name}")
    parts.append(f"**Language**: {transcript_data.get('language', 'unknown')}")
    parts.append("")

    # Chunk transcript into ~5-minute segments with timestamps
    # This gives the AI logical sections to work with
    segments = transcript_data.get("segments", [])
    chunk_duration = 300  # 5 minutes
    current_chunk: list[str] = []
    chunk_start = 0.0
    chunk_count = 0

    for seg in segments:
        if not current_chunk:
            chunk_start = seg["start"]

        current_chunk.append(seg["text"])

        # Flush chunk when we cross the duration threshold
        if seg["start"] + seg["duration"] - chunk_start >= chunk_duration:
            minutes = int(chunk_start // 60)
            seconds = int(chunk_start % 60)
            chunk_count += 1
            parts.append(
                f"### Section {chunk_count} [{minutes:02d}:{seconds:02d}]\n"
                f"{' '.join(current_chunk)}\n"
            )
            current_chunk = []

    # Flush remaining
    if current_chunk:
        minutes = int(chunk_start // 60)
        seconds = int(chunk_start % 60)
        chunk_count += 1
        parts.append(
            f"### Section {chunk_count} [{minutes:02d}:{seconds:02d}]\n"
            f"{' '.join(current_chunk)}\n"
        )

    return "\n".join(parts)


async def fetch_video_title(video_id: str) -> str:
    """Fetch video title from YouTube's oEmbed endpoint (no API key required)."""
    import httpx

    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return data.get("title", video_id)
    except Exception:
        return video_id


def determine_chapter_count_from_transcript(text: str, segment_count: int) -> int:
    """Determine appropriate chapter count based on transcript length.

    Rough heuristic: ~500 words per minute of spoken content.
    Target ~800-1200 words per chapter.
    """
    word_count = len(re.findall(r"\w+", text))
    if word_count < 1000:
        return 3
    elif word_count < 3000:
        return 4
    elif word_count < 6000:
        return 6
    elif word_count < 12000:
        return 8
    else:
        return min(12, max(4, segment_count // 5))
