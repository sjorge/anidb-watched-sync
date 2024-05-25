import { log } from './logger';
import { Config } from './configure';
import { Scrobblers, ScrobbleResult } from './scrobbler';
import { JellyfinMiniApi, JellyfinEpisodeDetail } from './jellyfin';

// WARN: partial type
type JellyfinPayload = {
    NotificationType: string;
    NotificationUsername: string;
    ItemType: "Episode" | "Season" | "Series" | "Movie" | "Song";
    PlayedToCompletion: boolean;
    SeasonNumber: number;
    EpisodeNumber: number;
    ServerId: string;
    ItemId: string;
    UserId: string;
    SeriesName: string;
    Name: string;
    PlaybackPositionTicks?: number,
    RunTimeTicks?: number,
    IsPaused?: boolean;
};

export async function webhookJellyfin(config: Config, scrobbler: Scrobblers, req: Request, reqid: string): Promise<Response> {
    if (
        (config.jellyfin.url == undefined) ||
        (config.jellyfin.apiKey == undefined) ||
        (config.jellyfin.user == undefined) ||
        (config.jellyfin.library.length == 0)
    ) {
        return new Response(`[${reqid}] jellyfin: Service Unavailable, not configured.`, {status: 503, statusText: "Service Unavailable"});
    }

    const api: JellyfinMiniApi = new JellyfinMiniApi(config.jellyfin.url, config.jellyfin.apiKey, config.jellyfin.caFile);

    try {
        const data: JellyfinPayload|undefined = await req.json() as JellyfinPayload;
        if (data == undefined) return new Response("Bad Request", {status: 400, statusText: "Bad Request"});

        if ( // NOTE: no (easy?) way to get libraryId or name, assuming webhook is configured correctly
            (data.NotificationType == "PlaybackStop") &&
            (data.PlayedToCompletion == true) &&
            (data.ItemType == "Episode") &&
            (data.NotificationUsername == config.jellyfin.user)
        ) {
            log(`[${reqid}] jellyfin: event=${data.NotificationType} username=${data.NotificationUsername} completed=${data.PlayedToCompletion} ...`);
            // retrieve required information
            const episodeData: JellyfinEpisodeDetail|undefined = await api.getEpisodeData(data.ItemId, data.UserId);
            if ((episodeData != undefined) && (episodeData.ProviderIds.anidb != undefined)) {
                const anidb_id: number = episodeData.ProviderIds.anidb;
                const media_series = (data.SeriesName != undefined) ? data.SeriesName : "Unknown Series";
                const media_season = (episodeData.ParentIndexNumber != undefined) ? episodeData.ParentIndexNumber : -1;
                const media_episode = (episodeData.IndexNumber != undefined) ? episodeData.IndexNumber : -1;
                const media_title = (data.Name != undefined) ? data.Name : "Unknown Title";
                log(`[${reqid}] jellyfin: detected as ${anidb_id}: ${media_series} - S${media_season}E${media_episode} - ${media_title}!`);

                if ((media_season >= 0) && (media_episode >= 0)) {
                    if (scrobbler.plex?.scrobble !== undefined) {
                        scrobbler.plex.scrobble(anidb_id, media_episode, media_season)
                            .then((result: ScrobbleResult) => {
                                log(`[${reqid}] jellyfin: scrobbled to Plex: ${result.log_msg}`, result.log_lvl);
                            });
                    }
                    if (scrobbler.anilist?.scrobble !== undefined) {
                        scrobbler.anilist.scrobble(anidb_id, media_episode, media_season)
                            .then((result: ScrobbleResult) => {
                                log(`[${reqid}] jellyfin: scrobbled to Anilist: ${result.log_msg}`, result.log_lvl);
                            });
                    }
                } else {
                    log(`[${reqid}] jellyfin: failed to extract usable season and episode!`, "warn");
                }
            } else {
                log(`[${reqid}] jellyfin: ignoring, could not retrieve needed data.`, "warn");
            }
        } else if (
            (data.NotificationType == "PlaybackProgress") &&
            (data.ItemType == "Episode") &&
            (data.NotificationUsername == config.jellyfin.user) &&
            ((data.IsPaused !== undefined) && (!data.IsPaused)) &&
            (scrobbler.plex?.scrobble !== undefined)
        ) {
            let progress = 0;
            let plex_runtime = 0;
            if (data.PlaybackPositionTicks && data.RunTimeTicks) {
                progress = (data.PlaybackPositionTicks / data.RunTimeTicks) * 100;
                progress = Math.round(progress * 100) / 100;
                plex_runtime = Math.round(data.PlaybackPositionTicks / 10000);
            }
            log(`[${reqid}] jellyfin: event=${data.NotificationType} username=${data.NotificationUsername} progress=${progress}% ...`);
            if ((plex_runtime >= 60001) && (plex_runtime % 15000 < 1001)) {
                const episodeData: JellyfinEpisodeDetail|undefined = await api.getEpisodeData(data.ItemId, data.UserId);
                if ((episodeData != undefined) && (episodeData.ProviderIds.anidb != undefined)) {
                    const anidb_id: number = episodeData.ProviderIds.anidb;
                    const media_series = (data.SeriesName != undefined) ? data.SeriesName : "Unknown Series";
                    const media_season = (episodeData.ParentIndexNumber != undefined) ? episodeData.ParentIndexNumber : -1;
                    const media_episode = (episodeData.IndexNumber != undefined) ? episodeData.IndexNumber : -1;
                    const media_title = (data.Name != undefined) ? data.Name : "Unknown Title";
                    log(`[${reqid}] jellyfin: detected as ${anidb_id}: ${media_series} - S${media_season}E${media_episode} - ${media_title}!`);

                    if ((media_season >= 0) && (media_episode >= 0)) {
                        scrobbler.plex.progress(anidb_id, plex_runtime, media_episode, media_season)
                            .then((result: ScrobbleResult) => {
                                log(`[${reqid}] jellyfin: progress send to plex: ${result.log_msg}`, result.log_lvl);
                            });
                    }
                }
            }
        } else {
            log(`[${reqid}] jellyfin: event=${data.NotificationType} username=${data.NotificationUsername}, ignoring, not interested in this event.`);
        }

        return new Response(`[${reqid}] jellyfin: OK`);
    } catch (error) {
        return new Response(`[${reqid}] jellyfin: Bad Request`, {status: 400, statusText: "Bad Request"});
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
