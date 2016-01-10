var playerApp = angular.module('playerApp', ['ngRoute','playerApp.controllers']);
playerApp.run(function($rootScope, $http) {

  //
  var _ = require('underscore');
  var fs = require('fs-extra');
  var path = require('path');
  var id3js = require('id3js');
  var getdirs = require('getdirs');
  var request = require('request');
  var nwNotify = require('nw-notify');
  //

  //
  var defaultFolder = '/home/amotio/git';
  $rootScope.loading = {
    active: true
  };
  //

  //
  $rootScope.archive = {
    defaultDir: '../',
    cacheDir: './app/cache',
    newFolder: '',
    folder: '',
    folders: [],
    files: [],
    artists: [],
    albums: [],
    size: 0,
    artFNames: ['Cover.jpg', 'cover.jpg','front.jpg', 'Folder.jpg', 'AlbumArtLarge.jpg', 'AlbumArt.jpg', 'AlbumArtSmall.jpg'],
    init: function(folder){
      var self = this;

      localforage.getItem('scan_folder', function(err, value) {
        console.log( value );
        if(value === null || err){
          self.folder = self.defaultDir;
          $rootScope.$apply();
          return
        }
        self.folder = value;
        $rootScope.$apply();
      });
      console.log( self.folder );

      this.folder = folder ? path.resolve(this.folder) : path.resolve(this.defaultDir);

      try{
        var cachedFolders = fs.readJsonSync(self.cacheDir+'/cachedFolders.json', {throws: false});
      }catch(err){
        console.log( err );
        var cachedFolders = null;
      }
      if(cachedFolders === null){
        console.log('scanning folders');
        this.scan(this.folder, function(files, artists, albums){
          // set default album to first album in array
          $rootScope.list.set.album(albums[0]);
        });
      }else{
        console.log('using cached folders');
        $rootScope.archive.files = cachedFolders.files;
        $rootScope.archive.size = _.size(cachedFolders.files);
        $rootScope.archive.artists = cachedFolders.artists;
        $rootScope.archive.albums = cachedFolders.albums;
        $rootScope.loading.active = false;
        // apply changes to scope
        console.dir($rootScope.archive.files)
        $rootScope.$apply();
        //$rootScope.list.set.album(cachedFolders.albums[0]);
      }
    },
    checkArt: function(item){
      var done = false;
      for( var i = 0; i < this.artFNames.length; i++ ){
        if( !done ){
          var diir = path.dirname(item.path)+'/'+this.artFNames[i];
          var artPath = diir;
          try{
            if(fs.statSync(artPath).isFile()){
              done = true;
              resultUrl = path.resolve(artPath);
            };
          }catch(err){
            resultUrl = false;
          }
        }
      }
      return resultUrl
    },
    fetchArt: function(item,cb){
      console.log( item );
      var self = this;
      $http({
        method: 'GET',
        //url: 'https://api.discogs.com/database/search?q='+item.artist+'&release_title='+item.album+'&key='+ConsumerKey+'&secret='+ConsumerSecret
        url: 'https://itunes.apple.com/search?term='+item.artist+'&entity=album'
      }).then(function successCallback(response) {
          console.log( response );
          var albums = response.data.results ? typeof response.data.results[0] !== 'undefined' ? response.data.results : [] : [];
          var album = _.findWhere(albums, { collectionName: item.album });
          console.log( album );
          //
          if( album && album.artworkUrl100 ){
            console.log( item );
            self.saveArt(album.artworkUrl100, path.dirname(item.path)+'/AlbumArtSmall.jpg', function(){
              console.log('done');
              var relativePath = path.resolve('../', path.dirname(item.path)+'/AlbumArtSmall.jpg');
              console.log(relativePath);
              cb(null,relativePath);
            });
          }else{
            cb(true);
          }
          /*
          */
        }, function errorCallback(response) {
          console.log( response );
      });
    },
    saveArt: function(uri, filename, callback){
      request(uri, {encoding: 'binary'}, function(error, response, body) {
        fs.writeFile(filename, body, 'binary', function (err) {
          if(err) console.log(err);
          callback();
        });
      });
    },
    setPath: function(){
      console.log( 'scanning '+this.newFolder )
      this.scan(this.newFolder, function(files, artists, albums){
        // set default album to first album in array
        $rootScope.list.set.album(albums[0]);
      });
    },
    scan: function(sourcePath, cb){
      var self = this;
      $rootScope.loading.active = true;
      $rootScope.loading.message = 'Scanning ...';

      var items = [] // files, directories, symlinks, etc
      try{
        var foldPath = sourcePath || this.folder;
        pathstr = path.dirname(process.execPath);
        foldPath = path.resolve(pathstr, foldPath);
        console.log( pathstr );
        fs.walk(foldPath).on('data', function (item) {
            if(path.extname(item.path) === '.mp3'){
              id3js({ file: item.path, type: id3js.OPEN_LOCAL }, function(err, tags) {
                // add tags and push to array
                var albumArt = self.checkArt(item);
                tags.albumArt = albumArt;
                tags.name = path.basename(item.path);
                tags.path = item.path;
                tags.relPath = path.relative(pathstr, item.path);
                console.log(item.path)
                console.log(tags.relPath)
                items.push(tags)
              });
            }
          }).on('end', function () {
            // save path to storage
            localforage.setItem('scan_folder', foldPath, function(err, value) {
              console.log( value );
              if(err) console.log( err );
              console.log( value );
            });
            // remove duplicates
            items = _.uniq(items);
            // assign folders
            $rootScope.archive.files = _.sortBy(items, 'relPath');
            console.dir($rootScope.archive.files)
            // total ammount of songs
            $rootScope.archive.size = _.size(items);
            // pick artist names
            $rootScope.archive.artists = _.compact(_.uniq(_.pluck(items, 'artist')));
            //console.log( $rootScope.archive.artists );
            // pick album names
            $rootScope.archive.albums = _.compact(_.uniq(_.pluck(items, 'album')));
            //console.log( $rootScope.archive.albums );
            // hide loading splashscreen
            $rootScope.loading.active = false;
            // apply changes to scope
            $rootScope.$apply();
            // archive current listed files for future startup
            fs.outputJson(self.cacheDir+'/cachedFolders.json',{
                files: $rootScope.archive.files,
                artists: $rootScope.archive.artists,
                albums: $rootScope.archive.albums
              }, function (err) {
              if( err ) console.log(err);
            });
            // call cb
            if(cb) cb($rootScope.archive.files, $rootScope.archive.artists, $rootScope.archive.albums);
          }
        )
      }catch(err){
        console.log(err);
        $rootScope.loading.active = false;
        alert('Scanning error. Please specify different folder.');
      }
    }
  };
  console.log( defaultFolder );
  $rootScope.archive.init(defaultFolder);
  //

  //
  $rootScope.list = {
    current: [],
    albumArt: '',
    album: '',
    albumInfo: [],
    set: {
      album: function( album ){
        console.log( album );
        $rootScope.list.album = album;
        $rootScope.list.current.songs = _.where($rootScope.archive.files, { album: album });
        $rootScope.list.albumInfo = $rootScope.list.current.songs[0];
        //console.log( $rootScope.list.albumInfo );
        $rootScope.list.albumInfo.size = _.size($rootScope.list.current.songs);
        $rootScope.list.albumArt = _.where($rootScope.archive.files, { album: album })[0].albumArt;
        if( !$rootScope.list.albumArt ){
          console.log('Fetching Album Art for: '+album);
          $rootScope.archive.fetchArt($rootScope.list.albumInfo, function(err, result){
            if (err) return;
            $rootScope.list.albumArt = result;
            $rootScope. $apply();
          });
        }
      }
    },
    artist:{
      get: function(artist){
        var songs;
        if( artist ){
          songs = _.where( $rootScope.archive.files, { artist: artist });
        }else{
          songs = $rootScope.archive.files;
        }
        var albums = _.uniq(_.pluck(songs, 'album'));
        $rootScope.list.current = {
          songs: songs,
          albums: albums
        };
        $rootScope.list.album = albums[0];
        $rootScope.list.set.album(albums[0]);
      }
    },
    init: function(){
      console.log('init list');
      this.artist.get();
    }
  }

  // PLAYER
  $rootScope.player = {
    audio: null,
    duration: 0,
    current: null,
    playing: false,
    random: false,
    loop: false,
    init: function(){
      var self = this;
      var postevak = document.getElementById('postevak');
      var postevakH = new Hammer(postevak);
      postevakH.on("panleft panright", function(ev) {
        self.position.seek(ev.center.x);
      });
      var behind = document.getElementById('behind');
      var behindH = new Hammer(behind);
      behindH.on("panleft panright tap", function(ev) {
        self.position.seek(ev.center.x);
      });
    },
    currArtist: function(artist){
      return this.current ? (this.current.artist === artist) : false;
    },
    currAlbum: function(album){
      return this.current ? (this.current.album === album) : false;
    },
    getRandom: function(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    play: function(file){
      var self = this;
          file = file || self.current;
      $rootScope.loading.active = true;
      $rootScope.loading.message = 'Loading ...';
      console.log( file );
      fs.exists(file.path, function (exists) {
        console.log(exists);
        if( !exists ){
          alert('file does not exist');
          $rootScope.loading.active = true;
          return false
        }else{
          //console.log( path.extname(file.relPath) );
          if( path.extname(file.relPath) === '.mp3' ){
            // load and play audio
            self.playing = true;
            self.current = file;
            self.audio =  new buzz.sound('../'+file.relPath);
            self.audio.bind("playing", function(e) {
              $rootScope.player.position.watch();
              self.audio.set("volume", self.volume.value/100 );
              $rootScope.loading.active = false;
              $rootScope.player.duration = Math.floor(self.audio.getDuration());
              console.log(self.duration);
              $rootScope.$apply();
            });
            self.audio.bind("ended", function(e) {
              $rootScope.player.onend();;
            });
            self.audio.play();
            // show notification
            nwNotify.setConfig({
              appIcon: path.resolve('./app/img/icon_64.png'),
              displayTime: 5000
            });
            nwNotify.notify('PLAER', '<strong>'+file.title+'</strong><br>'+file.artist+' - '+file.album);
          }else{
            self.next(file);
          }
        }
      });
    },
    onend: function(){
      var lastTrack = this.current;
      $rootScope.player.stop();
      var id = _.findIndex( $rootScope.archive.files, lastTrack);
      if( id === $rootScope.archive.size-1 ){
        console.log( 'List ended' );
        if(this.loop){
          var newFile = $rootScope.archive.files[0];
          this.play( newFile );
        }
      }else{
        var random = this.getRandom($rootScope.archive.size, 0);
        var newId = this.random ? random : id+1;
        var newFile = $rootScope.archive.files[newId];
        this.play( newFile );
      }
      $rootScope.$apply();
    },
    next: function(current){
      if( this.playing ){
        this.stop();
      }
      var id = _.findIndex( $rootScope.archive.files, current);
      var random = this.getRandom($rootScope.archive.size, 0);
      var newId = this.random ? random : id+1;
      var newFile = $rootScope.archive.files[newId];
      if( newFile ){
        this.play(newFile);
      }
    },
    prew: function(current){
      var id = _.findIndex( $rootScope.archive.files, current);
      var random = this.getRandom($rootScope.archive.size, 0);
      var newId = this.random ? random : id-1;
      this.stop();
      var newFile = $rootScope.archive.files[newId];
      if( newFile ){
        this.play(newFile);
      }
    },
    stop: function(){
      this.audio.stop();
      this.audio = null;
      this.playing = false;
      this.paused = false;
      this.position.stopWatch();
      this.position.current = '00:00';
      this.position.percentage = 0;
    },
    pause: function(){
      var self = this;
          file = self.current || null;
      if(this.paused){
        this.audio.play();
        this.paused = false;
      }else{
        if(this.playing){
          this.audio.pause();
          this.paused = true;
        }else{
          if( file ){
            this.play( file );
          }else{
            var random = this.getRandom($rootScope.archive.size, 0);
            var randFile = $rootScope.archive.files[random];
            this.play( randFile );
          }
        }
      }/*
      this.playing = true;
      newFile = file || this.current;
      */
    },
    toggle: function(file){
      var self = this;
      newFile = file || this.current;
      if( !this.audio ){
        if( newFile ){
          this.play(newFile);
        }else{
          var random = this.getRandom($rootScope.archive.size, 0);
          var newFile = $rootScope.archive.files[random];
          this.play( newFile );
        }
      }else{
        if( file && (file.relPath !== this.current.relPath) ){
          this.stop();
          setTimeout( function(){
            self.play(file);
            $rootScope.$apply();
          }, 100);
        }else{
          this.stop();
        }
      }
    },
    songState: function(file){
      if( file && this.current ){
        if( this.playing ){
          return file.relPath === this.current.relPath;
        }
      }
      return false
    },
    position: {
      timer: null,
      current: '00:00',
      currentSeek: null,
      percentage: 0,
      watch: function(){
        var self = $rootScope.player;
        self.position.timer = setInterval( function(){
          self.position.current = self.position.format( Math.floor(self.audio.getTime()) ) || '00:00';
          self.position.percentage = (100/$rootScope.player.duration) * self.audio.getTime();
          $rootScope.$apply();
        }, 100);
      },
      stopWatch: function(){
        var self = $rootScope.player;
        clearInterval( self.position.timer );
      },
      convms: function(s) {
        s = s || 0;
        var d, h, m, s, formated;
        //s = Math.floor(ms / 1000);
        m = Math.floor(s / 60);
        h = Math.floor(m / 60);
        d = Math.floor(h / 24);
        s = s % 60; if(s<10 && s!==0){s=s;};
        m = m % 60; if(m<10){m="0"+m;};
        h = h % 24; if(h<10 && h!==0){h="0"+h;};
        d = d % 24; if(d<10 && d!==0){d="0"+d;};
        return { d: d, h: h, m: m, s: s};
      },
      format: function(time){
        var t = $rootScope.player.position.convms(time);
        if (t.s){
          var days = t.d !== 0 ? '['+t.d+'d]' : '';
          var hours = t.h !== 0 ? t.h+':' : '';
          var minutes = t.m !== 0 ? t.m+':' : '';
              t.s = t.s < 10 ? '0'+t.s : t.s;
          var seconds = t.s !== 0 ? t.s : '';
          if(!days){
            if (!hours){
              if (!minutes){
                if (!seconds){
                  koncovka = 'nic?';
                }else{
                  koncovka = ' s';
                }
              }else{
                koncovka = ' m';
              }
            }else{
              koncovka = ' h';
            }
          }else{
            koncovka = ' d';
          }
          return days+' '+hours+minutes+seconds;
        }else {
          return '';
        }
      },
      seek: function(pxpos){
        var perc = (100/winWidth) * pxpos;
        var seekVal = Math.floor(($rootScope.player.duration/100)*perc);
        console.log( seekVal );
        if( $rootScope.player.audio ) $rootScope.player.audio.setTime( seekVal );
        $rootScope.player.audio
      },
    },
    volume: {
      value: 50,
      set: function(value){
        $rootScope.player.volume.value = value;
        if($rootScope.player.playing){
          $rootScope.player.audio.set("volume", $rootScope.player.volume.value/100);
        }
      }
    }
  };
  $rootScope.player.init();

});

// just some routes to show some content
playerApp.config(['$routeProvider',
  function($routeProvider) {
    $routeProvider
    .when('/app', {
      templateUrl: 'views/list.html',
      controller: 'ListCtrl'
    })
    .otherwise({
      redirectTo: '/app'
    });
}]);
