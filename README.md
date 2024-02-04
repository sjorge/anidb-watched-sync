# anidb-watched-sync
This is a webhook server that handles incomming webhook requests from **Plex Media Server** and **Jellyfin**.

It is able to scrobble anime playback to **Anilist**, **Plex**, and **Jellyfin**, depending on what is configured.

## building

Make sure you have [bun](https://github.com/oven-sh/bun/) installed. 

```bash
git clone <repo_url>
cd anidb-watched-sync
bun install
bun run compile
```

You can now copy `bin/aws` to somewhere in your path.


## configuration

For brevity anidb-watched-sync will be refered to as **aws**.

### plex incomming webhook

Plex provides all the information in the webook payload to scrobble to Anilist and Jellyfin, as long as the [com.plexapp.agents.hama](https://github.com/ZeroQI/Hama.bundle) agent is used. Also you must provide a library and username to limit for who/what we scrobble.

1. Go to the [webhook configuration](https://app.plex.tv/desktop/#!/settings/webhooks) page on plex.
2. Click `Add webhook`
3. Enter the URL where **aws** is listening and use the */plex* endpoint e.g. `http://localhost:4090/plex`
4. Configure the following on **aws**
```bash
aws configure --plex-library "Anime,Anime Movies" --plex-user "plexuser"
```

### jellyfin incomming webhook

Jellyfin does not provide all the information in it's webhook payload, in addition to using the anidb as primary metadata provider (we required the anidb field to be set), we most also provide a library, username, api key, and server url.

The library and username will be used to limit for who/what we scrobble, they will also be used in combination with the server url and api key to lookup the missing information needed.

1. Install the webhook plugin in Jellyfin
2. Go to the webhook plugin configuration page
3. Click `Add Generic Destination`
4. Set the `Webhook Url` to the URL where **aws** is listening and use the */jellyfin* endpoint e.g. `http://localhost:4090/jellyfin`
5. Only check `Playback Stop` under `Notification Type`
6. Only check your user under `User Filter`
7. Only check `Episodes` under `Item Type`
8. Check `Send All Properties (ignores template)`
9. Configure the following on **aws**
```bash
# NOTE: if using HTTPS with a custom CA, also specify --jellyfin-ca-file
aws configure --jellyfin-library "Anime,Anime Movies" --jellyfin-user "jellyfinuser" \
	--jellyfin-url "http://localhost:8096/" --jellyfin-api-key "apikey"
```

### anilist scrobble target

To scrobble to Anilist we need to configure a API token and ensure that the show we are scrobbling for is in either the *Watching* or *Plan to watch* status.

1. Configure the following on **aws**
```bash
aws configure --anilist-token "<token>"
```

#### getting an anilist api token
The anilist client works with a token you for access, this token is linked to your account!

You can request the token as follows:
1. visit https://anilist.co/settings/developer
2. click **Create New Client**
3. enter `https://anilist.co/api/v2/oauth/pin` as the *Redirect URL*
4. approve the generated token by visting `https://anilist.co/api/v2/oauth/authorize?client_id={clientID}&response_type=token` (**do not forget to replace clientID in the URL!**)

### jellyfin scrobble target

To scrobble to Jellyfin we need to configure the server url, api token, library, and username.

1. Configure the following on **aws**
```bash
# NOTE: if using HTTPS with a custom CA, also specify --jellyfin-ca-file
aws configure --jellyfin-library "Anime,Anime Movies" --jellyfin-user "jellyfinuser" \
	--jellyfin-url "http://localhost:8096/" --jellyfin-api-key "apikey"
```

It will automatically find the correct episode if the anidb metadata provider is used. **If other providers are enabled like tvdb we cannot match the correct season!** (Having the anilist provider with a lower priority does seem to work.)


### plex scrobble target

To scrobble to Plex we need to configure the server url, api token, library, and username.

1. Configure the following on **aws**
```bash
aws configure --plex-library "Anime,Anime Movies" --plex-user "plexuser" \
	--plex-url "https://127-0-0-1.<hash>.plex.direct:32400/" \
	--plex-token "token"
```
