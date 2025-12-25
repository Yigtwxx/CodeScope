import json
import os

try:
    with open('lint_results.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for file_data in data:
        filename = os.path.basename(file_data['filePath'])
        for msg in file_data['messages']:
            print(f"{filename}:{msg['line']}:{msg.get('ruleId', 'N/A')}:{msg['message']}")
except Exception as e:
    print(f"Error: {e}")
