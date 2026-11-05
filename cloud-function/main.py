import functions_framework
import urllib.request
import json
import re

def extract_photos_from_html(html):
    """
    Extracts high-resolution photo URLs from Google Photos shared album HTML,
    filtering out videos and video thumbnail previews.
    """
    photos = []
    
    # Try parsing Google Photos structured ds:1 data
    # Protobuf tag '76647426' indicates VideoMetadata (duration, video dimensions, etc.)
    m = re.search(r'AF_initDataCallback\(\{key:\s*\'ds:1\'.*?data:(.*?),\s*sideChannel:', html, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group(1))
            items = data[1] if len(data) > 1 and isinstance(data[1], list) else []
            for it in items:
                # Skip video entries
                meta = it[9] if len(it) > 9 and isinstance(it[9], dict) else {}
                if '76647426' in meta:
                    continue

                # Photo media base URL is in it[1][0]
                if len(it) > 1 and isinstance(it[1], list) and len(it[1]) > 0:
                    base_url = it[1][0]
                    if isinstance(base_url, str) and base_url.startswith('https://lh3.googleusercontent.com/'):
                        photos.append(f"{base_url}=w3840-h2160")
        except Exception:
            pass

    # Fallback to regex if structured data could not be parsed
    if not photos:
        matches = re.findall(r'https://lh3\.googleusercontent\.com/pw/[a-zA-Z0-9_\-]+', html)
        seen = set()
        for u in matches:
            if u not in seen:
                seen.add(u)
                photos.append(f"{u}=w3840-h2160")

    return photos

@functions_framework.http
def resolve_photos(request):
    """
    HTTP Cloud Function that takes a Google Photos shared album URL
    and returns a list of direct 4K UHD image URLs (excluding videos).
    """
    cors_headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    }

    # Handle CORS preflight OPTIONS request
    if request.method == 'OPTIONS':
        return ('', 204, cors_headers)

    url = request.args.get('url') if request.args else None
    if not url and request.is_json:
        data = request.get_json(silent=True) or {}
        url = data.get('url')

    if not url:
        return (json.dumps({'error': 'Missing "url" parameter'}), 400, cors_headers)

    # Validate Google Photos link domain
    if not (url.startswith('https://photos.app.goo.gl/') or url.startswith('https://photos.google.com/share/')):
        return (json.dumps({'error': 'Invalid URL. Must be a Google Photos shared album link.'}), 400, cors_headers)

    try:
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        photos = extract_photos_from_html(html)

        return (json.dumps({'photos': photos, 'count': len(photos)}), 200, cors_headers)
    except Exception as e:
        return (json.dumps({'error': str(e)}), 500, cors_headers)
