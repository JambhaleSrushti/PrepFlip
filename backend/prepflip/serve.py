"""Production-style entry point: one process, one worker.

In-memory storage lives inside a single process, so never run more than one
worker or instance until a database is added.
"""

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "prepflip.main:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        workers=1,
        proxy_headers=True,
    )


if __name__ == "__main__":
    main()
