"""Wait for the production domain to serve the checked-out static site."""

import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_file(item):
    path, expected = item
    route = "/" if path == "index.html" else "/" + path
    if route.endswith(".html"):
        route = route[:-5]
    url = os.environ.get("PRODUCTION_URL", "https://mldylabs.com").rstrip("/")
    url += urllib.parse.quote(route) + "?deployment-check=" + os.environ.get("GITHUB_SHA", "manual")
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            actual = response.read()
    except urllib.error.HTTPError as error:
        # Vercel serves the custom 404 page with the correct 404 status.
        if path != "404.html" or error.code != 404:
            return path + ": HTTP " + str(error.code)
        actual = error.read()
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return path + ": " + str(error)
    if digest(actual) != expected:
        return path + ": production content differs from this commit"
    return None


def check_vercel_status():
    repository = os.environ.get("GITHUB_REPOSITORY")
    sha = os.environ.get("GITHUB_SHA")
    if not repository or not sha:
        return
    url = f"https://api.github.com/repos/{repository}/commits/{sha}/status"
    request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "MLDY-production-verifier"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            statuses = json.load(response).get("statuses", [])
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        print(f"Could not read Vercel commit status: {error}", flush=True)
        return
    # The endpoint returns the newest status for each context first.
    status = next((item for item in statuses if item.get("context") == "Vercel"), None)
    if status and status.get("state") in {"failure", "error"}:
        raise SystemExit("Vercel rejected deployment: " + status.get("description", "Check the Vercel dashboard."))


def main():
    paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
    extensions = {".html", ".css", ".png", ".webp", ".ico", ".xml", ".txt"}
    files = [(path, digest(subprocess.check_output(["git", "show", "HEAD:" + path]))) for path in paths
             if path and not path.startswith((".", "api/"))
             and Path(path).suffix in extensions]
    if not files:
        raise SystemExit("No static site files found to verify.")
    deadline = time.monotonic() + int(os.environ.get("VERIFY_TIMEOUT_SECONDS", "900"))
    while True:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            failures = [result for result in pool.map(verify_file, files) if result]
        if not failures:
            message = f"Verified {len(files)} static files on production for {os.environ.get('GITHUB_SHA', 'manual check')}."
            print(message, flush=True)
            if os.environ.get("GITHUB_STEP_SUMMARY"):
                with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
                    summary.write(message + "\n")
            return
        print("Waiting for production: " + "; ".join(failures), flush=True)
        if time.monotonic() >= deadline:
            check_vercel_status()
            raise SystemExit("Production verification timed out. Check the Vercel hook branch, build logs, and production domain assignment.")
        time.sleep(15)


if __name__ == "__main__":
    main()
