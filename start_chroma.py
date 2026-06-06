"""
start_chroma.py -- Starts ChromaDB as an HTTP server on localhost:8000
Works with ChromaDB 1.x (tested on 1.5.9)

Usage:
    python start_chroma.py
"""
import os
import sys

# Fix Windows console encoding issues
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST = "0.0.0.0"
PORT = 8000
PERSIST_DIR = "./chroma_data"

os.makedirs(PERSIST_DIR, exist_ok=True)

try:
    import uvicorn
except ImportError:
    print("[ERROR] uvicorn is not installed. Run: pip install uvicorn")
    sys.exit(1)

try:
    import chromadb
    print(f"ChromaDB version: {chromadb.__version__}")
except ImportError:
    print("[ERROR] chromadb is not installed. Run: pip install chromadb")
    sys.exit(1)

# --- ChromaDB 1.x (uses chromadb.app + FastAPI) ---------------------------
try:
    from chromadb.server.fastapi import FastAPI as ChromaFastAPI

    settings = chromadb.Settings(
        is_persistent=True,
        persist_directory=PERSIST_DIR,
        anonymized_telemetry=False,
    )
    server = ChromaFastAPI(settings)
    print(f"[OK] ChromaDB 1.x server starting on http://localhost:{PORT}")
    print(f"     Data directory : {os.path.abspath(PERSIST_DIR)}")
    print(f"     Press Ctrl+C to stop")
    uvicorn.run(server.app(), host=HOST, port=PORT, log_level="info")
    sys.exit(0)
except ImportError as e:
    print(f"[WARN] chromadb.server.fastapi not available: {e}")

# --- ChromaDB 0.4/0.5 fallback -------------------------------------------
try:
    from chromadb.app import create_app

    settings = chromadb.Settings(
        is_persistent=True,
        persist_directory=PERSIST_DIR,
        anonymized_telemetry=False,
    )
    app = create_app(settings)
    print(f"[OK] ChromaDB 0.4/0.5 server starting on http://localhost:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
    sys.exit(0)
except (ImportError, AttributeError) as e:
    print(f"[WARN] chromadb.app.create_app not available: {e}")

print("[ERROR] Could not find a compatible ChromaDB server entrypoint.")
print("        Try: pip install chromadb uvicorn --upgrade")
sys.exit(1)
