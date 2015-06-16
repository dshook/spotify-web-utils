var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var app     = express();
var SpotifyWebApi = require('spotify-web-api-node');

var port = '8081';
var url = 'http://www.quuit.com/quu/playlist/177';
var clientId = '37dac1af51a649edb145a563eaa4d02a';
var clientSecret = '0ca26311c6334afb90f854833a79c754';
var redirectUrl = 'http://localhost:' + port + '/auth';
var playlistName = 'Old School';
var songs = [];

app.get('/scrape', function(req, res){

  request(url, function(error, response, html){
    if(!error){
      var $ = cheerio.load(html);
      songs = [];

      $('ul#ulPlaylist>li').each(function(){
        var data = $(this);
        songs.push({
          title: data.find('a.playlist-music').first().text(),
          artist: data.find('.music-desc label').first().text()
        });
      });
    }

    console.log("Fetched " + songs.length + " songs");

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

app.get('/auth', function(req, res){

  var code = req.query.code || null;
  var state = req.query.state || null;
  var user = null;
  var playlist = null;

  console.log('auth');

  var spotifyApi = new SpotifyWebApi({
    clientId: clientId,
    clientSecret: clientSecret,
    redirectUri: redirectUrl
  });

  spotifyApi.authorizationCodeGrant(code)
  .then(function(data) {
    console.log('The token expires in ' + data.body['expires_in']);
    console.log('The access token is ' + data.body['access_token']);
    console.log('The refresh token is ' + data.body['refresh_token']);

    // Set the access token on the API object to use it in later calls
    spotifyApi.setAccessToken(data.body['access_token']);
    spotifyApi.setRefreshToken(data.body['refresh_token']);

    return spotifyApi.getMe();
  })
  .then(function(userData){
    //console.log('Some information about the authenticated user', userData.body);
    user = userData.body;
    return user;
  })
  .then(function(userData){
    return spotifyApi.getUserPlaylists(user.id)
      .then(function(playlistData){
        console.log('fetched playlists');

        if(playlistData.body.items.length > 0){
          for (var i = playlistData.body.items.length - 1; i >= 0; i--) {
            var p = playlistData.body.items[i];
            console.log('playlist ', p.name);
            if(p.name === playlistName){
              return p;
            }
          }
        }

        //fall through create playlist if we couldn't find it
        return spotifyApi.createPlaylist(user.id, playlistName, { 'public' : false })
          .then(function(createdPlaylist){
            return createdPlaylist.body;
          });
      });
  })
  .then(function(playlistData) {
    playlist = playlistData;
    console.log('Got playlist');

    //lookup songs
    var songPromises = [];
    songs.forEach(function(song){
      songPromises.push(
        spotifyApi.searchTracks(song.title + '+artist:' + song.artist)
          .then(function(songData){
            //console.log(songData.body.tracks.items);
            if(songData.body.tracks.items.length > 0){
              return songData.body.tracks.items[0];
            }
            return null;
          })
          .catch(function(songError){
            console.log('Error finding song');
            console.log(songError);
          })
      );
    });

    return Promise.all(songPromises);
  })
  .then(function(songArray){
    var trackLookups = songArray
    .filter(function(m){ return m && m.id; })
    .map(function(m){
      return 'spotify:track:' + m.id;
    });
    console.log(trackLookups);
    return spotifyApi.addTracksToPlaylist(user.id, playlist.id, trackLookups);
  })
  .then(function(playlistAdd){
    console.log('playlist songs added', playlistAdd);
    res.json({code: code, playlistAdd: playlistAdd});
    res.end();
  })
  .catch(function(err){
    console.log('Something went wrong!', err);
    res.write('Something went wrong!' + JSON.stringify(err));
    res.end();
  });

});

app.listen(port);
console.log('Magic happens on port ' + port);
exports = module.exports = app;
