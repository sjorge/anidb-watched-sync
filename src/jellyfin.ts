import axios from 'axios';
import https from 'node:https';
import fs from 'node:fs';

export type JellyfinProviderSeries = {
    [providerId: number]: {
        name: string;
        id: string;
        completed: boolean;
        providerIds: {
            anidb?: number;
            anilist?: number;
        };
    };
};

export type JellyfinSeriesEpisodes = {
    [episode: number]: {
        id: string;
        season: number;
        episode: number;
        watched: boolean;
    };
};

export class JellyfinMiniApi {
    private client;

    public constructor(url: string, apiKey: string, caFile: string|undefined) {
        const httpClient = caFile ? 
            new https.Agent({ ca: fs.readFileSync(caFile), keepAlive: true }) :
            new https.Agent({ keepAlive: true });

        this.client = axios.create({
            baseURL: url.endsWith("/") ?  url : `${url}/`,
            httpsAgent: httpClient,
            timeout: 10000,
            headers: {
                "Accept": "application/json",
                "X-Emby-Token": apiKey,
                "X-Emby-Authorization": 'MediaBrowser, Client="other", Device="script", DeviceId="script", Version="0.0.0"',
            }
        });
    }

    private async query(endpoint: string, type: "POST"|"GET" = "GET"): Promise<any> {
        if (type == "GET") {
            const res = await this.client.get(endpoint);
            if (res.status !== 200) {
                throw new Error(`Jellyfin API ${type} for ${endpoint} returned status ${res.status}!`);
            } else {
                return res.data;
            }
        } else if (type == "POST") {
            const res = await this.client.post(endpoint);
            if (res.status !== 200) {
                throw new Error(`Jellyfin API ${type} for ${endpoint} returned status ${res.status}!`);
            } else {
                return res.data;
            }
        }
    }

    public async getInfo(): Promise<string> {
        const info = await this.query("/System/Info/Public");
        return `${info.ServerName}: ${info.Version}`;
    }

    public async getUserId(username: string): Promise<string|undefined> {
        const users = await this.query("/Users");
        for (const user of users) {
            if (user.Name == username) return user.Id;
        }

        return undefined;
    }

    public async getLibraryId(libraryName: string, userId: string): Promise<string|undefined> {
        const libraries = await this.query(`/Users/${userId}/Views`);

        for (const library of libraries.Items) {
            if (library.Name == libraryName) return library.Id;
        }

        return undefined;
    }

    public async getSeriesWithProvider(libraryId: string, userId: string, providerName: string): Promise<JellyfinProviderSeries> {
        const shows: JellyfinProviderSeries = {};

        let index: number = 0;
        let total: number = 100;

        while (index < total) {
            const res = await this.query(
                `/Users/${userId}/Items` +
                `?ParentId=${libraryId}&Recursive=True&IncludeItemTypes=Series&Fields=ProviderIds,Path,RecursiveItemCount&limit=100&StartIndex=${index}`
            );

            total = res.TotalRecordCount;
            index += 100;

            for (const show of res.Items) {
                const providerId = show.ProviderIds[providerName];
                if (providerId !== undefined) {
                    shows[providerId] = {
                        id: show.Id,
                        name: show.Name,
                        completed: (show.UserData.PlayedPercentage == 100),               
                        providerIds: {
                            anidb: show.ProviderIds.anidb ? parseInt(show.ProviderIds.anidb) : undefined,
                            anilist: show.ProviderIds.anilist ? parseInt(show.ProviderIds.anilist) : undefined,
                        },
                    };
                }
            }
        }
        
        return shows;
    }

    public async getEpisodesFromSeries(seriesId: string, userId: string, season: number = 1): Promise<JellyfinSeriesEpisodes> {
        const episodes: JellyfinSeriesEpisodes = {};

        let index: number = 0;
        let total: number = 100;

        while (index < total) {
            const res = await this.query(
                `/Users/${userId}/Items` +
                `?ParentId=${seriesId}&Recursive=True&IncludeItemTypes=Episodes&Fields=ProviderIds,Path,RecursiveItemCount&limit=100&StartIndex=${index}`
            );

            total = res.TotalRecordCount;
            index += 100;

            for (const episode of res.Items) {
                if (episode.ParentIndexNumber != season) continue;
                episodes[episode.IndexNumber] = {
                    id: episode.Id,
                    season: episode.ParentIndexNumber,
                    episode: episode.IndexNumber,
                    watched: episode.UserData.Played,
                };
            }
        }

        return episodes;
    }

    public async markWatched(itemId: string, userId: string): Promise<boolean> {
        try {
            const res = await this.query(`/Users/${userId}/PlayedItems/${itemId}`, "POST");
            return res.Played;
        } catch (e) {
            return false;
        }

        return false;
    }
}

// vim: tabstop=4 shiftwidth=4 softtabstop=0 smarttab expandtab
