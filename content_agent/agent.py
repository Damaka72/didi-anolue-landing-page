#!/usr/bin/env python3
"""
Content Agent for Didi Anolue Landing Page

Reads website content (HTML files) and uses Claude to generate:
  - Email newsletter (subject lines, preview text, body, CTA)
  - LinkedIn posts (thought leadership style)
  - Twitter/X posts (under 280 characters)
  - Instagram captions (with hashtags)
  - Facebook posts

Usage:
    python agent.py                    # Generate all content
    python agent.py --type newsletter  # Newsletter only
    python agent.py --type social      # Social media only
    python agent.py --output my.json   # Custom output filename
"""

import os
import re
import json
import argparse
import anthropic
from pathlib import Path
from datetime import datetime
from bs4 import BeautifulSoup, Comment

BASE_DIR = Path(__file__).parent.parent


# ---------------------------------------------------------------------------
# HTML extraction helpers
# ---------------------------------------------------------------------------

def extract_html_content(filepath: Path, max_chars: int = 0) -> str:
    """Strip scripts/styles/nav from an HTML file and return clean text."""
    with open(filepath, encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    for tag in soup(["script", "style", "nav", "noscript"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    text = soup.get_text(separator="\n", strip=True)
    # Collapse excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    if max_chars and len(text) > max_chars:
        text = text[:max_chars] + "\n...[truncated]"
    return text


def build_context() -> str:
    """Load and combine website content from all HTML files."""
    files = {
        "homepage": (BASE_DIR / "index.html", 8000),
        "blog_gcloud": (BASE_DIR / "blog-post-1.html", 4000),
        "blog_ai_procurement": (BASE_DIR / "blog-post-2.html", 4000),
    }

    sections = []
    for label, (path, limit) in files.items():
        if path.exists():
            sections.append(
                f"=== {label.upper().replace('_', ' ')} ===\n"
                + extract_html_content(path, max_chars=limit)
            )
        else:
            print(f"  [warn] {path} not found, skipping.")

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Claude prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a content marketing specialist for Didi Anolue, a Commercial,
Contracts & Procurement Consultant based in the UK.

Your job is to create compelling, authentic content based on her website that will:
1. Attract procurement professionals, CPOs, and public sector decision-makers
2. Showcase her expertise (20+ years, £100M+ contracts managed, 50+ major programmes)
3. Drive discovery calls and newsletter signups
4. Maintain her authentic, no-nonsense professional voice

Key brand elements:
- OPERATE™ Framework (her proprietary 7-step methodology)
- Website: didianolue.co.uk
- Discovery call: https://calendly.com/theconcurrentcontractor/30min
- LinkedIn: @damaka | Twitter/X: @didianolue | Instagram: @damaka
- Newsletter signup: https://didi-anolue.kit.com/aiplaybook

Always use British English. Write in first person where appropriate for social posts.
Be specific with numbers and credentials. Avoid generic corporate buzzwords."""


def build_user_prompt(context: str, content_type: str) -> str:
    """Build the generation prompt for the requested content type."""

    all_formats = {
        "newsletter": """\
"newsletter": {
  "subject_lines": ["Option 1 (curiosity-driven)", "Option 2 (stat-led)", "Option 3 (benefit-led)"],
  "preview_text": "One sentence teaser under 130 characters",
  "header": "Newsletter issue header / title",
  "intro": "Personalised 2-3 sentence intro (first person)",
  "main_content": "500-word expert insight drawn from the blog posts or homepage content",
  "key_insight": "One punchy, standalone insight the reader can use immediately",
  "cta_text": "Call-to-action button label",
  "cta_url": "https://calendly.com/theconcurrentcontractor/30min"
}""",
        "linkedin": """\
"linkedin": {
  "post_1": {
    "theme": "Thought leadership / expertise",
    "content": "300-600 word post with line breaks for readability",
    "hashtags": ["#Procurement", "...up to 5 relevant hashtags"]
  },
  "post_2": {
    "theme": "Client outcome / case study",
    "content": "300-600 word post with a story arc",
    "hashtags": ["#ContractManagement", "...up to 5 relevant hashtags"]
  }
}""",
        "twitter_x": """\
"twitter_x": {
  "tweet_1": "Under 280 chars — stat or insight",
  "tweet_2": "Under 280 chars — question or controversy",
  "tweet_3": "Under 280 chars — tip or myth-bust",
  "thread_starter": "Under 280 chars to open a thread (ends with 1/)"
}""",
        "instagram": """\
"instagram": {
  "caption_1": {
    "content": "Engaging caption, professional but approachable, 150-200 words",
    "hashtags": ["#Procurement", "...20-25 relevant hashtags"]
  },
  "caption_2": {
    "content": "Behind-the-scenes or personal insight caption",
    "hashtags": ["#ConsultantLife", "...20-25 relevant hashtags"]
  }
}""",
        "facebook": """\
"facebook": {
  "post_1": "Conversational, shareable post 150-300 words",
  "post_2": "Community question or poll prompt 100-200 words"
}""",
    }

    if content_type == "newsletter":
        selected = {"newsletter": all_formats["newsletter"]}
    elif content_type == "social":
        selected = {k: v for k, v in all_formats.items() if k != "newsletter"}
    else:  # "all"
        selected = all_formats

    schema_parts = ",\n".join(
        f'  {v}' for v in selected.values()
    )
    schema = "{\n" + schema_parts + "\n}"

    return f"""Based on the following website content, generate a complete content package.

WEBSITE CONTENT:
{context}

Generate the following content in valid JSON (no markdown fences, pure JSON):

{schema}

Important rules:
- Every string value must be valid JSON (escape quotes, no unescaped newlines).
- Use \\n for line breaks inside string values.
- Return ONLY the JSON object — no preamble, no explanation."""


# ---------------------------------------------------------------------------
# Main generation function
# ---------------------------------------------------------------------------

def generate_content(content_type: str = "all") -> dict:
    """Call Claude to generate the requested content and return parsed dict."""
    client = anthropic.Anthropic()

    print("  Reading website files...")
    context = build_context()

    print("  Calling Claude API (streaming)...")
    user_prompt = build_user_prompt(context, content_type)

    with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=8000,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        response = stream.get_final_message()

    # Extract the text block (there may also be a thinking block)
    text_content = next(
        (block.text for block in response.content if block.type == "text"),
        "",
    )

    # Parse JSON — handle cases where Claude wraps in markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", text_content.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: try to find the JSON object in the response
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group())
        # Return raw so the caller can still save it
        return {"raw_response": text_content}


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def save_content(content: dict, output_file: str | None = None) -> str:
    """Save generated content as JSON and return the file path."""
    if output_file is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"generated_content_{timestamp}.json"

    output_path = Path(__file__).parent / output_file
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(content, f, indent=2, ensure_ascii=False)
    return str(output_path)


def print_summary(content: dict) -> None:
    """Print a readable preview of each content section."""
    print("\n" + "=" * 60)
    print("  GENERATED CONTENT PREVIEW")
    print("=" * 60)

    def _trunc(text: str, n: int = 200) -> str:
        return (text[:n] + "...") if len(text) > n else text

    if "newsletter" in content:
        nl = content["newsletter"]
        print("\n EMAIL NEWSLETTER")
        print("-" * 40)
        for i, s in enumerate(nl.get("subject_lines", []), 1):
            print(f"  Subject {i}: {s}")
        print(f"  Preview : {nl.get('preview_text', '')}")
        print(f"  Header  : {nl.get('header', '')}")
        print(f"  Intro   : {_trunc(nl.get('intro', ''), 150)}")

    if "linkedin" in content:
        print("\n LINKEDIN POSTS")
        print("-" * 40)
        for key, post in content["linkedin"].items():
            theme = post.get("theme", "")
            body = _trunc(post.get("content", ""), 200)
            print(f"  [{key}] {theme}\n  {body}\n")

    if "twitter_x" in content:
        print("\n TWITTER / X POSTS")
        print("-" * 40)
        for key, tweet in content["twitter_x"].items():
            print(f"  [{key}] {tweet}")

    if "instagram" in content:
        print("\n INSTAGRAM CAPTIONS")
        print("-" * 40)
        for key, post in content["instagram"].items():
            print(f"  [{key}] {_trunc(post.get('content', ''), 150)}")

    if "facebook" in content:
        print("\n FACEBOOK POSTS")
        print("-" * 40)
        for key, post in content["facebook"].items():
            print(f"  [{key}] {_trunc(post, 150)}")

    if "raw_response" in content:
        print("\n [raw] Claude returned non-JSON; saved as-is.")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate newsletter & social media content from Didi Anolue's website."
    )
    parser.add_argument(
        "--type",
        choices=["all", "newsletter", "social"],
        default="all",
        help="Content type to generate (default: all)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output JSON filename (default: generated_content_<timestamp>.json)",
    )
    args = parser.parse_args()

    print("Didi Anolue Content Agent")
    print(f"  Mode: {args.type}")
    print()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set.")
        print("  export ANTHROPIC_API_KEY=your-key-here")
        raise SystemExit(1)

    content = generate_content(content_type=args.type)

    output_path = save_content(content, args.output)
    print(f"  Full content saved to: {output_path}")

    print_summary(content)
    print("\nDone.")


if __name__ == "__main__":
    main()
