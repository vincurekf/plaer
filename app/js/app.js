var playerApp = angular.module('playerApp', ['ngRoute','playerApp.controllers']);
playerApp.run(function($rootScope, $http) {

  //
  var _ = require('underscore');
  var fs = require('fs-extra');
  var path = require('path');
  var getdirs = require('getdirs');
  var request = require('request');
  var nwNotify = require('nw-notify');
  var mm = require('musicmetadata');
  //

  //
  var defaultFolder = '/home/amotio/git';
  $rootScope.loading = {
    active: true
  };
  //

  $rootScope.sortedList = {
    data: [],
    currentData: [],
    currentPath: '',
    set: function(arr){
      console.log( arr );
      var path = '';
      for( var id in arr ){
        path += id+'/'
      }
      console.log( path );
    },
    init: function(){
      console.log(this.data);
      this.currentData = this.data;
    }
  }

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
      // get saved scan folder
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
      // set final folder to scan
      this.folder = folder ? path.resolve(this.folder) : path.resolve(this.defaultDir);
      // try to load saved list of scanned files
      try{
        var cachedFolders = fs.readJsonSync(self.cacheDir+'/cachedFolders.json', {throws: false});
      }catch(err){
        console.log( err );
        var cachedFolders = null;
      }
      try{
        $rootScope.sortedList.data = fs.readJsonSync(self.cacheDir+'/cachedSortedArtists.json', {throws: false});
      }catch(err){
        console.log( err );
        $rootScope.sortedList.data = null;
      }
      // if there is no such file, scan default folder and start app
      if(cachedFolders === null || $rootScope.sortedList.data === null){
        console.log('scanning folders');
        this.scan(this.folder, function(files, artists, albums){
          // set default album to first album in array
          $rootScope.list.set.album(albums[0]);
          $rootScope.sortedList.init();
        });
      }else{
        // use chached data and do not scan folders for files
        console.log('using cached folders');
        $rootScope.archive.files = cachedFolders.files;
        $rootScope.archive.size = _.size(cachedFolders.files);
        $rootScope.archive.artists = cachedFolders.artists;
        $rootScope.archive.albums = cachedFolders.albums;
        $rootScope.loading.active = false;
        // apply changes to scope
        console.dir($rootScope.archive.files)
        $rootScope.$apply();
        $rootScope.sortedList.init();
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
        //$rootScope.list.set.album(albums[0]);
      });
    },
    scan: function(sourcePath, cb){
      var self = this;
      $rootScope.loading.active = true;
      $rootScope.loading.message = 'Scanning ...';

      var items = [] // files, directories, symlinks, etc
      var sorted = {} // autor > album > song
      try{
        var foldPath = sourcePath || this.folder;
        pathstr = path.dirname(process.execPath);
        foldPath = path.resolve(pathstr, foldPath);
        console.log( pathstr );
        fs.walk(foldPath).on('data', function (item) {
            var extname = path.extname(item.path);
            if( extname === '.mp3' || extname === '.flac' ){
              var parser = mm(fs.createReadStream(item.path), function (err, metadata) {
                if (err) throw err;
                var fileItem = {};
                // add tags and push to array
                var albumArt = self.checkArt(item);
                fileItem.name = path.basename(item.path);
                fileItem.title = metadata.title || fileItem.name;
                fileItem.artist = metadata.artist[0] || metadata.artist;
                fileItem.album = metadata.album;
                fileItem.path = item.path;
                fileItem.relPath = path.relative(pathstr, item.path);
                fileItem.albumArt = albumArt;
                if( !sorted[fileItem.artist] ) sorted[fileItem.artist] = {};
                if( !sorted[fileItem.artist][fileItem.album] ) sorted[fileItem.artist][fileItem.album] = {};
                sorted[fileItem.artist][fileItem.album][fileItem.title] = fileItem;
                //sorted[fileItem.artist][fileItem.album].push(fileItem);
                //console.log(fileItem);
                items.push(fileItem);
                $rootScope.notification.show(fileItem.title+' scanned');
                $rootScope.$apply();
              });
            }
          }).on('end', function () {
            // save path to storage
            localforage.setItem('scan_folder', foldPath, function(err, value) {
              console.log( value );
              if(err) console.log( err );
              console.log( value );
            });
            // save sorted list
            console.log( sorted );
            $rootScope.sortedList.data = sorted;
            // remove duplicates
            items = _.uniq(items);
            console.log( items );
            // assign folders
            $rootScope.archive.files = _.sortBy(items, 'path');
            // total ammount of songs
            $rootScope.archive.size = _.size(items);
            // pick artist names
            $rootScope.archive.artists = _.compact(_.uniq(_.flatten(_.pluck(items, 'artist'))));
            //console.log( $rootScope.archive.artists );
            // pick album names
            $rootScope.archive.albums = _.compact(_.uniq(_.pluck(items, 'album')));
            //console.log( $rootScope.archive.albums );
            // hide loading splashscreen
            $rootScope.loading.active = false;
            // apply changes to scope
            $rootScope.$apply();
            // archive current listed files for future startup
            setTimeout(function(){
              fs.outputJson(self.cacheDir+'/cachedFolders.json',{
                  files: items,
                  artists: $rootScope.archive.artists,
                  albums: $rootScope.archive.albums
                }, function (err) {
                if( err ) console.log(err);
                console.log('saved');
              });
              console.log( sorted );
              fs.outputJson(self.cacheDir+'/cachedSortedArtists.json',{
                  sorted: sorted
                }, function (err) {
                if( err ) console.log(err);
                console.log('saved');
              });
            },1000);
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
      },
      artist:function(artist){
        console.log( artist );
        var songs;
        if( artist ){
          songs = _.where( $rootScope.archive.files, { artist: artist });
        }else{
          songs = $rootScope.archive.files;
        }
        console.log(songs)
        var albums = _.uniq(_.pluck(songs, 'album'));
        $rootScope.list.current = {
          songs: songs,
          albums: albums
        };
        console.log(albums)
        $rootScope.list.album = albums[0];
        $rootScope.list.set.album(albums[0]);
      }
    },
    init: function(){
      console.log('init list');
      //this.set.artist();
    }
  }

  $rootScope.notification = {
    text: '',
    timer: null,
    show: function(text){
      var self = this;
      this.text = text;
      if( this.timer ){
        clearTimeout( this.timer );
      }
      this.timer = setTimeout( function(){
        self.text = '';
        $rootScope.$apply();
      },3000);
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
    fromPlaylist: true,
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

      // try to load saved playlist
      try{
        this.playlist.list = fs.readJsonSync(self.cacheDir+'/cachedPlaylist.json', {throws: false});
      }catch(err){
        console.log( err );
        this.playlist.list = [];
      }
      // get saved scan folder
      localforage.getItem('playlist_delay', function(err, value) {
        console.log( value );
        if(value === null || err){
          self.playlist.delay = false;
          $rootScope.$apply();
          return
        }
        self.playlist.delay = parseInt(value);
        $rootScope.$apply();
      });
      self.bindKeys();

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
          // load and play audio
          self.playing = true;
          self.current = file;
          var fileBuff = fs.readFileSync(file.path);

          self.audio = AV.Player.fromBuffer(fileBuff);

          self.audio.on('ready', function(){
            console.log( 'ready' );
            $rootScope.loading.active = false;
            console.log( self.audio.duration );
            $rootScope.player.duration = Math.floor(self.audio.duration);
            console.log(self.duration);
            $rootScope.$apply();
            $rootScope.player.position.watch();
          });

          self.audio.on('end', function(){
            $rootScope.player.onend();
          });

          // play audio
          self.audio.play();
          self.audio.volume = self.volume.value;
          // show notification
          nwNotify.setConfig({
            appIcon: path.resolve('./app/img/icon_64.png'),
            displayTime: 5000
          });
          nwNotify.notify('PLAER', '<strong>'+file.title+'</strong><br>'+file.artist+' - '+file.album);
        }
      });
    },
    playlist: {
      list: [],
      visible: false,
      random: false,
      toggle: function(){
        this.visible = !this.visible;
      },
      clear: function(){
        this.list = [];
      },
      set: function(what, value){
        // get saved scan folder
        localforage.getItem('playlist_'+what, function(err, value) {
          console.log( value );
          if(value === null || err){
            console.log( err );
            return
          }
          self.playlist.delay = parseInt(value);
          $rootScope.$apply();
        });
      },
      add: function(type, data){
        var self = this;
        if( type === "artist" ){
          var thisArtist = _.where($rootScope.archive.files, { artist: data });
          _.each( thisArtist, function(value, id){
            self.list.push(angular.copy(value));
            $rootScope.notification.show(thisArtist.length+' files added to playlist');
          })
        }else if( type === "album" ){
          var thisAlbums = _.where($rootScope.archive.files, { album: data });
          _.each( thisAlbums, function(value, id){
            self.list.push(angular.copy(value));
            $rootScope.notification.show(thisAlbums.length+' files added to playlist');
          })
        }else{
          this.list.push(angular.copy(data));
          $rootScope.notification.show('1 file added to playlist');
        }
      },
      remove: function(file){
        var id = this.list.indexOf(file);
        console.log(id);
        var odds = this.list.splice(id, 1);
        if( this.list.length === 0 ){
          this.list = [];
        }
        console.log(odds);
      }
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
        this.next( this.current );
      }
      $rootScope.$apply();
    },
    next: function(current){
      if( this.playing ){
        this.stop();
      }
      var list = !_.isEmpty(this.playlist.list) ? this.playlist.list : $rootScope.archive.files;
      console.log( list );
      var id = _.findIndex( list, current);
      var random = this.getRandom(list.length,0);
      var newId = this.random ? random : id+1;
      console.log( id, this.random, random, newId );
      var newFile = list[newId];
      if( newFile ){
        this.play(newFile);
        if( !_.isEmpty(this.playlist) ){
          this.playlist.remove(current);
        };
      }else{

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
          self.position.current = self.position.format( Math.floor(self.audio.currentTime) ) || '00:00';
          self.position.percentage = (100/$rootScope.player.duration) * self.audio.currentTime;
          $rootScope.$apply();
        }, 100);
      },
      stopWatch: function(){
        var self = $rootScope.player;
        clearInterval( self.position.timer );
      },
      convms: function(ms) {
        ms = ms || 0;
        var d, h, m, s, formated;
        s = Math.floor(ms / 1000);
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
        if( $rootScope.player.audio ) $rootScope.player.audio.seek( seekVal );
        $rootScope.player.audio
      },
    },
    volume: {
      value: 50,
      up: function(){
        var value = this.value < 90 ? this.value + 10 : 100;
        this.set(value);
      },
      down: function(){
        var value = this.value > 10 ? this.value - 10 : 0;
        this.set(value);
      },
      set: function(value){
        $rootScope.player.volume.value = value;
        if($rootScope.player.playing){
          $rootScope.player.audio.volume = Math.floor($rootScope.player.volume.value);
        }
      }
    },
    settings: {
      visible: false,
      toggle: function(){
        console.log(this.visible);
        this.visible = !this.visible;
        console.log(this.visible);
      }
    },
    find: function(){
      document.getElementById('search').focus();
    },
    bindKeys: function(){
      var self = this;
      Mousetrap.bind(['left', 'left'], function(e) {
        self.prew(self.current);
        return false
      });
      Mousetrap.bind(['right', 'right'], function(e) {
        self.next(self.current);
        return false
      });
      Mousetrap.bind(['up', 'up'], function(e) {
        self.volume.up();
        return false
      });
      Mousetrap.bind(['down', 'down'], function(e) {
        self.volume.down();
        return false
      });
      Mousetrap.bind(['space'], function(e) {
        self.pause();
        return false
      });
      Mousetrap.bind(['shift+space'], function(e) {
        self.stop();
        $rootScope.$apply();
        return false
      });
      Mousetrap.bind(['command+f', 'ctrl+f'], function(e) {
        self.find();
        return false
      });
      Mousetrap.bind(['command+r', 'ctrl+r'], function(e) {
        self.random = !self.random;
        return false
      });
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
    .when('/sorted', {
      templateUrl: 'views/sorted.html',
      controller: 'ListCtrl'
    })
    .otherwise({
      redirectTo: '/app'
    });
}]);
