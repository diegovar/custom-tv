import functions_framework
import urllib.request
import json
import re

@functions_framework.http
def resolve_photos(request):
    """
    HTTP Cloud Function that takes a Google Photos shared album URL
    and returns a list of direct 4K UHD image URLs.
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
        # Note: Using generic Mozilla User-Agent causes Google Photos to return
        # the server-rendered initial data payload containing all photo URLs.
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

        matches = re.findall(r'https://lh3\.googleusercontent\.com/pw/[a-zA-Z0-9_\-]+', html)
        seen = set()
        photos = []
        for m in matches:
            if m not in seen:
                seen.add(m)
                photos.append(f"{m}=w3840-h2160")

        return (json.dumps({'photos': photos, 'count': len(photos)}), 200, cors_headers)
    except Exception as e:
        return (json.dumps({'error': str(e)}), 500, cors_headers)
