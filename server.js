var express       = require('express');
var dotenv        = require('dotenv');
var request       = require('request');
var cheerio       = require('cheerio');
var querystring   = require('querystring');
var cookieParser  = require('cookie-parser');
var SpotifyWebApi = require('spotify-web-api-node');
var app           = express();

dotenv.load();

var port = process.env.PORT || '8081';
var url = 'http://www.quuit.com/quu/playlist/177';
var clientId = process.env.CLIENT_ID;
var clientSecret = process.env.CLIENT_SECRET;
var redirectUrl = 'http://localhost:' + port + '/auth';
var playlistName = 'Old School';
var songs = [];

function songSelect(s){ return {
    name : s.name,
    id : s.id,
    artist: s.artists[0].name
  }; 
}

app.get('/scrape', function(req, res){

  request(url, function(error, response, html){
    if(!error){
      var $ = cheerio.load(html);
      songs = [];

      $('ul#ulPlaylist>li').each(function(){
        var data = $(this);
        songs.push({
          title: data.find('a.playlist-music').first().text().trim().replace('...', ''),
          artist: data.find('.music-desc label').first().text().trim().replace('...', '')
        });
      });
    }

    console.log('Fetched ' + songs.length + ' songs');

    // requests authorization
    var scope = 'user-read-private playlist-read-private playlist-modify-private playlist-modify-public';
    res.redirect('https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: clientId,
        scope: scope,
        redirect_uri: redirectUrl,
        state: 'lolol'
      }));
  });
});

app.get('/auth', async function(req, res){

  var code = req.query.code || null;
  var state = req.query.state || null;

  console.log('auth');

  var spotifyApi = new SpotifyWebApi({
    clientId: clientId,
    clientSecret: clientSecret,
    redirectUri: redirectUrl
  });

  try{
    var authData = await spotifyApi.authorizationCodeGrant(code);

    console.log('The token expires in ' + authData.body['expires_in']);
    console.log('The access token is ' + authData.body['access_token']);
    console.log('The refresh token is ' + authData.body['refresh_token']);

    // Set the access token on the API object to use it in later calls
    spotifyApi.setAccessToken(authData.body['access_token']);
    spotifyApi.setRefreshToken(authData.body['refresh_token']);

    var userData = await spotifyApi.getMe();
    var user = userData.body;

    var playlistData = await spotifyApi.getUserPlaylists(user.id);
    console.log('fetched playlists');
    var playlist = null;

    if(playlistData.body.items.length > 0){
      for (var i = playlistData.body.items.length - 1; i >= 0; i--) {
        var p = playlistData.body.items[i];
        if(p.name === playlistName){
          playlist = p;
        }
      }
    }else{
      //create playlist if we couldn't find it
      var playlistResult = await spotifyApi.createPlaylist(user.id, playlistName, { 'public' : false });
      playlist = playlistResult.body;
    }

    console.log('Got playlist');

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
        console.log('Error finding song');
        console.log(songError);
      }
    }

    //find songs already in playlist to dedupe
    var playlistSongIds = [];
    var offset = 0;
    var limit = 100;
    var tracksFetched = 0;
    do{
      var playlistTrackData = await spotifyApi.getPlaylistTracks(user.id, playlist.id, 
        { 'offset' : offset, 'limit' : limit, 'fields' : 'items(track(id))' });
      console.log('playlist tracks');

      tracksFetched = playlistTrackData.body.items.length;
      offset += tracksFetched;
      playlistSongIds = playlistSongIds.concat(
        playlistTrackData.body.items.map(s => s.track.id)
      );

    }while(tracksFetched === limit);

    console.log('Fetched existing tracks');

    var actualNewSongs = [];
    //find new tracks
    for(let potentialNewSong of spotifySongs){
      if(playlistSongIds.indexOf(potentialNewSong.id) === -1){
        actualNewSongs.push(potentialNewSong);
      }
    }

    var trackLookups = actualNewSongs
      .filter(function(m){ return m && m.id; })
      .map(function(m){
        return 'spotify:track:' + m.id;
      });

    var playlistAdd = spotifyApi.addTracksToPlaylist(user.id, playlist.id, trackLookups);

    console.log('playlist songs added');
    res.json({
      songsAdded: actualNewSongs.map(songSelect),
      scrapedSongs: songs,
      potentialNewSongs: spotifySongs.map(songSelect)
    });
    res.end();
  } catch (err){ 
    console.log('Something went wrong!', err);
    res.write('Something went wrong!' + JSON.stringify(err));
    res.end();
  }

});

app.listen(port);
console.log('Magic happens on port ' + port);
exports = module.exports = app;
