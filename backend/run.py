"""Dev entrypoint: `python run.py` starts the ASGI app on :8000."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:asgi",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["app"],
    )
