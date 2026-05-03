import json
import os
import shutil

def build():
    print("[BUILD] Starting build process (Safe Version)...")
    
    # 1. Load data
    json_path = 'all_locations.json'
    if not os.path.exists(json_path):
        print(f"[BUILD] Error: {json_path} not found")
        return

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            locations = json.load(f)
    except Exception as e:
        print(f"[BUILD] Error parsing JSON: {e}")
        return

    print(f"[BUILD] Loaded {len(locations)} locations")

    # 2. Generate locations.js
    js_content = f"const DEFAULT_LOCATIONS = {json.dumps(locations, ensure_ascii=False)};"
    with open('docs/locations.js', 'w', encoding='utf-8') as f:
        f.write(js_content)
    print("[BUILD] Generated docs/locations.js")

    # 3. Ensure docs/all_locations.json is synced
    shutil.copy2(json_path, 'docs/all_locations.json')
    print("[BUILD] Synced docs/all_locations.json")

    print("[BUILD] Success! UI preserved, data updated.")

if __name__ == "__main__":
    build()
