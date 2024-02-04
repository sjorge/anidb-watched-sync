import { log } from './logger';
import { Config } from './configure';
import { Scrobblers, ScrobbleResult } from './scrobbler';
import { JellyfinProviderSeries, JellyfinSeriesEpisodes } from './jellyfin';

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
    Metadata: {
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

export async function webhookPlex(config: Config, scrobbler: Scrobblers, req: Request, reqid: string): Promise<Response> {
    if ((config.plex.library.length == 0) && (config.plex.user == undefined)) {
        return new Response(`[${reqid}] plex: Service Unavailable, not configured.`, {status: 503, statusText: "Service Unavailable"});
    }

    const formData = await req.formData();
    if (formData.has("payload")) {
        const rawData = formData.get("payload") as string;
        const data: PlexPayload|undefined = rawData ? JSON.parse(rawData) : undefined;
        if (data == undefined) return new Response("Bad Request", {status: 400, statusText: "Bad Request"});

        log(`[${reqid}] plex: event=${data.event} username=${data.Account.title} library=${data.Metadata?.librarySectionTitle} ...`);
        if (
            (data.event == "media.scrobble") &&
            (data.Account.title == config.plex.user) &&
            (config.plex.library.includes(data.Metadata?.librarySectionTitle)) &&
            (data.Metadata?.librarySectionType == "show") &&
            (data.Metadata?.type == "episode")
        ) {
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
                        if (scrobbler.jellyfin?.scrobble !== undefined) {
                            scrobbler.jellyfin.scrobble(anidb_id, media_episode, media_season)
                                .then((result: ScrobbleResult) => {
                                    log(`[${reqid}] plex: scrobbled to Jellyfin: ${result.log_msg}`, result.log_lvl);
                                });
                        }
                        if (scrobbler.anilist?.scrobble !== undefined) {
                            scrobbler.anilist.scrobble(anidb_id, media_episode, media_season)
                                .then((result: ScrobbleResult) => {
                                    log(`[${reqid}] plex: scrobbled to Anilist: ${result.log_msg}`, result.log_lvl);
                                });
                        }
                    } else {
                        log(`[${reqid}] plex: failed to extract usable season and episode!`, "warn"); 
                    }
                }
            } else {
                log(`[${reqid}] plex: episode metadata not provided by HAMA agent, skipped!`, "warn");
            }
        } else {
            log(`[${reqid}] plex: ignoring, not interested in this event.`);
        }

        return new Response(`[${reqid}] plex: OK`);
    } else {
        return new Response(`[${reqid}] plex: Bad Request`, {status: 400, statusText: "Bad Request"});
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
