import os
import wavelink

async def setup_lavalink(bot):
    uri = os.getenv("LAVALINK_URI", "http://127.0.0.1:2333")
    password = os.getenv("LAVALINK_PASSWORD", "youshallnotpass")
    node = wavelink.Node(uri=uri, password=password, identifier="main")
    await wavelink.Pool.connect(nodes=[node], client=bot, cache_capacity=100)
