var express       = require('express');
var dotenv        = require('dotenv');
var SpotifyApp    = require('./spotify-app.js');
var app           = express();

dotenv.load();

var port = process.env.PORT || '8081';
var clientId = process.env.CLIENT_ID;
var clientSecret = process.env.CLIENT_SECRET;

var spotifyApp = new SpotifyApp(port, clientId, clientSecret);

app.get('/auth', spotifyApp.authenticate.bind(spotifyApp));
app.get('/scrape', spotifyApp.scrape.bind(spotifyApp));
app.get('/coverify', spotifyApp.coverify.bind(spotifyApp));
app.get('/playlists', spotifyApp.playlists.bind(spotifyApp));

app.listen(port);
console.log('Magic happens on port ' + port);
exports = module.exports = app;
