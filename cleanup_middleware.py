#!/usr/bin/env python3
"""
Cleanup unnecessary middleware files.
Keep only: auth.js and errorHandler.js (required for Python services)
"""

import os
import glob

middleware_dir = r"c:\Users\irosa\Desktop\Claude\DEX\backend\src\middleware"

# Files to keep (required for Python services integration)
keep_files = {
    "auth.js",
    "errorHandler.js"
}

# Get all .js files in middleware directory
all_files = glob.glob(os.path.join(middleware_dir, "*.js"))

deleted_count = 0
kept_files = []

for filepath in all_files:
    filename = os.path.basename(filepath)

    if filename not in keep_files:
        try:
            os.remove(filepath)
            deleted_count += 1
            print("Deleted: " + filename)
        except Exception as e:
            print("Error deleting {}: {}".format(filename, e))
    else:
        kept_files.append(filename)

print("\n" + "="*60)
print("Middleware Cleanup Complete")
print("="*60)
print("\nKept files ({} file{}):".format(len(kept_files), "" if len(kept_files) == 1 else "s"))
for f in sorted(kept_files):
    print("  - " + f)

print("\nDeleted: {} unnecessary middleware file{}".format(
    deleted_count,
    "" if deleted_count == 1 else "s"
))

print("\nRemaining middleware files are all that is needed for")
print("Python services integration with authMiddleware.requireAuth()")
