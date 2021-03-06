var cheerio       = require('cheerio');
var express       = require('express');
var Promise       = require('bluebird');
var request       = require('request');
var requestAsync  = Promise.promisify(request);
var SpotifyWebApi = require('spotify-web-api-node');
var SpotifyUtils  = require('./spotify-utils.js');
var querystring   = require('querystring');
var _             = require('lodash');

export default class SpotifyApp{
  constructor(clientId, clientSecret){
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  songSelect(s){ return {
      name : s.name,
      id : s.id,
      artist: s.artists[0].name
    }; 
  }

  write(text, data){
    process.stdout.clearLine();  // clear current text
    process.stdout.cursorTo(0);  // move cursor to beginning of line 
    process.stdout.write(text);
  }

  //remember to add redirect uri to 
  //https://developer.spotify.com/my-applications
  getRedirectUrl(req){
    return req.protocol + '://' + req.get('host') + req.baseUrl + '/auth';
  }

  async getSpotifyApi(req, res, code){
    var accessToken = req.signedCookies.accessToken;
    var refreshToken = req.signedCookies.refreshToken;

    var spotifyApi = new SpotifyWebApi({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: this.getRedirectUrl(req)
    });

    if(code){
      var authData = await spotifyApi.authorizationCodeGrant(code);
      accessToken = authData.body['access_token'];
      refreshToken = authData.body['refresh_token'];

      console.log('The token expires in ' + authData.body['expires_in']);
      console.log('The access token is ' + accessToken);
      console.log('The refresh token is ' + refreshToken);

      // Set the access token on the API object to use it in later calls
      spotifyApi.setAccessToken(accessToken);
      spotifyApi.setRefreshToken(refreshToken);
      res.cookie('accessToken', accessToken, { signed: true });
      res.cookie('refreshToken', refreshToken, { signed: true });
      console.log('cookies set');

      return spotifyApi;
    }

    if(!accessToken || !refreshToken){
      return null;
    }

    spotifyApi.setAccessToken(accessToken);
    spotifyApi.setRefreshToken(refreshToken);

    //make a sample call to see if the token needs refreshing
    try{
      var me = await spotifyApi.getMe();
    }catch(e){
      var refreshResult = await spotifyApi.refreshAccessToken();
      spotifyApi.setAccessToken(refreshResult.body.access_token);
      console.log('token refreshed');
    }
    return spotifyApi;
  }

  async authenticate(req, res){
    var returnUrl = req.query.returnUrl;
    var state = req.query.state || null;
    var code = req.query.code || null;

    if(state && code){
      var spotifyApi = await this.getSpotifyApi(req, res, code);
      res.redirect(req.baseUrl + state);
      return;
    }


    // requests authorization
    var scope = 'user-read-private playlist-read-private playlist-modify-private playlist-modify-public';
    res.redirect('https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: this.clientId,
        scope: scope,
        redirect_uri: this.getRedirectUrl(req),
        state: returnUrl
      }));
  }

  async scrape(req, res){

    var url = 'http://www.quuit.com/quu/playlist/177';
    var playlistName = 'Old School';

    try{
      var spotifyApi = await this.getSpotifyApi(req, res);

      if(!spotifyApi){
        console.log('Redirecting to Auth'); 
        res.redirect(req.baseUrl + '/auth?' + querystring.stringify({returnUrl: req.path}));
        return;
      }

      console.log('auth');
      var spotifyUtils = new SpotifyUtils(spotifyApi);

      var songs = [];
      try{
        var scrapeResponse = await requestAsync(url);
        var $ = cheerio.load(scrapeResponse[1]);
        songs = [];

        $('ul#ulPlaylist>li').each(function(){
          var data = $(this);
          songs.push({
            title: data.find('a.playlist-music').first().text().trim().replace('...', ''),
            artist: data.find('.music-desc label').first().text().trim().replace('...', '')
          });
        });
      }catch(e){
        console.log('Error Fetching url ', e);
      }

      console.log('Fetched ' + songs.length + ' songs');

      var userData = await spotifyApi.getMe();
      var user = userData.body;

      var playlist = await spotifyUtils.fetchOrCreatePlaylist(user.id, playlistName, {public: false});

      //lookup songs
      var spotifySongs = [];
      for(let song of songs){
        try{
          var searchResult = await spotifyApi.searchTracks(song.title + ' ' + song.artist);
          // console.log('search for ' + song.title + ' ' + song.artist, 
          //   searchResult.body.tracks.items.slice(0, 5).map(songSelect));
          if(searchResult.body.tracks.items.length > 0){
            spotifySongs.push(searchResult.body.tracks.items[0]);
          }
        }catch (songError){
          console.log('Error finding song', songError);
        }
      }

      //find songs already in playlist to dedupe
      var playlistSongs = await spotifyUtils.fetchPlaylistSongs(user.id, playlist.id);

      console.log('Fetched existing tracks');

      var actualNewSongs = await spotifyUtils.addUniquePlaylistSongs(user.id, playlist.id, spotifySongs, playlistSongs);

      console.log('playlist songs added');
      res.json({
        songsAdded: actualNewSongs.map(this.songSelect),
        scrapedSongs: songs,
        potentialNewSongs: spotifySongs.map(this.songSelect)
      });
      res.end();
    } catch (err){ 
      console.log('Something went wrong!', err);
      res.write('Something went wrong!' + JSON.stringify(err));
      res.end();
    }
  }

  async coverify(req, res){

    var playlistName = req.query.playlist;

    if(!playlistName){
      res.send('Playlist name not provided');
      return;
    }

    try{
      var spotifyApi = await this.getSpotifyApi(req, res);

      if(!spotifyApi){
        console.log('Redirecting to Auth'); 
        res.redirect(req.baseUrl + '/auth?' + querystring.stringify({returnUrl: req.path}));
        return;
      }
      console.log('auth');

      var spotifyUtils = new SpotifyUtils(spotifyApi);

      var userData = await spotifyApi.getMe();
      var user = userData.body;

      var playlist = await spotifyUtils.findUserPlaylist(user, playlistName);
      console.log('fetched playlists');

      if(!playlist){
        res.write('Could not find playlist');
        res.end();
        return;
      }

      //find songs already in playlist to dedupe
      var playlistSongs = await spotifyUtils.fetchPlaylistSongs(playlist.owner.id, playlist.id);

      //lookup cover songs
      var coverSongs = [];
      var coverI = 0;
      for(let song of playlistSongs){
        try{
          var searchResult = await spotifyApi.searchTracks(song.track.name);

          this.write('Searched for song ' + coverI++);

          // console.log('search for ' + song.title + ' ' + song.artist, 
          //   searchResult.body.tracks.items.slice(0, 5).map(songSelect));
          var filteredSongs = _.filter(searchResult.body.tracks.items,
              track => track.artists[0].name !== song.track.artists[0].name 
                && track.name === song.track.name
            );
          if(filteredSongs.length > 0){
            coverSongs = coverSongs.concat(filteredSongs);
          }
        }catch (songError){
          console.log('Error finding song', songError);
        }
      }

      if(coverSongs.length === 0){
        res.json({coverSongs: 'No cover songs found'});
        return;
      }

      console.log('Found ' + coverSongs.length + ' Cover Songs');

      var newPlaylistName = playlistName + ' covers';
      //create playlist if we couldn't find it
      var playlistResult = await spotifyApi.createPlaylist(user.id, newPlaylistName, { 'public' : false });
      var newPlaylist = playlistResult.body;

      console.log('Created new playlist');


      var trackIds = coverSongs
        .filter(function(m){ return m && m.id; })
        .map(function(m){
          return m.id;
        });

      var playlistAdd = await spotifyUtils.addPlaylistSongs(user.id, newPlaylist.id, trackIds);

      console.log('cover songs added');
      res.json({
        coverSongs: coverSongs.map(this.songSelect)
      });
      res.end();
    } catch (err){ 
      console.log('Something went wrong!', err);
      res.json(err);
      res.end();
    }
  }

  async supafy(req, res){

    var playlistName = req.query.playlist;

    if(!playlistName){
      res.send('Playlist name not provided');
      return;
    }

    try{
      var spotifyApi = await this.getSpotifyApi(req, res);

      if(!spotifyApi){
        console.log('Redirecting to Auth'); 
        res.redirect(req.baseUrl + '/auth?' + querystring.stringify({returnUrl: req.path}));
        return;
      }
      console.log('auth');

      var spotifyUtils = new SpotifyUtils(spotifyApi);

      var userData = await spotifyApi.getMe();
      var user = userData.body;

      var playlist = await spotifyUtils.findUserPlaylist(user, playlistName);
      console.log('fetched playlist');

      if(!playlist){
        res.write('Could not find playlist');
        res.end();
        return;
      }

      //find songs already in playlist to dedupe
      var playlistSongs = await spotifyUtils.fetchPlaylistSongs(playlist.owner.id, playlist.id);
      console.log('playlist songs found');

      var artists = _(playlistSongs)
        .map(s => s.track.artists[0].name)
        .uniq()
        .value();

      console.log('artists', artists);

      //lookup cover songs
      var coverSongs = [];
      var coverI = 0;
      for(let artist of artists){
        try{
          var searchResult = await spotifyUtils.searchTracks(`artist:"${artist}"`);

          //filter results down to the actual artist, double quotes don't seem to do the trick
          var filteredSongs = _.filter(searchResult,
              track => track.artists[0].name === artist );

          if(filteredSongs.length > 0){
            console.log(`Found ${filteredSongs.length} results for ${artist}`);
            coverSongs = coverSongs.concat(filteredSongs);
          }

        }catch (songError){
          console.log('Error searching artist', songError);
        }
      }

      if(coverSongs.length === 0){
        res.json({coverSongs: 'No artist songs found'});
        return;
      }

      console.log('Found ' + coverSongs.length + ' Supafy Songs');

      var newPlaylistName = playlistName + ' supafy';
      //create playlist if we couldn't find it
      var newPlaylist = await spotifyUtils.fetchOrCreatePlaylist(user.id, newPlaylistName, { 'public' : false });

      console.log('Got Playlist');

      var trackIds = coverSongs
        .filter(m => m && m.id)
        .map(m => m.id);

      var playlistAdd = await spotifyUtils.addPlaylistSongs(user.id, newPlaylist.id, trackIds);

      console.log('Supafy songs added');
      res.json({
        songs: coverSongs.map(this.songSelect),
        artists: artists
      });
      res.end();
    } catch (err){ 
      console.log('Something went wrong!', err);
      res.json(err);
      res.end();
    }
  }
  async playlists(req, res){

    try{
      var spotifyApi = await this.getSpotifyApi(req, res);

      if(!spotifyApi){
        console.log('Redirecting to Auth'); 
        res.redirect(req.baseUrl + '/auth?' + querystring.stringify({returnUrl: req.path}));
        return;
      }
      console.log('auth');
      var spotifyUtils = new SpotifyUtils(spotifyApi);

      var userData = await spotifyApi.getMe();
      var user = userData.body;

      var playlistData = await spotifyApi.getUserPlaylists(user.id);
      console.log('fetched playlists');

      res.json(
        playlistData.body.items.map(p => 
          ({
            id: p.id,
            name: p.name,
            public: p.public
          })
        )
      );

    } catch (err){ 
      res.write('Something went wrong!' + JSON.stringify(err));
      res.end();
    }
  }
}
