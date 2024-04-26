import fs from 'node:fs';
import path from 'node:path';
import AniList from "anilist-node";
import { Anilist } from "anilist-node";
import { Config } from './configure'
import { ScrobbleResult } from './scrobbler';
import { JellyfinMiniApi, JellyfinProviderSeries } from './jellyfin';

type PlexMetaManagerMapping = {
    [anidb: string]: {
        tvdb_id?: number;
        tvdb_season?: number;
        tvdb_epoffset?: number;
        mal_id?: number;
        anilist_id?: number;
        imdb_id?: string;
    };
};

const PlexMetaManagerUrl: string = "https://raw.githubusercontent.com/Kometa-Team/Anime-IDs/master/anime_ids.json";

export class ScrobblerAnilist {
    private config: Config;
    private cacheDir: string;
    private api: Anilist | undefined;
    private anilistProfileId: number | undefined;
    private jellyfinApi: JellyfinMiniApi | undefined;
    private jellyfinUserId: string | undefined;
    private jellyfinLibraryId: string[];

    public constructor(config: Config) {
        this.config = config;
        this.cacheDir =  path.join('/var/tmp', 'anidb-watched-sync');
        this.jellyfinLibraryId = [];
    }

    public async init(): Promise<void> {
        if (this.config.anilist.token == undefined) {
            throw new Error("INFO_ANILIST_CONFIG");
        }

        this.api = new AniList(this.config.anilist.token);
        const profile = await this.api.user.getAuthorized();
        if (profile.id == undefined) {
            throw new Error("ERR_ANILIST_PROFILE");
        } else {
            this.anilistProfileId = profile.id;
        }

        // jellyfin config is optional (so non fatal if not configured)
        await this.initJellyfinApi();
    }

    private async initJellyfinApi(): Promise<void> {
        if (
            (this.jellyfinApi == undefined) &&
            (this.config.jellyfin.url != undefined) &&
            (this.config.jellyfin.apiKey != undefined) &&
            (this.config.jellyfin.user != undefined) &&
            (this.config.jellyfin.library.length != 0)
        ) { 
            try {
                this.jellyfinApi = new JellyfinMiniApi(this.config.jellyfin.url, this.config.jellyfin.apiKey, this.config.jellyfin.caFile);
                const userId = await this.jellyfinApi.getUserId(this.config.jellyfin.user);
                if (userId != undefined) {
                    this.jellyfinUserId = userId;

                    for (const library of this.config.jellyfin.library) {
                        const libraryId = await this.jellyfinApi.getLibraryId(library, this.jellyfinUserId);
                        if (libraryId != undefined) {
                            this.jellyfinLibraryId.push(libraryId);
                        }
                    }
                }

                // unset jellyfinApi if config not OK
                if (
                    (this.jellyfinLibraryId.length == 0) ||
                    (this.jellyfinUserId == undefined)
                ) {
                    this.jellyfinApi = undefined;
                    this.jellyfinUserId = undefined;
                    this.jellyfinLibraryId = [];
                }
            } catch (err: unknown) {
                this.jellyfinApi = undefined;
            }
        }
    }

    private async lookupJellyfinAnilistId(aid: number): Promise<number> {
        await this.initJellyfinApi();
        if ((this.jellyfinApi == undefined) || (this.jellyfinUserId == undefined)) return -1;

        for (const libraryId of this.jellyfinLibraryId) {
            const series: JellyfinProviderSeries = await this.jellyfinApi.getSeriesWithProvider(libraryId, this.jellyfinUserId, "anidb");
            if (Object.keys(series).includes(`${aid}`)) {
                const targetSeries = series[`${aid}`];
                if (targetSeries.providerIds.anilist != undefined) {
                    return targetSeries.providerIds.anilist;
                }
            }
        }

        return -1;
    }

    private async lookupMappedAnilistId(aid: number, retryDownload: number = 1): Promise<number> {
        const mappingFile = path.join(this.cacheDir, 'mapping.json');
        try {
            fs.mkdirSync(this.cacheDir, { recursive: true, mode: 0o755 });

            // expire cached file if older than 7 days 
            if (fs.existsSync(mappingFile)) {
                const cacheStats = fs.statSync(mappingFile);
                if (((new Date().getTime() - cacheStats.mtimeMs) / 1000 / 3600 / 24) > 7) {
                     fs.unlinkSync(mappingFile);
                }
            }

            // download mapping if required
            if (!fs.existsSync(mappingFile)) {
                const response = await fetch(PlexMetaManagerUrl);
                await Bun.write(mappingFile, response);
                fs.chmodSync(mappingFile, 0o666);
            }

            // search mapping
            if (fs.existsSync(mappingFile)) {
                const mapping: PlexMetaManagerMapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
                if (mapping[`${aid}`] != undefined) {
                    const anilistId: number | undefined = mapping[`${aid}`].anilist_id;
                    if (anilistId != undefined) return anilistId;
                }
            }
        } catch (err: unknown) {
            try {
                const error = err as Error;
                if (error.name == "SyntaxError") {
                    fs.unlinkSync(mappingFile);
                    if (retryDownload > 0) {
                        return await this.lookupMappedAnilistId(aid, (retryDownload - 1));
                    } else {
                        return -1;
                    }
                }
            } catch (err: unknown) {
                return -1;
            }
        }

        return -1;
    }

    public async scrobble(aid: number, episode: number, season: number = 1): Promise<ScrobbleResult> {
        if ((this.api == undefined) || (this.anilistProfileId == undefined)) {
            return {
                success: false,
                log_lvl: "error",
                log_msg: "not initialized!",
            } as ScrobbleResult;
        } 

        if (season != 1) {
            return {
                success: false,
                log_lvl: "warn",
                log_msg: "can only scrobble normal episodes (season != 1).",
            } as ScrobbleResult;
        }

        // map anidb to anilist Id (mapping is faster than querying jellyfin)
        let anilistId: number = await this.lookupMappedAnilistId(aid);
        if (anilistId == -1) anilistId = await this.lookupJellyfinAnilistId(aid);
        if (anilistId == -1) {
            return {
                success: false,
                log_lvl: "warn",
                log_msg: `could not find series with anidb id ${aid} on anilist.`,
            } as ScrobbleResult;
        }

        try {
            for (const list of await this.api.lists.anime(this.anilistProfileId)) {
                // only increase progress if in Watching list
                if (list.name == 'Watching') {
                    for (const entry of list.entries) {
                        if (entry.id == undefined) continue;
                        if (entry.media.id != anilistId) continue;

                        // sanity check before advancing progress
                        if (entry.progress >= episode) {
                            return {
                                success: false,
                                log_lvl: "warn",
                                log_msg: "skipping update, anilist progress > current episode.",
                            } as ScrobbleResult;
                        } else if ((entry.media.episodes == undefined) || (entry.media.episodes < episode)) {
                            return {
                                success: false,
                                log_lvl: "warn",
                                log_msg: "skipping update, current episode is > max episodes.",
                            } as ScrobbleResult;
                        }

                        // create updated entry (UpdateEntryOptions type is broken)
                        const updatedEntry: any = { "progress": episode };
                        if (updatedEntry.progress == entry.media.episodes) {
                            // mark as completed if episode is final episode
                            updatedEntry.status = "COMPLETED";
                        }

                        // apply update
                        const result = await this.api.lists.updateEntry(entry.id, updatedEntry);
                        if (result.status == "COMPLETED") {
                            return {
                                success: true,
                                log_lvl: "info",
                                log_msg: "series marked completed.",
                            } as ScrobbleResult;
                        } else if ((result.status != "CURRENT") || (result.progress != episode)) {
                            return {
                                success: false,
                                log_lvl: "error",
                                log_msg: `API returned unexpected result: ${JSON.stringify(result)}`,
                            } as ScrobbleResult;
                        } else {
                            return {
                                success: true,
                                log_lvl: "info",
                                log_msg: "successful.",
                            } as ScrobbleResult;
                        }
                    }

                // allow Planning -> Watching if episode 1 is played
                } else if (list.name == 'Planning') {
                    for (const entry of list.entries) {
                        if (entry.id == undefined) continue;
                        if (entry.media.id != anilistId) continue;

                        if (episode != 1) {
                            return {
                                success: false,
                                log_lvl: "warn",
                                log_msg: 'skipping update, anime on "Planning" list but this is not the first episode.',
                            } as ScrobbleResult;
                        }

                        // create updated entry (UpdateEntryOptions type is broken)
                        const updatedEntry: any = { "progress": episode, "status": "CURRENT" };
                        if (updatedEntry.progress == entry.media.episodes) {
                            // mark as completed if episode is final episode
                            updatedEntry.status = "COMPLETED";
                        }

                        // apply update
                        const result = await this.api.lists.updateEntry(entry.id, updatedEntry);
                        if (result.status == "COMPLETED") {
                            return {
                                success: true,
                                log_lvl: "info",
                                log_msg: "series marked completed.",
                            } as ScrobbleResult;
                        } else if ((result.status != "CURRENT") || (result.progress != episode)) {
                            return {
                                success: false,
                                log_lvl: "error",
                                log_msg: `API returned unexpected result: ${JSON.stringify(result)}`,
                            } as ScrobbleResult;
                        } else {
                            return {
                                success: true,
                                log_lvl: "info",
                                log_msg: "successful.",
                            } as ScrobbleResult;
                        }
                    }
                }
            }
        } catch (err: unknown) {
            return {
                success: false,
                log_lvl: "error",
                log_msg: `something went wrong while connecting to anilist.`,
            } as ScrobbleResult;
        } 

        return {
            success: false,
            log_lvl: "warn",
            log_msg: 'series not on "Watching" or "Planning" list',
        } as ScrobbleResult;
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
