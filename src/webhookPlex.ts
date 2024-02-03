import { log } from './webhook';
import { Config } from './configure';
import { JellyfinMiniApi, JellyfinProviderSeries, JellyfinSeriesEpisodes } from './jellyfin';

type PlexPayload = {
    event: string;
    user: boolean;
    owner: boolean;
    Account: {
        id: number;
        title: string;
        thumb?: string;
    };
    Server: {
        title: string;
        uuid: string;
    };
    Player?: {
        local: boolean;
        publicAddress?: string;
        title: string;
        uuid: string;
    };
    Metadata?: {
        librarySectionType: string;
        librarySectionTitle: string;
        librarySectionID: number;
        librarySectionKey: string;
        type: string;
        title: string;
        guid: string;
        key: string;
        originalTitle?: string;
        titleSort?: string;
        grandparentKey?: string;
        grandparentGuid?: string;
        grandparentTitle?: string;
        grandparentThumb?: string;
        grandparentArt?: string;
        grandparentSlug?: string;
        parentKey?: string;
        parentGuid?: string;
        parentTitle?: string;
        parentIndex?: number;
        parentThumb?: string;
        summary?: string;
        index: number;
        thumb?: string;
        art?: string;
        addedAt: number;
        updatedAt: number;
        musicAnalysisVersion?: string;
        contentRating?: string;
        Guid: { id: string; }[];
    };
};

const anidb_guid_re = /^com.plexapp.agents.hama:\/\/anidb-(\d+)(?:\/\d+\/\d+)?\?lang=(\w+)$/i;

export async function webhookPlex(config: Config, req: Request, reqid: string, jfApi: JellyfinMiniApi, jfUserId: string, jfLibraryId: string): Promise<Response> {
    const formData = await req.formData();
    if (formData.has("payload")) {
        const rawData = formData.get("payload") as string;
        const data: PlexPayload|undefined = rawData ? JSON.parse(rawData) : undefined;
        if (data == undefined) return new Response("Bad Request", {status: 400, statusText: "Bad Request"});

        log(`[${reqid}] plex: event=${data.event} username=${data.Account.title} library=${data.Metadata?.librarySectionTitle} ...`);
        if (
            (data.event == "media.play") && // XXX: switch back to media.scrobble
            (data.Account.title == config.plex.user) &&
            (data.Metadata?.librarySectionTitle == config.plex.library) &&
            (data.Metadata?.librarySectionType == "show") &&
            (data.Metadata?.type == "episode")
        ) {
            log(`[${reqid}] plex: checking media.scrobble event ...`);

            if (data.Metadata?.guid.startsWith('com.plexapp.agents.hama')) { 
                const anidb_matches = anidb_guid_re.exec(data.Metadata?.guid);
                if (!anidb_matches || anidb_matches.length != 3) {
                    log(`[${reqid}] plex: unable to extract anidb ID from GUID: ${data.Metadata?.guid}!`, "error");
                } else {
                    const anidb_id: number = parseInt(anidb_matches[1]);
                    const media_series = data.Metadata?.grandparentTitle || "Unknown Series";
                    const media_season = (data.Metadata?.parentIndex != undefined) ? data.Metadata?.parentIndex : -1;
                    const media_episode = (data.Metadata?.index != undefined) ? data.Metadata?.index : -1;
                    const media_title = data.Metadata?.title || "Unknown Title";
                    log(`[${reqid}] plex: detected as ${anidb_id}: ${media_series} - S${media_season}E${media_episode} - ${media_title}!`);

                    if ((media_season >= 0) && (media_episode >= 0)) {
                        log(`[${reqid}] plex: querying Jellyfin for matching series ...`);
                        const jfAniDBSeries: JellyfinProviderSeries = await jfApi.getSeriesWithProvider(jfLibraryId, jfUserId, "anidb");
                        if (
                            (Object.keys(jfAniDBSeries).length != 0) ||
                            (Object.keys(jfAniDBSeries).includes(`${anidb_id}`))
                        ) {
                            const jfSeries = jfAniDBSeries[`${anidb_id}`];
                            if (!jfSeries.completed) { // NOTE: do nothing when series already marked as completed
                                const jfEpisodes = await jfApi.getEpisodesFromSeries(jfSeries.id, jfUserId, media_season);
                                for (let episode of Object.values(jfEpisodes)) {
                                    if (episode.season != media_season) continue;
                                    if (episode.episode != media_episode) continue;
                                    if (episode.watched) continue;
                                    if (await jfApi.markWatched(episode.id, jfUserId)) {
                                        log(`[${reqid}] plex: marked as watched on Jellyfin!`);
                                    } else {
                                        log(`[${reqid}] plex: failed to mark as watched on Jellyfin!`, "error");
                                    }
                                }
                            }
                        } else {
                            log(`[${reqid}] plex: unable to find matching anidb series on Jellyfin server!`, "warn"); 
                        }
                    } else {
                        log(`[${reqid}] plex: failed to extra usable season and episode!`, "warn"); 
                    }
                }
            } else {
                log(`[${reqid}] plex: episode metadata not provided by HAMA agent, skipped!`, "warn");
            }
        } else {
            log(`[${reqid}] plex: ignoring, not a media.scrobble event for the target library and user.`);
        }

        return new Response(`[${reqid}] plex: OK`);
    } else {
        return new Response(`[${reqid}] plex: Bad Request`, {status: 400, statusText: "Bad Request"});
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
