import os
import logging
import discord
import wavelink

log = logging.getLogger("music")

LAVALINK_URI = os.getenv("LAVALINK_URI", "http://127.0.0.1:2333")
LAVALINK_PASSWORD = os.getenv("LAVALINK_PASSWORD", "youshallnotpass")


async def connect_nodes(bot: discord.Client) -> None:
    node = wavelink.Node(
        uri=LAVALINK_URI,
        password=LAVALINK_PASSWORD,
    )
    await wavelink.Pool.connect(
        nodes=[node],
        client=bot,
        cache_capacity=100,
    )
    log.info("Lavalink-Verbindung wird aufgebaut: %s", LAVALINK_URI)


async def get_player(guild: discord.Guild, channel: discord.VoiceChannel) -> wavelink.Player:
    current = guild.voice_client

    if isinstance(current, wavelink.Player):
        if current.channel and current.channel.id != channel.id:
            await current.move_to(channel)
        return current

    return await channel.connect(cls=wavelink.Player)


async def play_query(
    guild: discord.Guild,
    channel: discord.VoiceChannel,
    query: str,
) -> wavelink.Playable:
    player = await get_player(guild, channel)

    tracks = await wavelink.Playable.search(query)
    if not tracks:
        raise RuntimeError("Lavalink hat keinen passenden Titel gefunden.")

    track = tracks[0]
    await player.play(track)
    return track


async def stop(guild: discord.Guild) -> None:
    player = guild.voice_client
    if isinstance(player, wavelink.Player):
        await player.stop()


async def disconnect(guild: discord.Guild) -> None:
    player = guild.voice_client
    if isinstance(player, wavelink.Player):
        await player.disconnect(force=True)


async def close() -> None:
    try:
        await wavelink.Pool.close()
    except Exception:
        pass
