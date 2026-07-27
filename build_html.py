import json
import os
import shutil


def build():
    print("[BUILD] Starting build process (Safe Version)...")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(script_dir, "all_locations.json")
    docs_dir = os.path.join(script_dir, "docs")

    if not os.path.exists(json_path):
        print(f"[BUILD] Error: {json_path} not found")
        return False

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            locations = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[BUILD] Error parsing JSON: {exc}")
        return False

    print(f"[BUILD] Loaded {len(locations)} locations")
    os.makedirs(docs_dir, exist_ok=True)

    js_content = (
        "const DEFAULT_LOCATIONS = "
        f"{json.dumps(locations, ensure_ascii=False)};"
    )
    locations_js = os.path.join(docs_dir, "locations.js")
    with open(locations_js, "w", encoding="utf-8") as f:
        f.write(js_content)
    print("[BUILD] Generated docs/locations.js")

    shutil.copy2(json_path, os.path.join(docs_dir, "all_locations.json"))
    print("[BUILD] Synced docs/all_locations.json")
    print("[BUILD] Success! UI preserved, data updated.")
    return True


if __name__ == "__main__":
    raise SystemExit(0 if build() else 1)
