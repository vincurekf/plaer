/**
 * hearth of this PLÆR boilerplate.
 * here we takecare of wondow showing,
 * splashscreen, saving/recovering last window state
 **/

var gui = require('nw.gui');
// define global variables
var mainwin, maingui,
    tray = null,
    minimizeToTray = false,
    saveState = true,
    safeExit = true,
    winWidth = 0;

var viewbox = {
  init: function( setTray ){
    window.onload = function() {
      maingui = gui;//global.window.nwDispatcher.requireNwGui();
      console.log(maingui);
      mainwin = maingui.Window.get();
      // get the screen resolution
      try{
        maingui.Screen.Init();
        var screens = maingui.Screen.screens;
        workscreen = screens[0];
        console.log( workscreen );
      }catch(err){
        console.log(err);
      }
      /*
      */
      // attach actions to UI buttons
      var closeButton = document.getElementById('close-window-button');
      closeButton.addEventListener('click', function() {
        //
        mainwin.close();
      });
      var minimizeButton = document.getElementById('minimize-window-button');
      minimizeButton.addEventListener('click', function() {
        //
        mainwin.minimize();
      });
      // listen to window events
      mainwin.on('close', function(){
        console.log('saveState', saveState)
        if( saveState ){
          viewbox.save();
        }else{
          // used for blocking window when saving data
          // this must be 'true' in order to close to window
          safeExit = true;
        };
        // so close only if we have saved the data to database
        this.close(safeExit);
      });
      mainwin.on('minimize', function(){
        saveState = false;
        if( minimizeToTray ){
          this.hide();
          viewbox.showTray();
        }
      });
      mainwin.on('restore', function(){
        //
        saveState = true;
      });
      // preset saving varibla to delay actions after move and resize events
      var saving;
      mainwin.on('move', function(){
        // reset timeout
        clearTimeout(saving);
        // set timeout
        saving = setTimeout(function(){
          // if there is notthing happening
          // save data to db
          viewbox.save();
        }, 100);
      });
      mainwin.on('resize', function(){
        clearTimeout(saving);
        winWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        saving = setTimeout(function(){
          viewbox.save();
        }, 100);
      });
      viewbox.get( setTray );
    }
    window.onfocus = function() {
      //console.log("focus");
      viewbox.focus(true);
    }
    window.onblur = function() {
      //console.log("blur");
      viewbox.focus(false);
    }
  },
  get: function( setTray ){
    localforage.getItem('windowstate', function(err, value) {
      if (err){
        return console.log( err );
      }else{
        if ( value !== null ){
          console.log( value );
          var newWidth = value['width'];
          var newHeight = value['height'];
          var newXpos = value['xpos'];
          var newYpos = value['ypos'];
          mainwin.resizeTo(newWidth, newHeight);
          mainwin.moveTo(newXpos, newYpos);
          minimizeToTray = value['totray'];
        }
        /*
        */
        console.log( 'show' );
        mainwin.show();
        winWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
        if( setTray ){
          //viewbox.setGuiMenu();
        }
      }
    });
  },
  save: function(){
    if ( saveState ){
      // get needed dtada like position, size
      var state = {
        xpos: mainwin.x,
        ypos: mainwin.y,
        width: mainwin.width,
        height: mainwin.height,
        totray: minimizeToTray
      };
      // save the data to database
      localforage.setItem('windowstate', state, function(err, value) {
        console.log( value );
        safeExit = true;
      });
    }
  },
  showTray: function(){
    // create new tray icon
    tray = tray || new maingui.Tray({
      icon: 'app/img/icon_16.png',
      title: 'PLÆR - Title',
      tooltip: 'PLÆR - Tooltip'
    });
    // give it a menu
    var menu = new maingui.Menu();
    viewbox.menuItems( menu );
    tray.menu = menu;
    // show window when clicked
    tray.on('click', function() {
      mainwin.show();
    });
  },
  setGuiMenu: function(){
    var menu = new maingui.Menu({ 'type': 'menubar' });
    // add the menu items - usefull for using menu on different things
    viewbox.menuItems( menu );
    // assign the menu
    mainwin.menu = menu;
    // listen to right-click event
    document.body.addEventListener('contextmenu', function(ev) {
      ev.preventDefault();
      menu.popup(ev.x, ev.y);
      return false;
    });
  },
  menuItems: function( menu ){
    menu.append(new maingui.MenuItem({ label: 'PLÆR',
      type: 'normal',
      icon: 'app/img/icon_16.png',
      click: function(){
        mainwin.show();
      }
    }));
    menu.append(new maingui.MenuItem({ type: 'separator' }));
    menu.append(new maingui.MenuItem({ label: 'Minimize to tray?',
      type: 'checkbox',
      checked: minimizeToTray,
      click: function(){
        console.log(this.checked);
        minimizeToTray = this.checked;
        viewbox.save();
        if( !minimizeToTray ) {
          mainwin.show();
          //tray.remove(); tray = null;
        }
      }
    }));
    menu.append(new maingui.MenuItem({ label: 'Show window',
      type: 'normal',
      click: function(){
        mainwin.show();
      }
    }));
  },
  focus: function( focus ) {
    focused = focus;
  },
}; viewbox.init( true );
