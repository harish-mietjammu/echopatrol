import socketio

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)


@sio.event
async def connect(sid, environ):
    await sio.emit("server:hello", {"msg": "EchoPatrol live feed connected"}, to=sid)


@sio.event
async def disconnect(sid):
    pass


async def broadcast_violation(incident: dict) -> None:
    await sio.emit("violation:new", incident)


async def broadcast_review(incident: dict) -> None:
    await sio.emit("review:new", incident)
