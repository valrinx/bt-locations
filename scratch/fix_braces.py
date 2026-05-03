import re

path = r'c:\Users\T\Documents\GitHub\bt-locations\build_html.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Match the html = f'''...''' block
match = re.search(r"(html = f'''|html = f\"\"\")(.*?)('''|\"\"\")", content, re.DOTALL)
if match:
    prefix = match.group(1)
    body = match.group(2)
    suffix = match.group(3)
    
    # We need to find all { and } that are NOT already doubled and NOT variables like {filter_options}
    # This is tricky with regex. Let's do a simpler approach:
    # Double everything, then un-double the known variables.
    
    # Actually, let's just manually fix the specific block I added.
    pass

# Manual fix for the block I added which was missing braces
content = content.replace('function _initMapEvents() {', 'function _initMapEvents() {{')
content = content.replace('if (!map) return;', 'if (!map) return;') # no brace here
content = content.replace("map.on('click', (e) => {", "map.on('click', (e) => {{")
content = content.replace('if (!addMode) return;', 'if (!addMode) return;')
content = content.replace('editingIndex = -1;', 'editingIndex = -1;')
content = content.replace('});', '}});')
content = content.replace('}', '}}') # Be careful with this one

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
