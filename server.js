var express       = require('express');
var dotenv        = require('dotenv');
var Promise       = require('bluebird');
var request       = require('request');
var requestAsync  = Promise.promisify(request);
var cheerio       = require('cheerio');
var querystring   = require('querystring');
var cookieParser  = require('cookie-parser');
var SpotifyWebApi = require('spotify-web-api-node');
var SpotifyUtils  = require('./spotify-utils.js');
var _             = require('lodash');
var app           = express();

dotenv.load();

var port = process.env.PORT || '8081';
var clientId = process.env.CLIENT_ID;
var clientSecret = process.env.CLIENT_SECRET;

function songSelect(s){ return {
    name : s.name,
    id : s.id,
    artist: s.artists[0].name
  }; 
}

//remember to add redirect uri to 
//https://developer.spotify.com/my-applications
function getRedirectUrl(currentPath){
  return 'http://localhost:' + port + currentPath;
}

async function getSpotifyApi(code, currentPath){

  var spotifyApi = new SpotifyWebApi({
    clientId: clientId,
    clientSecret: clientSecret,
    redirectUri: getRedirectUrl(currentPath)
  });

  var authData = await spotifyApi.authorizationCodeGrant(code);

  console.log('The token expires in ' + authData.body['expires_in']);
  console.log('The access token is ' + authData.body['access_token']);
  console.log('The refresh token is ' + authData.body['refresh_token']);

  // Set the access token on the API object to use it in later calls
  spotifyApi.setAccessToken(authData.body['access_token']);
  spotifyApi.setRefreshToken(authData.body['refresh_token']);

  return spotifyApi;
}


app.get('/auth', async function(req, res){

  var returnUrl = req.query.returnUrl;

  // requests authorization
  var scope = 'user-read-private playlist-read-private playlist-modify-private playlist-modify-public';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: clientId,
      scope: scope,
      redirect_uri: getRedirectUrl(returnUrl),
      state: 'lolol'
    }));
});

app.get('/scrape', async function(req, res){

  var url = 'http://www.quuit.com/quu/playlist/177';
  var playlistName = 'Old School';
  var code = req.query.code || null;
  var currentPath = '/scrape';

  if(!code){
    console.log('Redirecting to Auth'); 
    res.redirect('/auth?' + querystring.stringify({returnUrl: currentPath}));
    return;
  }

  console.log('auth');

  try{
    var spotifyApi = await getSpotifyApi(code, currentPath);
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
        console.log('Error finding song', songError);
      }
    }

    //find songs already in playlist to dedupe
    var playlistSongs = await spotifyUtils.fetchPlaylistSongs(user.id, playlist.id);

    console.log('Fetched existing tracks');

    var actualNewSongs = [];
    //find new tracks
    for(let potentialNewSong of spotifySongs){
      if(!_.any(playlistSongs, s => s.track.id === potentialNewSong.id) ){
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
