# Spotify Web Api Utils
================

Scrape internet playlists, find cover songs, or write your own app with these utilities. 

Utilities included:

* **Fetch or Create Playlist.** Look up a playlist by name, create it if it doesn't exist
* **Fetch User Playlist.** Look up a playlist by name given a user object
* **Fetch Playlist songs** Forget about writing your own paging logic and just use this.
* **Add Songs to Playlist** Again, doing paging manually is annoying.  This lets you fire and forget a big array of songs to add.
* **Add Unique Songs to Playlist** Add only new songs to a playlist and don't duplicate ones already on the playlist.


## Setup
Get started by [creating a Spotify App](https://developer.spotify.com/my-applications/#!/applications)

Make sure to add a Redirect URL to your app
```
http://localhost:8081/auth
```

Create a .env file in the directory you checked it out to and add your client ID/Secret
```
PORT=8081
CLIENT_ID=yourclientid
CLIENT_SECRET=yourclientsecret
```

Then fire 'er up with `npm start` and browse to http://localhost:8081/coverify?playlist=riffs
